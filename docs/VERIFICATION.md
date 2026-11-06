# Verification: what is proven, by what, and what is not

Most projects answer "does it work?" with a badge. This file answers it with a list of things that were actually
done, the name of the test that does them, and the things nobody has done yet. If a claim is not in the first list,
it is in the second or the third, and it should not be read as tested.

## 1. What the suite proves

`npm test` runs `node --test tests/*.test.mjs` — 300 checks, no browser needed, ~16 seconds on one core. The
tests load **the same script files the extension ships** into a `vm` context with a fake `chrome.*`, a fake page
and a fake storage (`tests/helpers.mjs`). There is no second copy of the logic anywhere, which is why the
numbers below mean something.

| Claim in the README | Test that backs it |
|---|---|
| the pill appears above the composer and shows a phase per state | `tests/dock.test.mjs`, `tests/a11y.test.mjs` |
| the approval card renders the parsed request, not the model's prose | `tests/grant.test.mjs`, `tests/grants.test.mjs` |
| a denial is honoured, a timeout is a denial | `tests/policy.test.mjs`, `tests/grants.test.mjs`, `tests/guard.test.mjs` |
| both path checks reject the same escapes, including symlinks | `tests/guard.test.mjs` |
| the audit chain detects an edited or removed line | `tests/audit.test.mjs` |
| eight platform adapters parse their own reply shapes | `tests/parser.test.mjs`, `tests/via.test.mjs` |
| rejection → reload → wait → fresh chat → pause, in that order | `tests/phoenix.test.mjs`, `tests/planmode.test.mjs` |
| the host speaks the same frame protocol the extension sends | `tests/host.test.mjs`, `tests/handoff.test.mjs` |
| the log page filters, hides and never deletes | `tests/logcli.test.mjs`, `tests/viewer.test.mjs` |
| the manifest asks for nothing it does not use | `tests/manifest.test.mjs` |
| the version is the same in all seven places | `tests/version.test.mjs` |
| the KB numbers in the docs match the zip | `npm run weigh`, `tests/weigh.test.mjs` |

## 2. What only a browser can prove, and where to run it

A `vm` context is not Chrome. It has no service worker, no `connectNative`, no compositor, no shadow DOM layout.
Those four things are checked by `npm run live-check`, which drives the browser **you already have** over the
DevTools protocol. It needs no npm packages: Node 22 has a `WebSocket` client, and Chrome supplies the rest.

```bash
npm run build
./install.sh                       # registers the native host for your browser
npm run live-check                 # extension loads, worker registers, real host answers
npm run live-check -- --page https://chatgpt.com/      # …and the pill mounts on a live page
npm run live-check -- --page https://chatgpt.com/ --click   # …and Start actually starts
```

| Step | What passing means |
|---|---|
| `extension is built` | `dist/chrome/manifest.json` exists and is manifest v3 |
| `native host manifest` | the manifest for your browser points at a file that exists and allows this extension id |
| `service worker registered` | Chrome accepted the extension and started `background.js` — the thing a `vm` test can only assume |
| `native host answers` | a real `connectNative` round trip returned a `pong` from the real host, with the audit chain status |
| `the pill mounted` | `#mdh-dock` exists in a live page's DOM with a `.pill` in its shadow root, positioned above the composer |
| `Start pressed` | with `--click`: the pill left `Start`, which means the click reached the agent, not just the event listener |

`--click` sends a message into the chat that is open in that tab. That is a real action on a real account, which is
why it is a flag and not the default.

## 3. What has not been done

Said plainly, because the alternative is a README that lies:

- **This repository's test run has never had a browser in it.** The machine that produced these commits has no
  Chrome, no Firefox, and no way to install one: the package mirrors a browser download needs are not reachable
  from it, and the shared libraries Chromium links against are not installed. `npm run live-check` is written for
  a machine where they are; **it has not been run here**, and its own tests cover its argument parsing, browser
  discovery, manifest parsing and DevTools client — not a browser session.
- **The eight platform adapters have not been fired at the eight live sites from here.** They are tested against
  saved fixtures of the reply shapes they parse. A site redesign breaks an adapter the day it ships, and no test
  can prevent that; `docs/PLATFORMS.md` says which platforms are marked tested, and by whom.
- **No store has reviewed this.** The zips pass `web-ext lint` and the manifest tests; submission is a person's
  step, described in `docs/RELEASE.md`.
- **Firefox is built, not driven.** The Firefox artifact is generated and linted, but nothing in this repository
  has loaded it into Firefox.
- **One desktop, one distribution.** Everything measured here was measured on Linux/x64 with Node 22, X11, one
  shell. Wayland, other distros, other Node versions: untested, and `docs/KNOWN-LIMITS.md` lists them.

## 4. The five-minute version, for a reader who trusts nothing

```bash
git clone https://github.com/MDHojayfa/MDH_AI && cd MDH_AI
npm test                       # 300 checks, no network, no browser
npm run weigh                  # the numbers in the README, measured again
./install.sh --diagnose        # the host, talking to itself
npm run live-check             # the four things a fake page cannot test
```

If any of those four disagree with this file, this file is wrong and the command output is right.
