/**
 * 在详情页的 JS 分片里定位「楼层选中/高亮」的实现。
 *
 *   node research/find-highlight.mjs [url]
 *
 * 思路：评论组件必然包含 class 名 `link-comment__comment-item`，
 * 找到含它的 chunk，再在附近搜状态类名与高亮相关代码。
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
const jsDir = path.resolve('research/js');
fs.mkdirSync(jsDir, { recursive: true });

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
await page.evaluate(async () => {
  for (let i = 0; i < 8; i++) { window.scrollBy(0, 900); await new Promise((r) => setTimeout(r, 350)); }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(3500);

const urls = await page.evaluate(() => {
  const out = new Set();
  for (const s of document.querySelectorAll('script[src]')) out.add(s.src);
  for (const l of document.querySelectorAll('link[rel=modulepreload][as=script]')) out.add(l.href);
  return [...out];
});
await browser.close();
console.log(`JS 分片数：${urls.length}`);

const KEY = 'link-comment__comment-item';
const STATE_RE = /is-active|is-selected|is-highlight|highlight|selected|activeClass|jump|scrollIntoView|is-target|targetFloor/;

const downloaded = [];
for (const url of urls) {
  const name = url.split('/').pop();
  const dest = path.join(jsDir, name);
  let text;
  if (fs.existsSync(dest)) text = fs.readFileSync(dest, 'utf8');
  else {
    try {
      const res = await fetch(url);
      text = await res.text();
      fs.writeFileSync(dest, text, 'utf8');
    } catch (e) {
      console.log(`ERR ${name}: ${String(e).slice(0, 70)}`);
      continue;
    }
  }
  downloaded.push({ name, text, bytes: text.length });
}
console.log(`已缓存 ${downloaded.length} 个分片，合计 ${(downloaded.reduce((a, b) => a + b.bytes, 0) / 1048576).toFixed(1)}MB`);

// 1) 找出含评论组件 class 的分片
const owners = downloaded.filter((d) => d.text.includes(KEY));
console.log(`\n含 "${KEY}" 的分片：${owners.map((o) => o.name).join(', ') || '无'}`);

// 2) 在这些分片里找状态相关标识符
for (const o of owners) {
  console.log(`\n########## ${o.name} (${(o.bytes / 1024).toFixed(0)}KB) ##########`);
  const seen = new Set();
  let idx = 0;
  let hits = 0;
  while ((idx = o.text.indexOf(KEY, idx)) >= 0 && hits < 6) {
    hits++;
    const from = Math.max(0, idx - 700);
    const to = Math.min(o.text.length, idx + 900);
    const ctx = o.text.slice(from, to);
    // 只打印含状态线索的上下文，避免噪声
    if (STATE_RE.test(ctx)) {
      const key = ctx.slice(0, 120);
      if (!seen.has(key)) {
        seen.add(key);
        console.log(`--- 上下文 @${idx} ---`);
        console.log(ctx.replace(/\s+/g, ' '));
        console.log('');
      }
    }
    idx += KEY.length;
  }
  if (!seen.size) console.log('（该分片中 class 附近未出现状态类名，列出前 2 段上下文）');
  if (!seen.size) {
    let i2 = o.text.indexOf(KEY);
    for (let k = 0; k < 2 && i2 >= 0; k++) {
      console.log(o.text.slice(Math.max(0, i2 - 400), i2 + 600).replace(/\s+/g, ' '));
      console.log('');
      i2 = o.text.indexOf(KEY, i2 + KEY.length);
    }
  }
}

// 3) 全量搜 highlight / 选中相关关键词
console.log('\n########## 关键词命中统计 ##########');
for (const kw of ['highlight', 'is-highlight', 'highlightFloor', 'activeFloor', 'floorId', 'jumpToFloor', 'scrollToComment', 'commentId']) {
  const hit = downloaded.filter((d) => d.text.includes(kw)).map((d) => d.name);
  if (hit.length) console.log(`  ${kw}: ${hit.join(', ')}`);
}
console.log('DONE');
