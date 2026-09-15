/**
 * 抓取指定详情页额外加载的 CSS 分片（首页语料之外的部分），
 * 并就地打印「评论/楼层状态样式」候选规则。
 *
 *   node research/fetch-detail-css.mjs [url]
 *
 * 背景：home 的 16 个分片里完全没有 link-comment / comment-item 相关规则，
 * 说明评论样式在详情页按需加载的 chunk 里。
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

const URL_ = process.argv[2] || 'https://www.xiaoheihe.cn/app/bbs/link/190535650';
const outDir = path.resolve('research/css-detail');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: exe });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'zh-CN',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const page = await context.newPage();
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(9000);
// 滚动以触发评论区懒加载 chunk
await page.evaluate(async () => {
  for (let i = 0; i < 8; i++) { window.scrollBy(0, 900); await new Promise((r) => setTimeout(r, 400)); }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(4000);

const report = await page.evaluate(() => {
  const hrefs = [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.href);

  // 收集所有规则，筛出评论/楼层相关的状态样式
  const rules = [];
  const keyframes = new Set();
  const visit = (list) => {
    for (const r of list) {
      const isStyle = typeof r.selectorText === 'string';
      if (!isStyle) {
        if (r.cssRules && r.cssRules.length) visit(r.cssRules);
        if (typeof r.name === 'string' && /flash|highlight|active|target|fade/i.test(r.name)) keyframes.add(r.name);
        continue;
      }
      const t = r.cssText || '';
      if (/@keyframes|animation/i.test(t) && /flash|highlight|active|target/i.test(t)) {
        rules.push({ sel: r.selectorText, css: t.slice(0, 300) });
      }
    }
  };
  for (const s of document.styleSheets) { try { visit(s.cssRules); } catch (e) {} }

  // 评论项 DOM 结构（找状态类线索）
  const items = [];
  for (const el of document.querySelectorAll('[class*="comment-item"], [class*="link-comment"]').values()) {
    if (items.length >= 6) break;
    items.push({
      cls: String(el.className).slice(0, 120),
      tag: el.tagName.toLowerCase(),
      attrs: [...el.attributes].map((a) => a.name).filter((n) => n !== 'class').slice(0, 6),
    });
  }

  // 找所有看起来像"状态"的类名（DOM 里出现的 is-* / active / selected / highlight）
  const stateLike = new Set();
  for (const el of document.querySelectorAll('[class]')) {
    for (const c of String(el.className).split(/\s+/)) {
      if (/^(is-|has-)|active|selected|highlight|target|current|checked|focus/.test(c)) stateLike.add(c);
    }
  }

  return {
    sheetCount: document.styleSheets.length,
    hrefs,
    animationRules: rules.slice(0, 20),
    keyframes: [...keyframes].slice(0, 20),
    commentItems: items,
    stateLikeClasses: [...stateLike].slice(0, 40),
    hasCaptcha: !!document.querySelector('.tcaptcha-transform, [class*="tcaptcha"]'),
  };
});

console.log(JSON.stringify(report, null, 1));

// 下载新分片
const existing = new Set(
  fs.existsSync(path.resolve('research/css'))
    ? fs.readdirSync(path.resolve('research/css'))
    : [],
);
let added = 0;
for (const url of report.hrefs) {
  const name = url.split('/').pop();
  const dest = path.join(outDir, name);
  if (fs.existsSync(dest)) continue;
  try {
    const res = await fetch(url);
    const text = await res.text();
    fs.writeFileSync(dest, text, 'utf8');
    const isNew = !existing.has(name);
    if (isNew) added++;
    console.log(`${isNew ? 'NEW ' : '    '}${String(text.length).padStart(8)}  ${name}`);
  } catch (e) {
    console.log(`ERR ${name}: ${String(e).slice(0, 80)}`);
  }
}
console.log(`\n新增（首页语料之外）分片：${added}`);

await browser.close();
console.log('DONE');
