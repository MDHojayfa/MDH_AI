#!/usr/bin/env bash
# install.sh — one script, one extension, eight platforms.
#
#   ./install.sh              install (or repair) for every browser found
#   ./install.sh --dry-run    print every path it would write, touch nothing
#   ./install.sh --uninstall  remove the host manifests and the wrapper
#   ./install.sh --help
#
# It registers the native host, builds both extension artifacts, and finishes by actually talking to the
# host (a real ping/pong, not an assumption). Logs and prompts go to stdout; nothing is written outside
# ~/.config/mdh, ~/.local/share/mdh, ~/.local/state/mdh and the browser host directories.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_NAME="dev.mdhojayfa.mdh"
GECKO_ID="mdh@mdhojayfa.dev"
WRAPPER_DIR="${HOME}/.local/share/mdh"
WRAPPER="${WRAPPER_DIR}/host.sh"
CONFIG_DIR="${HOME}/.config/mdh"

DRY_RUN=0
UNINSTALL=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help)
      sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown option: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

say() { printf '%s\n' "$*"; }
ok() { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die() { printf '  \033[31m✖\033[0m %s\n' "$*" >&2; exit 1; }
run() { if [ "$DRY_RUN" -eq 1 ]; then printf '  would run: %s\n' "$*"; else "$@"; fi; }

say "MDH_AI installer"
say "================"
[ "$DRY_RUN" -eq 1 ] && say "(dry run — nothing will be changed)"

# ── 1 · dependencies ────────────────────────────────────────────────────────────────────────────────
say ""
say "1. checking dependencies"

command -v node >/dev/null 2>&1 || die "node is required (20 or newer). Install it and run this again."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "node $NODE_MAJOR is too old; 20 or newer is required."
ok "node $(node -p 'process.versions.node')"

if command -v python3 >/dev/null 2>&1; then ok "python3 present (used by some MCP servers)"; else warn "python3 missing — fine unless your MCP servers need it"; fi

# ── 2 · extension identity ─────────────────────────────────────────────────────────────────────────
say ""
say "2. extension identity"
EXT_ID="$(node -e '
const fs=require("fs");
const key=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).key;
const der=Buffer.from(key,"base64");
const hex=require("crypto").createHash("sha256").update(der).digest("hex").slice(0,32);
process.stdout.write(hex.replace(/[0-9a-f]/g,c=>"abcdefghijklmnop"[parseInt(c,16)]));
' "$ROOT/src/overlays/chrome.json")"
[ -n "$EXT_ID" ] || die "could not derive the extension id from src/overlays/chrome.json"
ok "chromium id ${EXT_ID} (pinned by the key — it is the same on every machine)"
ok "firefox id ${GECKO_ID}"

# ── 3 · build ──────────────────────────────────────────────────────────────────────────────────────
say ""
say "3. building the extension"
if [ "$DRY_RUN" -eq 1 ]; then
  say "  would run: npm run build"
else
  ( cd "$ROOT" && npm run build --silent )
fi
[ -f "$ROOT/dist/firefox/manifest.json" ] || [ "$DRY_RUN" -eq 1 ] || die "build produced no dist/firefox"

# ── 4 · native host ────────────────────────────────────────────────────────────────────────────────
say ""
say "4. registering the native host"

write_json() {
  local path="$1" body="$2"
  run mkdir -p "$(dirname "$path")"
  if [ "$DRY_RUN" -eq 1 ]; then
    say "  would write: $path"
  else
    printf '%s\n' "$body" > "$path"
  fi
}

chromium_manifest() {
  cat <<EOF
{
  "name": "${HOST_NAME}",
  "description": "MDH_AI host — runs the builtin Linux tools and your MCP servers",
  "path": "${WRAPPER}",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://${EXT_ID}/"]
}
EOF
}

firefox_manifest() {
  cat <<EOF
{
  "name": "${HOST_NAME}",
  "description": "MDH_AI host — runs the builtin Linux tools and your MCP servers",
  "path": "${WRAPPER}",
  "type": "stdio",
  "allowed_extensions": ["${GECKO_ID}"]
}
EOF
}

BROWSERS_FOUND=0
for dir in \
  "${HOME}/.config/google-chrome/NativeMessagingHosts" \
  "${HOME}/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts" \
  "${HOME}/.config/chromium/NativeMessagingHosts"
do
  parent="$(dirname "$dir")"
  [ -d "$parent" ] || continue
  BROWSERS_FOUND=$((BROWSERS_FOUND + 1))
  write_json "${dir}/${HOST_NAME}.json" "$(chromium_manifest)"
  ok "chromium-family: ${dir}"
