#!/usr/bin/env bash
# Build Release artifacts for one benchmark config (see scripts/bench/configs.json).
#
# Usage: scripts/bench/build.sh <id> [--ios-only | --android-only | --check]
#
#   iOS      xcodebuild Release, iphonesimulator arm64, own derived data -> .bench/artifacts/ios/<id>.app
#   Android  ./gradlew clean + rm app/.cxx app/build, then assembleRelease arm64-v8a -> .bench/artifacts/android/<id>.apk
#            (always clean: the RN bundle task does not track node_modules, so a stale JS bundle could leak in)
#   --check  only run the preflight checks (Pro version, @expo/metro-config state, scene patch), build nothing
#
# Also writes .bench/artifacts/<id>.json (installed version, dependency spec, per-platform md5), which
# measure.py and update-results.mjs use to label the results. Logs go to .bench/logs/.
#
# Pro configs: this script never switches versions. Run `scripts/use-pro.sh <version>` first; the build
# fails if the installed Uniwind Pro version does not match the id.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BENCH="$ROOT/.bench"
ID="${1:-}"
MODE="${2:-all}"

if [ -z "$ID" ]; then
  echo "Usage: $0 <id> [--ios-only | --android-only | --check]" >&2
  echo "ids: $(python3 -c 'import json,sys; print(" ".join(c["id"] for c in json.load(open(sys.argv[1]))["configs"]))' "$ROOT/scripts/bench/configs.json")" >&2
  exit 1
fi

case "$MODE" in
  all | --ios-only | --android-only | --check) ;;
  *)
    echo "Unknown option: $MODE" >&2
    exit 1
    ;;
esac

# Prints shell assignments for the config fields.
CFG="$(python3 - "$ROOT/scripts/bench/configs.json" "$ID" <<'EOF'
import json, shlex, sys
configs = json.load(open(sys.argv[1]))["configs"]
c = next((c for c in configs if c["id"] == sys.argv[2]), None)
if c is None:
    sys.exit(f"unknown config id '{sys.argv[2]}', expected one of: {', '.join(x['id'] for x in configs)}")
pro = c.get("pro") or {}
fields = {
    "APP_DIR": c["app"], "VERSION_MODULE": c["versionModule"], "EXPO": "1" if c["expo"] else "",
    "WORKSPACE": c["ios"]["workspace"], "SCHEME": c["ios"]["scheme"],
    "PRO_VERSION": pro.get("version", ""), "PRO_HIDE_EXPO": "1" if pro.get("hideExpoMetroConfig") else "",
}
for k, v in fields.items():
    print(f"{k}={shlex.quote(v)}")
EOF
)"
eval "$CFG"

APP="$ROOT/$APP_DIR"
MODULE_PKG="$APP/node_modules/$VERSION_MODULE/package.json"
EXPO_METRO_CONFIG="$ROOT/node_modules/.bun/node_modules/@expo/metro-config"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[ -f "$MODULE_PKG" ] || fail "$MODULE_PKG not found, run bun install"
INSTALLED="$(node -p "require('$MODULE_PKG').version")"
SPEC="$(node -p "const p = require('$APP/package.json'); (p.dependencies || {})['$VERSION_MODULE'] || (p.devDependencies || {})['$VERSION_MODULE'] || ''")"

# Preflight
if [ -n "$PRO_VERSION" ]; then
  if [ "$INSTALLED" != "$PRO_VERSION" ]; then
    fail "config $ID needs Uniwind Pro $PRO_VERSION but apps/uniwind-pro has $INSTALLED installed. Run: scripts/use-pro.sh $PRO_VERSION"
  fi
  [ -f "$APP/node_modules/uniwind/Uniwind.podspec" ] ||
    fail "Uniwind Pro package is incomplete (postinstall did not run). Run: scripts/use-pro.sh $PRO_VERSION"
  if [ -n "$PRO_HIDE_EXPO" ] && [ -e "$EXPO_METRO_CONFIG" ]; then
    fail "Uniwind Pro $PRO_VERSION needs @expo/metro-config hidden. Run: scripts/use-pro.sh $PRO_VERSION"
  fi
fi
if [ -n "$EXPO" ] && [ ! -e "$EXPO_METRO_CONFIG" ]; then
  fail "@expo/metro-config is hidden (by use-pro.sh for an old Pro version). Run scripts/use-pro.sh with 1.7.0 or newer first"
