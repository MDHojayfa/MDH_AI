# SEO and launch plan

The goal is not "rank for AI". It is: **when a person searches for the specific thing this product does,
this repository is the answer, and it looks like the obvious answer.** Everything below serves that.

---

## 1. Positioning

**One line.** Your chatbot gets a terminal.

**One paragraph.** MDH_AI is a browser extension plus a small local host. You install both, keep using the
free web UI of ChatGPT, Claude, Gemini, DeepSeek, Kimi, Qwen, GLM or Grok, and that chat can read and
write files, run shell commands and open applications on your Linux machine — with approval on every step.
No API key, no account, no billing, and it works in Firefox and Brave, not just Chrome.

**What makes it defensible** (every claim must be literally true in the README):

| Claim | Why a searcher cares | Where it is proven |
|---|---|---|
| No API key | zero cost, zero setup | README §1, install in two commands |
| Firefox + Brave + Chrome | most tools in this space are Chromium-only | three-browser table, `web-ext lint` at 0 errors |
| Eight platforms | not locked to one vendor | `docs/PLATFORMS.md` |
| Deep desktop control | files, shell, GUI — not one app | thirteen builtin tools + MCP |
| Approval + allowlist + audit | "I am not letting a model run `rm -rf`" | `docs/SECURITY.md` |
| Rate-limit recovery | "my free account got banned" | refusal ladder in `docs/ARCHITECTURE.md` §4 |

## 2. Who is searching, and for what

| Intent | Query shape | Where the answer lives |
|---|---|---|
| "let ChatGPT control my computer" | `chatgpt control my computer`, `give chatgpt access to files` | README hero + landing page H1 |
| "no API key agent" | `ai agent without api key`, `free ai agent no api` | README §What you get, landing page section |
| "firefox ai agent" | `ai browser agent firefox extension`, `claude computer use firefox` | compat table + a dedicated doc section |
| "linux assistant" | `chatgpt linux terminal integration`, `ai shell assistant linux` | manual §run a task, landing page example |
| "safety" | `is it safe to give ai terminal access`, `mcp approval prompt` | `docs/SECURITY.md`, blog post 1 |
| "MCP" | `use my mcp servers in chatgpt`, `mcp browser extension` | README §MCP, `host/servers.example.json` |
| "how it works" | `how does chatgpt read a response stream` | blog post 2 (technical credibility) |

Write for these intents in this order. Short-tail "AI agent" is not winnable and not useful.

## 3. GitHub as the landing page

The repository is the first result for the brand and the first thing every visitor sees.

- **Description** (max 350 chars):
  `Give the chatbot you're already signed into full control of your Linux machine — files, shell, GUI.
  No API key. 8 platforms, Chrome/Brave/Firefox. One script + one extension.`
- **Topics**: `ai-agent` `browser-extension` `firefox` `chrome-extension` `brave` `linux` `mcp`
  `model-context-protocol` `chatgpt` `claude` `gemini` `deepseek` `kimi` `qwen` `grok`
  `native-messaging` `desktop-automation` `no-api-key` `self-hosted` `automation`
- **About**: website → `https://mdhojayfa.github.io/`, description above, topics, and the social preview
  image (1280×640) using the icon on a dark background with the one-liner.
- **Pinned release** with both artifacts attached (`mdh-ai-chrome-1.0.0.zip`,
  `mdh-ai-firefox-1.0.0.zip`) so "download" does not require reading instructions.
- **First screen of the README** must answer four questions before any scroll: what is it, who is it for,
  what does it need, how do I start. It currently does.
- **Screenshots, not mockups.** Three: the approval card mid-task, the popup pipeline, a chat result with
  a real file listing. Alt text names the platform shown.

## 4. The repository README as an SEO surface

GitHub pages rank well for `site:github.com` and for technical queries. Structure it as a document, not
a brochure:

- H1 with the plain-language promise, not the project name alone.
- A code block in the first screen (install) — code blocks earn featured snippets.
- Definition-shaped lines ("MDH_AI is …", "No API key means …") that can be lifted into a snippet.
- A table of the eight platforms and three browsers; tables win "list" queries.
- FAQ section at the bottom, each question an `###` with a two-sentence answer — mirrors the FAQPage
  JSON-LD on the landing page.
- Internal links to `docs/*.md` with descriptive anchor text, never "click here".

## 5. Landing page (GitHub Pages, one static file)

Serve at `https://mdhojayfa.github.io/mdh-ai/`. No framework, no build, no tracker beyond one lightweight
analytics script (or none).

### Head

```html
<title>MDH_AI — give your chatbot a Linux terminal, no API key</title>
<meta name="description" content="Install one browser extension and one script: your ChatGPT, Claude,
Gemini, DeepSeek, Kimi, Qwen, GLM or Grok chat gains real control of your Linux machine — files, shell,
apps. No API key, works in Firefox, Brave and Chrome.">
<link rel="canonical" href="https://mdhojayfa.github.io/mdh-ai/">
<meta property="og:title" content="MDH_AI — your chatbot gets a terminal">
<meta property="og:description" content="No API key. 8 AI platforms. Files, shell and GUI on Linux,
with approval on every step.">
<meta property="og:image" content="https://mdhojayfa.github.io/mdh-ai/og.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
```

