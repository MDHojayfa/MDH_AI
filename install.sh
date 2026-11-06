#!/usr/bin/env bash
# install.sh — one script, one extension, eight platforms.
#
#   ./install.sh              install (or repair) for every browser found
#   ./install.sh --dry-run    print every path it would write, touch nothing
#   ./install.sh --uninstall  remove the host manifests and the wrappers
#   ./install.sh --no-fun     mission control goes quiet (CI, logs, serious meetings)
#   ./install.sh --barbos     also echo every shell command, boot-log style
#   ./install.sh --diagnose   print the machine facts a bug report would carry, then exit
#   ./install.sh --help
#
# HOUSE RULES for the jokes below, because a joke can still be a bug:
#   1. every mission line is printed with ☾ and a dim colour, never with ✔;
#   2. no line claims something real happened; the ✔ lines are the only claims;
#   3. no line says anything about the user's data, keys or files — there is nothing to say;
#   4. --no-fun exists, because humour that cannot be turned off is a defect.
#
# It registers the native host, builds both extension artifacts, and finishes by actually talking to the
# host (a real ping/pong, not an assumption). Files are written only under ~/.config/mdh,
# ~/.local/share/mdh, ~/.local/state/mdh and the browser host directories.
#
# Written for machines that are not new. If a step fails here, it is usually a distribution that renamed a
# binary, not a computer that is too old to run a thirteen-kilobyte JSON host. The developer's own box
# predates the second Bush administration's second term; it has never needed a NASA PC, only a Node version
# that exists.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_NAME="dev.mdhojayfa.mdh"
GECKO_ID="mdh@mdhojayfa.dev"
WRAPPER_DIR="${HOME}/.local/share/mdh"
WRAPPER="${WRAPPER_DIR}/host.sh"
CONFIG_DIR="${HOME}/.config/mdh"

DRY_RUN=0
UNINSTALL=0
DIAGNOSE=0
FUN=1
BARBOS=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --no-fun) FUN=0 ;;
    --barbos) BARBOS=1 ;;
    --diagnose) DIAGNOSE=1 ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown option: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

# --diagnose: the same facts the failure card collects, printed for pasting into an issue. Read-only.
if [ "$DIAGNOSE" -eq 1 ]; then
  echo "MDH_AI diagnostics — paste this into a bug report if it helps. Nothing is uploaded."
  echo "Paths are redacted. Your IP is not included; add it yourself only if you want to."
  echo
  if ! node "$ROOT/host/mdh-log.mjs" --json; then
    echo "could not read the state directory; is node installed and the repo intact?" >&2
    exit 1
  fi
  exit 0
fi

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'
  C_FUN=$'\033[35m'; C_DIM=$'\033[2m'; C_B=$'\033[1m'; C_0=$'\033[0m'
else
  C_OK=''; C_WARN=''; C_ERR=''; C_FUN=''; C_DIM=''; C_B=''; C_0=''
fi

say() { printf '%s\n' "$*"; }
ok() { printf '  %s✔%s %s\n' "$C_OK" "$C_0" "$*"; }
warn() { printf '  %s!%s %s\n' "$C_WARN" "$C_0" "$*"; }
die() { printf '  %s✖%s %s\n' "$C_ERR" "$C_0" "$*" >&2; exit 1; }
run() {
  if [ "$BARBOS" -eq 1 ]; then printf '  %s$ %s%s\n' "$C_DIM" "$*" "$C_0"; fi
  if [ "$DRY_RUN" -eq 1 ]; then printf '  would run: %s\n' "$*"; else "$@"; fi
}

# ☾ the mission log: decoration, and visibly so.
fun() {
  [ "$FUN" -eq 1 ] || return 0
  printf '  %s☾%s %s%s%s\n' "$C_FUN" "$C_0" "$C_DIM" "$1" "$C_0"
  sleep 0.14
}

# A few of these in a row is the loading screen. It is also the only part of this script that has never
# failed, which the developer considers a personal achievement.
mission() {
  fun "contacting the aliens on the Moon…"
  fun "Moon aliens are on a call. Holding."
  fun "taking data from Mars… (light delay: 12 minutes, patience: less)"
  fun "routing packets through Apollo 11…"
  fun "Sputnik 1 answered. It only says \"beep\". It is 1957 years old in satellite years."
  fun "satellite is down. It has been down since Tuesday."
  fun "setting up the laser weapon on Pluto… 12 %"
  fun "Pluto laser charged. Do not point it at the Moon aliens."
  fun "sending a polite missile to Jupiter (it is a paper plane)…"
  fun "Jupiter returned it to sender. Postage due."
  fun "asking Voyager 1 for a status update…"
  fun "Voyager 1 replied \"brb\". That was 22 hours ago."
  fun "rebooting the cosmic microwave background…"
  fun "deploying the solar sail. It is a bedsheet."
}

