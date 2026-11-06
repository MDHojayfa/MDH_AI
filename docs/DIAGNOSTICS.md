# Diagnostics — what a failure collects, and what it refuses to

A bug report is only worth reading if it carries the facts that **separate causes**. Most reports carry the
symptom and none of the context, so the maintainer's first three replies are questions. This document is the
list of those questions, answered before they are asked — and the list of answers this product will never
collect on its own.

Everything here is built **locally**, shown to the user, and stays on the machine until a human clicks
**Submit** on GitHub. There is no endpoint, no bucket, no crash service. Nothing is posted from the
extension, ever, not even with consent: consent hands the user a pre-filled form and the form is GitHub's.

---

## 1. Where a report comes from

Three sources, merged into one object:

| Source | Collected by | Examples |
|---|---|---|
| **Page** | `src/core/diag.js` in the tab | stage that failed, platform, read mode, log trail, visibility |
| **Browser** | the same, from `navigator` | name + version, engine brands, OS hint, timezone, cores, memory, screen, DPR |
| **Machine** | `host/diag.mjs` over the same pipe as the tools | kernel, node version, load, free RAM, disk free, interfaces, VPN-ish tunnels, MTU, clock skew |

The host half is not optional decoration: a surprising share of "it just stopped" is a clock two minutes off,
an MTU that eats large frames, a VPN that reconnects mid-stream, or a disk so full the audit write fails.

## 2. The signature table

`src/core/diag.js` keeps an ordered table of real-world signatures — the failures that look like a product
bug and are not. Each one carries *what*, *why* and *what to do*, because a diagnosis with no action is trivia.

| id | Looks like | Usually is | Fix it by |
|---|---|---|---|
| `cf-ban` | page loads nothing, 1015/1020 | the provider refuses **this network** | another Wi-Fi, then a hotspot — and read the hotspot result as a hint, not proof |
| `cf-challenge` | "Just a moment…", selectors all miss | a bot check sits where the app should be | solve it once; if it returns, test another Wi-Fi before blaming the extension |
| `rate-limit` | 429, "retry after", empty replies | the plan's quota | waiting; reloading faster extends the block |
| `geo-block` | "not available in your country" | a regional block | a supported network |
| `clock-skew` | certificate errors, signed requests fail | the system clock | enable NTP, reload |
| `network-flap` | `ERR_NETWORK_CHANGED`, truncated replies | VPN reconnect or Wi-Fi roam | Resume; watch for a repeating minute |
| `mtu-vpn` | small requests work, large responses die | MTU on a tunnel | 1400/1380, or switch the VPN off for one run |
| `no-host` | every tool fails at once | native host not running | `./install.sh`, reopen the popup |
| `context-invalidated` | "extension context invalidated" | tab older than the extension | reload the tab |
| `dom-drift` | "composer not found" | the site shipped a redesign | report it — the card names the selector |
| `no-reply` | no answer, or an answer with no tool block | the model answered in prose | send `use your tools`, or start a fresh chat |
| `permission` | `PATH_DENIED` | the guard did its job | add the folder to `allowPaths` |
| `truncated` | "unclosed fence" | a stream cut mid-block | Resume; the parser already retries once |

Two facts outrank the table, because they are measurements rather than pattern matches: `navigator.onLine`
being false, and a **clock skew measured against a real HTTP `Date` header**. A measured 13-minute skew is
placed above every guess.

The table is a *hypothesis generator*, and it says so in its own output. Every card and every report labels
the guesses as guesses. A wrong confident answer costs a maintainer a day; a wrong labelled guess costs a
glance.

### Why the network advice is careful

"Try a hotspot" is good advice with a bad failure mode: mobile carriers hand out addresses that are blocked in
some regions and not others, and some carriers rotate them mid-session. So a hotspot that works is **evidence
that the address matters**, not proof that the problem is solved — and a hotspot that fails does not clear the
code either. The wording in the table says exactly that, and a test keeps it from drifting back into
"just use your phone".

## 3. The failure card

When the loop dies, the card inside the page shows:

1. **The real error**, in the same colour as any other error, unedited.
2. **The top hypothesis**, with its fix — `Likely: a bot check is standing between you and the chat`.
3. **What will be sent**, in a collapsed `<details>`: the exact issue body, byte for byte. No surprises.
4. **Open issue with report** — opens GitHub's form, pre-filled. GitHub submits it, with the user's click.
5. **Copy report** / **Log viewer** / **Copy log** — for people who would rather email it or read it first.
6. **Include my public IP** — a checkbox, off by default. See §5.