done

if [ -d "${HOME}/.mozilla" ]; then
  BROWSERS_FOUND=$((BROWSERS_FOUND + 1))
  write_json "${HOME}/.mozilla/native-messaging-hosts/${HOST_NAME}.json" "$(firefox_manifest)"
  ok "firefox: ${HOME}/.mozilla/native-messaging-hosts"
else
  warn "no ~/.mozilla — Firefox will be registered the next time you run this after opening Firefox once"
fi

if [ "$BROWSERS_FOUND" -eq 0 ]; then
  warn "no browser profile found yet. Open Chrome/Brave/Chromium or Firefox once, then run this again."
fi

# wrapper: the manifest points at an executable, not at node directly
run mkdir -p "$WRAPPER_DIR"
if [ "$DRY_RUN" -eq 1 ]; then
  say "  would write: $WRAPPER"
else
  cat > "$WRAPPER" <<EOF
#!/bin/sh
# Generated by MDH_AI install.sh — exec the host; all logs go to stderr.
exec "$(command -v node)" "${ROOT}/host/mdh-host.mjs" "\$@"
EOF
  chmod 755 "$WRAPPER"
fi
ok "wrapper: ${WRAPPER}"

# ── 5 · config ────────────────────────────────────────────────────────────────────────────────────
say ""
say "5. config files"
run mkdir -p "$CONFIG_DIR"
if [ -f "${CONFIG_DIR}/config.json" ]; then
  ok "kept existing ${CONFIG_DIR}/config.json"
else
  write_json "${CONFIG_DIR}/config.json" '{
  "allowPaths": ["~/projects", "~/mdh", "/tmp/mdh"],
  "denyPaths": ["~/.ssh", "~/.gnupg", "~/.aws", "~/.config", "~/.local/share/keyrings", "~/.mozilla", "/etc/shadow"],
  "commandTimeoutMs": 60000,
  "container": false
}'
  ok "wrote ${CONFIG_DIR}/config.json"
fi
if [ -f "${CONFIG_DIR}/servers.json" ]; then
  ok "kept existing ${CONFIG_DIR}/servers.json"
else
  write_json "${CONFIG_DIR}/servers.json" '{ "servers": [] }'
  ok "wrote ${CONFIG_DIR}/servers.json (add your MCP servers here; see host/servers.example.json)"
fi

# ── 6 · uninstall ─────────────────────────────────────────────────────────────────────────────────
if [ "$UNINSTALL" -eq 1 ]; then
  say ""
  say "removing"
  for f in \
    "${HOME}/.config/google-chrome/NativeMessagingHosts/${HOST_NAME}.json" \
    "${HOME}/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/${HOST_NAME}.json" \
    "${HOME}/.config/chromium/NativeMessagingHosts/${HOST_NAME}.json" \
    "${HOME}/.mozilla/native-messaging-hosts/${HOST_NAME}.json" \
    "${WRAPPER}"
  do
    if [ -f "$f" ]; then run rm -f "$f"; ok "removed $f"; fi
  done
  say ""
  say "Your audit log and config were left in place."
  say "Remove ${HOME}/.local/state/mdh and ${CONFIG_DIR} yourself if you want them gone."
  exit 0
fi

# ── 7 · the only step that proves it works ────────────────────────────────────────────────────────
say ""
say "6. self-check (a real ping, not an assumption)"
if [ "$DRY_RUN" -eq 1 ]; then
  say "  would run: node tools/selfcheck.mjs"
else
  if node "$ROOT/tools/selfcheck.mjs" --quiet; then
    :
  else
    die "the host did not answer. Check that node runs '${ROOT}/host/mdh-host.mjs' and look at its stderr."
  fi
fi

# ── 8 · what to do next ───────────────────────────────────────────────────────────────────────────
say ""
say "7. load the extension (once per browser)"
say "   chrome://extensions        → Developer mode → Load unpacked → ${ROOT}/dist/chrome"
say "   (Brave uses the same artifact: brave://extensions)"
say "   about:debugging#/runtime/this-firefox → Load Temporary Add-on → ${ROOT}/dist/firefox/manifest.json"
say ""
say "Then open one of the 8 platforms, click the MDH icon, and give it a task."
say ""
say "If something breaks: ${ROOT}/docs/FAQ.md first, then an issue at"
say "https://github.com/MDHojayfa/MDH_AI/issues — the developer has no NASA PC, so your log is the"
say "closest thing to a test machine this project has."
say ""
say "Docs: ${ROOT}/docs/MANUAL.md · profile: https://github.com/MDHojayfa"
