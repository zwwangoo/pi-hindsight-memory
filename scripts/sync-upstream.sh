#!/usr/bin/env bash
# Re-vendor the five vendored upstream artifacts from the npm package.
#
# Usage: scripts/sync-upstream.sh 0.8.2
#
# The vendored files are byte-identical copies of
#   package/dist/pi.js                -> vendor/hindsight-pi.mjs   (mode 644)
#   package/dist/deepen.js            -> vendor/deepen.js         (mode 755)
#   package/dist/daemon-start.js      -> vendor/daemon-start.js   (mode 755)
#   package/dist/mcp-server.js        -> vendor/mcp-server.js     (mode 755)
#   package/dist/survey-supervisor.js -> vendor/survey-supervisor.js (mode 755)
# from @vectorize-io/hindsight-coding-agents. Never hand-edit them; all local behaviour lives in
# src/index.mjs. This script also re-checks the upstream internals the wrapper and the sibling
# spawns depend on.
set -euo pipefail

VERSION="${1:?usage: scripts/sync-upstream.sh <version>   e.g. 0.8.2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="@vectorize-io/hindsight-coding-agents"
URL="https://registry.npmjs.org/${PKG}/-/hindsight-coding-agents-${VERSION}.tgz"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> fetching $PKG@$VERSION"
curl -fsSL -o "$TMP/pkg.tgz" "$URL"
tar xzf "$TMP/pkg.tgz" -C "$TMP"

for f in pi.js deepen.js daemon-start.js mcp-server.js survey-supervisor.js; do
  [ -f "$TMP/package/dist/$f" ] || { echo "missing dist/$f in tarball" >&2; exit 1; }
done

echo "==> checking wrapper assumptions in dist/pi.js"
grep -q 'getBranch' "$TMP/package/dist/pi.js" \
  || { echo "!! dist/pi.js no longer references getBranch — review src/index.mjs before wiring 0.8.x" >&2; exit 1; }
grep -q 'event.messages' "$TMP/package/dist/pi.js" \
  || { echo "!! dist/pi.js no longer has the event.messages fallback — review src/index.mjs" >&2; exit 1; }

# The three sibling bundles are spawned by bare filename from dist/pi.js; if a rename ever happens
# the corresponding feature degrades to a silent no-op, so fail loudly here.
echo "==> checking sibling spawns in dist/pi.js"
for f in deepen.js daemon-start.js mcp-server.js survey-supervisor.js; do
  grep -q "$f" "$TMP/package/dist/pi.js" \
    || { echo "!! dist/pi.js no longer mentions $f; vendor/$f would be dead weight" >&2; exit 1; }
done

install -m 644 "$TMP/package/dist/pi.js" "$ROOT/vendor/hindsight-pi.mjs"
install -m 755 "$TMP/package/dist/deepen.js" "$ROOT/vendor/deepen.js"
install -m 755 "$TMP/package/dist/daemon-start.js" "$ROOT/vendor/daemon-start.js"
install -m 755 "$TMP/package/dist/mcp-server.js" "$ROOT/vendor/mcp-server.js"
install -m 755 "$TMP/package/dist/survey-supervisor.js" "$ROOT/vendor/survey-supervisor.js"
printf '%s\n' "$VERSION" > "$ROOT/vendor/UPSTREAM_VERSION"

echo "==> new checksums"
FILES=(hindsight-pi.mjs deepen.js daemon-start.js mcp-server.js survey-supervisor.js)
( cd "$ROOT/vendor" && md5 -q "${FILES[@]}" 2>/dev/null || md5sum "${FILES[@]}" )
echo "==> done. Update vendor/PROVENANCE.md, run the tests, then reload the plugin."
