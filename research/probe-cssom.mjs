import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { resolveChromePath } from '../scripts/lib/chromium.mjs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const exe = resolveChromePath();

const browser = await chromium.launch({ headless: true, executablePath: exe });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const page = await context.newPage();
await page.goto('https://www.xiaoheihe.cn/app/bbs/home', {
  waitUntil: 'domcontentloaded',
  timeout: 90000,
});
await page.waitForTimeout(7000);

const result = await page.evaluate(async () => {
  const out = { sheets: [], fetchTests: [], inline: {}, resources: {} };

  for (const sheet of document.styleSheets) {
    const rec = { href: sheet.href, owner: !!sheet.ownerNode, rules: null, error: null, cors: null };
    try {
      rec.rules = sheet.cssRules.length;
      let colored = 0;
      let scanned = 0;
      for (const r of sheet.cssRules) {
        scanned++;
        if (r.cssText && /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(r.cssText)) colored++;
      }
      rec.coloredRules = colored;
      rec.scanned = scanned;
    } catch (e) {
      rec.error = String(e).slice(0, 120);
    }
    out.sheets.push(rec);
  }

  const cssUrls = [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.href);
  for (const url of cssUrls.slice(0, 3)) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      out.fetchTests.push({
        url: url.split('/').pop(),
        ok: res.ok,
        status: res.status,
        acao: res.headers.get('access-control-allow-origin'),
        bytes: text.length,
      });
    } catch (e) {
      out.fetchTests.push({ url: url.split('/').pop(), ok: false, error: String(e).slice(0, 140) });
    }
  }

  let inlineColor = 0;
  let inlineBg = 0;
  let inlineBgImg = 0;
  const samples = [];
  for (const el of document.querySelectorAll('[style]')) {
    const s = el.getAttribute('style') || '';
    if (/color\s*:/.test(s) ) inlineColor++;
    if (/background(-color)?\s*:/.test(s)) inlineBg++;
    if (/background-image\s*:/.test(s)) inlineBgImg++;
    if (samples.length < 10 && /color|background/.test(s)) {
      samples.push({ tag: el.tagName.toLowerCase(), cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60), style: s.slice(0, 140) });
    }
  }
  out.inline = {
    withStyleAttr: document.querySelectorAll('[style]').length,
    inlineColor,
    inlineBg,
    inlineBgImg,
    samples,
  };

  const all = [...document.querySelectorAll('body *')];
  let bgImageRules = 0;
  for (const el of all) {
    const bi = getComputedStyle(el).backgroundImage;
    if (bi && bi !== 'none' && bi.includes('url(')) bgImageRules++;
  }
  out.resources = {
    elements: all.length,
    imgs: document.querySelectorAll('img').length,
    svgs: document.querySelectorAll('svg').length,
    canvases: document.querySelectorAll('canvas').length,
    videos: document.querySelectorAll('video').length,
    iframes: document.querySelectorAll('iframe').length,
    elsWithBgUrl: bgImageRules,
  };

  out.meta = {
    htmlClass: document.documentElement.className,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
    sheetsCount: document.styleSheets.length,
  };

  out.epVersion = (window.ElementPlus && window.ElementPlus.version) || null;

  return out;
});

console.log(JSON.stringify(result, null, 2));
fs.writeFileSync(
  path.resolve('research/probe-cssom.json'),
  JSON.stringify(result, null, 2),
  'utf8',
);

await browser.close();
console.log('DONE');
