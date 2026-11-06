# MDH_AI — v1 Master Plan

**Scope locked 2026-11-06.**

| Axis | v1 decision |
|---|---|
| Browsers | **Chrome · Brave · Firefox** (Brave is Chromium → same artifact as Chrome, different native-host path) |
| OS | **Linux only.** Windows/macOS deferred to v2+. No conditional code paths for them except where free |
| Distribution | unpacked / side-loaded. No store submissions in v1 |
| Platforms | **8**: ChatGPT · Claude · Gemini · DeepSeek · Kimi · Qwen · GLM/z.ai · Grok |
| Explicitly out | Arena, Meta AI, Doubao, Perplexity, Copilot (v2 candidates) |
| Model access | whatever web chat you are logged into. No API keys, ever |
| Tool boundary | MCP (any server) + a built-in Linux toolset |
| Languages | prompt + UI in English. Bangla UI reference manual after v1 |

---

## 1. The one-sentence product

> Run one script, load one extension, keep chatting — and the web model gets a real shell on your
> Linux box, with a permission card in front of every action, in Chrome, Brave and Firefox.

## 2. What "done" means (definition of done)

v1 ships when **all** of these are true:

- [ ] `./install.sh` on a clean Ubuntu/Debian box → bridge installed, native host registered for
      Chrome, Brave **and** Firefox, systemd user unit enabled, extension build printed
- [ ] The extension loads without errors in Chrome 116+, Brave, Firefox 140+
- [ ] All 8 platforms: inject prompt → detect call → approve → execute → deliver result → loop continues
- [ ] A rate-limit refusal stops the loop cleanly and resumes on the next user message (never re-sends blindly)
- [ ] Approval works: `allow` / `ask` / `deny`, per server **and** per tool
- [ ] Tool result over ~64 KB is attached as a file / truncated with a note, never silently dropped
- [ ] Extension reload mid-session is detected and reported, not silently retried
- [ ] `web-ext lint` 0 errors; `npm test` green; shellcheck clean; `install.sh --dry-run` prints a plan
- [ ] The repo contains **no third-party code** — `app/` deleted, only our own implementation
- [ ] A documented live-test checklist that a human can run in 10 minutes

## 3. Architecture in one screen

```
┌────────────────────────── browser ──────────────────────────┐
│ chat page (chatgpt.com, claude.ai, …)                       │
│   ▲ DOM fallback            ▲ stream                        │
│   │                         │                               │
│ ┌─┴─────────────────────────┴──────────────────────────┐    │
│ │ content/*.js  (per-site adapter + UI panel)          │    │
│ │  · inject tool catalogue                             │    │
│ │  · read reply: SSE text → binary frames → DOM        │    │
│ │  · parse call, ask the user, deliver result          │    │
│ └───────────────────────┬──────────────────────────────┘    │
│                         │ chrome.runtime                    │
│ ┌───────────────────────▼──────────────────────────────┐    │
│ │ background.js  (transport + state + permissions)     │    │
│ └───────────────────────┬──────────────────────────────┘    │
└─────────────────────────┼───────────────────────────────────┘
                          │ native messaging (stdio, no port)
                ┌─────────▼──────────┐
                │ host/mdh-host      │  Python, spawned by the browser
                │  · MCP stdio client│
                │  · policy + audit  │
                └─────────┬──────────┘
                          │ JSON-RPC stdio
              ┌───────────┴────────────┐
        DesktopCommander           builtin linux tools
        (or any MCP server)        (fs, shell, proc, gui)
```

Three processes, one socket, no open port.

## 4. Milestones

