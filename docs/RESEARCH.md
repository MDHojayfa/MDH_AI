# Research log

This file exists because "I read the docs" is not research. Every entry below is something actually read on
**6 November 2026**, with what it said, and then one of two honest outcomes: *it changed the product*, or *it did
not, and here is why*. Nothing here is cited from memory; where I could not get the primary text I say so instead
of dressing a summary up as the source.

The question I was reading to answer: **when an agent asks a human for permission, what makes that ask real
instead of theatre?** MDH_AI's whole safety story is an approval card, so if the card is theatre the product is
theatre with a nicer font.

---

## 1. The classic literature (books and the 1975 paper)

**Saltzer & Schroeder, "The Protection of Information in Computer Systems" (1975)** — read at
`web.mit.edu/Saltzer/www/publications/protection/` (Abstract + §I.A–I.B, the chapter the principles live in).

The definitions are plainer than the folklore versions, and two pieces stuck:

> *Prescript:* "A rule that must be followed before access to an object is permitted, thereby introducing an
> opportunity for human judgment about the need for access, so that abuse of the access is discouraged."

That is an approval card, described in 1975, with the reason it works stated as *discouragement* — the point is
not that a human is infallible, it is that a human is present.

> "The protection mechanisms not only protect one user from another, *they may also protect their own
> implementation*."

Read against our own design: the audit chain is a protection mechanism, and the thing it protects is the record
of who did what. That is what made the gap in §5 below feel like a bug rather than a nice-to-have.

**Matt Bishop, *Computer Security: Art and Science*, ch. 13 "Design Principles"** — the free chapter PDF at
`nob.cs.ucdavis.edu/book/book-aands/aands13.pdf` (read the first ten pages; the PDF reader stops at 30, the
chapter is longer). Definitions 13-1 to 13-4 are quoted here because MDH_AI claims to implement them:

> **13–1 least privilege:** "a subject should be given only those privileges that it needs in order to complete
> its task."
> **13–2 fail-safe defaults:** "unless a subject is given explicit access to an object, it should be denied
> access to that object."
> **13–4 complete mediation:** "all accesses to objects be checked to ensure that they are allowed."

Bishop then does something useful for a product that keeps a log: he points out that a UNIX file descriptor
*is* a violation of complete mediation — the permission is checked at `open()` and never again. Our remembered
grants have the same shape, so §4 below is partly an argument with this paragraph.

**Ross Anderson, *Security Engineering*, 3rd ed., ch. 4 "Access Control"** — **not read in full.** The PDF URL on
`cl.cam.ac.uk` 404s from here, and the copies I could reach were excerpts pasted into a book-sharing site. I am
not going to cite a search snippet as a chapter. It is on the list for a pass where I can get the real file.

---

## 2. The standards (what an approval need to be, mechanically)

**W3C, WAI-ARIA 1.3, §5.4 `status` role and §6.8 `aria-live`** (`w3c.github.io/aria/`):

> "When live regions are marked as polite, assistive technologies *SHOULD* announce updates at the next graceful
> opportunity… authors *SHOULD* create a rendered but empty live region as early as possible (such as on page
> load), and then modify the content of the live region."

**W3C WAI technique ARIA22, "Using role=status to present status messages"** (`w3.org/WAI/WCAG22/Techniques/aria/ARIA22`),
which is the technique behind WCAG 2.2 success criterion 4.1.3. It also warns that `role="status"` is not treated
as atomic everywhere, so `aria-atomic="true"` should be said out loud.

MDH_AI's pill changes phase — waiting, executing, paused — without moving focus and without a dialog. A screen
reader user gets nothing. That is a real defect and it is queued in §6.

---

## 3. The talks (video, transcript read end to end)

**"8.3 — When Should an AI Agent Stop and Ask a Human? Approval Gates Done Right"**, Cloud + AI Architect,
`youtube.com/watch?v=WpFT75UBhMk` (9:17; transcript read in full). Four claims I checked our design against:

