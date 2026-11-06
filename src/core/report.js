/**
 * core/report.js — the two doors a user actually needs: "report it" and "tell someone".
 *
 * This file exists because of one sentence that turned out to be the whole support policy:
 * **the developer does not have a NASA PC.** One laptop, eight websites that redesign on a Tuesday, and a
 * test suite that runs in three seconds because there is nothing faster to rent. So a bug report is not
 * paperwork here — it is the QA department.
 *
 * Two pools, deliberately separate from `core/fun.js`:
 *   · ISSUES — shown on every run and on every failure, with a real link that opens the bug form;
 *   · SHARE  — shown once per profile, with real share URLs and a copy button.
 *
 * Same three house rules as the mission log, and the same tests enforce them: nothing here may claim a
 * success, hint at a credential, or read as a status message. A joke next to a real button is fine; a joke
 * that *is* the button is not.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;

  const REPO = 'https://github.com/MDHojayfa/MDH_AI';
  const HOME = 'https://mdhojayfa.github.io/';
  const PROFILE = 'https://github.com/MDHojayfa';
  const BUG_FORM = `${REPO}/issues/new?template=bug_report.yml`;
  const IDEA_FORM = `${REPO}/issues/new?template=feature_request.yml`;

  /** Twenty ways to say the same true thing: if it broke, say so, and it will be looked at. */
  const ISSUES = [
    'The developer does not have a NASA PC. If you found a bug, you are the test lab — open an issue.',
    'One laptop, eight websites, zero NASA budget. Found something? The issue tracker is the QA team.',
    'This was tested on a real machine, not a rack of them. If it broke, tell us exactly how.',
    'The developer is not old, but the laptop is. A precise bug report is worth more than a fleet.',
    'Every bug that reaches the tracker gets read. Every bug that stays in your head does not.',
    'If it crashed: the crash is new to someone. Open an issue and make it old.',
    'No NASA PC, no QA department, no excuses. Just the issue button, right there.',
    'A suggestion is a bug report wearing a nicer jacket. Both are welcome.',
    'The developer has one laptop and a cat with keyboard access. The cat reports nothing. You can.',
    'Found a typo, a crash, or a weird vibe? The issue form has a field for all three.',
    'The roadmap is not a wish list, it is a queue. Issues get in the queue.',
    'If something looks broken, it probably is. The fastest fix starts with your report.',
    'Precision beats poetry: which platform, which stage, which browser. Put it in the issue and it gets fixed.',
    'The developer cannot test eight websites on one laptop. That is literally why the issue button exists.',
    'No budget for a test fleet, plenty of budget for reading. Open an issue.',
    'A bug you do not report is a feature nobody asked for.',
    'If the tool failed, it failed on real hardware. Say what happened in an issue; the log knows the rest.',
    'The developer is not ignoring you; he is probably reinstalling something. Issue first, forget later.',
    'If it worked, tell a friend. If it broke, tell the tracker. Both keep the project alive.',
    'The bug form takes ninety seconds. The fix takes longer, but it cannot start without you.',
  ];

  /** Twelve ways to say "share it", because word of mouth is the only marketing budget here. */
  const SHARE = [
    'No ads, no tracking, no budget. If this saved you an hour, share it with someone.',
    'The promotion strategy is you, telling one friend. That is the entire campaign.',
    'Servers cost money. Word of mouth is free. Please use the free one.',
    'If a colleague still copies files by hand, they need this more than you do.',
    'Share the repo. The developer will never know, and the project will still grow.',
    'One link to a friend is worth more than a thousand impressions nobody asked for.',
    'If this tool is useful, the polite thing is to make it someone else\'s problem too.',
    'Nobody is paying for a billboard. There is a copy button instead.',
    'The best review is a link pasted into a group chat at 11 p.m.',
    'Send it to the person who says "AI cannot touch my computer". Let them decide.',
    'Sharing is cheap. A cloud bill is not. Choose the cheap one.',
    'Tell one person. If they hate it, tell the issue tracker instead.',
  ];

  /** Deterministic pick, seeded by the caller (day, session, failure count) so it is stable per run. */
  const pick = (list, seed) => list[Math.abs(Math.floor(Number(seed) || 0)) % list.length];

  /** One issue line per run, and a different one per failure count. */
  const issueLine = (seed = 0) => pick(ISSUES, seed);
  const shareLine = (seed = 0) => pick(SHARE, seed);

  /**
   * The bug form, pre-filled with what we already know. Nothing about the user, their files or their
   * chats goes in here — only the stage, the browser and what the extension itself did.
   */
  /**
   * Redact before anything is pre-filled. An issue is public, and a helpful tool that quietly pastes a
   * home directory or an internal URL into a public form is not being helpful. The user can always type
   * the path back in themselves; the extension does not get to make that decision for them.
   */
  const redact = (text) =>
    String(text ?? '')
      .replace(/https?:\/\/[^\s"'<>]+/gi, '<url>')
      .replace(/(^|[\s("'`])\/(?:[\w.@+-]+\/)*[\w.@+-]+/g, '$1<path>')
      .slice(0, 600);

  function issueUrl({ title, stage, platform, browser, detail } = {}) {
    const safe = (v) => String(v ?? '').slice(0, 180);
    const body = [
      '### What happened',
      '',
      redact(detail) || '<!-- one sentence; the exact error text if you have it -->',
      '',
      '### Context (filled in by the extension — edit it if it is wrong)',
      '',
      `- stage: ${safe(stage) || 'unknown'}`,
      `- platform: ${safe(platform) || 'unknown'}`,
      `- browser: ${safe(browser) || 'unknown'}`,
      '',
      '### Log',
      '',
      '<!-- popup → Advanced → Copy log → paste here -->',
      '',
    ].join('\n');
    const params = new URLSearchParams({ title: safe(title) || '[bug] ', body });
    return `${BUG_FORM}&${params.toString()}`;
  }

  const ideaUrl = ({ title, body } = {}) => {
    const params = new URLSearchParams({
      title: String(title ?? '').slice(0, 180) || '[idea] ',
      body: String(body ?? '').slice(0, 4000),
    });
    return `${IDEA_FORM}&${params.toString()}`;
  };

  /** What we are sharing: a link and a line. Kept in one place so every button agrees. */
  function shareText({ url = REPO } = {}) {
    return {
      title: 'MDH_AI — your chatbot gets a Linux terminal',
      text: 'Give the chatbot you already use real control of your Linux machine — files, shell, apps. No API key. 8 platforms, Chrome/Brave/Firefox.',
      url,
      hashtags: 'linux,firefox,ai,mcp',
    };
  }

  /**
   * Real share endpoints. Instagram and TikTok have no web intent that pre-fills a link, so pretending
   * otherwise would produce a broken button; they get "copy the link, open the app" instead.
   */
  function shareLinks({ url = REPO, text, title } = {}) {
    const t = encodeURIComponent(text ?? shareText().text);
    const u = encodeURIComponent(url);
    const ti = encodeURIComponent(title ?? shareText().title);
    return {
      x: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
      whatsapp: `https://wa.me/?text=${t}%20${u}`,
      telegram: `https://t.me/share/url?url=${u}&text=${t}`,
      reddit: `https://www.reddit.com/submit?url=${u}&title=${ti}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
      bluesky: `https://bsky.app/intent/compose?text=${t}%20${u}`,
      email: `mailto:?subject=${ti}&body=${t}%0A%0A${u}`,
      instagram: 'https://www.instagram.com/',
      tiktok: 'https://www.tiktok.com/',
    };
  }

  /** One-line clipboard payload: the link plus the sentence that makes someone click it. */
  const clipboard = ({ url = REPO } = {}) => `${shareText({ url }).text}\n${url}`;

  MDH.report = {
    REPO,
    HOME,
    PROFILE,
    BUG_FORM,
    IDEA_FORM,
    ISSUES,
    SHARE,
    issueLine,
    shareLine,
    issueUrl,
    ideaUrl,
    shareText,
    shareLinks,
    clipboard,
    size: () => ISSUES.length + SHARE.length,
  };
})();
