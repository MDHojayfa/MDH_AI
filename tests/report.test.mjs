import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCore, ROOT } from './helpers.mjs';

const { MDH } = loadCore(['src/core/report.js']);
const { report } = MDH;

test('there are enough issue lines to remind without nagging', () => {
  assert.ok(report.ISSUES.length >= 15 && report.ISSUES.length <= 30, `ISSUES is ${report.ISSUES.length}`);
  assert.ok(report.SHARE.length >= 8, `SHARE is ${report.SHARE.length}`);
});

test('every issue line mentions a real way to report it', () => {
  for (const line of report.ISSUES) {
    assert.match(line, /issue|report|tracker|bug form|tell us/i, `no call to action: ${line}`);
  }
});

test('the NASA-PC joke is present, because it is the support policy', () => {
  const text = report.ISSUES.join('\n');
  assert.match(text, /NASA PC/);
  assert.match(text, /one laptop|one machine/i);
});

test('no line claims a success or hints at a credential', () => {
  for (const line of [...report.ISSUES, ...report.SHARE]) {
    assert.doesNotMatch(line, /✔|\bsuccess(ful|fully)?\b/i);
    assert.doesNotMatch(line, /api key|private key|id_rsa|\bssh\b|passphrase/i);
  }
});

test('the bug URL is a real GitHub form, pre-filled and encoded', () => {
  const url = report.issueUrl({ title: '[bug] stalled', stage: 'waiting-reply', platform: 'claude', browser: 'Firefox', detail: 'no reply after 300 s' });
  assert.ok(url.startsWith('https://github.com/MDHojayfa/MDH_AI/issues/new?template=bug_report.yml'));
  const params = new URL(url).searchParams;
  assert.equal(params.get('title'), '[bug] stalled');
  assert.match(params.get('body'), /stage: waiting-reply/);
  assert.match(params.get('body'), /platform: claude/);
  assert.match(params.get('body'), /browser: Firefox/);
  assert.match(params.get('body'), /no reply after 300 s/);
});

test('the issue body never includes a filesystem path or a URL from the user', () => {
  const url = report.issueUrl({ stage: 'x', detail: 'failed in /home/secret/file.txt at https://internal.example' });
  const body = new URL(url).searchParams.get('body');
  assert.doesNotMatch(body, /\/home\/secret/);
  assert.doesNotMatch(body, /internal\.example/);
});

test('the idea form has its own template', () => {
  const url = report.ideaUrl({ title: '[idea] a ninth platform', body: 'please' });
  assert.ok(url.startsWith('https://github.com/MDHojayfa/MDH_AI/issues/new?template=feature_request.yml'));
});

test('share links point at the right endpoints and carry the repo', () => {
  const links = report.shareLinks();
  const expected = {
    x: 'https://twitter.com/intent/tweet',
    facebook: 'https://www.facebook.com/sharer/sharer.php',
    whatsapp: 'https://wa.me/',
    telegram: 'https://t.me/share/url',
    reddit: 'https://www.reddit.com/submit',
    linkedin: 'https://www.linkedin.com/sharing/share-offsite/',
    bluesky: 'https://bsky.app/intent/compose',
    email: 'mailto:',
    instagram: 'https://www.instagram.com/',
    tiktok: 'https://www.tiktok.com/',
  };
  for (const [name, prefix] of Object.entries(expected)) {
    assert.ok(links[name].startsWith(prefix), `${name} → ${links[name]}`);
  }
  assert.ok(decodeURIComponent(links.x).includes(report.REPO));
  assert.ok(decodeURIComponent(links.reddit).includes(report.REPO));
});

test('Instagram and TikTok are honest: they cannot carry a post in a URL', () => {
  assert.ok(!report.shareLinks().instagram.includes(report.REPO));
  assert.match(report.clipboard(), /github\.com\/MDHojayfa\/MDH_AI/);
});

test('picks are deterministic per seed and actually rotate', () => {
  assert.equal(report.issueLine(3), report.ISSUES[3 % report.ISSUES.length]);
  assert.notEqual(report.issueLine(0), report.issueLine(1));
  assert.equal(report.shareLine(2), report.SHARE[2 % report.SHARE.length]);
});

test('the popup ships the buttons the user asked for', () => {
  const html = readFileSync(join(ROOT, 'src/popup/popup.html'), 'utf8');
  const js = readFileSync(join(ROOT, 'src/popup/popup.js'), 'utf8');
  for (const platform of ['Facebook', 'WhatsApp', 'Telegram', 'Reddit', 'LinkedIn', 'Bluesky', 'Email', 'Instagram', 'TikTok']) {
    assert.match(html, new RegExp(`>${platform}<`), `missing ${platform} button`);
  }
  assert.match(html, /id="share-copy"/);
  assert.match(html, /id="report-bug"/);
  assert.match(html, /id="report-idea"/);
  assert.match(js, /sharePrompted/);
  assert.match(js, /paintIssueStrip/);
  assert.match(js, /phase === 'stopped'/);
  assert.match(js, /navigator\.clipboard\.writeText/);
  assert.match(js, /navigator\.share/);
});

test('a failed run promotes the strip instead of hiding it', () => {
  const js = readFileSync(join(ROOT, 'src/popup/popup.js'), 'utf8');
  assert.match(js, /strip\.host === false/, 'host-not-answering must count as trouble');
  assert.match(js, /item\.status !== 'ok'/, 'a failed tool call must count as trouble');
  assert.match(js, /classList\.toggle\('loud'/, 'the strip needs a visible promoted state');
});

test('the agent shows the form when the loop dies', () => {
  const js = readFileSync(join(ROOT, 'src/core/agent.js'), 'utf8');
  assert.match(js, /MDH\.ui\.issue\?\.\(/);
  assert.match(js, /REPORTABLE/);
});

test('a changed page gets its own card, with the selector named', () => {
  const ui = readFileSync(join(ROOT, 'src/core/ui.js'), 'utf8');
  const agent = readFileSync(join(ROOT, 'src/core/agent.js'), 'utf8');
  assert.match(ui, /function drift\(/);
  assert.match(ui, /Report this selector/);
  assert.match(agent, /MDH\.ui\.drift\?\.\(/);
  assert.match(agent, /adapter\.dom\?\.composer/);
});

test('one failure shows one card, not two', () => {
  const agent = readFileSync(join(ROOT, 'src/core/agent.js'), 'utf8');
  assert.match(agent, /function reportCard/);
  assert.match(agent, /Date\.now\(\) - lastIssueAt < 60000/);
  // the catch must not re-report what the drift card already explained
  assert.match(agent, /if \(!e\.reported\)/);
});

test('the help desk does not depend on the joke engine', () => {
  // loaded with report.js alone: no fun.js in this context, and the lines still work
  assert.equal(MDH.fun, undefined);
  assert.ok(report.issueLine(0).length > 20);
  assert.ok(report.shareLine(0).length > 20);
});

test('the share sheet is automatic exactly once, and can be reopened', () => {
  const js = readFileSync(join(ROOT, 'src/popup/popup.js'), 'utf8');
  assert.match(js, /if \(!sharePrompted\)/);
  assert.match(js, /showShare\(true\)/);
  assert.match(js, /sharePrompted: true/);
});
