/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const html = readFileSync(join(ROOT, 'site/index.html'), 'utf8');

function jsonLd() {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return blocks.map((m) => JSON.parse(m[1]));
}

test('the page is self-contained: no external stylesheet, script, font or image', () => {
  // A canonical link is metadata for crawlers, not a fetched resource.
  assert.doesNotMatch(html, /<link[^>]+rel="(?:stylesheet|preload|icon|preconnect)"[^>]*href="https?:\/\//);
  assert.doesNotMatch(html, /<link[^>]+href="https?:\/\/[^"]+"[^>]*rel="(?:stylesheet|preload|icon|preconnect)"/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /@import|fonts\.googleapis|cdn\./);
  assert.doesNotMatch(html, /<img[^>]+src="https?:\/\//);
});

test('the only network references are links a reader may click', () => {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  for (const href of hrefs) {
    if (!href.startsWith('http')) continue;
    assert.match(href, /^https:\/\/(github\.com\/MDHojayfa|mdhojayfa\.github\.io)(\/|$)/, `unexpected link ${href}`);
  }
});

test('structured data parses and names the product', () => {
  const blocks = jsonLd();
  assert.equal(blocks.length, 3);
  const app = blocks.find((b) => b['@type'] === 'SoftwareApplication');
  assert.equal(app.name, 'MDH_AI');
  assert.equal(app.offers.price, '0');
  assert.equal(app.offers.priceCurrency, 'USD');
  assert.equal(app.operatingSystem, 'Linux');
  assert.equal(app.author.name, 'MDHojayfa');
  assert.ok(app.featureList.length >= 5);
});

test('the how-to has three steps and the FAQ page is not empty', () => {
  const blocks = jsonLd();
  const how = blocks.find((b) => b['@type'] === 'HowTo');
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.equal(how.step.length, 3);
  assert.ok(faq.mainEntity.length >= 6);
  for (const q of faq.mainEntity) {
    assert.ok(q.name.endsWith('?'), `not a question: ${q.name}`);
    assert.ok(q.acceptedAnswer.text.length > 40);
  }
});

test('all eight platforms and all three browsers are named in visible text', () => {
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const name of ['ChatGPT', 'Claude', 'Gemini', 'DeepSeek', 'Kimi', 'Qwen', 'GLM', 'Grok']) {
    assert.match(visible, new RegExp(name), `missing platform ${name}`);
  }
  for (const browser of ['Chrome', 'Brave', 'Firefox']) assert.match(visible, new RegExp(browser));
});

test('the credit is present and spelled the one way it is spelled', () => {
  assert.match(html, /github\.com\/MDHojayfa/);
  assert.match(html, /mdhojayfa\.github\.io/);
  assert.doesNotMatch(html, /MDHohayfa|MDHojayfaa|Hojaifa/);
});

test('the social preview exists, is a real PNG and is not enormous', () => {
  const p = join(ROOT, 'site/og.png');
  assert.ok(existsSync(p));
  const buf = readFileSync(p);
  assert.equal(buf[0], 0x89);
  assert.equal(buf.toString('ascii', 1, 4), 'PNG');
  assert.equal(buf.readUInt32BE(16), 1200);
  // 630, not the 640 this file used to be: og.png is now the card `npm run art` generates, and 1200x630 is the shape
  // a link preview crops to. Anything else gets re-cropped by the scraper, from wherever it likes.
  assert.equal(buf.readUInt32BE(20), 630);
  assert.ok(statSync(p).size < 200 * 1024, 'og.png should stay small');
});

test('the page declares a canonical URL and a description of a sensible length', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/mdhojayfa\.github\.io\/mdh-ai\/">/);
  const desc = /<meta name="description" content="([^"]+)">/.exec(html)[1];
  assert.ok(desc.length >= 120 && desc.length <= 320, `description is ${desc.length} chars`);
});

test('headings are ordered: exactly one h1, and no h3 before an h2', () => {
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
  const order = [...html.matchAll(/<h([123])[\s>]/g)].map((m) => Number(m[1]));
  let seenH2 = false;
  for (const level of order) {
    if (level === 2) seenH2 = true;
    if (level === 3) assert.ok(seenH2, 'an h3 appears before the first h2');
  }
});

test('the mission patch is inline SVG, self-contained and described', () => {
  const svg = html.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
  assert.ok(svg.length >= 1, 'no inline SVG on the page');
  for (const block of svg) {
    assert.match(block, /viewBox="0 0 320 320"/);
    assert.match(block, /role="img"/);
    assert.match(block, /aria-label="[^"]{20,}"/);
    assert.doesNotMatch(block, /<image|xlink:href|https?:\/\//, 'the patch must not fetch anything');
    assert.equal((block.match(/<svg/g) ?? []).length, (block.match(/<\/svg>/g) ?? []).length);
  }
  assert.match(html, /One mission patch per release/);
});

test('the media kit lists six usable screenshots and the permission story', () => {
  const media = readFileSync(join(ROOT, 'docs/MEDIA.md'), 'utf8');
  for (let i = 1; i <= 6; i += 1) assert.match(media, new RegExp(`0${i}-[a-z]+\\.png`));
  assert.match(media, /nativeMessaging/);
  assert.match(media, /No `<all_urls>`/);
  assert.match(media, /never arrives with your paths/i);
});
