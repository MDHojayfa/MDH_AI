# Adversarial review — we attack our own plan

Written before any of the code exists, on purpose: it is cheaper to kill an idea now than at M9.
Every question is one a competent reviewer would ask. Answers marked ⚠ are weaknesses we accept with
eyes open, ✗ means the plan changed because of this document.

---

## A. Does the core idea survive contact with reality?

**A1. These sites change weekly. Will the whole thing rot in a month?**
Yes, partly — and that is why every read path is a *ladder* (SSE → binary → WS → DOM) rather than a
single hook. Chapters:
- SSE signature dies → the DOM fallback still answers.
- DOM selectors die → the SSE path is unaffected.
- Both die → the popup says `platform unsupported` instead of silently misbehaving.
The real question is maintenance cost. Measured against the 15 surveyed repos, every single-platform
project died when its one path broke. Our cost per platform per year is a selector or a regex: ~30 min,
because `PLATFORMS.md` documents the 5-step update procedure.

**A2. Is "no API key" actually a feature, or a limitation we are dressing up?**
⚠ Honest answer: it is both. It buys a zero-config onboarding (the real feature: *one script, one
extension*) and it costs reliability, speed, and model choice. The reason it is still right: the user's
stated goal is that a chatbot they are *already signed into* becomes an agent. Key mode answers a
different question. We do not add it as a fallback, because a fallback becomes the default the moment
something breaks.

**A3. Free tiers will throttle a loop harder than a human. Is the loop even usable?**
⚠ This is the biggest product risk. A 10-call task on DeepSeek's free tier can hit the daily cap.
Mitigations: the 5-minute ladder, the "stop before the wall" heuristic (if the popup knows the day's
usage it warns at 80 %), and treating one call as expensive (no speculative calls, no tool-list churn).
Residual: some platforms will simply not support long tasks. We will report which, in the README, per
platform. Do not pretend otherwise.

**A4. Why not just use the platform's own agent features (Deep Research, Computer Use, MCP connectors)?**
Because none of them give a *shell* on *this* machine under *this* user's control, and all of them are
paywalled or region-gated. Vendor MCP connectors are also the exact opposite of "no config".

## B. Is the architecture right?

**B1. Content-script loop vs background loop.**
Content script: sees the DOM, dies on tab navigation, sees `document.hidden`. Background: survives
navigation, cannot read the composer.
✗ We moved the loop to the content script and put *durable* state in `storage.local`. Consequence: a
navigation mid-task ends the task. Accepted — a task that survives a page navigation is rare, and the
recovery path (persisted pending call + `Resume`) covers it.

**B2. Native messaging vs a local WebSocket.**
WebSocket is 30 minutes of work and 40 years of security debt (any page can connect, port discovery,
CSRF-ish abuse, firewall prompts). Native messaging: no open port, OS-authenticated by the browser.
⚠ Cost: 4 host-manifest paths, an extension ID that changes per unpacked install on Chrome, and an
install step that must have read access to the user's home. Worth it. Cache the ID at install time.

**B3. Firefox first-class, or Firefox-after-Chrome?**
First-class. The single incompatible key is `background.service_worker`; everything else is version
gating we already do. Firefox users are the ones who will not tolerate a Chrome-only tool, and they are
a disproportionate share of the Linux desktop.
✗ `strict_min_version` stays at 140: below it, host permissions are revocable and the polyfill cost
outweighs the users.

**B4. Intercepting `fetch` from the page — will sites detect and block it?**
They will notice eventually (the wrapper changes `Function.prototype.toString` output if written
naively). Mitigations: keep the wrapper transparent (same `name`, `length`, `toString` via Proxy
`getOwnPropertyDescriptor`), never `preventDefault`, never mutate init. Detection is also a *policy*
question: are we breaking ToS? Possibly. It is disclosed in `SECURITY.md §4.4`.
⚠ Residual: an anti-bot stack could break us on any given day. We do not and will not build evasion
(changing fingerprints, spoofing headers). That is the line.

**B5. Parsing the model's prose for a JSON block — is that ever reliable?**
For strong models, ~99 %. For small free models, no. Hence: the fence, the reminder line, the repair
ladder, and the DOM fallback to read the *rendered* reply when the stream is unreadable.
**B5a. Why not function calling?** Web UIs do not expose it to us. This is the honest constraint.
**B5b. Why not a grammar/regex over free text?** Because a regex that accepts loose JSON accepts
`{"tool":"run_command"}` from a *quoted example in prose*, and executes it. The fence is a safety
feature, not a formatting preference.

**B6. Why no bundler?**
180 files of vanilla ESM is ~200 ms slower to load once and zero build drama. It also means the shipped
artifact is readable — which matters for a tool that gets shell access. A minified bundle reviewing your
`~/.ssh` is an unfalsifiable claim.
⚠ Cost: no TypeScript-only conveniences. We keep JSDoc types and a `tsc --checkJs` pass in CI.

