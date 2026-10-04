import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { resolveChromePath } from '../scripts/lib/chromium.mjs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const exe = resolveChromePath();

const reproDir = path.resolve('research/repro');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(path.resolve('research'), urlPath.replace(/^\//, ''));
  if (!file.startsWith(path.resolve('research')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('nf');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const userscript = fs.readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const STACK = () => {
  const desc = (el) => {
    if (!el || el.nodeType !== 1) return 'none';
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const info = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      sel: desc(el),
      bg: cs.backgroundColor,
      z: cs.zIndex,
      pos: cs.position,
      op: cs.opacity,
      box: `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}`,
    };
  };
  const pointOver = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.left + Math.min(60, r.width / 2);
    const y = r.top + r.height / 2;
    const stack = document.elementsFromPoint(x, y).slice(0, 6).map(info);
    return { at: `${Math.round(x)},${Math.round(y)}`, stack };
  };
  return {
    content: pointOver('.comment-item__content'),
    childReply: pointOver('.children-item__comment-content'),
    username: pointOver('.info-box__username'),
  };
};

const browser = await chromium.launch({ headless: true, executablePath: exe });
const context = await browser.newContext({ viewport: { width: 1332, height: 900 }, locale: 'zh-CN' });
await context.addInitScript(() => {
  try { localStorage.setItem('heybox-dark-mode', '1'); } catch (_) {}
});
const page = await context.newPage();
await page.goto(`${origin}/repro/floor.html`, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(1200);
await page.addScriptTag({ content: code });
await page.waitForTimeout(1500);

console.log('===== 深色 · 静态 =====');
console.log(JSON.stringify(await page.evaluate(STACK), null, 1));

await page.hover('.comment-children-item');
await page.waitForTimeout(600);
console.log('\n===== 深色 · hover 嵌套回复 =====');
console.log(JSON.stringify(await page.evaluate(STACK), null, 1));
await page.screenshot({ path: path.join(reproDir, 'stack-hover-child.png') });

await page.hover('.link-comment__comment-item');
await page.waitForTimeout(600);
console.log('\n===== 深色 · hover 整层楼 =====');
console.log(JSON.stringify(await page.evaluate(STACK), null, 1));
await page.screenshot({ path: path.join(reproDir, 'stack-hover-item.png') });

const pseudo = await page.evaluate(() => {
  const item = document.querySelector('.link-comment__comment-item');
  const child = document.querySelector('.comment-children-item');
  const out = {};
  for (const [k, el, ps] of [['item:before', item, '::before'], ['child:after', child, '::after']]) {
    const p = getComputedStyle(el, ps);
    out[k] = { content: p.content, bg: p.backgroundColor, z: p.zIndex, pos: p.position, w: p.width, h: p.height, op: p.opacity };
  }
  return out;
});
console.log('\n===== hover 伪元素计算值 =====');
console.log(JSON.stringify(pseudo, null, 1));

await browser.close();
server.close();
