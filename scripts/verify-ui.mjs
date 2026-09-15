/**
 * 切换按钮的验收：不再用 React 之后，按钮的全部行为都要有回归覆盖。
 *
 *   node scripts/verify-ui.mjs
 *
 * 为什么要本地起 HTTP 服务而不是 file:// 或 setContent：
 *   - localStorage 在 about:blank / data: 下不可靠
 *   - file:// 下同目录样式表在 Chrome 里算跨域，cssRules 抛异常，引擎会整片跳过
 *
 * 覆盖点：
 *   1) 宿主 #heybox-dark-mode-root 挂载 + data-hb-own（引擎跳过自身）
 *   2) Shadow DOM 隔离（站点 CSS 改不动按钮）
 *   3) 初始态：跟随系统 / 已存偏好
 *   4) 点击 -> 类名、基础层、localStorage、图标、aria 全部同步
 *   5) 再点击 -> 完整还原
 *   6) 控制台入口 __hbSetDark 也会同步图标（订阅机制）
 *   7) 刷新后记忆生效
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

const distFile = path.resolve('dist/xiaoheihe-dark-mode.user.js');
const userscript = fs.readFileSync(distFile, 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

// 一份"有东西可重映射"的最小页面：画布 / 卡片 / 伪元素 / 深色 CTA 各一
const HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>ui-fixture</title>
<style>
  :root { background-color: #f7f8f9; }
  html, body { margin: 0; }
  .card { background-color: #ffffff; color: #1a1a1a; border: 1px solid #e5e7eb; padding: 12px; }
  .card::before { content: ''; display: block; height: 4px; background-color: #f3f4f5; }
  .cta { background: #ff5a5f; color: #ffffff; padding: 8px 12px; }
</style></head>
<body><div class="card">卡片<button class="cta">按钮</button></div></body></html>`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(HTML);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}/`;

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok, detail });
  if (!ok) console.log(`  ❌ ${name}  ${detail ?? ''}`);
};

/** 一次性把按钮状态全捞出来 */
const PROBE = () => {
  const host = document.getElementById('heybox-dark-mode-root');
  const root = host && host.shadowRoot;
  const btn = root ? root.getElementById('heybox-dark-toggle') : null;
  const svg = btn ? btn.querySelector('svg') : null;
  const cs = btn ? getComputedStyle(btn) : null;
  const card = document.querySelector('.card');
  const cardBefore = card ? getComputedStyle(card, '::before') : null;
  const parse = (s) => {
    const m = String(s).match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  };
  const lum = (c) => (c ? 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] : null);
  return {
    hostExists: !!host,
    hostParent: host ? host.parentElement.tagName : null,
    ownMarker: host ? host.hasAttribute('data-hb-own') : false,
    shadowMode: host && host.shadowRoot ? 'open' : null,
    buttonExists: !!btn,
    label: btn ? btn.getAttribute('aria-label') : null,
    title: btn ? btn.title : null,
    pressed: btn ? btn.getAttribute('aria-pressed') : null,
    icon: svg ? [...svg.children].map((e) => e.tagName.toLowerCase()) : null,
    btnBg: cs ? cs.backgroundColor : null,
    btnText: cs ? cs.color : null,
    btnSize: btn ? [Math.round(btn.getBoundingClientRect().width), Math.round(btn.getBoundingClientRect().height)] : null,
    darkClass: document.documentElement.classList.contains('hb-dark'),
    baseStyle: !!document.getElementById('hb-dark-base'),
    stored: (() => { try { return localStorage.getItem('heybox-dark-mode'); } catch { return 'ERR'; } })(),
    canvasBg: getComputedStyle(document.documentElement).backgroundColor,
    cardBg: card ? getComputedStyle(card).backgroundColor : null,
    cardLum: card ? lum(parse(getComputedStyle(card).backgroundColor)) : null,
    beforeBg: cardBefore ? cardBefore.backgroundColor : null,
    ctaBg: (() => {
      const el = document.querySelector('.cta');
      return el ? getComputedStyle(el).backgroundColor : null;
    })(),
  };
};

const browser = await chromium.launch({ headless: true, executablePath: exe });