fi
if [ -n "$EXPO" ]; then
  if [ ! -d "$APP/ios" ] || [ ! -d "$APP/android" ]; then
    if [ "$MODE" = "--check" ]; then
      fail "$APP_DIR has no native projects, run \`bunx expo prebuild --clean\` there (build.sh does it)"
    fi
    echo "==> expo prebuild --clean ($APP_DIR)"
    (cd "$APP" && bunx expo prebuild --clean)
  fi
  python3 "$ROOT/scripts/bench/scene-patch.py" "$(basename "$APP_DIR")"
fi

echo "==> $ID: $VERSION_MODULE $INSTALLED ($SPEC)"
if [ "$MODE" = "--check" ]; then
  echo "==> preflight OK"
  exit 0
fi

mkdir -p "$BENCH/artifacts/ios" "$BENCH/artifacts/android" "$BENCH/logs" "$BENCH/derived-data"

build_ios() {
  local dd="$BENCH/derived-data/$ID" log="$BENCH/logs/$ID-ios.log" prod
  rm -rf "$dd"
  if ! (cd "$APP/ios" && xcodebuild -workspace "$WORKSPACE.xcworkspace" -scheme "$SCHEME" -configuration Release \
    -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
    -derivedDataPath "$dd" build) >"$log" 2>&1; then
    echo "ios $ID FAILED, see $log"
    return 1
  fi
  prod="$(ls -d "$dd/Build/Products/Release-iphonesimulator/"*.app 2>/dev/null | head -1)"
  [ -n "$prod" ] || {
    echo "ios $ID FAILED, no .app in $dd"
    return 1
  }
  rm -rf "$BENCH/artifacts/ios/$ID.app"
  cp -R "$prod" "$BENCH/artifacts/ios/$ID.app"
  echo "ios $ID OK -> .bench/artifacts/ios/$ID.app"
}

build_android() {
  local log="$BENCH/logs/$ID-android.log" apk=app/build/outputs/apk/release/app-release.apk
  cd "$APP/android"
  if ! ./gradlew clean >"$BENCH/logs/$ID-android-clean.log" 2>&1; then
    echo "android $ID FAILED (gradlew clean), see $BENCH/logs/$ID-android-clean.log"
    return 1
  fi
  rm -rf app/.cxx app/build
  if ! ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a >"$log" 2>&1 || [ ! -f "$apk" ]; then
    echo "android $ID FAILED, see $log"
    return 1
  fi
  cp "$apk" "$BENCH/artifacts/android/$ID.apk"
  echo "android $ID OK -> .bench/artifacts/android/$ID.apk"
}

PIDS=()
PLATFORMS=()
if [ "$MODE" != "--android-only" ]; then
  build_ios &
  PIDS+=($!)
  PLATFORMS+=(ios)
fi
if [ "$MODE" != "--ios-only" ]; then
  build_android &
  PIDS+=($!)
  PLATFORMS+=(android)
fi

STATUS=0
BUILT=()
for i in "${!PIDS[@]}"; do
  if wait "${PIDS[$i]}"; then
    BUILT+=("${PLATFORMS[$i]}")
  else
    STATUS=1
  fi
done

if [ ${#BUILT[@]} -gt 0 ]; then
  python3 - "$BENCH/artifacts" "$ID" "$INSTALLED" "$SPEC" "$(git -C "$ROOT" rev-parse --short HEAD)" "${BUILT[@]}" <<'EOF'
import datetime, hashlib, json, os, sys
art, cid, version, spec, commit, *platforms = sys.argv[1:]
path = os.path.join(art, f"{cid}.json")
meta = json.load(open(path)) if os.path.exists(path) else {}
local = spec.startswith(("file:", "link:", "workspace:", "git", "http"))
meta.update({"id": cid, "version": version, "spec": spec, "published": not local})
meta.setdefault("platforms", {})
for p in platforms:
    f = os.path.join(art, "ios", f"{cid}.app", "main.jsbundle") if p == "ios" else os.path.join(art, "android", f"{cid}.apk")
    meta["platforms"][p] = {
        "md5": hashlib.md5(open(f, "rb").read()).hexdigest(),
        "version": version, "spec": spec, "published": not local,
        "builtAt": datetime.datetime.now().isoformat(timespec="seconds"), "repoCommit": commit,
    }
json.dump(meta, open(path, "w"), indent=2)
print(f"wrote .bench/artifacts/{cid}.json")
EOF
fi

exit $STATUS