## 4. The local log viewer

`mdh-log` renders the audit chain and the last report as one self-contained page.

```
mdh-log              # ~/.local/state/mdh/log.html, prints the path
mdh-log --open       # …and opens it
mdh-log --serve      # live view on 127.0.0.1 only
mdh-log --json       # summary for a script or a paste
```

The same page is reachable from the popup (**Advanced → Log viewer**) and from the failure card. Properties:

- **Loopback only** — `listen(port, '127.0.0.1')`, never `0.0.0.0`, never `::`.
- **Token-gated** — 32 random bytes in the URL, compared with `timingSafeEqual`; a wrong or missing token gets
  a `404`, not a `403`, so a probing page learns nothing.
- **Script-free** — `default-src 'none'`, no `<script>`, no fonts, no icons, no CDN. It renders with the network
  unplugged, which is when a log is most useful.
- **Read-only, with one honest exception** — the filters are query parameters, and *Archive & clear* is a
  token-bound `POST` behind a confirm card that renames the chain with a timestamp and starts a new one from
  genesis. It does not delete: a hash chain that can be truncated is a text file with commitments.

## 5. The one thing that leaves the machine, and only if you tick a box

The product's single outbound request is a `GET` to `https://api.ipify.org?format=json`, falling back to
`https://ifconfig.co/json`. It exists because a blocked IP once cost three months of debugging, and no local
fact can reveal it.

- It runs **only** when the user ticks *include my public IP*, and it returns the address **and** the clock
  skew from the same `Date` header — one request, two answers.
- The model **cannot** trigger it. `net_probe` is not in the tool catalogue; the host handles it on a `diag`
  frame the model never sees. A prompt cannot exfiltrate an address it cannot ask for.
- The URL builder writes `not included (the user chose not to send it)` when it is absent, so a reader knows
  the difference between "no IP" and "forgot to look".

## 6. What is deliberately excluded

| Excluded | Why |
|---|---|
| File contents, file names, directory names | replaced with `<path>`; a public form is not a place to leak a home directory |
| Visited URLs other than the eight platform hosts | replaced with `<url host>` — the host part stays, the path does not |
| Email addresses | replaced with `<email>` |
| Cookies, tokens, `localStorage`, session keys | never read, not even to redact |
| The page's DOM | only the adapter's selector list; no snapshots, no screenshots |
| Clipboard, keystrokes, other tabs | out of scope by design, not by policy |
| The user's IP | opt-in per report, never stored, never reused |

## 6b. Credit for the person who reports it

Every form the product opens asks for a GitHub handle, and says what it is for: if the report leads to a fix or
the idea ships, the handle goes into [`CREDITS.md`](../CREDITS.md)'s community section — one line, permanently.
Anonymous is an accepted answer; the promise is credit, not exposure.

This is not decoration. A one-person project cannot pay a bounty, and most people do not file issues because
they assume nobody reads them and there is nothing in it for them. Both assumptions are answered in the card:
the same person reads every report, and the second file in this repository has their name on it.

## 7. Where the data lives

| Path | Contents |
|---|---|
| `~/.local/state/mdh/audit.jsonl` | hash-chained record: tool, status, ms, path/command summary |
| `~/.local/state/mdh/last-diag.json` | the most recent report, written only when a failure produced one |
| `~/.local/state/mdh/log.html` | the rendered page, rewritten on demand |
| `~/.local/state/mdh/sessions.json` | session counters |

All four are the user's own files in the user's own home directory. `--uninstall` leaves them in place on
purpose, because deleting somebody's records is not an uninstall; the installer prints exactly what to remove.

## 8. What it looks like when it happens

[`docs/SCENARIOS.md`](SCENARIOS.md) is the companion: ten real failure classes, from the blocked IP to the
filled disk, each with the exact card, the exact words and the next action. If a report does not resemble any
of them, that is the interesting case — and the form is one click away.

## 9. Honest limits

`docs/KNOWN-LIMITS.md` has the full table. The three that matter for this document:

- The IP probe has been exercised against **one** network. IPv6-only and CGNAT setups may return an address
  that is not the one the provider sees.
- MTU and tunnel detection reads `/sys/class/net/*/mtu`, which is Linux-only, and only sees interfaces that
  exist at the moment of the report.
- Clock skew is measured against **one** endpoint's `Date` header, which is coarse by a second and wrong by a
  second on a badly configured server. It is a strong hint, not a legal instrument.
