/**
 * 换路由白闪回归：站点在切换页面时会（1）用 JS 给整屏加载幕写内联白底、
 * （2）插入新的 CSS 分片，而分片里的浅色在引擎改写之前就会被绘制。
 *
 *   node scripts/verify-flash.mjs
 *
 * 离线（本地 HTTP，样式表才可读 CSSOM）：合成这两种时机，逐帧统计「浅色面积占比」，
 * 要求全程没有任何一帧出现成片浅色。
 *
 * 每个场景都带**阴性对照**：把引擎改回修复前的做法（内联改写排队 80ms /
 * 新分片只等 400ms 防抖），要求判据必须检出白闪 —— 否则判据只是空跑。
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const exe =
  process.env.CHROME_PATH ||
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe');

const userscript = fs.readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');
const CODE = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

/** 阴性对照 1：内联改写退回「排队 80ms」 */
const CODE_DEFERRED_INLINE = CODE.replace(
  'if (el.isConnected) fixInlineStyle(el);',
  'setTimeout(() => { if (el.isConnected) fixInlineStyle(el); }, 80);',
);
/** 阴性对照 2：新分片不即时重建，只留 400ms 防抖 */
const CODE_NO_IMMEDIATE = CODE.replace(
  'if (!enabled || immediateQueued) return;',
  'if (true) return;',
);
for (const [name, patched, marker] of [
  ['内联排队', CODE_DEFERRED_INLINE, 'setTimeout(() => { if (el.isConnected) fixInlineStyle(el); }, 80);'],
  ['分片不即时重建', CODE_NO_IMMEDIATE, 'if (true) return;'],
]) {
  if (!patched.includes(marker)) {
    console.error(`阴性对照补丁未生效（${name}）—— 产物代码已变，请同步 __tests__ 里的补丁字符串`);
    process.exit(2);
  }
}

const PAGE = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>flash</title>
<style>
  :root { background-color: #f7f8f9; }
  html, body { margin: 0; height: 100%; background-color: #f7f8f9; }
  #route { min-height: 620px; }
</style></head>
<body>
<div id="app"><div id="route"></div></div>
<script>
  // 采样器：网格逐帧记录最上层不透明背景的亮度占比
  window.__frames = [];
  window.startSampler = (ms) => {
    window.__frames = [];
    const xs = [], ys = [];
    for (let x = 20; x < innerWidth; x += 40) xs.push(x);
    for (let y = 10; y < innerHeight; y += 40) ys.push(y);
    const parse = (s) => {
      const m = String(s).match(/rgba?\\(([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,\\s/]+([\\d.]+))?\\)/);
      return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
    };
    const t0 = performance.now();
    const sample = () => {
      let light = 0, total = 0, culprit = null;
      for (const y of ys) for (const x of xs) {
        total++;
        for (const el of document.elementsFromPoint(x, y)) {
          const c = parse(getComputedStyle(el).backgroundColor);
          if (!c || c.a <= 0.5) continue;
          if (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 150) {
            light++;
            if (!culprit) culprit = el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 30);
          }
          break;
        }
      }
      window.__frames.push({ t: Math.round(performance.now() - t0), frac: +(light / total).toFixed(3), culprit });
      if (performance.now() - t0 < ms) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  };
  // 场景一：整屏加载幕 + JS 写内联白底（真实站点 .hb-loading-spinner 的做法）。
  // 关键在时序：元素**先插入**、内联底色在**后一个任务**才写上去 —— 站点就是这么做的，
  // 也正是「只在 addedNodes 里同步改写」漏掉、必须靠 style 属性变更同步改写的那条路径。
  window.triggerInline = () => {
    const m = document.createElement('div');
    m.id = 'mask';
    document.body.appendChild(m);
    setTimeout(() => {
      m.style.cssText = 'position:fixed;inset:0;z-index:50';
      m.style.backgroundColor = 'rgb(255, 255, 255)';
    }, 30);
  };
  // 场景二：换路由插入新的 CSS 分片（服务端延迟 200ms 返回，分片里是浅色）
  window.triggerSheet = () => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/route.css';
    document.head.appendChild(l);
  };
</script>
</body></html>`;

const ROUTE_CSS = '#route{background-color:#ffffff;color:#14191e;border-top:1px solid #e5e7eb}';

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/route.css')) {
    // 模拟网络：分片晚 200ms 到达
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'text/css' });
      res.end(ROUTE_CSS);
    }, 200);
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(PAGE);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ headless: true, executablePath: exe });
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok });
  console.log(`  ${ok ? 'PASS ✅' : 'FAIL ❌'}  ${name}${ok ? '' : '   ' + (detail ?? '')}`);
};

/** 跑一个场景，返回浅色帧统计 */
async function run(engineCode, trigger, label) {
  const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
  await context.addInitScript(() => { try { localStorage.setItem('heybox-dark-mode', '1'); } catch {} });
  await context.addInitScript(engineCode);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(900);
  await page.evaluate((ms) => window.startSampler(ms), trigger === 'inline' ? 2200 : 2600);
  await page.evaluate((t) => (t === 'inline' ? window.triggerInline() : window.triggerSheet()), trigger);
  await page.waitForTimeout(trigger === 'inline' ? 2600 : 3000);
  const frames = await page.evaluate(() => window.__frames);
  const bad = frames.filter((f) => f.frac > 0.02);
  const peak = frames.reduce((a, f) => (f.frac > a.frac ? f : a), frames[0]);
  const settled = await page.evaluate(() => {
    const mask = document.getElementById('mask');
    const route = document.getElementById('route');
    return {
      mask: mask ? getComputedStyle(mask).backgroundColor : null,
      route: route ? getComputedStyle(route).backgroundColor : null,
      routeDecl: (() => {
        // 页面里另有一条只写 min-height 的 `#route` 规则，不能取第一条匹配
        for (const s of document.styleSheets) {
          let rules;
          try { rules = s.cssRules; } catch { continue; }
          for (const r of rules) {
            if (r.selectorText !== '#route' || !r.style) continue;
            const bg = r.style.getPropertyValue('background-color');
            if (bg) return bg;
          }
        }
        return null;
      })(),
    };
  });
  await context.close();
  return {
    label,
    frames: frames.length,
    lightFrames: bad.length,
    window: bad.length ? `${bad[0].t}ms -> ${bad[bad.length - 1].t}ms` : '-',
    peak,
    culprit: bad[0]?.culprit ?? null,
    settled,
    errors,
  };
}

