/**
 * 预览壳（index.html）验收。
 *
 *   node scripts/verify-preview.mjs
 *
 * index.html 是 `npm run dev` 打开的效果预览页：它自己有一个「深色/浅色」按钮，
 * 并且把站点 DOM 快照（fixtures/）灌进 #hb-stage。断言的是三件事：
 *
 *   1) 预览壳的按钮能**双向**切换 —— 它必须通过 __hbIsDark() 读状态，
 *      而不是读某个类名；类名一旦与引擎的 ROOT_CLASS 不一致，
 *      按钮就会恒判为「开」，只能单向打开、再也回不到浅色。
 *   2) 预览壳自己的样式不被引擎重映射 —— 靠 style[data-hb-own]；
 *      引擎遍历 document.styleSheets 时会整块跳过它。
 *   3) 整页无 JS 报错、无资源加载失败。
 *
 * 初始状态取决于 localStorage 与系统偏好，所以不断言固定初始态，只断言「能否翻转」。
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

// 预览页不走打包，只能整目录起 HTTP 再打开
const root = process.cwd();
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};
const server = http.createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]);
  // 浏览器自己会取 favicon，Playwright 的 request 事件不上报它；给个 204 免得
  // 由此产生的 404 混淆「页面报错」这项断言。
  if (p === '/favicon.ico') { res.writeHead(204).end(); return; }
  const file = path.join(root, p === '/' ? 'index.html' : p.replace(/^\//, ''));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('nf');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch({ headless: true, executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
const failed = [];
page.on('requestfailed', (r) => failed.push(r.url()));
page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

await page.goto(origin, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2500);

const read = () =>
  page.evaluate(() => ({
    dark: document.documentElement.classList.contains('hb-dark'),
    engineDark: typeof window.__hbIsDark === 'function' ? window.__hbIsDark() : null,
    label: document.getElementById('hb-theme').textContent,
    barBg: getComputedStyle(document.getElementById('hb-bar')).backgroundColor,
    stageBg: getComputedStyle(document.getElementById('hb-stage')).backgroundColor,
    stored: localStorage.getItem('heybox-dark-mode'),
  }));

const s0 = await read();
await page.click('#hb-theme');
await page.waitForTimeout(600);
const s1 = await read();
await page.click('#hb-theme');
await page.waitForTimeout(600);
const s2 = await read();

console.log('初始     :', JSON.stringify(s0));
console.log('点一次   :', JSON.stringify(s1));
console.log('再点一次 :', JSON.stringify(s2));

const checks = [
  ['引擎已加载（脚本在 document-start 应用过状态）', s0.engineDark !== null && s0.engineDark === s0.dark],
  ['点一次后状态翻转', s1.dark === !s0.dark],
  ['再点一次回到初始态', s2.dark === s0.dark],
  ['按钮文案随状态双向变化', s1.label !== s0.label && s2.label === s0.label],
  ['预览条自身未被引擎重映射', s1.barBg === 'rgba(20, 24, 29, 0.94)' || s1.barBg === 'rgb(20, 24, 29)', s1.barBg],
  ['存储跟随状态', s1.stored === (s1.dark ? '1' : '0') && s2.stored === (s2.dark ? '1' : '0')],
  ['无 JS 报错', errors.length === 0, errors.join(' | ')],
  ['无资源加载失败', failed.length === 0, failed.join(' | ')],
];

let bad = 0;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : '  ' + (detail ?? '')}`);
  if (!ok) bad++;
}

await browser.close();
server.close();
console.log(bad ? `\n########## 预览壳验收：失败 ❌（${bad} 项）##########` : '\n########## 预览壳验收：全部通过 ✅ ##########');
process.exit(bad ? 1 : 0);
