#!/usr/bin/env python3
"""Measure benchmark configs on a booted iOS simulator or Android emulator.

Usage: scripts/bench/measure.py <ios|android> <device-id> <id...> [--scenario render|theme] [options]

Scenarios (one build serves both, see packages/benchmark/src/scenario.ts):
  render  (default) every run re-mounts the list of 1000 items
  theme   the list stays mounted, every run switches between the light and dark theme. The app is
          launched with `-benchmarkScenario theme` (iOS, simctl launch) / data uwbench://theme (Android).
          Only configs listing "theme" in configs.json; no memory readings. The StyleSheet controls
          still run the render scenario: they check the host, not the library.

Method (see README, Methodology):
  - host gate: every launch waits until the 1-minute load average is below --max-load (default 6)
  - StyleSheet is installed and launched cold once (discarded)
  - per block: StyleSheet warm control, install <id> (md5 verified), 1 cold launch (discarded),
    --launches warm launches (terminate + relaunch), StyleSheet warm control
  - a block is accepted when both controls are within --tolerance (20%) of the baseline, every warm
    launch produced a result and no launch ran above the load gate (Android: or with a throttled qemu)
  - --sweeps sweeps (default 2), alternating forward and reverse order; a rejected block is retried
  - the result is read once, --wait seconds after launch (inspecting the UI during the run slows it)
  - after the result, memory is read from outside the (idle) app, so it cannot affect the timing:
    iOS: the peak phys_footprint (`footprint`, what Xcode's memory gauge and jetsam use) first, then a
    simulated memory warning, --memory-settle seconds, and phys_footprint. Android: a trim-memory
    RUNNING_CRITICAL, --memory-settle seconds, then TOTAL PSS and its App Summary (`dumpsys meminfo`).
    React Native answers both signals with a full Hermes GC; without it the reading depends on when the
    last GC ran (+-20 MB). Android has no usable peak (VmHWM includes shared pages and is bimodal).

Baseline: the StyleSheet median from results/results.json for the platform, so one library can be
re-measured without the others. --rebaseline measures StyleSheet warm launches first instead.

Artifacts come from scripts/bench/build.sh (.bench/artifacts/{ios,android}/<id>.{app,apk}).
Output: .bench/runs/<date>-<platform>[-theme].json with every launch, block and control reading, then a summary.
iOS launches and reads go through the argent CLI (`argent run restart-app` / `argent run describe`; theme
launches use `xcrun simctl launch`, restart-app cannot pass launch arguments), Android through adb
(am start, one uiautomator dump).
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BENCH = ROOT / ".bench"
ANDROID_HOME = os.environ.get("ANDROID_HOME", str(Path.home() / "Library/Android/sdk"))
os.environ["PATH"] = f"{ANDROID_HOME}/platform-tools:{os.environ.get('PATH', '')}"

QEMU_OK_PRIORITY = 31
SCENARIO_LAUNCH_KEY = "benchmarkScenario"  # packages/benchmark/src/scenario.ts
SCENARIO_URL_SCHEME = "uwbench://"
RUNS_LABEL = {"render": "runs", "theme": "theme changes"}  # shown by the app as "2003 views × 10 <label>"
MIB = 1024 * 1024
MEMORY_METRICS = {
    "ios": {"total": "phys_footprint after a simulated memory warning (footprint)",
            "peak": "phys_footprint_peak before the memory warning (footprint)", "unit": "MiB"},
    "android": {"total": "TOTAL PSS after trim-memory RUNNING_CRITICAL (dumpsys meminfo)", "peak": None, "unit": "MiB"},
}
ANDROID_SUMMARY = ["Java Heap", "Native Heap", "Code", "Stack", "Graphics", "Private Other", "System"]
LOAD_GATE_MAX_WAIT_S = 20 * 60
EMULATOR_FIX = f"""The Android emulator is throttled (qemu threads at priority {{pri}}, expected {QEMU_OK_PRIORITY}).
macOS App Nap throttles an emulator whose window is hidden (StyleSheet ran ~6x slower), and zsh `&`
starts it at nice +5. Restart it windowless from bash:

  adb -s <serial> emu kill
  /bin/bash -c '"{ANDROID_HOME}/emulator/emulator" -avd Pixel_9a -no-snapshot-load -no-audio \\
    -memory 4096 -no-window -gpu host > .bench/logs/emulator.log 2>&1 &'