| # | Milestone | Deliverable | Verification |
|---|---|---|---|
| M0 | **Plan** (this document set) | `docs/**` | reviewed, committed |
| M1 | **Skeleton** | build emits `dist/{chrome,firefox}` from `src/`; lint clean | `npm run build && npm run lint:firefox` |
| M2 | **Interceptor** | fetch+XHR hook, text + binary readers, chunk reassembly | unit tests with synthetic streams |
| M3 | **Parser + prompt** | envelope parse, repair, failure feedback | unit tests incl. fuzz corpus |
| M4 | **Loop** | inject → observe → execute → deliver, with the refusal rule | headless harness (no browser) |
| M5 | **Transport** | native messaging host, Linux manifests for 3 browsers | loopback harness test |
| M6 | **Bridge** | MCP stdio multiplexer + builtin Linux tools | integration test against a dummy MCP |
| M7 | **Guard** | approval, allowlist, audit, container mode | policy unit tests |
| M8 | **Platforms** | 8 adapters | live checklist (human) |
| M9 | **Packaging** | `install.sh`, systemd, uninstall | clean-VM dry run |
| M10 | **Purge** | delete `app/`, repo is 100 % ours | `git grep` finds no upstream headers |

Every milestone ends with a **checkpoint commit** (see `CHECKPOINTS.md`).

## 5. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A site changes its stream format | certain, recurring | one adapter breaks | data-only adapters; DOM fallback; 15-min fix path |
| Prompt injection owns the box | high | catastrophic | approval gate default `ask`; container mode; no secrets in reach |
| Free tier refusal / ban | high | feature dies | refusal rule + ladder + never-resend; document honestly |
| Firefox event page suspends mid-call | medium | lost result | persist pending call in `storage.local`, resume on wake |
| Native host registration differs per distro | medium | install fails | `install.sh` with `--dry-run`, detect browser dirs, print exact paths |
| Binary stream format (Kimi) drifts | medium | 1 platform dead | isolate in the adapter; DOM fallback stays alive |
| Scope creep (adding platforms) | high | v1 never ships | 8 is the list. Everything else is v2 |

## 6. What is deliberately *not* in v1

No store listings. No Windows. No mobile. No cloud sync. No multi-user. No API-key mode.
No Arena/Meta/Doubao. No voice. No image generation. No scheduled/24-7 agents (that needs a model
route, which is exactly what this project exists to avoid).

## 7. Open questions that only live testing answers

1. Which of the 8 platforms still use the SSE formats we recorded? (all of them may have changed)
2. Does Gemini stream over `fetch` or something else today?
3. Grok — is it SSE or WebSocket?
4. Does Firefox's event page survive a 150 s tool call, or does it need an alarm ping?
5. Real prompt-injection escape rate against this bridge.

These are answered by the M8 checklist, not by more reading.

## 8. Documentation map

| File | Read it when… |
|---|---|
| `PLAN.md` (this) | you need the scope, the milestones, or the definition of done |
| `ARCHITECTURE.md` | you need to know which layer may do what, and why the ladder exists |
| `DECISIONS.md` | you are about to change something and want to know what was already rejected |
| `INTERFACES.md` | you are writing code — names, signatures, storage keys, error codes |
| `PLATFORMS.md` | an adapter broke, or you are adding platform #9 |
| `SECURITY.md` | a user asks "is this safe", or you are adding a tool |
| `TESTPLAN.md` | before claiming anything works |
| `REVIEW.md` | before a checkpoint — it is the list of ways this fails |
| `ROADMAP.md` | something is out of scope and you want to know when it is not |
| `CHECKPOINTS.md` | you are resuming a session |
| `specs/01…09` | one module, in detail |
| `prompt/SYSTEM.md`, `prompt/FRAMING.md` | any change to what the model sees |
| `research/` | **internal only — deleted before v1 ships**; 8 files, 18 repos, the evidence behind every number |

## 9. Definition of done — additions from the second survey

The ten original items stand. These are added:

- [ ] `install.sh` ends with a live `ping → pong` self-check against the host, and fails loudly if it
      cannot connect — never "installed" on an assumption.
- [ ] Chrome/Chromium extension ID is **pinned** by `key` and the derived ID is printed by the installer.
- [ ] The rate governor (3 s / 8 per min; DeepSeek 6 s / 5) is observable in the debug log.
- [ ] The ladder is exercised with a synthetic refusal: 1 → 2 → 3 → stop, each rung showing a countdown.
- [ ] A hidden tab does not lose a turn (test: hide, reply arrives, loop continues).
- [ ] The same assistant turn is never answered twice, including across a reload.
- [ ] `research/` is deleted from the shipped tree, and `CREDITS.md` no longer mentions a third-party
      snapshot.
