/**
 * 抓取运行时 CSS：不仅 link[rel=stylesheet]，还包括 JS 动态注入的 <style>。
 *
 *   node research/dump-runtime-css.mjs [url]
 *
 * 起因：详情页 document.styleSheets 有 21 个，而 link[rel=stylesheet] 只有 19 个，
 * 说明有样式表是运行时注入的 —— 之前的离线语料（只按 link 抓）漏掉了它们，
 * 所以"楼层选中高亮"的规则一直找不到。
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

const URL_ = process.argv[2] || 'https://www.xiaoheihe.cn/app/bbs/link/190707314';
const outDir = path.resolve('research/css-runtime');
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
await page.evaluate(async () => {
  for (let i = 0; i < 10; i++) { window.scrollBy(0, 900); await new Promise((r) => setTimeout(r, 350)); }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(4000);

const sheets = await page.evaluate(() => {
  const out = [];
  let i = 0;
  for (const s of document.styleSheets) {
    const owner = s.ownerNode;
    const tag = owner ? owner.tagName.toLowerCase() : null;
    let text = null;
    let rules = null;
    try { rules = s.cssRules ? s.cssRules.length : null; } catch (e) { rules = 'ERR'; }
    if (tag === 'style' && owner.textContent) text = owner.textContent;
    out.push({
      idx: i++,
      tag,
      id: owner && owner.id ? owner.id : null,
      href: s.href,
      rules,
      bytes: text ? text.length : null,
      text,
    });
  }
  return out;
});

let saved = 0;
for (const s of sheets) {
  const label = s.tag === 'style'
    ? `inline-${s.idx}${s.id ? '-' + s.id : ''}.css`
    : (s.href || `unknown-${s.idx}`).split('/').pop();
  if (s.text) {
    fs.writeFileSync(path.join(outDir, label), s.text, 'utf8');
    saved++;
    console.log(`STYLE  ${String(s.bytes).padStart(8)}B  rules=${String(s.rules).padStart(5)}  ${label}`);
  } else {
    console.log(`LINK   ${''.padStart(8)}   rules=${String(s.rules).padStart(5)}  ${label}`);
  }
}
console.log(`\n内联 <style> 落盘数：${saved}；样式表总数：${sheets.length}`);

// 直接在内联样式里找「评论高亮」线索
console.log('\n########## 内联样式中的 comment/target/highlight 规则 ##########');
for (const s of sheets) {
  if (!s.text) continue;
  const rules = [...s.text.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const r of rules) {
    const sel = r[1].replace(/\s+/g, ' ').trim();
    const body = r[2].replace(/\s+/g, ' ');
    if (!/comment|reply|floor|target|highlight|jump/i.test(sel)) continue;
    if (!/background|box-shadow|opacity|visibility|display/.test(body)) continue;
    console.log(`[inline ${s.idx}] ${sel}`);
    console.log(`    ${body.slice(0, 220)}`);
  }
}

// 找所有全尺寸覆盖层（任意来源）
console.log('\n########## 全尺寸覆盖层（含内联），限制在评论相关选择器 ##########');
for (const s of sheets) {
  if (!s.text) continue;
  for (const r of s.text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = r[1].replace(/\s+/g, ' ').trim();
    const body = r[2].replace(/\s+/g, ' ');
    if (!/position:\s*(absolute|fixed)/.test(body)) continue;
    if (!/height:\s*100%/.test(body)) continue;
    if (!/(background|background-color)\s*:/.test(body)) continue;
    if (!/comment|reply|link-|bbs-link/i.test(sel)) continue;
    console.log(`[${s.tag} ${s.idx}] ${sel}`);
    console.log(`    ${body.slice(0, 240)}`);
  }
}

await browser.close();
console.log('\nDONE');
