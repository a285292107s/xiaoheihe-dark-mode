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
  // 整屏底色层全在伪元素上，元素级指纹看不见它们 —— 而这些色带正是
  // 最容易被「第几轮构建」影响的地方（曾经第 2 轮就从画布色翻成卡片色）。
  for (const [sel, pseudo] of [
    ['#page-bbs-community', '::before'],
    ['#page-bbs-community', '::after'],
    ['.hb-bbs-home__splitline', '::after'],
    ['.hb-bbs-home__feed-splitline', '::after'],
  ]) {
    const el = document.querySelector(sel);
    if (el) parts.push(sel + pseudo, getComputedStyle(el, pseudo).backgroundColor);
  }
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
  rounds.push({
    round: i,
    ...fp,
    cssBytes,
    changed: stats.changed,
    declarations: stats.declarations,
    keyframes: stats.keyframes,
    tracked: stats.tracked,
  });
  console.log(JSON.stringify(rounds[rounds.length - 1]));
}

const first = rounds[0];
const stable = rounds.every((r) => r.hash === first.hash);
const cssStable = rounds.every((r) => r.cssBytes === first.cssBytes);

// ---------------------------------------------------------------
// 第二项：构建输出必须与「这是第几轮构建」无关。
//
// 引擎就地改写站点声明，所以站点样式表里存的就是我们写过的值。任何一处
// 从「当前值」而不是「站点原值」推导结论，第 1 轮与第 2 轮就会给出不同的
// 颜色 —— 实例：整屏固定色带 #page-bbs-community::before 第 1 轮是画布色，
// 第 2 轮起翻成卡片色，因为画布色集合读到了引擎自己写进 :root 的值
// （FINDINGS 第八节）。关掉再打开等于回到「首轮」，重建一轮等于「第二轮」，
// 两者必须逐条相等。读取与构建放在同一次 evaluate 里，避免落在里程碑构建之后。
// ---------------------------------------------------------------
const LAYERS = [
  ['#page-bbs-community', '::before'],
  ['#page-bbs-community', '::after'],
  ['.hb-bbs-home__splitline', '::after'],
  ['.hb-bbs-home__feed-splitline', '::after'],
];

const LAYER_CYCLE = ({ pairs, action }) => {
  const read = () =>
    pairs.flatMap(([sel, pseudo]) => {
      const el = document.querySelector(sel);
      return el ? [[sel + pseudo, getComputedStyle(el, pseudo).backgroundColor]] : [];
    });
  if (action === 'fresh') {
    window.__hbSetDark(false);
    window.__hbSetDark(true); // 首轮构建在这次调用内同步完成
  } else {
    window.__hbRebuild();
  }
  return read();
};

const freshLayers = await page.evaluate(LAYER_CYCLE, { pairs: LAYERS, action: 'fresh' });
const rebuiltLayers = await page.evaluate(LAYER_CYCLE, { pairs: LAYERS, action: 'rebuilt' });
const layersStable =
  freshLayers.length === LAYERS.length &&
  JSON.stringify(freshLayers) === JSON.stringify(rebuiltLayers);

console.log('\n########## 幂等性结论 ##########');
console.log(`渲染指纹: 首轮 ${first.hash} -> 末轮 ${rounds[rounds.length - 1].hash}`);
console.log(`例外层字节: 首轮 ${first.cssBytes} -> 末轮 ${rounds[rounds.length - 1].cssBytes}`);
console.log(`整屏底色层: 首轮构建 ${JSON.stringify(freshLayers)}`);
console.log(`            重建之后 ${JSON.stringify(rebuiltLayers)}`);
console.log(`渲染${stable ? '稳定 ✅' : '漂移 ❌'} | 例外层${cssStable ? '稳定 ✅' : '漂移 ❌'} | ` +
  `底色层${layersStable ? '与构建轮次无关 ✅' : '随构建轮次改变 ❌'} | 报错 ${errors.length}`);
if (!stable) {
  console.log('各轮指纹：', rounds.map((r) => r.hash).join(' '));
}

await browser.close();
const pass = stable && cssStable && layersStable && errors.length === 0;
console.log(pass ? '\nPASS ✅' : '\nFAIL ❌');
process.exit(pass ? 0 : 1);
