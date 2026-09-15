/**
 * 复用本机 Chrome 的会话数据（只读复制到临时 profile），
 * 以便绕过整页风控验证码，然后用外部 Chrome 真实检查页面。
 *
 *   node research/chrome-session.mjs [url]
 *
 * 只复制：Local State（含 cookie 解密密钥）、Default/Network/Cookies(+WAL/SHM)、
 *         Default/Local Storage（SPA 登录态可能在这里）。
 * 源 profile 全程只读，不会被修改。
 */
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_ = process.argv[2] || 'https://www.xiaoheihe.cn/app/bbs/link/190697878';
const SRC = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');

const outDir = path.resolve('output/chrome-inspect');
fs.mkdirSync(outDir, { recursive: true });

const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-session-'));
console.log(`外部 Chrome: ${CHROME}`);
console.log(`源 profile : ${SRC}（只读）`);
console.log(`临时 profile: ${dst}`);

function copyIfExists(from, to) {
  if (!fs.existsSync(from)) return null;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return fs.statSync(to).size;
}

const copied = [];
let n;
n = copyIfExists(path.join(SRC, 'Local State'), path.join(dst, 'Local State'));
copied.push(`Local State: ${n ? (n / 1024).toFixed(0) + 'KB' : '缺失'}`);
for (const f of ['Cookies', 'Cookies-wal', 'Cookies-shm']) {
  n = copyIfExists(path.join(SRC, 'Default', 'Network', f), path.join(dst, 'Default', 'Network', f));
  if (n) copied.push(`Default/Network/${f}: ${(n / 1024).toFixed(0)}KB`);
}
// SPA 登录态常在 Local Storage
const lsSrc = path.join(SRC, 'Default', 'Local Storage');
if (fs.existsSync(lsSrc)) {
  try {
    fs.cpSync(lsSrc, path.join(dst, 'Default', 'Local Storage'), { recursive: true });
    copied.push('Default/Local Storage: 已复制');
  } catch (e) {
    copied.push('Default/Local Storage: 复制失败 ' + String(e).slice(0, 60));
  }
}
console.log('已复制: ' + copied.join(' | '));

const userscript = fs.readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const context = await chromium.launchPersistentContext(dst, {
  headless: false,
  executablePath: CHROME,
  ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=AutomationControlled'],
  args: [
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-infobars',
    '--start-maximized',
    '--window-size=1440,1000',
  ],
  viewport: null,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});

await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = window.chrome || { runtime: {} };
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
});

const page = context.pages()[0] || (await context.newPage());
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

// 第一趟：先用「浅色 + 不注入脚本」看能否通过风控
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });

let state = { count: 0, captcha: false };
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});
  state = await page.evaluate(() => ({
    count: document.querySelectorAll('.link-comment__comment-item').length,
    captcha: !!document.querySelector('.tcaptcha-transform, [class*="tcaptcha"], iframe[src*="captcha"]'),
    title: document.title,
  })).catch(() => state);
  if (i % 4 === 0 || state.count) console.log(`  t=${(i + 1) * 3}s 评论项=${state.count} 验证码=${state.captcha}`);
  if (state.count > 0) break;
}

await page.screenshot({ path: path.join(outDir, 'session-page.png') });
console.log('\n载入状态: ' + JSON.stringify(state));

if (state.count === 0) {
  console.log('\n⚠️ 仍未通过风控，无法用外部 Chrome 检查该页面。');
  await context.close();
  fs.rmSync(dst, { recursive: true, force: true });
  process.exit(2);
}

// 第二趟：注入脚本开深色，做 hover 检查
await page.addScriptTag({ content: code });
await page.evaluate(() => window.__hbSetDark && window.__hbSetDark(true));
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const el = document.querySelector('.link-comment__comment-item');
  if (el) el.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(1200);

const info = await page.evaluate(() => {
  const item = document.querySelector('.link-comment__comment-item');
  const content = item.querySelector('.comment-item__content');
  const r = item.getBoundingClientRect();
  const p = getComputedStyle(item, '::before');
  const styleEl = document.getElementById('hb-dark-overrides');
  const text = styleEl ? styleEl.textContent : '';
  const gen = [];
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].includes('comment-item:hover')) continue;
    gen.push(m[1].trim() + ' { ' + m[2].trim() + ' }');
  }
  return {
    box: { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height) },
    text: (content.textContent || '').slice(0, 40),
    notHovered: { content: p.content, bg: p.backgroundColor, z: p.zIndex, op: p.opacity },
    contentColor: getComputedStyle(content).color,
    generated: gen,
  };
});
console.log('\n=== 未 hover ===');
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: path.join(outDir, 'hover-before.png'), clip: info.box });

await page.hover('.link-comment__comment-item');
await page.waitForTimeout(900);
const hovered = await page.evaluate(() => {
  const item = document.querySelector('.link-comment__comment-item');
  const content = item.querySelector('.comment-item__content');
  const p = getComputedStyle(item, '::before');
  const r = content.getBoundingClientRect();
  const stack = document.elementsFromPoint(r.left + 60, r.top + r.height / 2).slice(0, 6).map((el) => {
    const s = getComputedStyle(el);
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} bg=${s.backgroundColor} z=${s.zIndex}`;
  });
  return {
    before: { content: p.content, bg: p.backgroundColor, z: p.zIndex, w: p.width, h: p.height, op: p.opacity },
    contentColor: getComputedStyle(content).color,
    stack,
  };
});
console.log('\n=== hover 后 ===');
console.log(JSON.stringify(hovered, null, 1));
await page.screenshot({ path: path.join(outDir, 'hover-after.png'), clip: info.box });

console.log(`\n页面报错: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
await context.close();
fs.rmSync(dst, { recursive: true, force: true });
console.log('DONE');
