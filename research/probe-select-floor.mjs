/**
 * 真实点击「某一层楼」后，对该元素子树做计算样式前后差分，
 * 精确定位「选中高亮」到底改了什么，以及深色引擎把它变成了什么。
 *
 *   node research/probe-select-floor.mjs [url]
 *
 * 用有头 Chrome + 去自动化特征，避免整页验证码（无头下会被拦截）。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_ = process.argv[2] || 'https://www.xiaoheihe.cn/app/bbs/link/190535650';

const userscript = fs.readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const outDir = path.resolve('output/select');
fs.mkdirSync(outDir, { recursive: true });

/** 对子树做「计算样式快照」，用于前后差分 */
const SNAPSHOT = (rootSel) => {
  const root = document.querySelector(rootSel);
  if (!root) return null;
  const props = ['backgroundColor', 'backgroundImage', 'color', 'borderTopColor', 'borderBottomColor',
    'boxShadow', 'opacity', 'outlineColor', 'outlineWidth', 'filter', 'mixBlendMode', 'visibility'];
  const out = [];
  const walk = (el, p) => {
    const cs = getComputedStyle(el);
    const rec = { p, bg: cs.backgroundColor, color: cs.color };
    for (const k of props) rec[k] = cs[k];
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      if (ps && ps.content !== 'none') {
        rec[pseudo] = {
          bg: ps.backgroundColor, bgImage: ps.backgroundImage === 'none' ? null : ps.backgroundImage.slice(0, 80),
          opacity: ps.opacity, display: ps.display, w: ps.width, h: ps.height, z: ps.zIndex, pos: ps.position,
        };
      }
    }
    out.push(rec);
    let i = 0;
    for (const child of el.children) walk(child, p + '>' + child.tagName.toLowerCase() + (i++));
  };
  walk(root, 'root');
  return out;
};

const browser = await chromium.launch({
  headless: false,
  executablePath: CHROME,
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--disable-blink-features=AutomationControlled', '--start-maximized', '--window-size=1440,1000'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'zh-CN' });
await context.addInitScript(() => {
  try { localStorage.setItem('heybox-dark-mode', '1'); } catch (_) {}
});
await context.addInitScript(code);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(10000);
await page.evaluate(async () => {
  for (let i = 0; i < 8; i++) { window.scrollBy(0, 800); await new Promise((r) => setTimeout(r, 400)); }
  // 回到第一条评论
  const first = document.querySelector('.link-comment__comment-item');
  if (first) first.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(3000);

const pre = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.link-comment__comment-item')];
  return {
    captcha: !!document.querySelector('.tcaptcha-transform, [class*="tcaptcha"]'),
    count: items.length,
    classes: items.slice(0, 3).map((el) => String(el.className)),
    hasDark: document.documentElement.classList.contains('hb-dark'),
  };
});
console.log('载入状态: ' + JSON.stringify(pre));

if (pre.captcha || pre.count === 0) {
  console.log('⚠️ 无法进行：' + (pre.captcha ? '命中验证码' : '没有评论项'));
  await page.screenshot({ path: path.join(outDir, 'blocked.png') });
  await browser.close();
  process.exit(2);
}

await page.screenshot({ path: path.join(outDir, 'before.png') });
const before = await page.evaluate(SNAPSHOT, '.link-comment__comment-item');

// 记录属性变化
await page.evaluate(() => {
  window.__log = [];
  const root = document.querySelector('.link-comment__list') || document.body;
  window.__obs = new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type !== 'attributes') continue;
      const t = r.target;
      const cls = typeof t.className === 'string' ? t.className : '';
      window.__log.push({
        attr: r.attributeName,
        tag: t.tagName.toLowerCase(),
        cls: cls.slice(0, 90),
        oldValue: (r.oldValue || '').slice(0, 160),
        newValue: (t.getAttribute(r.attributeName) || '').slice(0, 160),
      });
    }
  });
  window.__obs.observe(root, { attributes: true, subtree: true, attributeOldValue: true });
});

// 点击第一层楼（触发「设为回复目标」＝选中）
await page.evaluate(() => {
  const el = document.querySelector('.link-comment__comment-item');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
});
await page.waitForTimeout(2500);

const after = await page.evaluate(SNAPSHOT, '.link-comment__comment-item');
const log = await page.evaluate(() => window.__log || []);
await page.screenshot({ path: path.join(outDir, 'after-click.png') });

// 差分
const diffs = [];
const n = Math.max(before.length, after.length);
for (let i = 0; i < n; i++) {
  const a = before[i];
  const b = after[i];
  if (!a || !b) { diffs.push({ p: (a || b).p, note: 'node added/removed' }); continue; }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = typeof a[k] === 'object' ? JSON.stringify(a[k]) : String(a[k]);
    const vb = typeof b[k] === 'object' ? JSON.stringify(b[k]) : String(b[k]);
    if (va !== vb) diffs.push({ p: b.p, prop: k, before: va, after: vb });
  }
}

console.log(`\n属性变化日志（${log.length} 条）:`);
for (const l of log.slice(0, 12)) console.log('  ' + JSON.stringify(l));

console.log(`\n计算样式差分（${diffs.length} 处）:`);
for (const d of diffs.slice(0, 30)) {
  console.log(`  ${d.p}  ${d.prop || ''}`);
  console.log(`      before: ${d.before}`);
  console.log(`      after : ${d.after}`);
}

console.log(`\n页面报错: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
await browser.close();
console.log('DONE');
