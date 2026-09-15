/**
 * 回归：整屏底色层「第 1 轮构建正确、第 2 轮起翻车」。
 *
 *   node research/repro-canvas-flip.mjs
 *
 * 离线、不联网：用 research/css/ 里站点真实的两个 CSS 分片渲染
 * `#page-bbs-community` 的固定色带与信息流分隔条，注入 dist 产物，比较两种状态：
 *
 *   fresh    —— 关掉再打开（首轮构建：站点声明刚从还原状态读出来）
 *   rebuilt  —— 强制重建（第二轮构建）
 *
 * 四层都必须等于画布色 `rgb(14,17,22)`，且两种状态逐条相等。
 *
 * 根因（FINDINGS 第八节的回归）：`walk()` 登记「页面画布色」时读的是声明的
 * **当前值**，而 `:root{background-color:#f7f8f9}` 在上一轮刚被引擎自己改写成
 * 画布色 —— 画布色集合于是从 `#f7f8f9` 变成 `#0e1116`，此后凡是「等于页面底色」
 * 的整屏层都掉进通用中性表面分支，拿到卡片色 `rgb(38,44,51)`。
 *
 * 脚本同时跑**阴性对照**：把引擎换回「读当前值」的实现，要求判据必须能检出
 * 差异 —— 否则这套断言只是空跑。
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

const CANVAS = 'rgb(14, 17, 22)';

const userscript = fs.readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

/** 阴性对照：退回「读声明当前值」的旧实现 */
const PREFIXED = code.replace(
  'plainColorOf(sourceValue(style, style[j]))',
  'plainColorOf(style.getPropertyValue(style[j]))',
);

const mainCss = fs.readFileSync(path.resolve('research/css/index-Cv4ia_mR.css'), 'utf8');
const bbsCss = fs.readFileSync(path.resolve('research/css/index-DBcvV3KQ.css'), 'utf8');

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<style>${mainCss}</style>
<style>${bbsCss}</style>
</head><body>
<div id="page-bbs-community" data-v-a4016135 class="content">
  <main data-v-a4016135 class="list">
    <div data-v-a4016135 class="hb-cpt__scroll-list hb-bbs-home">
      <div data-v-a4016135 class="bbs-home__topic-list-wrapper hb-bbs-home__splitline">
        <div data-v-a4016135 class="bbs-home__topic-list" style="height:80px">话题栏</div>
      </div>
      <div data-v-a4016135 class="bbs-home__content-list">
        <div data-v-a4016135 class="bbs-home__content-item hb-bbs-home__feed-splitline" style="height:160px">卡片</div>
      </div>
    </div>
  </main>
</div>
</body></html>`;

const LAYERS = [
  ['#page-bbs-community', '::before'],
  ['#page-bbs-community', '::after'],
  ['.hb-bbs-home__splitline', '::after'],
  ['.hb-bbs-home__feed-splitline', '::after'],
];

/** 读取与构建放在同一次 evaluate 里，避免采样点落在线上的里程碑构建之后 */
const LAYER_CYCLE = ({ pairs, action }) => {
  const read = () =>
    pairs.map(([sel, pseudo]) => {
      const el = document.querySelector(sel);
      return [sel + pseudo, el ? getComputedStyle(el, pseudo).backgroundColor : '(missing)'];
    });
  if (action === 'fresh') {
    window.__hbSetDark(false);
    window.__hbSetDark(true); // 首轮构建在这次调用内同步完成
  } else {
    window.__hbRebuild();
  }
  return read();
};

const browser = await chromium.launch({ headless: true, executablePath: exe });

async function measure(engineCode, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
  await page.addScriptTag({ content: engineCode });
  await page.waitForTimeout(300);
  const fresh = await page.evaluate(LAYER_CYCLE, { pairs: LAYERS, action: 'fresh' });
  const rebuilt = await page.evaluate(LAYER_CYCLE, { pairs: LAYERS, action: 'rebuilt' });
  const stats = await page.evaluate(() => window.__hbEngineStats());
  await context.close();
  return { label, fresh, rebuilt, stats };
}

const fixed = await measure(code, '当前产物');
const old = await measure(PREFIXED, '阴性对照（旧实现：读声明当前值）');
await browser.close();

const show = (m) => {
  console.log(`\n===== ${m.label} =====`);
  for (const [i, [sel, bg]] of m.fresh.entries()) {
    console.log(`  ${sel.padEnd(52)} 首轮 ${bg.padEnd(18)} 重建 ${m.rebuilt[i][1]}`);
  }
  console.log(`  扫描 ${m.stats.scanned} / 改动规则 ${m.stats.changed} / 改动声明 ${m.stats.declarations}`);
};
show(fixed);
show(old);

const allCanvas = (m) =>
  m.fresh.every(([, bg]) => bg === CANVAS) && m.rebuilt.every(([, bg]) => bg === CANVAS);
const freshSame = (m) => JSON.stringify(m.fresh) === JSON.stringify(m.rebuilt);

const checks = [
  ['四层全部命中（非空跑）', fixed.fresh.length === LAYERS.length && fixed.fresh.every(([, bg]) => bg !== '(missing)')],
  ['首轮 == 重建（产物）', freshSame(fixed)],
  ['四层都是画布色', allCanvas(fixed)],
  ['阴性对照必须被检出', !freshSame(old)],
];

console.log('\n########## 结论 ##########');
let pass = true;
for (const [name, ok] of checks) {
  console.log(`  ${ok ? 'PASS ✅' : 'FAIL ❌'}  ${name}`);
  if (!ok) pass = false;
}
console.log(pass ? '\nPASS ✅' : '\nFAIL ❌');
process.exit(pass ? 0 : 1);
