/**
 * 幂等性回归测试。
 *
 * 引擎对「关键帧」和「内联样式」是就地在站点样式表/元素上改写的，
 * 站点里存的就是我们写过的值。若不做 orig/applied 记账，反复重建会把
 * 「已映射过的值」再映射一次 —— 典型症状是边框被反复衰减到
 * rgba(255,255,255,0.06)，页面描边逐轮消失。
 *
 * 本脚本连续重建 6 次，要求最终渲染结果与首次完全一致。
 *   node scripts/verify-idempotent.mjs
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

const userscript = fs.readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

/** 渲染指纹：把全页所有元素的颜色相关计算值拼起来 */
const FINGERPRINT = () => {
  const parts = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    parts.push(
      cs.color, cs.backgroundColor, cs.borderTopColor, cs.borderBottomColor,
      cs.borderLeftColor, cs.borderRightColor, cs.outlineColor, cs.fill, cs.stroke,
    );
  }
  parts.push(getComputedStyle(document.documentElement).backgroundColor);
  const s = parts.join('|');
  // 简单稳定哈希
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return { hash: h.toString(16), len: s.length };
};

const browser = await chromium.launch({ headless: true, executablePath: exe });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'zh-CN',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
await context.addInitScript(() => {
  try { localStorage.setItem('heybox-dark-mode', '1'); } catch (_) {}
});
await context.addInitScript(code);

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

await page.goto('https://www.xiaoheihe.cn/app/bbs/home', {
  waitUntil: 'domcontentloaded',
  timeout: 90000,
});
await page.waitForTimeout(8000);
// 停留一下，让站点的骨架屏/动画关键帧都跑起来
await page.evaluate(async () => {
  for (let i = 0; i < 4; i++) { window.scrollBy(0, 800); await new Promise((r) => setTimeout(r, 300)); }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(2500);

const rounds = [];
for (let i = 0; i < 6; i++) {
  if (i > 0) {
    await page.evaluate(() => window.__hbRebuild());
    await page.waitForTimeout(350);
  }
  const fp = await page.evaluate(FINGERPRINT);
  const cssBytes = await page.evaluate(() => window.__hbEngineCss().bytes);
  const stats = await page.evaluate(() => window.__hbEngineStats());
  rounds.push({ round: i, ...fp, cssBytes, keyframes: stats.keyframes, emitted: stats.emitted });
  console.log(JSON.stringify(rounds[rounds.length - 1]));
}

const first = rounds[0];
const stable = rounds.every((r) => r.hash === first.hash);
const cssStable = rounds.every((r) => r.cssBytes === first.cssBytes);

console.log('\n########## 幂等性结论 ##########');
console.log(`渲染指纹: 首轮 ${first.hash} -> 末轮 ${rounds[rounds.length - 1].hash}`);
console.log(`覆盖表字节: 首轮 ${first.cssBytes} -> 末轮 ${rounds[rounds.length - 1].cssBytes}`);
console.log(`渲染${stable ? '稳定 ✅' : '漂移 ❌'} | 覆盖表${cssStable ? '稳定 ✅' : '漂移 ❌'} | 报错 ${errors.length}`);
if (!stable) {
  console.log('各轮指纹：', rounds.map((r) => r.hash).join(' '));
}

await browser.close();
const pass = stable && cssStable && errors.length === 0;
console.log(pass ? '\nPASS ✅' : '\nFAIL ❌');
process.exit(pass ? 0 : 1);