console.log('\n===== 场景一：JS 写内联白底的整屏加载幕 =====');
const inlineFixed = await run(CODE, 'inline', '产物');
const inlineOld = await run(CODE_DEFERRED_INLINE, 'inline', '阴性对照（内联排队 80ms）');
console.log(`  产物   : 浅色帧 ${inlineFixed.lightFrames}/${inlineFixed.frames}  峰值 frac=${inlineFixed.peak.frac}  结算 ${inlineFixed.settled.mask}`);
console.log(`  阴性对照: 浅色帧 ${inlineOld.lightFrames}/${inlineOld.frames}  峰值 frac=${inlineOld.peak.frac} (${inlineOld.window}) ${inlineOld.culprit ?? ''}`);
check('内联白底从未被绘制（产物）', inlineFixed.lightFrames === 0, `峰值 ${inlineFixed.peak.frac}`);
check('加载幕结算后是深色', inlineFixed.settled.mask === 'rgb(38, 44, 51)', String(inlineFixed.settled.mask));
check('阴性对照能被检出白闪', inlineOld.lightFrames > 0, '判据无判别力');
check('无 JS 报错（场景一）', inlineFixed.errors.length === 0, inlineFixed.errors.join(' | '));

console.log('\n===== 场景二：换路由插入的新 CSS 分片 =====');
const sheetFixed = await run(CODE, 'sheet', '产物');
const sheetOld = await run(CODE_NO_IMMEDIATE, 'sheet', '阴性对照（只等 400ms 防抖）');
console.log(`  产物   : 浅色帧 ${sheetFixed.lightFrames}/${sheetFixed.frames}  峰值 frac=${sheetFixed.peak.frac}  结算 #route=${sheetFixed.settled.route} 规则=${sheetFixed.settled.routeDecl}`);
console.log(`  阴性对照: 浅色帧 ${sheetOld.lightFrames}/${sheetOld.frames}  峰值 frac=${sheetOld.peak.frac} (${sheetOld.window}) ${sheetOld.culprit ?? ''}`);
check('新分片的浅色从未被绘制（产物）', sheetFixed.lightFrames === 0, `峰值 ${sheetFixed.peak.frac}`);
check('新分片结算后是深色（元素 + 规则）', sheetFixed.settled.route === 'rgb(38, 44, 51)' && sheetFixed.settled.routeDecl === 'rgb(38, 44, 51)', JSON.stringify(sheetFixed.settled));
check('阴性对照能被检出白闪', sheetOld.lightFrames > 0, '判据无判别力');
check('无 JS 报错（场景二）', sheetFixed.errors.length === 0, sheetFixed.errors.join(' | '));

await browser.close();
server.close();

const pass = checks.every((c) => c.ok);
console.log(`\n########## 白闪回归：${pass ? '全部通过 ✅' : '存在失败 ❌'} ##########`);
process.exit(pass ? 0 : 1);
