/**
 * 调试：为什么 `.hb-cpt__image--default` 的 background 没被改写？
 *   node research/debug-placeholder.mjs
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

const htmlPath = path.resolve('research/repro/placeholder.html');
const userscript = fs.readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const browser = await chromium.launch({ headless: true, executablePath: exe });
const page = await (await browser.newContext({ viewport: { width: 1332, height: 700 } })).newPage();
await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(1200);
await page.addScriptTag({ content: code });
await page.evaluate(() => window.__hbSetDark(true));
await page.waitForTimeout(1200);

const info = await page.evaluate(() => {
  // 1) 站点原始规则里这条规则的声明形态
  const found = [];
  for (const s of document.styleSheets) {
    let rules;
    try { rules = s.cssRules; } catch (e) { continue; }
    for (const r of rules) {
      if (!r.selectorText || !r.selectorText.includes('hb-cpt__image--default')) continue;
      const decls = [];
      for (let i = 0; i < r.style.length; i++) {
        const p = r.style[i];
        decls.push({ prop: p, value: r.style.getPropertyValue(p), prio: r.style.getPropertyPriority(p) });
      }
      found.push({ sheet: (s.href || 'inline').split('/').pop(), selector: r.selectorText, decls });
    }
  }

  // 2) 我们生成的覆盖表里有没有这条
  const mine = document.getElementById('hb-dark-overrides');
  const text = mine ? mine.textContent : '';
  const idx = text.indexOf('hb-cpt__image--default');
  const generated = idx >= 0 ? text.slice(Math.max(0, idx - 120), idx + 220) : null;

  // 3) 实际计算值
  const cs = getComputedStyle(document.querySelector('.hb-cpt__image--default'));

  return {
    siteRules: found,
    generatedSnippet: generated,
    computed: { background: cs.backgroundColor, backgroundImage: cs.backgroundImage, opacity: cs.opacity },
    ourStyleParent: mine ? mine.parentElement.tagName : null,
    sheetOrder: [...document.styleSheets].map((s) => (s.href || 'inline:' + (s.ownerNode && s.ownerNode.id)).split('/').pop()),
  };
});

console.log(JSON.stringify(info, null, 1));
await browser.close();
