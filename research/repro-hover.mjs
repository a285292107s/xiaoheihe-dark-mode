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

const box = await page.evaluate(() => {
  const r = document.querySelector('.link-comment__comment-item').getBoundingClientRect();
  return { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height) };
});

const READ_PSEUDO = () => {
  const item = document.querySelector('.link-comment__comment-item');
  const p = getComputedStyle(item, '::before');
  const content = document.querySelector('.comment-item__content');
  const cs = getComputedStyle(content);
  return {
    before: {
      content: p.content, bg: p.backgroundColor, z: p.zIndex, pos: p.position,
      w: p.width, h: p.height, op: p.opacity, display: p.display,
    },
    contentColor: cs.color,
    contentOpacity: cs.opacity,
  };
};

const GENERATED = () => {
  const el = document.getElementById('hb-dark-overrides');
  const t = el ? el.textContent : '';
  const out = [];
  for (const m of t.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].includes('comment-item:hover')) continue;
    out.push({ selector: m[1].trim(), body: m[2].trim() });
  }
  return out;
};

console.log('=== 引擎生成的 hover 覆盖规则 ===');
console.log(JSON.stringify(await page.evaluate(GENERATED), null, 1));

console.log('\n=== hover 前 ===');
const before = await page.evaluate(READ_PSEUDO);
console.log(JSON.stringify(before, null, 1));
await page.screenshot({ path: path.join(reproDir, 'hover-before.png'), clip: box });

await page.hover('.link-comment__comment-item');
await page.waitForTimeout(700);
console.log('\n=== hover 后 ===');
const after = await page.evaluate(READ_PSEUDO);
console.log(JSON.stringify(after, null, 1));
await page.screenshot({ path: path.join(reproDir, 'hover-after.png'), clip: box });

await browser.close();
server.close();

AddType: {
}
console.log('\n截图已保存: research/repro/hover-before.png / hover-after.png');