1. *"Treat the approval gate as a first-class step in the agent loop, not a pop-up you bolt on at the end."* —
   We do: `gate()` sits between parse and `execute()`, and a refusal never reaches the host. Verified in
   `tests/planmode.test.mjs`-style source assertions.
2. *"Default unknown tools to the strictest tier… The golden rule is fail closed. An unclassified tool is
   approve, never auto."* — Ours is stricter than the video's advice in one way and looser in another: unknown
   tools land on the approval card (good), but the card's default is to wait rather than to deny, with a timeout
   that denies. Worth a documented read rather than a change.
3. *"A good approval request is a decision pre-packaged… the exact action and args, the why in context, a real
   preview."* — Mostly present: exact command, folder, policy reason, times-you-have-approved-this counter. The
   *why in context* (which plan step this serves) is only present in plan mode.
4. *"Every gated decision goes into an audit trail… the action and its tier, the arguments, the decision, who
   approved or denied it."* — **We recorded the action and the arguments, not the decision.** This is the finding
   that shipped today (§7).

**"The Human in the Loop Is Going Away"**, YSecurity, `ysecurity.io/blog/human-in-the-loop-is-going-away/`
(article plus the episode it quotes, a16z CISO Yash Kosaraju at `youtube.com/watch?v=my6Rie4TR0s&t=993s`):

> "after the third click you don't really read what's in there, and you just start clicking through. And that's
> the sort of defense we think is there, but not really."

The article collects the numbers behind that: Windows Vista UAC approved 89–91% of prompts and only 13% of lab
participants could say why the dialog appeared; Chrome certificate warnings were clicked through 70.2% of the
time, 47% within 1.5 s (Akhawe & Porter Felt, 2013); and Anthropic's own telemetry put Claude Code approval rates
at 93% in March 2026 and 97% by August 2026.

The useful conclusion is not "remove the approval" — it is **make each approval carry information a person can
check, and make the record say which approvals were actually given.** A 97% approval rate is only alarming if you
cannot tell which 3% were refusals. That is an audit design problem, which is what we fixed.

---

## 4. Existing projects, read as source and docs

**Cline — `docs/features/auto-approve.mdx`** (raw file from `github.com/cline/cline`). Cline's model is a set of
per-category toggles plus "YOLO mode", and this line is the whole design:

> "Cline does not use a fixed allowlist. The model marks each command with a `requires_approval` flag based on the
> command and arguments. These are examples, not guarantees."

That is authorisation decided by the LLM. OWASP's LLM06 says the opposite in as many words ("implement
authorization in downstream systems rather than relying on an LLM to decide if an action is allowed"), and so
does Saltzer. MDH_AI decides in `policy.js` and re-decides in `host/policy` after `realpath()`, with the model
getting no vote. Reading Cline was still useful: it is the clearest statement of the position we are rejecting,
and its "type the toggle and hope" UX is why our card has one sentence of *reason* on it.

