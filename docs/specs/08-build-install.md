# Spec 08 — Build, install, packaging (Linux)

**Files:** `tools/build.mjs`, `install.sh`, `packaging/mdh.service` · **Milestone:** M1 + M9

## Build — one source, two manifests, three browsers

```bash
npm run build          # → dist/chrome, dist/firefox
npm run build -- chrome
```

| Key | chrome build | firefox build |
|---|---|---|
| `background` | `{service_worker, type:"module"}` | `{scripts:[compat.js, background.js], type:"module"}` |
| `minimum_chrome_version` | `116` | removed |
| `browser_specific_settings` | — | `gecko.id`, `strict_min_version:"140.0"`, `gecko_android:"142.0"`, `data_collection_permissions:{required:["none"]}` |

Brave = the chrome artifact. Nothing differs inside the extension; only the native-host registration path.

**No bundler.** Vanilla ES modules, `node --check` on every file as a lint step, `web-ext lint` for Firefox.

## install.sh contract

```bash
./install.sh --dry-run     # print every action, touch nothing  (default is NOT dry)
./install.sh               # install
./install.sh --uninstall   # remove host, manifests, service, extension data
```

Steps, in order:
1. Detect `python3` ≥ 3.9, `node` ≥ 18 (build only), `systemctl --user`.
2. Create venv at `~/.local/share/mdh/venv`, install `websockets`-free deps (stdlib only if possible).
3. Copy host to `~/.local/share/mdh/mdh-host`, `chmod 0755`.
4. Write host manifests for **each browser directory that exists**; skip and report the absent ones.
   Print the extension ID it wrote, and how to get it from the popup.
5. `systemctl --user enable --now mdh.service` (optional; the browser can spawn the host itself).
6. Print the next three steps verbatim (build, load unpacked, pick browser).

Idempotent. Never overwrites `tools.json` without `--force`. Never requires `sudo`; if sudo is needed,
it says exactly which line and stops.

## systemd unit (`~/.config/systemd/user/mdh.service`)

```ini
[Unit]
Description=MDH_AI host
[Service]
ExecStart=%h/.local/share/mdh/mdh-host --daemon
Restart=on-failure
RestartSec=2
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=%h/projects %h/mdh /tmp/mdh %h/.local/state/mdh
[Install]
WantedBy=default.target
```

Note: the unit is for the **daemon** mode (used when the browser's native-messaging spawn is
undesirable). Native messaging itself needs no unit — the browser starts the host on demand.

## Repo layout after M1

```
src/            content, background, core, platforms, ui, shared
host/           mdh_host.py, policy.py, mcp_client.py, tools/
tools/          build.mjs, lint.mjs
platforms/      one file per site (data only)
docs/           plan, architecture, specs, platform notes
app/            TEMPORARY imported base — deleted at M10
install.sh  packaging/
```

## Acceptance criteria
- [ ] `./install.sh --dry-run` makes no changes (verify with `git status` + `find ~ -newer`).
- [ ] Fresh Ubuntu 24.04 container: install → load in Chrome → smoke tool works, in < 5 min.
- [ ] Uninstall leaves no host manifests and no service behind.
- [ ] Build is byte-identical across runs (reproducible).