say ""
say "  ${C_B}MDH_AI${C_0} installer"
say "  ${C_DIM}one script · one extension · eight platforms · zero API keys${C_0}"
say "  ${C_DIM}────────────────────────────────────────────────────────────${C_0}"
if [ "$FUN" -eq 1 ]; then
  say "  ${C_DIM}BARBOS MODE: on. Lines tagged ☾ are decorative. Lines tagged ✔ are real.${C_0}"
  say ""
  mission
fi
if [ "$DRY_RUN" -eq 1 ]; then say "  (dry run — nothing will be changed)"; fi

# ── 1 · dependencies ────────────────────────────────────────────────────────────────────────────────
say ""
say "${C_B}1/6${C_0} checking dependencies"
fun "calibrating the satellite dish with a coat hanger…"

command -v node >/dev/null 2>&1 || die "node is required (20 or newer). Install it and run this again."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "node $NODE_MAJOR is too old; 20 or newer is required."
ok "node $(node -p 'process.versions.node') — newer than Sputnik, which is the bar"

command -v python3 >/dev/null 2>&1 \
  && ok "python3 present (some MCP servers want it; this script does not)" \
  || warn "python3 missing — fine unless your MCP servers need it"

command -v podman >/dev/null 2>&1 \
  && ok "podman present — container mode available if you want a hard boundary" \
  || fun "no podman. The laser on Pluto is also out of reach. We cope."

# ── 2 · extension identity ─────────────────────────────────────────────────────────────────────────
say ""
say "${C_B}2/6${C_0} extension identity"
fun "asking the Moon for our coordinates. The Moon asks about you."

EXT_ID="$(node -e '
const fs=require("fs");
const key=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).key;
const der=Buffer.from(key,"base64");
const hex=require("crypto").createHash("sha256").update(der).digest("hex").slice(0,32);
process.stdout.write(hex.replace(/[0-9a-f]/g,c=>"abcdefghijklmnop"[parseInt(c,16)]));
' "$ROOT/src/overlays/chrome.json")"
[ -n "$EXT_ID" ] || die "could not derive the extension id from src/overlays/chrome.json"
ok "chromium id ${EXT_ID} (pinned by the key — same on every machine, unlike the weather on Mars)"
ok "firefox id ${GECKO_ID}"

# ── 3 · build ──────────────────────────────────────────────────────────────────────────────────────
say ""
say "${C_B}3/6${C_0} building the extension"
fun "compiling 400 lines of JavaScript using no compiler, because it is JavaScript"
fun "defragmenting the asteroid belt… (already defragmented, thank you)"
if [ "$DRY_RUN" -eq 1 ]; then
  say "  would run: npm run build"
else
  ( cd "$ROOT" && npm run build --silent )
fi
[ -f "$ROOT/dist/firefox/manifest.json" ] || [ "$DRY_RUN" -eq 1 ] || die "build produced no dist/firefox"
fun "both artifacts built. NASA would have needed a review board and a launch window."

# ── 4 · native host ────────────────────────────────────────────────────────────────────────────────
say ""
say "${C_B}4/6${C_0} registering the native host"
fun "wiring the pipe. No port. No socket. No website can dial in. This is the whole security model."

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
  "description": "MDH_AI host — native messaging, builtin Linux tools and your MCP servers",
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
  "description": "MDH_AI host — native messaging, builtin Linux tools and your MCP servers",
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
  warn "no ~/.mozilla yet — open Firefox once, then run this again"
  fun "Firefox has not introduced itself. We will wait; we are good at waiting."
fi

if [ "$BROWSERS_FOUND" -eq 0 ]; then
  warn "no browser profile found. Open Chrome/Brave/Chromium or Firefox once, then run this again."
  fun "0 browsers detected. The satellite is down, and so is the audience."
fi

# The manifest points at an executable, not at node directly — browsers exec the path and nothing else.
run mkdir -p "$WRAPPER_DIR"
if [ "$DRY_RUN" -eq 1 ]; then
  say "  would write: $WRAPPER"
else
  cat > "$WRAPPER" <<EOF
#!/bin/sh
# Generated by MDH_AI install.sh — exec the host; protocol on stdout, logs on stderr.
exec "$(command -v node)" "${ROOT}/host/mdh-host.mjs" "\$@"
EOF
  chmod 755 "$WRAPPER"
fi
ok "wrapper: ${WRAPPER}"

# A second wrapper, because "look at the log" should not require remembering a path. It is a file viewer and
# a loopback server, nothing else; --serve refuses every request without the token it prints.
LOG_WRAPPER="${WRAPPER_DIR}/mdh-log"
if [ "$DRY_RUN" -eq 1 ]; then
  say "  would write: $LOG_WRAPPER"
else
  cat > "$LOG_WRAPPER" <<EOF
