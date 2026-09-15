/**
 * 用外部 Google Chrome 打开真实页面，检查「hover 那一层楼时内容被覆盖」。
 *
 *   node research/chrome-inspect.mjs [url]
 *
 * - 用独立临时 profile，不影响你正在用的 Chrome
 * - 先等 45s 看能否渲染出评论（此前遇到过整页验证码）
 * - 拿到评论后：hover 该层楼，读 ::before 计算值 / 引擎生成的覆盖规则 / 元素栈
 * - 存 hover 前后同区域截图，供像素比对
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

const outDir = path.resolve('output/chrome-inspect');
fs.mkdirSync(outDir, { recursive: true });

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-chrome-'));
console.log(`外部 Chrome: ${CHROME}`);
console.log(`临时 profile: ${userDataDir}`);

const userscript = fs.readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const context = await chromium.launchPersistentContext(userDataDir, {
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

// 抹掉自动化特征：风控常用 navigator.webdriver / chrome 对象 / 插件列表来判定
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  // eslint-disable-next-line no-undef
  window.chrome = window.chrome || { runtime: {} };
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
  const origQuery = navigator.permissions && navigator.permissions.query;
  if (origQuery) {
    navigator.permissions.query = (p) =>
      p && p.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : origQuery.call(navigator.permissions, p);
  }
});

await context.addInitScript(() => {
  try { localStorage.setItem('heybox-dark-mode', '1'); } catch (_) {}
});
await context.addInitScript(code);

const page = context.pages()[0] || (await context.newPage());
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });

// 最多等 45s，看评论能不能渲染出来
let state = { count: 0, captcha: false, dark: false };
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(3000);
  // 滚动一下触发懒加载
  await page.evaluate(async () => {
    window.scrollBy(0, 700);
    await new Promise((r) => setTimeout(r, 300));
  }).catch(() => {});
  state = await page.evaluate(() => ({
    count: document.querySelectorAll('.link-comment__comment-item').length,
    captcha: !!document.querySelector('.tcaptcha-transform, [class*="tcaptcha"], iframe[src*="captcha"]'),
    dark: document.documentElement.classList.contains('hb-dark'),
    title: document.title,
    url: location.href,
  })).catch(() => state);
  console.log(`  t=${(i + 1) * 3}s 评论项=${state.count} 验证码=${state.captcha} 深色=${state.dark} 标题=${state.title}`);
  if (state.count > 0) break;
}

await page.screenshot({ path: path.join(outDir, 'page.png') });
console.log('\n载入状态: ' + JSON.stringify(state));

if (state.count === 0) {
  console.log('\n⚠️ 未渲染出评论项' + (state.captcha ? '（命中验证码）' : ''));
  await context.close();
  process.exit(2);
}

// 回到第一条评论
await page.evaluate(() => {
  const el = document.querySelector('.link-comment__comment-item');
  if (el) el.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(1500);

const info = await page.evaluate(() => {
  const item = document.querySelector('.link-comment__comment-item');
  const content = item.querySelector('.comment-item__content');
  const r = item.getBoundingClientRect();
  const p = getComputedStyle(item, '::before');
  const cs = getComputedStyle(content);
  // 引擎生成的 hover 覆盖规则
  const styleEl = document.getElementById('hb-dark-overrides');
  const text = styleEl ? styleEl.textContent : '';
  const gen = [];
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].includes('comment-item:hover')) continue;
    gen.push({ selector: m[1].trim(), body: m[2].trim() });
  }
  return {
    box: { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height) },
    rect: `${Math.round(r.width)}x${Math.round(r.height)}`,
    text: (content.textContent || '').slice(0, 40),
    beforeNotHovered: { content: p.content, bg: p.backgroundColor, z: p.zIndex, pos: p.position, op: p.opacity },
    contentColor: cs.color,
    generated: gen,
  };
});

console.log('\n=== 未 hover 时 ===');
console.log(JSON.stringify(info, null, 1));

await page.screenshot({ path: path.join(outDir, 'hover-before.png'), clip: info.box });

await page.hover('.link-comment__comment-item');
await page.waitForTimeout(800);

const hovered = await page.evaluate(() => {
  const item = document.querySelector('.link-comment__comment-item');
  const content = item.querySelector('.comment-item__content');
  const p = getComputedStyle(item, '::before');
  const cs = getComputedStyle(content);
  const r = content.getBoundingClientRect();
  const x = r.left + Math.min(80, r.width / 2);
  const y = r.top + r.height / 2;
  const stack = document.elementsFromPoint(x, y).slice(0, 5).map((el) => {
    const s = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} bg=${s.backgroundColor} z=${s.zIndex} ${Math.round(b.width)}x${Math.round(b.height)}`;
  });
  return {
    before: { content: p.content, bg: p.backgroundColor, z: p.zIndex, pos: p.position,
      w: p.width, h: p.height, op: p.opacity },
    contentColor: cs.color,
    stack,
  };
});

console.log('\n=== hover 后（::before 与文字上方元素栈）===');
console.log(JSON.stringify(hovered, null, 1));

await page.screenshot({ path: path.join(outDir, 'hover-after.png'), clip: info.box });

console.log(`\n页面报错: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
console.log('截图: output/chrome-inspect/hover-before.png / hover-after.png / page.png');

await context.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
console.log('DONE');
