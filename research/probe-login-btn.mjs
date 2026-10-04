import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { resolveChromePath } from '../scripts/lib/chromium.mjs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const exe = resolveChromePath();

const code = fs
  .readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8')
  .replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const browser = await chromium.launch({ executablePath: exe, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
  try { localStorage.setItem('heybox-dark-mode', '1'); } catch (_) {  }
});
await context.addInitScript(code);
const page = await context.newPage();
await page.goto('https://www.xiaoheihe.cn/app/bbs/home', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(7000);

const report = await page.evaluate(() => {
  const btn = document.querySelector('button.login-btn');
  if (!btn) return { found: false };
  const cs = getComputedStyle(btn);
  const chain = [];
  let node = btn;
  while (node && node !== document.documentElement) {
    const c = getComputedStyle(node);
    chain.push({
      tag: node.tagName.toLowerCase(),
      cls: String(node.className).slice(0, 48),
      bg: c.backgroundColor,
      inline: node.getAttribute && node.getAttribute('style'),
    });
    node = node.parentElement;
  }
  const matched = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    const owner = (sheet.ownerNode && (sheet.ownerNode.id || sheet.ownerNode.tagName)) || '?';
    const href = sheet.href ? sheet.href.split('/').pop() : '(inline)';
    for (const rule of rules) {
      if (!rule.selectorText) continue;
      let hit = false;
      try { hit = btn.matches(rule.selectorText); } catch { continue; }
      if (!hit) continue;
      const bg = rule.style && (rule.style.backgroundColor || rule.style.background || rule.style.backgroundImage);
      if (bg) matched.push({ owner, href, sel: rule.selectorText.slice(0, 160), bg: String(bg).slice(0, 120) });
    }
  }
  const lights = [];
  document.querySelectorAll('body *').forEach((el) => {
    if (el.closest('[data-hb-own]')) return;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 20) return;
    const c = getComputedStyle(el);
    const m = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(c.backgroundColor);
    if (!m) return;
    const [rr, gg, bb] = [+m[1], +m[2], +m[3]];
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    if (0.2126 * lin(rr) + 0.7152 * lin(gg) + 0.0722 * lin(bb) > 0.706) {
      lights.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 48), bg: c.backgroundColor, inline: el.getAttribute('style') });
    }
  });
  return {
    found: true,
    computedBg: cs.backgroundColor,
    inlineStyle: btn.getAttribute('style'),
    inShadow: !!btn.getRootNode().host,
    stats: window.__hbEngineStats ? window.__hbEngineStats() : null,
    chain: chain.slice(0, 5),
    matched: matched.slice(0, 12),
    lights: lights.slice(0, 10),
  };
});

console.log(JSON.stringify(report, null, 2));
await browser.close();
