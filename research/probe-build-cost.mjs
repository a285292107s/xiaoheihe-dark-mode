/**
 * 代价核算：新分片「即时重建」（第十四节的修复）在首屏加载时多花多少主线程时间。
 *
 *   node research/probe-build-cost.mjs
 *
 * 对照组的做法：把产物里 `scheduleImmediateBuild` 的守卫改成恒真返回，
 * 即退回修复前「只等 400ms 防抖」的行为，其余完全相同。
 * 输出为长任务（PerformanceObserver longtask）个数 / 总时长 / 最长一条，
 * 以及 DOMContentLoaded 与 load 的时刻。
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
const CODE = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');
const CODE_NO_IMMEDIATE = CODE.replace('if (!enabled || immediateQueued) return;', 'if (true) return;');

const browser = await chromium.launch({ headless: true, executablePath: exe });

async function run(code, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
  await context.addInitScript(() => {
    window.__lt = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__lt.push(Math.round(e.duration));
      }).observe({ type: 'longtask', buffered: true });
    } catch (_) {}
  });
  await context.addInitScript(() => { try { localStorage.setItem('heybox-dark-mode', '1'); } catch (_) {} });
  await context.addInitScript(code);
  const page = await context.newPage();
  await page.goto('https://www.xiaoheihe.cn/app/bbs/home', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(9000);
  const out = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const lt = window.__lt || [];
    return {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
      loadEnd: Math.round(nav.loadEventEnd || 0),
      longTasks: lt.length,
      longTaskTotal: lt.reduce((a, b) => a + b, 0),
      longTaskMax: lt.length ? Math.max(...lt) : 0,
      scanned: window.__hbEngineStats().scanned,
    };
  });
  await context.close();
  console.log(label.padEnd(28), JSON.stringify(out));
  return out;
}

const a = await run(CODE, '即时重建（产物）');
const b = await run(CODE_NO_IMMEDIATE, '只等 400ms 防抖（对照）');
await browser.close();
console.log('\n差值: 长任务总时长', a.longTaskTotal - b.longTaskTotal, 'ms, 长任务数', a.longTasks - b.longTasks);
