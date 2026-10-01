# Uniwind Benchmarks

Benchmark repository for different React Native styling libraries.

<img src="./assets/result.jpg" alt="iOS results">

<img src="./assets/result-android.jpg" alt="Android results">

## Methodology

Every app renders the same screen: a header card plus a grid of 1000 items (2003 views in total), re-rendered 10 times.
The app shows the average render time of those 10 runs, in milliseconds.

- Release builds, Hermes, New Architecture, React Native 0.86.3 bare apps (Expo SDK 57 for NativeWind 5).
- iOS: iPhone 18 Pro Max simulator (iOS 27.0). Android: Pixel_9a AVD (Android 16, API 36, arm64, 4 GB RAM).
  Both on the same Apple M3 Pro Mac (macOS 27.0). Simulator/emulator numbers are only comparable with each other,
  not with the physical-device numbers from earlier revisions of this README.
- iOS 27 requires the scene lifecycle, so every iOS app starts React Native from a `SceneDelegate`.
- Warm launches only: after installing an app, the first (cold) launch is discarded, then the app is terminated and relaunched 3 times.
- Two sweeps over all libraries, one in forward and one in reverse order, so 6 warm launches per library.
  The reported value is the median of those 6.
- A StyleSheet control launch runs before and after every block. A block counts only if both controls are within 20%
  of the session's StyleSheet baseline. Every launch waits until the host's 1-minute load average is below 6.
- The Android emulator runs windowless (`-no-window -gpu host -memory 4096`). macOS App Nap throttles an emulator whose
  window is hidden, which made it about 6x slower; those runs were discarded.
- The result is read from the screen once, 10 seconds after launch. Inspecting the view hierarchy while the benchmark
  is running slows the render loop massively.

Uniwind, Uniwind Pro and NativeWind use the exact same classNames.

It’s difficult to directly compare Unistyles, Uniwind, and Nativewind to StyleSheet, as it has no features, it only serves as a baseline for performance.

## Results

Measured on 2026-09-29.

iOS

<!-- results:ios -->
| Library | Time [ms] | Relative to StyleSheet |
| --- | --- | --- |
| StyleSheet | 36.81 | 1.00 |
| Uniwind Pro 1.8.0 (unreleased, built from perf/lean-host-props) | 44.83 | 1.22 |
| Uniwind Pro 1.0.1 | 48.03 | 1.30 |
| Unistyles 3.3.0 | 52.66 | 1.43 |
| Uniwind Pro 1.7.0 | 57.52 | 1.56 |
| Uniwind 1.12.0 | 59.67 | 1.62 |
| NativeWind 4.2.7 | 137.65 | 3.74 |
| NativeWind 5.0.0-rc.0 | 309.75 | 8.41 |
<!-- /results:ios -->

Android

<!-- results:android -->
| Library | Time [ms] | Relative to StyleSheet |
| --- | --- | --- |
| StyleSheet | 49.46 | 1.00 |
| Uniwind Pro 1.8.0 (unreleased, built from perf/lean-host-props) | 57.91 | 1.17 |
| Uniwind Pro 1.0.1 | 61.14 | 1.24 |
| Unistyles 3.3.0 | 63.48 | 1.28 |
| Uniwind 1.12.0 | 64.72 | 1.31 |
| Uniwind Pro 1.7.0 | 67.81 | 1.37 |
| NativeWind 4.2.7 | 156.66 | 3.17 |
| NativeWind 5.0.0-rc.0 | 325.44 | 6.58 |
<!-- /results:android -->

Raw numbers, including every accepted warm launch and the spread per library, live in [`results/results.json`](./results/results.json).
Earlier rounds are kept in its `history` section. Charts are generated from that file with `node scripts/generate-chart.mjs`.

Screenshots below come from a separate confirmation launch on iOS, so their numbers differ slightly from the medians above.

<img src="./assets/stylesheet.png" width="300" alt="StyleSheet">
<img src="./assets/unistyles3.png" width="300" alt="Unistyles 3.3.0">
<img src="./assets/uniwind.png" width="300" alt="Uniwind 1.12.0">
<img src="./assets/uniwind-pro-1.8.0.png" width="300" alt="Uniwind Pro 1.8.0">
<img src="./assets/uniwind-pro-1.7.0.png" width="300" alt="Uniwind Pro 1.7.0">
<img src="./assets/uniwind-pro-1.0.1.png" width="300" alt="Uniwind Pro 1.0.1">
<img src="./assets/nativewind.png" width="300" alt="NativeWind 4.2.7">
<img src="./assets/nativewind5.png" width="300" alt="NativeWind 5.0.0-rc.0">

## Uniwind Pro versions

All Uniwind Pro versions are measured with the same `uniwind-pro` app; only the `uniwind` dependency changes.
`scripts/use-pro.sh <version>` switches it (package.json, `bun install`, `pod install`). The committed app is pinned to
the latest release, 1.7.0. There is no `uniwind-pro@1.0.0` on npm, 1.0.1 is the first stable release.

Uniwind Pro 1.8.0 is not published yet. It was measured from a local build of the uniwind-pro branch `perf/lean-host-props`
(commit `1431d1e0` plus an uncommitted View/Text render optimisation that passes fewer props to host components),
packed as a tarball with the version set to 1.8.0. It was re-measured in a separate session with the same method
(two blocks of 3 warm launches, StyleSheet controls within 20% of the session baseline); StyleSheet was not re-measured,
so its ratio uses the StyleSheet medians above. The numbers of the earlier 1.8.0 build (without that optimisation) are kept
in `results/results.json` under `previous`. To reproduce, pack a build and run
`UNIWIND_PRO_TARBALL=/path/to/uniwind-pro-1.8.0.tgz scripts/use-pro.sh 1.8.0`.

