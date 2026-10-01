#!/usr/bin/env bash
# Switch apps/uniwind-pro between Uniwind Pro versions (all share one app / bundle id).
#
# Usage: scripts/use-pro.sh <version>          e.g. 1.0.1, 1.7.0, 1.8.0
#
#   Installs `uniwind: npm:uniwind-pro@<version>` from npm.
#   UNIWIND_PRO_TARBALL=/path/to/uniwind-pro-<version>.tgz installs a local build instead
#   (`uniwind: file:<tarball>`); its package.json version must equal <version>.
#
# Steps:
#   1. rewrite the `uniwind` dependency in apps/uniwind-pro/package.json
#   2. `bun install` at the repo root
#   3. npm releases ship only a `pre/` stub whose postinstall downloads the licensed package using the
#      macOS keychain credentials; bun may skip it, so run it manually when the real package is missing
#   4. Pro < 1.7 prefers Expo's transform worker whenever `@expo/metro-config` resolves, and bun's isolated
#      store leaks it from apps/nativewind5 via node_modules/.bun/node_modules. Hide it for those versions,
#      restore it otherwise (while hidden, switch back before working on apps/nativewind5)
#   5. `pod install` in apps/uniwind-pro/ios
#   6. verify the resolved version
#
# Then build with `scripts/bench/build.sh pro-<version>` (it cleans Android, the RN gradle bundle task
# does not see node_modules changes).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/apps/uniwind-pro"
PKG="$APP/node_modules/uniwind"
TARBALL="${UNIWIND_PRO_TARBALL:-}"
EXPO_METRO_CONFIG="$ROOT/node_modules/.bun/node_modules/@expo/metro-config"
EXPO_METRO_CONFIG_HIDDEN="$EXPO_METRO_CONFIG.hidden-by-use-pro"

VERSION="${1:-}"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Usage: $0 <version>   (e.g. 1.8.0; set UNIWIND_PRO_TARBALL to install a local build)" >&2
  exit 1
fi

if [ -n "$TARBALL" ]; then
  if [ ! -f "$TARBALL" ]; then
    echo "UNIWIND_PRO_TARBALL does not exist: $TARBALL" >&2
    exit 1
  fi
  SPEC="file:$TARBALL"
else
  SPEC="npm:uniwind-pro@$VERSION"
fi

# Pro < 1.7 needs @expo/metro-config hidden (step 4)
HIDE_EXPO=""
if [ "$(printf '%s\n%s\n' "$VERSION" 1.7.0 | sort -V | head -1)" != "1.7.0" ]; then
  HIDE_EXPO=1
fi

echo "==> uniwind -> $SPEC"
SPEC="$SPEC" node -e '
  const fs = require("node:fs")
  const file = process.argv[1]
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"))
  pkg.dependencies.uniwind = process.env.SPEC
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
' "$APP/package.json"

# Restore before installing so bun sees the store as it left it
if [ -e "$EXPO_METRO_CONFIG_HIDDEN" ] && [ ! -e "$EXPO_METRO_CONFIG" ]; then
  mv "$EXPO_METRO_CONFIG_HIDDEN" "$EXPO_METRO_CONFIG"
fi

echo "==> bun install"
(cd "$ROOT" && bun install)

if [ ! -f "$PKG/Uniwind.podspec" ]; then
  if [ -f "$PKG/pre/postinstall/index.js" ]; then
    echo "==> running Uniwind Pro postinstall"
    (cd "$PKG" && node pre/postinstall/index.js)
  fi
fi

if [ ! -f "$PKG/Uniwind.podspec" ]; then
  echo "Uniwind Pro package is incomplete (no Uniwind.podspec in $PKG)" >&2
  exit 1
fi

if [ -n "$HIDE_EXPO" ]; then
  if [ -e "$EXPO_METRO_CONFIG" ]; then
    echo "==> hiding $EXPO_METRO_CONFIG (Pro < 1.7 would use Expo's transform worker)"
    mv "$EXPO_METRO_CONFIG" "$EXPO_METRO_CONFIG_HIDDEN"
  fi
fi

echo "==> pod install"
(cd "$APP/ios" && pod install)

RESOLVED="$(node -p "require('$PKG/package.json').version")"
echo "==> Uniwind Pro resolved: $RESOLVED"

if [ "$RESOLVED" != "$VERSION" ]; then
  echo "Expected $VERSION, got $RESOLVED" >&2
  exit 1
fi