#!/bin/sh
# Generated by MDH_AI install.sh — the local log page.
#   mdh-log            write ~/.local/state/mdh/log.html and print the path
#   mdh-log --open     …and open it
#   mdh-log --serve    live view on 127.0.0.1 only, token in the URL
#   mdh-log --json     summary as JSON, for a bug report
exec "$(command -v node)" "${ROOT}/host/mdh-log.mjs" "\$@"
EOF
  chmod 755 "$LOG_WRAPPER"
fi
ok "log viewer: ${LOG_WRAPPER}"

# ── 5 · config ────────────────────────────────────────────────────────────────────────────────────
say ""
say "${C_B}5/6${C_0} config files"
fun "reading the config. It is 9 lines, which is the correct number of lines for a config."

run mkdir -p "$CONFIG_DIR"
if [ -f "${CONFIG_DIR}/config.json" ]; then
  ok "kept existing ${CONFIG_DIR}/config.json (your edits are yours)"
else
  write_json "${CONFIG_DIR}/config.json" '{
  "allowPaths": ["~/projects", "~/mdh", "/tmp/mdh"],
  "denyPaths": ["~/.ssh", "~/.gnupg", "~/.aws", "~/.config", "~/.local/share/keyrings", "~/.mozilla", "/etc/shadow"],
  "commandTimeoutMs": 60000,
  "container": false
}'
  ok "wrote ${CONFIG_DIR}/config.json"
  fun "allowlist: three folders. Deny list: everything embarrassing. This ratio is on purpose."
fi
if [ -f "${CONFIG_DIR}/servers.json" ]; then
  ok "kept existing ${CONFIG_DIR}/servers.json"
else
  write_json "${CONFIG_DIR}/servers.json" '{ "servers": [] }'
  ok "wrote ${CONFIG_DIR}/servers.json (see host/servers.example.json for the shape)"
  fun "0 MCP servers configured. The 13 builtins still work; Jupiter remains unreachable."
fi

# ── 6 · uninstall ─────────────────────────────────────────────────────────────────────────────────
if [ "$UNINSTALL" -eq 1 ]; then
  say ""
  say "${C_B}removing${C_0}"
  fun "recalling the missile. It was a paper plane anyway."
  for f in \
    "${HOME}/.config/google-chrome/NativeMessagingHosts/${HOST_NAME}.json" \
    "${HOME}/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/${HOST_NAME}.json" \
    "${HOME}/.config/chromium/NativeMessagingHosts/${HOST_NAME}.json" \
    "${HOME}/.mozilla/native-messaging-hosts/${HOST_NAME}.json" \
    "${WRAPPER}" \
    "${WRAPPER_DIR}/mdh-log"
  do
    if [ -f "$f" ]; then run rm -f "$f"; ok "removed $f"; fi
  done
  say ""
  say "Your audit log and config were left in place on purpose."
  say "Remove ${HOME}/.local/state/mdh and ${CONFIG_DIR} yourself if you want them gone."
  fun "Moon aliens informed. They asked us to keep the laser."
  exit 0
fi

# ── 7 · the only step that proves it works ────────────────────────────────────────────────────────
say ""
say "${C_B}6/6${C_0} self-check (a real ping, not an assumption)"
fun "waiting for a pong from a process that has existed for 400 milliseconds…"
if [ "$DRY_RUN" -eq 1 ]; then
  say "  would run: node tools/selfcheck.mjs"
else
  if node "$ROOT/tools/selfcheck.mjs" --quiet; then
    fun "the host answered. Voyager 1 could never."
  else
    die "the host did not answer. Check that node runs '${ROOT}/host/mdh-host.mjs' and read its stderr."
  fi
fi

# ── 8 · what to do next ───────────────────────────────────────────────────────────────────────────
say ""
say "${C_B}Next${C_0} load the extension (once per browser)"
say "   chrome://extensions        → Developer mode → Load unpacked → ${ROOT}/dist/chrome"
say "   (Brave uses the same artifact: brave://extensions)"
say "   about:debugging#/runtime/this-firefox → Load Temporary Add-on → ${ROOT}/dist/firefox/manifest.json"
say ""
say "Then open one of the 8 platforms and use the small pill on the chat box — click to start, click to pause,
click to continue. The toolbar icon opens the settings drawer; it is no longer the only way in."
say "First run opens the author's GitHub profile once — the follow button is there, one click away,"
say "and the site is linked in the popup. Nothing about you is sent anywhere; there is no telemetry to send it."
say ""
if [ "$FUN" -eq 1 ]; then
  fun "mission control signing off. The lasers were never real. The shell is."
  fun "remember: \$HOME is not a suggestion, and neither is the approval card."
fi
say "If something breaks: ${ROOT}/docs/FAQ.md first, then an issue at"
say "https://github.com/MDHojayfa/MDH_AI/issues — the developer has no NASA PC, so your log is the"
say "closest thing to a test machine this project has."
say ""
say "Docs: ${ROOT}/docs/MANUAL.md · profile: https://github.com/MDHojayfa"
