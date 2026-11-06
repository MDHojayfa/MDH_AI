# Media kit and store listing copy

Everything a listing needs, written once so it does not have to be invented at submission time. Copy is
plain text: paste it, do not retype it.

## Screenshot kit

Six shots tell the whole product. Anything more is a gallery nobody scrolls.

| # | File | What must be visible | Size |
|---|---|---|---|
| 1 | `01-popup.png` | the popup: issue strip, task box, Start enabled, host `up` | 1280×800 |
| 2 | `02-approval.png` | an approval card with a real `run_command` in it | 1280×800 |
| 3 | `03-waiting.png` | the waiting state: real `sys` line plus a planet-tagged joke | 1280×800 |
| 4 | `04-failure.png` | the failure card with **Report a bug** and **Copy log** | 1280×800 |
| 5 | `05-barbos.png` | BARBOS MODE, with `sys` and `fun` visibly different | 1280×800 |
| 6 | `06-shell.png` | a terminal mid-install, the `host answered` line readable | 1280×800 |

The bug form a screenshot points at never arrives with your paths in it — they are redacted before the URL is
built, which is worth saying in any caption that shows the button.

Rules: real screenshots only, no mockups, no blurred fake terminals, no stock photography. If a screenshot
would need a lie to look good, it is a bug report, not marketing.

Alt text (use it, it is also what a store reader hears):

1. "The MDH_AI popup: a help-desk line with Report a bug and Send an idea, a task box, and a Start button."
2. "An approval card showing the exact shell command, with Deny, Allow once and Always."
3. "The waiting state: a real status line and a joke clearly tagged with a planet."
4. "A failure card inside the page, carrying the real error, a Copy log button and a link to the bug form."
5. "BARBOS MODE: a scrolling boot log where real events and jokes are visually different."
6. "A terminal running install.sh, ending with the host answering a ping."

## Repository art (README)

The images at the top of the README are **generated illustrations, not screenshots** — and they say so on every
frame. `npm run art` (`tools/make-readme-art.mjs`) draws them with ImageMagick primitives from the same labels,
states and buttons the extension renders.

| File | What it is | Where it goes |
|---|---|---|
| `assets/hero.gif` | the pill through Start → Working → approval → Paused → Done, 5 frames, loops | README top, social posts as a still |
| `assets/terminal.gif` | clone, `install.sh`, three checks, `mdh-log --runs` | README quickstart |
| `assets/approval-card.png` | the approval card at 960 px: command, folder, reason, three lifetimes | README features |
| `assets/social.png` | 1200×630 link-preview card, cropped from frame 1 | Open Graph / link unfurls |

Two rules, and the first one is the one that gets broken elsewhere:

1. **An illustration is labelled as one.** Every frame carries *"Illustration drawn from the real pill and card
   markup — not a screen recording."* A mock in a README is fine; a mock presented as a screenshot is not.
2. **Store screenshots stay real.** The rules in the section above are untouched: what goes into a listing is a
   capture of the running product, because a listing is a promise about what the user will get.

## Chrome / Brave listing

- **Name:** MDH_AI
- **Short description (≤132 chars):** Give the AI chat you already use full control of your Linux desktop. No API key, no account, eight platforms.
- **Category:** Developer Tools
- **Language:** English

**Detailed description:**

> MDH_AI turns the chat you are already signed into — ChatGPT, Claude, Gemini, DeepSeek, Kimi, Qwen, GLM or
> Grok — into an agent with real control of your Linux machine. It reads and writes files, runs shell
> commands and keeps a hash-chained audit log. There is no API key, no provider setting and no model picker:
> the model is the website you already pay for, on the plan you already have.
>
> **Eight platforms, three browsers.** Chrome 116+, Brave and Firefox 140+. Firefox is first-class, not a
> port: the design avoids the debugger API Firefox does not expose.
>
> **Approval is the default.** Every write and every command shows a card with the real request; deny is what
> happens if nobody answers. Two independent path guards, `~/.ssh` and friends denied by name, and an audit
> chain you can verify offline.
>
> **A local host, not a service.** A small Node process speaks length-prefixed JSON over a pipe the browser
> opens. No listening socket, no telemetry, no remote configuration, no fonts from a CDN.
>
> **It tells you when it cannot know.** No NASA PC was involved: one laptop tested it as far as one laptop
> can, `docs/KNOWN-LIMITS.md` says exactly where that line is, and the popup opens with a button to report
> what fell over the edge.
>
> Open source, MIT, one author: MDHojayfa.

**Permission justifications (paste into the review form):**

| Permission | Why it is needed |
|---|---|
| `nativeMessaging` | talks to the local host; this is the only way a page can reach a local process |
| `storage` | policy, history and the once-per-profile share flag stay in the browser |
| `tabs` | finds the chat tab and keeps the loop attached to it |
| `scripting` | injects the injected UI (approval card, plan, failure card) into that tab |
| host access to the eight chat domains | reading the reply and clicking send, which is the entire product |
| host access to `127.0.0.1` / `localhost` | the local host bridge |

No `<all_urls>`, no `webRequest`, no `cookies`, no remote code, no analytics.

## Firefox (addons.mozilla.org) listing

- **Name:** MDH_AI
- **Summary (≤250 chars):** Full desktop control for the AI chat you already use. Eight platforms, no API key. Files, shell, approvals, audit log — plus an honest report button, because one laptop cannot test everything.
- **Tags:** ai, automation, linux, developer tools, self-hosted
- **Notes for reviewers:** the extension does nothing until the user runs `install.sh`, which registers a
  native-messaging manifest. Without the host, `ping` fails and the popup says so; no other code path runs.
  The Firefox build is generated separately (`dist/firefox`) and contains no service worker.

## Social

- **Open Graph card:** `site/og.png`, 1200×640, generated by `node tools/make-og.mjs` — drawn in arithmetic,
  no design tool, no stock image.
- **Post template:** one sentence about the constraint, one about the result, one link. No thread, no
  engagement bait.

> Eight AI chats, one extension, zero API keys. It drives your Linux desktop, asks before it touches anything,
> and tells you honestly what one laptop could not test. https://github.com/MDHojayfa/MDH_AI

## What not to publish

- No "works with every AI" — it works with eight, named.
- No "fully tested" — see `docs/KNOWN-LIMITS.md`.
- No benchmark numbers that were not measured on this machine.
- No logo of a platform rendered as if it were an endorsement.