*(I also tried to read OpenHands' `openhands/security/` invariant analyser and Cline's `AutoApprovalSettings.ts`
directly. The GitHub contents API returned 404 for the paths I guessed and the recursive tree call came back
empty on this repo's size, so this section rests on the docs file I did fetch. Marked, not hidden.)*

---

## 5. The research literature, and the hole it found in our own design

**Bellare & Yee, "Forward Integrity for Secure Audit Logs" (1997)** — I could not reach the original technical
report (two `ucsd`/`rogaway` URLs 404 from here). I read it through three papers that quote and build on it:

- **Ma & Tsudik, "A New Approach to Secure Logging"** (`eprint.iacr.org/2008/185.pdf`):
  > "all these schemes do not defend against *truncation attack* — a special kind of deletion attack whereby the
  > attacker deletes a contiguous subset of tail-end log entries… A hash chain element *Yi* only protects data
  > records generated before time *i*. Thus, truncating log entries generated after time *i* will not be detected."
- **"Secure Audit Logs with Verifiable Excerpts"** (`eprint.iacr.org/2016/283.pdf`): forward integrity means a
  key compromise does not help forge *prior* entries; sequence numbers and epoch markers are what catch
  deletion of individual entries.
- **von Zeipel / Linköping thesis, "Improving Integrity Assurances of Log Entries"** (`diva-portal.org`):
  > "Truncation (A4) however, cannot be detected through this method since the chain is never technically broken."

This is a statement about **our** log, exactly. `host/audit.mjs` writes a SHA-256 chain, and `verifyAudit()`
walks it: edit a line and it breaks, delete a line from the middle and it breaks, **delete the last ten lines
and it verifies perfectly**. An agent that did something embarrassing, or anyone with write access to
`~/.local/state/mdh/audit.jsonl`, can shorten the record and the page will still say "chain verified".

So the current claim in the docs is true but narrower than it sounds, and the fix is small: persist the last
hash and the entry count somewhere the audit file does not control, and compare on verify. That is **not**
cryptographic tamper-proofing — an attacker with write access to both files can still lie — but it converts "you
have to notice" into "the page notices for you". Queued as the next checkpoint with a test that deletes the tail
and expects a red line.

---

## 6. What did *not* change, and why

- **No risk-tier classifier in front of approvals** (the video's auto / notify / require-approval / forbid). It is
  a good idea and it is the wrong first move here: a tier assigned by a model is the Cline problem again, and a
  tier assigned by rules is what `policy.js` already is, with the card as the only tier that interrupts.
- **No "approve everything" switch** — YOLO mode in Cline, `--dangerously-skip-permissions` elsewhere. OWASP
  LLM06 and Saltzer 1975 agree, and the YSecurity episode makes the same point from the other direction: the
  protection is *what the agent can reach*, not the click.
- **No interrupt-and-resume plumbing.** The video assumes a server holding a thread open and recommends releasing
  compute while a human decides. We already hold no compute: the loop stops and the page waits. Checked, not
  built.
- **Complete mediation on remembered grants is knowingly not complete.** A `site` grant answers future calls
  without asking again, which is precisely Bishop's UNIX-descriptor criticism. The mitigation is not to pretend
  otherwise: the policy check still runs first on every call, a grant can only ever answer "you already approved
  this exact command", and the popup lists every remembered grant with a ✕. What was missing is that the log did
  not distinguish an auto-allowed call from a remembered approval — today it does.

## 7. What this pass changed in MDH_AI

**Who said yes is now part of every audit entry.** Until this pass the gate collapsed two different facts into
one string: a call the policy allowed without asking, and a call a person clicked *Allow once* for both came back
as `'once'`. The host recorded `status: ok` and nothing else.

Now `gate()` returns `auto` for a policy allow, and the loop maps the decision to a small vocabulary that travels
with the frame (`via`) into the audit entry, inside the hash:

| `via` | means |
|---|---|
| `auto` | the policy allowed it; nobody was asked |
| `approval` | a person clicked *Allow once* |
| `grant:run` / `grant:session` / `grant:site` | a remembered approval answered, scope named |
| `always-allow` | the tool was switched to always-allow in the policy |

Anything unrecognisable is recorded as `other` rather than dropped, because a log that silently loses a field is
worse than one that admits it did not understand it. The log page shows it on every row, `?run=` includes it in
the sequence, and `mdh-log --run <id>` prints an `allowed by: auto 4 · approval 1` line.

Grounding: the video's "who approved or denied it", OWASP LLM06's complete-mediation and user-context advice, and
the YSecurity numbers — a 97% approval rate means nothing unless the log can show which calls were ever approved
at all.

## 8. Reading list, in order

1. Bellare & Yee, the original 1997 report (needs a mirror that is not 404).
2. Anderson, *Security Engineering* 3rd ed., ch. 4 and ch. 21 ("System security"), as actual files.
3. OWASP's companion **Agentic AI — Threats and Mitigations**, which the 2025 Top 10 defers to for MCP and
   multi-agent cases.
4. Anthropic's own write-ups of the 93% / 97% approval telemetry, for the method rather than the number.
5. Schneier & Kelsey on secure audit logs, for what a log should do after the checkpoint lands.