### Structured data (one `<script type="application/ld+json">` per type)

- `SoftwareApplication`: name, `applicationCategory: "DeveloperApplication"`, `operatingSystem: "Linux"`,
  `offers: {price: "0", priceCurrency: "USD"}`, `license`, `codeRepository`, `author`.
- `HowTo`: three steps — clone and run `install.sh`; load the extension; open a chat and give it a task.
- `FAQPage`: the six questions from the README FAQ, verbatim.

### Page skeleton

1. **Hero** — one-liner, sub-line, install block, three badges (Firefox · Brave · Chrome), screenshot.
2. **What it can do** — three columns: files, shell, apps. One real command and one real result each.
3. **Eight platforms** — logo-free table with names; text, not images, so it is indexable.
4. **Why it is safe** — allowlist, approval card, audit log, no listening port. Link `SECURITY.md`.
5. **Why Firefox works here** — the differentiator; most competitors cannot ship it.
6. **How it works** — the four-step diagram as text plus a small SVG.
7. **Install** — the six lines, again.
8. **FAQ** — the JSON-LD questions, visible on the page.
9. **Footer** — credit MDHojayfa, link to the repo, MIT.

Performance budget: < 100 KB total, no web fonts (system stack), LCP under 1.5 s. Core Web Vitals are
a ranking input and a credibility signal here — this is a performance-minded project.

## 6. Content that earns links

Four posts, published on the author's site and cross-posted to dev.to with canonical URLs. Each is a real
answer to a real query, not a rewrite of the README:

1. **"Is it safe to give an AI a terminal? The three controls that make it defensible."**
   Targets the safety query; links `SECURITY.md`; ends with the two-guard design.
2. **"How to read a streaming chat reply without being the page."** MAIN-world tap, cloning a Request,
   terminal frames per platform. This is the post engineers link to.
3. **"Firefox MV3: no service worker, no debugger, still an agent."** Native messaging + event page +
   `web-ext lint` at 0 errors. Genuinely under-served topic.
4. **"Rate limits are not a bug: a refusal ladder that keeps your account alive."** Concrete numbers,
   the ladder, why re-sending is how accounts die.

Rules: one canonical URL, no AI-slop intros, a code block or a table in every post, and a link back to
the repository in the first screen.

## 7. Distribution, in order of expected return

| Channel | What to post | Note |
|---|---|---|
| `r/linux`, `r/firefox`, `r/selfhosted`, `r/LocalLLaMA` | plain-language post + one screenshot + honest limits | read each sub's self-promo rule first; answer comments for a day |
| Hacker News (Show HN) | "Show HN: Give the chatbot you already use a Linux terminal, no API key" | post Tuesday–Thursday morning US time; the Firefox angle is the hook |
| Product Hunt | the one-liner + three screenshots | prepare the gallery, reply to every comment |
| `awesome-ai-agents`, `awesome-mcp-servers`, `awesome-firefox` | a one-line entry with a working link | respect contribution format exactly |
| the author's profile | pin the repository; the first-run tab already lands there | GitHub has no auto-follow URL — do not pretend otherwise |
| dev.to / Hashnode | posts 1 and 2, canonical to the site | |
| YouTube (short) | 90 s: install → task → approval card → result | silence + captions; no music |

Do **not** buy stars, do not post the same text in six subreddits in one hour, do not claim "works with
every AI" anywhere. The eight-platform list is the credibility.

## 8. Measurement

| Signal | Tool | Target by day 30 |
|---|---|---|
| Organic impressions/clicks for the seven query clusters | Search Console | ≥ 1 keyword in top 20 |
| Repo → release download rate | GitHub release asset counts | ≥ 25 % |
| Extension installs | store dashboards once published | first 100 |
| Time-to-first-successful-task (self-reported in issues) | GitHub issues | < 10 minutes |
| Stars | GitHub | vanity only; never optimise it |

One question decides whether the positioning works: **do people describe the product in the same words the
README uses?** If issue titles start saying "chatbot terminal", the keywords are right.

## 9. Launch checklist

**Day 0** — release published with both artifacts; README first screen final; social preview image;
landing page live with JSON-LD validated (Rich Results Test); Search Console + sitemap submitted; repo
topics set; three screenshots in `docs/media/`; `web-ext lint` 0 errors pasted into the release notes.

**Week 1** — Show HN, three subreddits, Product Hunt scheduled; answer every comment within 12 hours;
fix the first three reported issues and ship `1.0.1`; publish post 1.

**Week 2–4** — posts 2 and 3; two awesome-list PRs; a 90-second video; ask three users what they expected
and adjust the README's first paragraph if their words differ from ours.

**Month 2–3** — publish the Firefox write-up during a Firefox release cycle; add a "who uses it" section
only with real quotes; start `docs/ROADMAP.md` discussion for the ninth platform so search traffic has a
second landing page.

## 10. What not to do

- No keyword-stuffed titles like "Best AI Agent 2026 Free Download".
- No comparison table with competitor names and unverified claims — the only comparison allowed is the
  browser/platform support table, which is checkable.
- No auto-generated blog network, no translated page spam.
- No "as an AI" marketing language. The product's tone is a tool, not a promise.