"""


def sh(cmd, check=True, timeout=300):
    r = subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True, text=True, timeout=timeout)
    if check and r.returncode != 0:
        raise RuntimeError(f"command failed: {cmd}\n{r.stdout}\n{r.stderr}")
    return r.stdout


def log(msg):
    print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def md5(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def load1():
    return float(sh("sysctl -n vm.loadavg").split()[1])


def median(xs):
    return round(statistics.median(xs), 2) if xs else None


class Runner:
    def __init__(self, args, configs, results):
        self.a = args
        self.platform = args.platform
        self.scenario = args.scenario
        self.with_memory = args.scenario == "render"
        self.dev = args.device
        self.configs = {c["id"]: c for c in configs}
        self.activities = {}
        ss = next((c for c in results["configs"] if c["id"] == "stylesheet"), None)
        self.ss_median = ss[self.platform]["median"] if ss and self.platform in ss else None
        stamp = datetime.date.today().isoformat()
        name = f"{stamp}-{self.platform}" + ("" if self.scenario == "render" else f"-{self.scenario}")
        out = Path(args.out) if args.out else BENCH / "runs" / f"{name}.json"
        n = 2
        while not args.out and out.exists():
            out = BENCH / "runs" / f"{name}-{n}.json"
            n += 1
        self.out = out
        self.run = {
            "tool": "scripts/bench/measure.py",
            "platform": self.platform,
            "scenario": self.scenario,
            "device": {},
            "host": {
                "chip": sh("sysctl -n machdep.cpu.brand_string").strip(),
                "os": f"macOS {sh('sw_vers -productVersion').strip()}",
            },
            "startedAt": datetime.datetime.now().isoformat(timespec="seconds"),
            "finishedAt": None,
            "complete": False,
            "settings": {
                "sweeps": args.sweeps, "launches": args.launches, "waitS": args.wait,
                "maxLoad": args.max_load, "tolerance": args.tolerance, "attempts": args.attempts,
                "memorySettleS": args.memory_settle,
            },
            "memoryMetrics": MEMORY_METRICS[self.platform] if self.with_memory else None,
            "configs": args.ids,
            "baseline": None,
            "styleSheetMedian": self.ss_median,
            "builds": {},
            "launches": [],
            "blocks": [],
            "results": {},
        }

    # Devices

    def ios_device(self):
        data = json.loads(sh(["xcrun", "simctl", "list", "devices", "-j"]))["devices"]
        for runtime, devs in data.items():
            for d in devs:
                if d["udid"] == self.dev:
                    ver = re.sub(r"^.*SimRuntime\.iOS-", "", runtime).replace("-", ".")
                    return {"id": self.dev, "model": f"{d['name']} simulator", "os": f"iOS {ver}", "state": d["state"]}
        return None

    def adb(self, cmd, **kw):
        return sh(f"adb -s {self.dev} {cmd}", **kw)

    def android_device(self):
        if sh(["adb", "-s", self.dev, "get-state"], check=False).strip() != "device":
            return None
        prop = lambda k: self.adb(f"shell getprop {k}").strip()
        avd = self.adb("emu avd name", check=False).strip().splitlines()
        return {
            "id": self.dev,
            "model": f"{avd[0].strip()} AVD" if avd and avd[0].strip() and avd[0].strip() != "OK" else prop("ro.product.model"),
            "os": f"Android {prop('ro.build.version.release')} (API {prop('ro.build.version.sdk')})",
            "abi": prop("ro.product.cpu.abi"),
        }

    def qemu_priority(self):
        """Dominant scheduling priority of the qemu threads (e.g. '31T'), None when no emulator runs."""
        if self.platform != "android":
            return None
        pids = sh("pgrep -f qemu-system-aarch64", check=False).split()
        if not pids:
            return None
        rows = sh(["ps", "-M", "-p", pids[0]]).splitlines()[1:]
        pri = [r.split()[-3] for r in rows if len(r.split()) >= 3]
        return max(set(pri), key=pri.count) if pri else None

    @staticmethod
    def throttled(pri):
        m = re.match(r"(\d+)", pri or "")
        return bool(m) and int(m.group(1)) < QEMU_OK_PRIORITY

    def preflight(self):
        if self.platform == "ios":
            if not shutil.which("argent"):
                sys.exit("argent CLI not found (npm i -g @swmansion/argent), it launches and reads the iOS apps")
            dev = self.ios_device()
            if not dev:
                sys.exit(f"simulator {self.dev} not found (xcrun simctl list devices)")
            if dev.pop("state") != "Booted":
                sys.exit(f"simulator {self.dev} is not booted")
        else:
            if not shutil.which("adb"):
                sys.exit(f"adb not found (ANDROID_HOME={ANDROID_HOME})")
            dev = self.android_device()
            if not dev:
                sys.exit(f"{self.dev} is not an online adb device (adb devices); `unauthorized` is fixed by a -wipe-data boot")
            pri = self.qemu_priority()
            if pri is None:
                log("no qemu process found, skipping the emulator throttling check")
            elif self.throttled(pri):
                sys.exit(EMULATOR_FIX.format(pri=pri))
            dev["qemuPriority"] = pri
        self.run["device"] = dev
        missing = [i for i in ["stylesheet", *self.a.ids] if not self.artifact(i).exists()]
        if missing:
            sys.exit(f"missing artifacts for {', '.join(sorted(set(missing)))}; run scripts/bench/build.sh <id>")

    # App control

    def artifact(self, cid):
        ext = "app" if self.platform == "ios" else "apk"
        return BENCH / "artifacts" / self.platform / f"{cid}.{ext}"

    def app_id(self, cid):
        c = self.configs[cid]
        return c["ios"]["bundleId"] if self.platform == "ios" else c["android"]["packageId"]

    def install(self, cid):
        art, pkg = self.artifact(cid), self.app_id(cid)
        if self.platform == "ios":
            sh(["xcrun", "simctl", "terminate", self.dev, pkg], check=False)
            sh(["xcrun", "simctl", "install", self.dev, str(art)])
            cont = sh(["xcrun", "simctl", "get_app_container", self.dev, pkg]).strip()
            want, got = md5(art / "main.jsbundle"), md5(Path(cont) / "main.jsbundle")
        else:
            self.adb(f"shell am force-stop {pkg}", check=False)
            self.adb(f"install -r -d {art}", timeout=600)
            path = self.adb(f"shell pm path {pkg}").strip().splitlines()[0].replace("package:", "")
            want, got = md5(art), self.adb(f"shell md5sum {path}").split()[0]
        if want != got:
            raise RuntimeError(f"{cid}: installed copy does not match the artifact ({want} != {got})")
        return want

    def scenario_of(self, cid):
        """The StyleSheet controls always run the render scenario."""
        return "render" if cid == "stylesheet" else self.scenario

    def launch(self, cid):
        pkg = self.app_id(cid)
        scenario = self.scenario_of(cid)
        if self.platform == "ios":
            if scenario == "render":
                sh(["argent", "run", "restart-app", "--udid", self.dev, "--bundleId", pkg])
                return
            sh(["xcrun", "simctl", "terminate", self.dev, pkg], check=False)
            time.sleep(1)
            sh(["xcrun", "simctl", "launch", self.dev, pkg, f"-{SCENARIO_LAUNCH_KEY}", scenario])
            return
        if pkg not in self.activities:
            self.activities[pkg] = self.adb(f"shell cmd package resolve-activity --brief {pkg}").strip().splitlines()[-1]
        self.adb(f"shell am force-stop {pkg}")
        time.sleep(1)
        if scenario == "render":
            self.adb(f"shell am start -n {self.activities[pkg]}")
        else:
            # Explicit intent, so no intent filter is needed; Linking.getInitialURL only reports VIEW intents
            self.adb(f"shell am start -n {self.activities[pkg]} -a android.intent.action.VIEW -d {SCENARIO_URL_SCHEME}{scenario}")

    def read_screen(self):
        if self.platform == "ios":
            out = json.loads(sh(["argent", "run", "describe", "--udid", self.dev]))["description"]
            return re.findall(r'AXStaticText "([^"]*)"', out)
        self.adb("shell uiautomator dump /sdcard/uwb.xml", timeout=120)
        return re.findall(r' text="([^"]*)"', self.adb("shell cat /sdcard/uwb.xml"))

    def ios_pid(self, pkg):
        for line in sh(["xcrun", "simctl", "spawn", self.dev, "launchctl", "list"]).splitlines():
            pid, _, label = (line.split("\t") + ["", ""])[:3]
            if label.startswith(f"UIKitApplication:{pkg}[") and pid.isdigit():
                return int(pid)
        raise RuntimeError(f"{pkg} is not running")

    def ios_footprint(self, pid):
        out = BENCH / "logs" / "footprint.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        sh(["footprint", "-p", str(pid), "-j", str(out)])
        return json.loads(out.read_text())["processes"][0]

    def read_memory(self, cid):
        """Memory of the idle app after the run in MiB: total after a forced GC, peak (iOS), breakdown (Android)."""
        pkg = self.app_id(cid)
        mb = lambda b: round(b / MIB, 1)
        if self.platform == "ios":
            pid = self.ios_pid(pkg)
            before = self.ios_footprint(pid)["auxiliary"]
            if not hasattr(self, "memory_warning_file"):
                self.memory_warning_file = sh(["xcrun", "simctl", "getenv", self.dev, "SIMULATOR_MEMORY_WARNINGS"]).strip()
            os.utime(self.memory_warning_file, None)  # what Simulator > Simulate Memory Warning does
            time.sleep(self.a.memory_settle)
            proc = self.ios_footprint(pid)
            if proc["pid"] != pid:
                raise RuntimeError("app restarted during the memory reading")
            # No breakdown: footprint's categories do not add up to phys_footprint (compressed pages).
            return {"total": mb(proc["auxiliary"]["phys_footprint"]), "peak": mb(before["phys_footprint_peak"]),
                    "beforeGc": mb(before["phys_footprint"])}
        meminfo = lambda: self.adb(f"shell dumpsys meminfo {pkg}")
        pss = lambda info: round(int(re.search(r"TOTAL PSS:\s+(\d+)", info).group(1)) / 1024, 1)
        before = pss(meminfo())
        out = self.adb(f"shell am send-trim-memory {pkg} RUNNING_CRITICAL 2>&1")
        if "Exception" in out:  # am exits 0 when it rejects the trim level
            raise RuntimeError(f"send-trim-memory failed: {out.strip().splitlines()[0]}")
        time.sleep(self.a.memory_settle)
        info = meminfo()
        kb = lambda pattern: int(re.search(pattern, info, re.M).group(1))
        return {"total": pss(info), "peak": None, "beforeGc": before, "rss": round(kb(r"TOTAL RSS:\s+(\d+)") / 1024, 1),
                "breakdown": {k: round(kb(rf"^\s*{k}:\s+(\d+)") / 1024, 1) for k in ANDROID_SUMMARY}}

    @staticmethod
    def parse(texts, scenario):
        joined = " | ".join(texts)
        if "Benchmark Complete" not in joined:
            return None, joined
        label = re.search(r"views \S+ \d+ ([a-z ]+)", joined)
        if not label or label.group(1).strip() != RUNS_LABEL[scenario]:
            # e.g. the launch argument did not reach the app and it measured rendering instead
            raise RuntimeError(f"expected the {scenario} scenario ({RUNS_LABEL[scenario]!r}), the app shows: {joined[:300]}")
        value = lambda k: float(re.search(k + r":\s*([\d.]+)\s*ms", joined).group(1))
        return {"average": value("Average"), "min": value("Min"), "max": value("Max"),
                "title": texts[0] if texts else ""}, None

    # Measurement

    def gate(self):
        t0 = time.time()
        load = load1()
        if load >= self.a.max_load:
            log(f"load {load} >= {self.a.max_load}, waiting")
        while load >= self.a.max_load and time.time() - t0 < LOAD_GATE_MAX_WAIT_S:
            time.sleep(30)
            load = load1()
        return load, load < self.a.max_load, round(time.time() - t0)

    def measure(self, cid, sweep, kind, block=None):
        load, ok, waited = self.gate()
        scenario = self.scenario_of(cid)
        rec = {"config": cid, "scenario": scenario, "sweep": sweep, "kind": kind, "block": block, "load": load,
               "loadGateOk": ok, "gateWaitS": waited, "timestamp": datetime.datetime.now().isoformat(timespec="seconds")}
        pri_before = self.qemu_priority()
        self.launch(cid)
        time.sleep(self.a.wait)
        res, raw = self.parse(self.read_screen(), scenario)
        extra = 0
        while res is None and extra < 4:
            time.sleep(10)
            extra += 1
            res, raw = self.parse(self.read_screen(), scenario)
        rec["extraReads"] = extra
        if self.platform == "android":
            rec["qemuPriBefore"], rec["qemuPriAfter"] = pri_before, self.qemu_priority()
        if res:
            rec.update(res)
            if self.with_memory:
                try:
                    rec["memory"] = self.read_memory(cid)
                except Exception as e:  # noqa: BLE001 - a missing reading only rejects the block
                    rec["memory"] = None
                    rec["memoryError"] = str(e)[:300]
        else:
            rec.update({"average": None, "error": "no result", "raw": (raw or "")[:300]})
        self.run["launches"].append(rec)
        self.save()
        mem = rec.get("memory") or {}
        log(f"{sweep:8s} {kind:7s} {cid:12s} avg={rec.get('average')} min={rec.get('min')} max={rec.get('max')} "
            f"mem={mem.get('total')} peak={mem.get('peak')} load={load}")
        return rec

    def block_ok(self, controls, warm):
        base = self.run["baseline"]["value"]
        reasons = []
        if self.with_memory and any(x.get("memory") is None for x in [*controls, *warm] if x.get("average") is not None):
            reasons.append("launch without a memory reading")
        for c in controls:
            if c.get("average") is None or abs(c["average"] - base) / base > self.a.tolerance:
                reasons.append(f"control {c.get('average')} not within {self.a.tolerance:.0%} of baseline {base}")
        if any(w.get("average") is None for w in warm):
            reasons.append("warm launch without a result")
        launches = [*controls, *warm]
        if not all(x["loadGateOk"] for x in launches):
            reasons.append(f"host load stayed above {self.a.max_load}")
        if any(self.throttled(x.get("qemuPriBefore")) or self.throttled(x.get("qemuPriAfter")) for x in launches):
            reasons.append("qemu throttled during the block")
        return reasons

    def save(self):
        self.out.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.out.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.run, indent=2) + "\n")
        tmp.replace(self.out)

    def build_info(self, cid):
        meta_path = BENCH / "artifacts" / f"{cid}.json"
        meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        info = dict(meta.get("platforms", {}).get(self.platform, {}))
        if info.get("md5") and info["md5"] != md5(self.artifact(cid) / "main.jsbundle" if self.platform == "ios" else self.artifact(cid)):
            log(f"WARNING {cid}: artifact changed since build.sh wrote {meta_path.name}, ignoring its metadata")
            info = {}
        if info:
            info["source"] = "build.sh"
            return info
        # Artifact not built by build.sh: fall back to what is installed now (may not match the artifact).
        c = self.configs[cid]
        pkg_json = ROOT / c["app"] / "node_modules" / c["versionModule"] / "package.json"
        app_json = json.loads((ROOT / c["app"] / "package.json").read_text())
        version = json.loads(pkg_json.read_text())["version"] if pkg_json.exists() else None
        spec = {**app_json.get("devDependencies", {}), **app_json.get("dependencies", {})}.get(c["versionModule"], "")
        if c.get("pro") and version != c["pro"]["version"]:
            version = None
        return {"version": version, "spec": spec, "published": not spec.startswith(("file:", "link:", "workspace:", "git", "http")),
                "source": "node_modules at measure time (no build.sh metadata)"}

    def execute(self):
        self.preflight()
        a = self.a
        log(f"{self.platform} {self.run['device'].get('model')} {self.dev}; configs {', '.join(a.ids)}; output {self.out.relative_to(ROOT) if self.out.is_relative_to(ROOT) else self.out}")
        for cid in dict.fromkeys(["stylesheet", *a.ids]):
            self.run["builds"][cid] = self.build_info(cid)
        self.run["builds"]["stylesheet"]["md5"] = self.install("stylesheet")
        self.measure("stylesheet", "setup", "cold")
        if a.rebaseline:
            runs = [self.measure("stylesheet", "baseline", "warm")["average"] for _ in range(max(3, a.launches))]
            runs = [r for r in runs if r is not None]
            if not runs:
                sys.exit("StyleSheet produced no results, check the device")
            self.run["baseline"] = {"value": median(runs), "source": "rebaseline (StyleSheet warm launches)", "runs": runs}
        else:
            if self.ss_median is None:
                sys.exit(f"results.json has no StyleSheet {self.platform} median, use --rebaseline")
            self.run["baseline"] = {"value": self.ss_median, "source": "results/results.json StyleSheet median"}
        log(f"baseline {self.run['baseline']['value']} ({self.run['baseline']['source']})")

        for s in range(a.sweeps):
            sweep = chr(ord("A") + s)
            order = a.ids if s % 2 == 0 else a.ids[::-1]
            for cid in order:
                for attempt in range(1, a.attempts + 1):
                    blk = f"{sweep}:{cid}#{attempt}"
                    c1 = self.measure("stylesheet", sweep, "control", blk)
                    h = self.install(cid)
                    self.measure(cid, sweep, "cold", blk)
                    warm = [self.measure(cid, sweep, "warm", blk) for _ in range(a.launches)]
                    c2 = self.measure("stylesheet", sweep, "control", blk)
                    reasons = self.block_ok([c1, c2], warm)
                    self.run["blocks"].append({"block": blk, "config": cid, "sweep": sweep, "attempt": attempt,
                                               "accepted": not reasons, "reasons": reasons,
                                               "controls": [c1.get("average"), c2.get("average")],
                                               "controlMemory": [(c.get("memory") or {}).get("total") for c in (c1, c2)],
                                               "md5": h})
                    self.save()
                    log(f"block {blk} {'accepted' if not reasons else 'REJECTED: ' + '; '.join(reasons)}")
                    if not reasons:
                        break
                    if attempt < a.attempts:
                        log(f"retrying in {a.retry_wait} s")
                        time.sleep(a.retry_wait)
        self.aggregate()
        self.run["finishedAt"] = datetime.datetime.now().isoformat(timespec="seconds")
        self.run["complete"] = all(r["complete"] for r in self.run["results"].values())
        self.save()
        self.summary()

    def aggregate(self):
        accepted = {b["block"] for b in self.run["blocks"] if b["accepted"]}
        for cid in self.a.ids:
            launches = [x for x in self.run["launches"]
                        if x["block"] in accepted and x["config"] == cid and x["kind"] == "warm"]
            warm = [x["average"] for x in launches]
            controls = [c for b in self.run["blocks"] if b["accepted"] and b["config"] == cid for c in b["controls"]]
            sweeps_ok = {b["sweep"] for b in self.run["blocks"] if b["accepted"] and b["config"] == cid}
            m, cm = median(warm), median(controls)
            ref = self.ss_median
            self.run["results"][cid] = {
                "median": m,
                # StyleSheet has no themes, a theme change has nothing to compare with
                "ratioToStyleSheet": round(m / ref, 2) if m and ref and self.scenario == "render" else None,
                "spread": [min(warm), max(warm)] if warm else None,
                "warmLaunches": warm,
                "n": len(warm),
                "controls": controls,
                "controlMedian": cm,
                "controlDrift": round(cm / ref - 1, 4) if cm and ref else None,
                "complete": len(sweeps_ok) == self.a.sweeps,
                "build": self.run["builds"].get(cid),
                "memory": self.aggregate_memory(cid, launches) if self.with_memory else None,
            }

    def aggregate_memory(self, cid, launches):
        mems = [x["memory"] for x in launches if x.get("memory")]
        if not mems:
            return None
        totals = [m["total"] for m in mems]
        controls = [m for b in self.run["blocks"] if b["accepted"] and b["config"] == cid
                    for m in b.get("controlMemory", []) if m is not None]
        peaks = [m["peak"] for m in mems if m["peak"] is not None]
        mem = {
            "median": median(totals),
            "peak": median(peaks),
            "spread": [min(totals), max(totals)],
            "launches": totals,
            "peaks": peaks,
            "beforeGc": median([m["beforeGc"] for m in mems]),
            "controls": controls,
            "controlMedian": median(controls),
        }
        if self.platform == "android":
            mem["rss"] = median([m["rss"] for m in mems])
            mem["breakdown"] = {k: median([m["breakdown"][k] for m in mems]) for k in ANDROID_SUMMARY}
        return mem

    def summary(self):
        ref = self.ss_median
        print()
        print(f"{self.platform} {self.scenario}: {self.run['device'].get('model')}, baseline {self.run['baseline']['value']} "
              f"({self.run['baseline']['source']}), StyleSheet median in results.json {ref}")
        print(f"  {'config':12s} {'median':>8s} {'ratio':>6s} {'n':>3s}  {'spread':15s} {'controls':>9s} {'drift':>7s}  version")
        for cid, r in self.run["results"].items():
            spread = f"{r['spread'][0]}-{r['spread'][1]}" if r["spread"] else "-"
            drift = f"{r['controlDrift']:+.1%}" if r["controlDrift"] is not None else "-"
            flags = []
            if not r["complete"]:
                flags.append("INCOMPLETE")
            if r["controlDrift"] is not None and abs(r["controlDrift"]) > 0.05:
                flags.append("DRIFT > 5% (update-results.mjs refuses without --allow-drift)")
            print(f"  {cid:12s} {r['median'] or '-':>8} {r['ratioToStyleSheet'] or '-':>6} {r['n']:>3}  {spread:15s} "
                  f"{r['controlMedian'] or '-':>9} {drift:>7}  {(r['build'] or {}).get('version')} {' '.join(flags)}")
        rejected = [b["block"] for b in self.run["blocks"] if not b["accepted"]]
        print(f"  rejected blocks: {', '.join(rejected) or 'none'}")
        if not self.with_memory:
            print(f"  raw data: {self.out}")
            return
        m = MEMORY_METRICS[self.platform]
        print(f"\n  memory [{m['unit']}]: total = {m['total']}" + (f", peak = {m['peak']}" if m["peak"] else ""))
        print(f"  {'config':12s} {'total':>8s} {'peak':>8s} {'spread':15s} {'controls':>9s} {'vs ctrl':>8s}")
        for cid, r in self.run["results"].items():
            mem = r.get("memory")
            if not mem:
                print(f"  {cid:12s} {'-':>8s}")
                continue
            delta = f"{mem['median'] - mem['controlMedian']:+.1f}" if mem["controlMedian"] is not None else "-"
            print(f"  {cid:12s} {mem['median']:>8} {mem['peak'] or '-':>8} {mem['spread'][0]}-{mem['spread'][1]:<10} "
                  f"{mem['controlMedian'] or '-':>9} {delta:>8}")
        print(f"  raw data: {self.out}")


def main():
    configs = json.loads((ROOT / "scripts/bench/configs.json").read_text())["configs"]
    ids = [c["id"] for c in configs]
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                formatter_class=argparse.RawDescriptionHelpFormatter, epilog=f"ids: {' '.join(ids)}")
    p.add_argument("platform", choices=["ios", "android"])
    p.add_argument("device", help="simulator UDID (xcrun simctl list devices) or adb serial (adb devices)")
    p.add_argument("ids", nargs="+", metavar="id")
    p.add_argument("--scenario", choices=["render", "theme"], default="render",
                   help="render: re-mount the list (default), theme: switch the theme of the mounted list")
    p.add_argument("--sweeps", type=int, default=2, help="sweeps, alternating forward/reverse (default 2)")
    p.add_argument("--launches", type=int, default=3, help="warm launches per block (default 3)")
    p.add_argument("--rebaseline", action="store_true", help="measure the StyleSheet baseline instead of using results.json")
    p.add_argument("--tolerance", type=float, default=0.20, help="control tolerance vs baseline (default 0.20)")
    p.add_argument("--max-load", type=float, default=6.0, help="host 1-minute load gate (default 6)")
    p.add_argument("--wait", type=float, default=10.0, help="seconds between launch and reading the result (default 10)")
    p.add_argument("--attempts", type=int, default=3, help="attempts per block before giving up (default 3)")
    p.add_argument("--retry-wait", type=float, default=60.0, help="seconds to wait before retrying a rejected block")
    p.add_argument("--out", help="output file (default .bench/runs/<date>-<platform>.json)")
    p.add_argument("--memory-settle", type=float, default=4.0,
                   help="seconds between the GC signal (memory warning / trim-memory) and the memory reading (default 4)")
    a = p.parse_args()
    unknown = [i for i in a.ids if i not in ids]
    if unknown:
        p.error(f"unknown id(s) {', '.join(unknown)}; expected: {' '.join(ids)}")
    a.ids = list(dict.fromkeys(a.ids))
    unsupported = [c["id"] for c in configs if c["id"] in a.ids and a.scenario not in c.get("scenarios", ["render"])]
    if unsupported:
        p.error(f"{', '.join(unsupported)} cannot run the {a.scenario} scenario (scenarios in configs.json)")
    results = json.loads((ROOT / "results/results.json").read_text())
    runner = Runner(a, configs, results)
    try:
        runner.execute()
    except KeyboardInterrupt:
        if runner.run["baseline"]:
            runner.aggregate()
        runner.save()
        sys.exit(f"\ninterrupted, partial data in {runner.out}")


if __name__ == "__main__":
    main()