This benchmark mounts 2003 fresh views on every run. It does not exercise style updates, theme changes or animations,
which is where the newer Uniwind Pro releases moved work off the JavaScript thread.

## Repository Structure

```
uniwind-benchmarks/
├── apps/                    # React Native applications
│   ├── nativewind4/        # NativeWind v4 benchmark app
│   ├── nativewind5/        # NativeWind v5 benchmark app (Expo)
│   ├── stylesheet/         # React Native StyleSheet benchmark app
│   ├── unistyles3/         # Unistyles v3 benchmark app
│   ├── uniwind/            # Uniwind benchmark app
│   └── uniwind-pro/        # Uniwind Pro benchmark app (version set by scripts/use-pro.sh)
├── packages/
│   └── benchmark/          # Shared benchmark utilities
├── patches/                # bun patches (react-native-css-interop Expo detection in a bare app)
├── results/                # Measured numbers (results.json, current round + history)
├── scripts/                # Chart generator, Uniwind Pro version switcher
├── biome.json              # Biome configuration (linting + formatting)
├── tsconfig.json           # TypeScript configuration
└── package.json            # Workspace root configuration
```

## Running the benchmarks

```sh
bun install
# iOS (from an app directory)
cd apps/stylesheet/ios && pod install && cd .. && bun run ios -- --mode Release
# Android
bun run android -- --mode release
# NativeWind 5 (Expo)
cd apps/nativewind5 && bunx expo run:ios --configuration Release
# Switch the Uniwind Pro app to another version (then `./gradlew clean` before an Android build)
scripts/use-pro.sh 1.0.1
# Regenerate the charts from results/results.json (requires Google Chrome and ImageMagick)
node scripts/generate-chart.mjs
```

Uniwind Pro requires a license; `bun install` downloads the package through the Uniwind Pro CLI credentials.

## Re-measuring a library

`scripts/bench/` re-measures one or more libraries with the method above and merges the numbers into
`results/results.json`, the tables above and the charts. The configs (ids as in `results.json`, app, bundle ids,
Pro version) live in `scripts/bench/configs.json`. The result tables are generated from `results.json`
(between the `<!-- results:* -->` markers), do not edit them by hand.

Prerequisites: Xcode with the iOS 27 simulator runtime (iPhone 18 Pro Max), the Android SDK with the Pixel_9a AVD
(Android 16, arm64), the [argent](https://www.npmjs.com/package/@swmansion/argent) CLI (`npm i -g @swmansion/argent`,
it launches the iOS apps and reads their result), Google Chrome and ImageMagick for the charts, a Uniwind Pro license
for Pro configs, and a quiet host: stop other builds, test runs and heavy apps (every launch waits for a load average below 6).

Example: Uniwind Pro 1.8.0 once it is published on npm.

```sh
bun install
scripts/use-pro.sh 1.8.0                 # npm:uniwind-pro@1.8.0, bun install, pod install, verifies the version
scripts/bench/build.sh stylesheet        # once: the StyleSheet control app used in every block
scripts/bench/build.sh pro-1.8.0         # Release .app and .apk into .bench/artifacts/, logs in .bench/logs/

# iOS simulator (`xcrun simctl list devices` shows the UDID)
xcrun simctl boot <udid>
# Android emulator: windowless, started from bash, 4 GB RAM (see below)
/bin/bash -c '"$HOME/Library/Android/sdk/emulator/emulator" -avd Pixel_9a -no-snapshot-load -no-audio -memory 4096 -no-window -gpu host > /tmp/emulator.log 2>&1 &'
adb wait-for-device shell 'while [ "$(getprop sys.boot_completed)" != 1 ]; do sleep 2; done'

scripts/bench/measure.py ios <udid> pro-1.8.0
scripts/bench/measure.py android emulator-5554 pro-1.8.0
node scripts/bench/update-results.mjs .bench/runs/<date>-ios.json .bench/runs/<date>-android.json
git diff                                 # review, then commit
```

- The emulator flags matter: macOS App Nap throttles an emulator whose window is hidden (about 6x slower), zsh `&`
  starts it at nice +5, and the AVD's `config.ini` asks for 2 GB, which swaps under this benchmark.
  `measure.py` refuses to start when the emulator threads run at a lowered priority. If `adb devices` shows the
  emulator as `unauthorized`, boot it once with `-wipe-data`.
- `build.sh` never switches Uniwind Pro versions; it fails when the installed version does not match the id. It always
  cleans the Android build, because the React Native bundle task would otherwise reuse a stale JS bundle. For NativeWind 5
  it runs `expo prebuild` when the native projects are missing and re-applies the iOS 27 scene patch
  (`scripts/bench/scene-patch.py`, also needed after every `expo prebuild --clean`).
- `measure.py` defaults to 2 sweeps (forward, reverse) of 3 warm launches (`--sweeps`, `--launches`). StyleSheet controls
  are compared with the StyleSheet median in `results.json`, so other libraries do not need to be re-measured;
  `--rebaseline` measures StyleSheet first instead. Every launch, block and control reading goes to `.bench/runs/`.
- `update-results.mjs` computes ratios against the StyleSheet medians in `results.json`, keeps the replaced numbers under
  `previous`, takes version and label from the measured build (a published version clears the `unreleased` flag and note)
  and regenerates the tables and charts. It refuses when the StyleSheet controls drifted more than 5% from the StyleSheet
  median; `--allow-drift` merges anyway and records a normalized value too. `--dry-run` prints the merged JSON only.
- Still manual: the "Measured on" date and the prose above (for example the Uniwind Pro versions section) and the screenshots.
- A new Uniwind Pro version needs an entry in `scripts/bench/configs.json` (copy `pro-1.8.0`, change `id` and `pro.version`).