## C. Safety

**C1. Isn't prompt injection through a file a total compromise?**
⚠ Partly. The allowlist bounds *where*, approvals bound *what*, and neither bounds *intent*.
What we actually guarantee: nothing executes without a human click unless the user opted into `always`;
`~/.ssh` is unreachable; every call is in the audit log with a hash chain. What we do not guarantee:
that the click is informed. A user approving `curl … | bash` has been social-engineered, not exploited
by us. Stating this plainly is the honest thing.

**C2. `always allow` — why not just remember everything like other tools?**
Because the signature is `git status`, `git log` — narrow by design. A wildcard is one Policy edit away,
and the popup warns once when you add one.

**C3. Approval timeout = deny. Is that right?**
Yes. Silence is not consent. ⚠ Cost: a user who walks away mid-task returns to a dead loop. Acceptable;
the pending call is persisted and resumable.

**C4. The audit log is local and user-editable — is it worth anything?**
It is not forensic evidence against the user. It is *the user's* record of their own machine, and a
hash chain makes silent tampering detectable. Do not oversell it.

**C5. What if the model is the adversary (a malicious provider)?**
A hostile model can only produce calls. Every call passes policy + approval. The worst it can do is
propose something awful and let the UI render it — hence the "render the request, never the model's
prose" rule in `specs/09-ui.md §2`.

## D. Engineering nits that sink projects

**D1. `stdout` in the native host.**
Three well-known repos broke on this. Rule: protocol on stdout, logs on stderr, and an assertion in CI
that greps `console.log` out of `host/`.

**D2. Unpacked Chrome extension ID instability.**
A host manifest written with a wrong ID fails silently. We read the ID from the extension at runtime via
`management` … which needs a permission we do not want. Instead: `install.sh` pins a `key` in the
manifest so the ID is deterministic, and prints it. ✗ Decision: pin the key.

**D3. Firefox event page suspension during a 120 s tool call.**
The background may be evicted mid-call. Our host does not use the background for the call path at all —
content script → `runtime.sendMessage` → host. ⚠ The port can still drop; reconnect-once is specified.

**D4. Time zones, locales, and `du -sh` output in another language.**
Tool output goes to the model verbatim. We never localise it. Consequence: models must cope with the
user's locale in command output — fine, they read it, they just must not assume English.

**D5. 48 KB truncation boundary can split a UTF-8 sequence.**
Specified: cut at a boundary. A test asserts the result re-encodes cleanly.

**D6. Two tabs, same platform, one session.**
The lease in `storage.local` is the lock. Test: open two tabs, start in each, assert the second refuses
with `NO_TAB`.

## E. Product & maintenance

**E1. Who is this for, in one line?**
A Linux user who already pays for nothing and wants a chatbot that can fix their machine.

**E2. What is the failure the user will actually hit first?**
`Native host offline`. Not a parser bug, not a rate limit — the host. So the popup's red state carries
the fix command, and `install.sh` verifies end-to-end by printing `sys_info` output.

**E3. What is the "wow" moment?**
Turn 3, when a model that just said "I can't access your computer" lists `/home` instead.

**E4. Twelve-month maintenance load, honestly.**
8 platforms × ~2 breaks/year × 30 min = ~8 h/year, plus 2 browser-manifest changes. Sustainable for one
maintainer if `PLATFORMS.md` stays accurate. It will not stay sustainable if we add 8 more platforms
without automating the live check.

**E5. What would make us change the design?**
- A platform ships a *user-facing* tool API in its web UI → we adapt to it and delete an adapter.
- Firefox ships service-worker parity → delete half the build overlay.
- A platform blocks stream interception in a way DOM cannot cover → that platform drops to beta.
These are the kill criteria. Written here so a future session does not defend a decision for ego.

## F. Things we deliberately did not do (and might be wrong about)

| Not done | The argument against us | Our answer |
|---|---|---|
| Windows/macOS in v1 | "Most users are on Windows" | the requester is on Linux; porting before the design is proven wastes both |
| Bangla in v1 | "the audience is Bangla-speaking" | one language must be canonical for prompts; Bangla arrives in v1.1 as a data file |
| Store distribution | "nobody installs unpacked extensions" | review would reject stream interception; install.sh is one command |
| Cloud/24-7 | "an agent that needs your PC on is half an agent" | a hosted agent means someone else holds the shell |
| Voice, multi-agent, GUI screenshots | "the demo needs them" | every one is a new attack surface before the first one is proven |

## G. Verdict

The plan is sound where it is boring (transport, packaging, state) and risky where it must be
(interception, parsing, free-tier economics). The risks are named, bounded, and have fallbacks. **Build
it.** Re-read §E5 at every checkpoint.
