/**
 * 探针：站点是否在运行时用 CSSOM API 改规则（`insertRule` / `deleteRule` /
 * `replaceSync` / `replace`）。
 *
 *   node research/probe-cssom-injection.mjs
 *
 * 这类注入不产生 `<style>` / `<link>` 节点变更，引擎的 head 观察器与内联观察器
 * 原理上都看不见 —— 它只能靠里程碑、防抖兜底或回前台对账补上。
 * 实测结论（2026-09）：首页与换路由到详情页后**都是 0 次**，
 * 所以这是边界而非现状；回前台对账不是为它加的，但顺手能兜住（见 FINDINGS 第十四节）。
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

const browser = await chromium.launch({ headless: true, executablePath: exe });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
await context.addInitScript(() => {
  window.__cssom = { insertRule: 0, deleteRule: 0, replaceSync: 0, replace: 0, adopted: 0, samples: [] };
  const proto = CSSStyleSheet.prototype;
  for (const name of ['insertRule', 'deleteRule', 'replaceSync', 'replace']) {
    const orig = proto[name];
    if (typeof orig !== 'function') continue;
    proto[name] = function patched(...args) {
      const r = orig.apply(this, args);
      window.__cssom[name]++;
      if (window.__cssom.samples.length < 12) {
        window.__cssom.samples.push(`${name}: ${String(args[0]).slice(0, 120)}`);
      }
      return r;
    };
  }
});
await context.addInitScript(() => { try { localStorage.setItem('heybox-dark-mode', '1'); } catch (_) {} });
await context.addInitScript(code);
const page = await context.newPage();
await page.goto('https://www.xiaoheihe.cn/app/bbs/home', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(7000);
console.log('首页 CSSOM 计数:', JSON.stringify(await page.evaluate(() => window.__cssom), null, 1));
await page.evaluate(() => {
  document.querySelectorAll('#t_mask, .t-mask').forEach((el) => el.remove());
  window.__cssom.insertRule = 0; window.__cssom.replaceSync = 0; window.__cssom.samples = [];
});
await page.locator('a[href*="/app/bbs/link/"] .bbs-content__title').first().click({ noWaitAfter: true });
await page.waitForTimeout(6000);
console.log('换路由后 CSSOM 计数:', JSON.stringify(await page.evaluate(() => window.__cssom), null, 1));
await browser.close();