async function newPage({ colorScheme = 'light', stored = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 900, height: 700 }, colorScheme });
  if (stored !== null) {
    await context.addInitScript((v) => {
      try { localStorage.setItem('heybox-dark-mode', v); } catch {}
    }, stored);
  }
  await context.addInitScript(code);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  return { context, page, errors };
}

// ---------- 场景一：首次访问，系统为浅色 ----------
console.log('\n===== 场景一：首次访问（系统浅色，无记忆） =====');
{
  const { context, page, errors } = await newPage({ colorScheme: 'light' });
  const a = await page.evaluate(PROBE);

  check('宿主已挂载且父节点是 <html>', a.hostExists && a.hostParent === 'HTML', `hostParent=${a.hostParent}`);
  check('宿主带 data-hb-own（引擎跳过自身）', a.ownMarker);
  check('Shadow DOM 以 open 模式挂载', a.shadowMode === 'open');
  check('按钮存在于 shadowRoot 内', a.buttonExists);
  check('初始为浅色（无 hb-dark 类名、无基础层）', !a.darkClass && !a.baseStyle);
  check('记忆写入 0', a.stored === '0', `stored=${a.stored}`);
  check('初始图标是月亮（1 个 path）', a.icon && a.icon.length === 1 && a.icon[0] === 'path', JSON.stringify(a.icon));
  check('初始文案为「切换到深色模式」', a.label === '切换到深色模式', `label=${a.label}`);
  check('aria-pressed=false', a.pressed === 'false', `pressed=${a.pressed}`);
  check('按钮尺寸 44x44', a.btnSize && a.btnSize[0] === 44 && a.btnSize[1] === 44, JSON.stringify(a.btnSize));
  check('Shadow 隔离：按钮底色未被站点/引擎改动', a.btnBg === 'rgb(20, 25, 30)', `btnBg=${a.btnBg}`);
  check('浅色下卡片是白的', a.cardLum > 240, `cardLum=${a.cardLum}`);
  check('无 JS 报错', errors.length === 0, errors.join(' | '));

  // ---------- 场景二：点击开启深色 ----------
  console.log('\n===== 场景二：点击按钮开启深色 =====');
  const shadow = await page.evaluate(() => {
    const host = document.getElementById('heybox-dark-mode-root');
    const btn = host.shadowRoot.getElementById('heybox-dark-toggle');
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  // 用真实鼠标事件点击，验证事件确实绑上了（而不是内部直接改状态）
  await page.mouse.click(shadow.x, shadow.y);
  await page.waitForTimeout(500);
  const b = await page.evaluate(PROBE);

  check('点击后 <html> 有 hb-dark', b.darkClass);
  check('点击后基础层已注入', b.baseStyle);
  check('点击后记忆为 1', b.stored === '1', `stored=${b.stored}`);
  check('图标切换为太阳（circle + path）', b.icon && b.icon.length === 2 && b.icon[0] === 'circle', JSON.stringify(b.icon));
  check('文案变为「切换到浅色模式」', b.label === '切换到浅色模式', `label=${b.label}`);
  check('title 同步', b.title === '切换到浅色模式', `title=${b.title}`);
  check('aria-pressed=true', b.pressed === 'true', `pressed=${b.pressed}`);
  check('画布变深（#f7f8f9 -> CANVAS）', b.canvasBg === 'rgb(14, 17, 22)', `canvasBg=${b.canvasBg}`);
  check('卡片变深（引擎重映射生效）', b.cardLum < 70, `cardLum=${b.cardLum}`);
  check('伪元素也被重映射（::before）', b.beforeBg !== 'rgb(243, 244, 245)', `beforeBg=${b.beforeBg}`);
  check('品牌色 CTA 保留色相（不是灰的）', (() => {
    const m = String(b.ctaBg).match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
    if (!m) return false;
    const [r, g, bl] = [+m[1], +m[2], +m[3]];
    return Math.max(r, g, bl) - Math.min(r, g, bl) > 40;
  })(), `ctaBg=${b.ctaBg}`);
  check('按钮自身仍未被重映射', b.btnBg === 'rgb(20, 25, 30)' && b.btnText === 'rgb(255, 255, 255)', `btnBg=${b.btnBg}`);

  // ---------- 场景三：再点一次还原 ----------
  console.log('\n===== 场景三：再点一次关闭深色 =====');
  await page.mouse.click(shadow.x, shadow.y);
  await page.waitForTimeout(500);
  const c = await page.evaluate(PROBE);
  check('类名已移除', !c.darkClass);
  check('基础层已移除', !c.baseStyle);
  check('记忆为 0', c.stored === '0', `stored=${c.stored}`);
  check('图标回到月亮', c.icon && c.icon.length === 1 && c.icon[0] === 'path', JSON.stringify(c.icon));
  check('卡片还原为白色', c.cardBg === 'rgb(255, 255, 255)', `cardBg=${c.cardBg}`);
  check('画布还原为 #f7f8f9', c.canvasBg === 'rgb(247, 248, 249)', `canvasBg=${c.canvasBg}`);

  // ---------- 场景四：控制台入口也要同步图标 ----------
  console.log('\n===== 场景四：控制台 __hbSetDark 与图标同步 =====');
  await page.evaluate(() => window.__hbSetDark(true));
  await page.waitForTimeout(300);
  const d = await page.evaluate(PROBE);
  check('__hbSetDark(true) 后图标同步为太阳', d.icon && d.icon[0] === 'circle', JSON.stringify(d.icon));
  check('__hbSetDark(true) 后文案同步', d.label === '切换到浅色模式', `label=${d.label}`);

  // ---------- 场景五：刷新后记忆生效 ----------
  console.log('\n===== 场景五：刷新后记忆生效 =====');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const e = await page.evaluate(PROBE);
  check('刷新后仍是深色', e.darkClass && e.baseStyle);
  check('刷新后图标是太阳', e.icon && e.icon[0] === 'circle', JSON.stringify(e.icon));
  check('刷新后没有重复挂载宿主', await page.evaluate(() => document.querySelectorAll('#heybox-dark-mode-root').length) === 1);
  check('全流程无 JS 报错', errors.length === 0, errors.join(' | '));

  await context.close();
}

// ---------- 场景六：无记忆 + 系统深色 ----------
console.log('\n===== 场景六：无记忆，系统为深色 =====');
{
  const { context, page, errors } = await newPage({ colorScheme: 'dark' });
  const a = await page.evaluate(PROBE);
  check('跟随系统：初始就是深色', a.darkClass && a.baseStyle);
  check('图标是太阳', a.icon && a.icon[0] === 'circle', JSON.stringify(a.icon));
  check('无 JS 报错', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- 场景七：有记忆时优先于系统 ----------
console.log('\n===== 场景七：记忆优先于系统偏好 =====');
{
  const { context, page, errors } = await newPage({ colorScheme: 'dark', stored: '0' });
  const a = await page.evaluate(PROBE);
  check('系统深色但记忆为关 -> 保持浅色', !a.darkClass && !a.baseStyle);
  check('无 JS 报错', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- 场景八：必须带 data-hb-own 之外，还要确认引擎没扫到 shadow 内部 ----------
console.log('\n===== 场景八：Shadow DOM 样式表不被引擎触碰 =====');
{
  const { context, page } = await newPage({ stored: '1' });
  const r = await page.evaluate(() => {
    const host = document.getElementById('heybox-dark-mode-root');
    // 引擎遍历的是 document.styleSheets，shadow root 的样式表不在其中
    const inDoc = [...document.styleSheets].some((s) => s.ownerNode && s.ownerNode.closest && s.ownerNode.closest('#heybox-dark-mode-root'));
    const btnColor = getComputedStyle(host.shadowRoot.getElementById('heybox-dark-toggle')).backgroundColor;
    const stats = window.__hbEngineStats ? window.__hbEngineStats() : null;
    return { inDoc, btnColor, stats };
  });
  check('shadow 内的 <style> 不在 document.styleSheets 里', r.inDoc === false);
  check('深色下按钮底色仍是设计值', r.btnColor === 'rgb(20, 25, 30)', `btnColor=${r.btnColor}`);
  check('引擎仍在工作（有扫描统计）', r.stats && r.stats.scanned > 0, JSON.stringify(r.stats));
  await context.close();
}

await browser.close();
server.close();

const failed = checks.filter((c) => !c.ok);
console.log(`\n共 ${checks.length} 项断言，失败 ${failed.length} 项`);
if (failed.length) {
  console.log('########## UI 验收：失败 ❌ ##########');
  process.exit(1);
}
console.log('########## UI 验收：全部通过 ✅ ##########');
