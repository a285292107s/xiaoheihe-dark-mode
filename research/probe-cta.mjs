/**
 * 精确诊断：暗色模式下哪些元素出现「配对反转失效」。
 *  - 文本亮、但最近不透明祖先背景也亮  -> 文字看不清（必须修）
 *  - 表面很深、却位于更深的页面上      -> 反转填充（CTA）失效（可选修）
 * node research/probe-cta.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const exe =
  process.env.CHROME_PATH ||
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe');

const engine = fs.readFileSync(path.resolve('research/hb-dark-engine.js'), 'utf8');

const browser = await chromium.launch({ headless: true, executablePath: exe });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 }, locale: 'zh-CN',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const page = await context.newPage();
await page.goto('https://www.xiaoheihe.cn/app/bbs/home', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(7000);
await page.addScriptTag({ content: engine });
await page.evaluate(() => window.__hbDarkProto.enable());
await page.waitForTimeout(2500);

const report = await page.evaluate(() => {
  const parse = (s) => {
    const m = String(s).match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const relLum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const contrast = (a, b) => {
    const l1 = relLum(a), l2 = relLum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const path = (el) => {
    const out = [];
    let n = el, i = 0;
    while (n && n.nodeType === 1 && i++ < 4) {
      const cls = typeof n.className === 'string' ? n.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      out.unshift(n.tagName.toLowerCase() + (cls ? '.' + cls : ''));
      n = n.parentElement;
    }
    return out.join(' > ');
  };
  // 找最近的不透明背景
  const bgBehind = (el) => {
    let n = el.parentElement;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.5) return { c, el: n };
      n = n.parentElement;
    }
    const b = parse(getComputedStyle(document.body).backgroundColor);
    return b && b.a > 0.5 ? { c: b, el: document.body } : { c: { r: 14, g: 17, b: 22, a: 1 }, el: document.body };
  };

  const badText = [];     // 文字与背景对比不足
  const invertedFill = []; // 深色实心块（CTA）
  let scanned = 0;

  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 12) continue;
    const cs = getComputedStyle(el);
    // 只看自身直接有文本的叶子
    const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    const own = parse(cs.backgroundColor);
    const ownOpaque = own && own.a > 0.5;
    scanned++;

    if (ownOpaque && relLum(own) < 0.055) {
      invertedFill.push({ path: path(el), bg: cs.backgroundColor, color: cs.color, w: Math.round(r.width), h: Math.round(r.height) });
    }

    if (!hasOwnText) continue;
    const fg = parse(cs.color);
    if (!fg || fg.a < 0.3) continue;
    const behindRaw = ownOpaque ? own : bgBehind(el).c;
    // 半透明自身背景：与背后做近似混合
    let behind = behindRaw;
    if (own && own.a > 0.05 && own.a <= 0.5) {
      behind = {
        r: own.r * own.a + behindRaw.r * (1 - own.a),
        g: own.g * own.a + behindRaw.g * (1 - own.a),
        b: own.b * own.a + behindRaw.b * (1 - own.a),
        a: 1,
      };
    }
    const ratio = contrast(fg, behind);
    if (ratio < 3.2) {
      badText.push({
        path: path(el),
        text: (el.textContent || '').trim().slice(0, 22),
        color: cs.color, bg: `rgb(${Math.round(behind.r)}, ${Math.round(behind.g)}, ${Math.round(behind.b)})`,
        ratio: Math.round(ratio * 100) / 100,
      });
    }
  }

  // CTA 专项
  const cta = [];
  for (const sel of ['.login-btn', '.publish-btn', '.view-btn', '.hb-level-tag__inner']) {
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      cta.push({ sel, bg: cs.backgroundColor, bgImage: cs.backgroundImage.slice(0, 70), color: cs.color,
        contrastVsPage: Math.round(contrast(parse(cs.backgroundColor) || { r: 0, g: 0, b: 0 }, { r: 14, g: 17, b: 22 }) * 100) / 100 });
      break;
    }
  }
  const rootCs = getComputedStyle(document.documentElement);
  const tokens = ['--publish-bg', '--publish-color', '--nav-background', '--nav-link-color', '--nav-logo-color']
    .map((t) => `${t}=${rootCs.getPropertyValue(t).trim()}`);

  return {
    scanned,
    tokens,
    cta,
    badTextCount: badText.length,
    badText: badText.slice(0, 30),
    invertedFillCount: invertedFill.length,
    invertedFill: invertedFill.slice(0, 24),
  };
});

console.log(JSON.stringify(report, null, 1));
fs.writeFileSync(path.resolve('research/cta-report.json'), JSON.stringify(report, null, 2), 'utf8');
await browser.close();
console.log('DONE');
