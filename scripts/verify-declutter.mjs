/**
 * 页面精简（隐藏首页入口 / 隐藏社区页右侧栏）验收。
 *
 *   node scripts/verify-declutter.mjs            # 离线判据 + 真实站点
 *   node scripts/verify-declutter.mjs --offline  # 只跑离线判据
 *
 * 分两部分：
 *
 *   离线（本地 HTTP，自带一份与站点同构的最小复刻）
 *     - 复刻里**照抄了站点规则的选择器权重**（含 [data-v-*] 属性选择器）。
 *       这一点不能省：精简层靠「多一层 html.hb-declutter」压过站点写的
 *       display:inline-flex / max-width:660px，权重不够就会静默失效 ——
 *       只有让站点规则原样参与层叠，这条才真的被验证。
 *     - 每条断言都配阴性对照（关掉开关 = 类名与样式表同时撤掉，页面必须回到
 *       站点原样），否则「一直隐藏着」也能让断言通过。
 *
 *   真实站点（https://www.xiaoheihe.cn/app/bbs/home）
 *     - 位置选择器必须真的落在「首页」那一项上：站点导航项由配置数组渲染，
 *       数组首项是「首页」（英文变体是 Home），这条只有在线上才能确认顺序没变。
 *     - 用户给的 `#page-bbs-community > div.content > div` 与实现用的类选择器
 *       必须指向同一个元素，否则实现与需求就对不上了。
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

const userscript = fs.readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const offlineOnly = process.argv.includes('--offline');
const outDir = path.resolve('output/declutter');
fs.mkdirSync(outDir, { recursive: true });

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok });
  if (!ok) console.log(`  ❌ ${name}  ${detail ?? ''}`);
};

// ---------------------------------------------------------------------------
// 离线复刻页：只保留与本次改动相关的骨架，CSS 逐条抄自站点的 index-DBcvV3KQ.css
// 与 index-Cv4ia_mR.css（含 data-v-* 属性选择器，权重与线上一致）
// ---------------------------------------------------------------------------
const FIXTURE = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>declutter-fixture</title>
<style>
  html, body { margin: 0; background-color: #f7f8f9; }
  .nav { height: 64px; background-color: #fff; }
  /* 以下四条与站点一致（仅去掉无关的配色细节） */
  .nav .nav-content[data-v-ab0ef0d9] { width: 100%; height: 100%; margin: 0 auto; display: flex; align-items: center; gap: 12px; }
  .nav .nav-content .nav-links[data-v-ab0ef0d9] { display: flex; align-items: center; gap: 2px; min-width: 0; margin-left: 12px; margin-right: auto; }
  .nav .nav-content .nav-links .nav-link[data-v-ab0ef0d9] { display: inline-flex; align-items: center; justify-content: center; height: 64px; padding: 0 18px; border-radius: 6px; background: transparent; font-size: 16px; line-height: 24px; font-weight: 500; color: #14191e; white-space: nowrap; cursor: pointer; }
  #page-bbs-community[data-v-a4016135] { position: relative; max-width: 1032px; margin: 0 auto; padding: 16px 0; box-sizing: border-box; }
  #page-bbs-community .content[data-v-a4016135] { display: flex; gap: 16px; }
  #page-bbs-community .list[data-v-a4016135] { flex: 1; max-width: 660px; width: 0; padding: 0; background-color: #fff; }
  #page-bbs-community .right[data-v-a4016135] { position: sticky; top: 138px; flex-shrink: 0; z-index: 10; width: 356px; }
  .right-side-default { width: 100%; }
  .qr-section { height: 120px; background-color: #fff; border-radius: 8px; }
  @media only screen and (max-width: 1080px) {
    #page-bbs-community .content[data-v-a4016135] { justify-content: center; }
    #page-bbs-community .content .list[data-v-a4016135] { max-width: none; }
    #page-bbs-community .content .right[data-v-a4016135] { display: none; }
  }
</style></head>
<body>
<nav class="nav" data-v-ab0ef0d9><div class="nav-content" data-v-ab0ef0d9>
  <div class="nav-links" data-v-ab0ef0d9>
    <button class="nav-link" type="button" data-v-ab0ef0d9>首页</button>
    <button class="nav-link nav-link--active" type="button" data-v-ab0ef0d9>社区</button>
    <button class="nav-link" type="button" data-v-ab0ef0d9>开放平台</button>
  </div>
</div></nav>
<main>
  <section id="page-bbs-community" data-v-a4016135>
    <div class="content" data-v-a4016135>
      <main class="list" data-v-a4016135><div style="height:800px"></div></main>
      <div class="cpt-right-side right" data-v-a4016135>
        <div class="right-side-default"><div class="qr-section">立即下载小黑盒APP</div></div>
      </div>
    </div>
  </section>
</main>
</body></html>`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(FIXTURE);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}/`;

/** 一次性把两侧状态全捞出来。selectorText 断言的是「命中的是不是同一个元素」。 */
const PROBE = () => {
  const root = document.documentElement;
  const navLinks = [...document.querySelectorAll('.nav .nav-links > .nav-link')];
  const section = document.getElementById('page-bbs-community');
  const content = section ? section.querySelector(':scope > .content') : null;
  const divKids = content ? [...content.children].filter((el) => el.tagName === 'DIV') : [];
  const rail = section ? section.querySelector(':scope > .content > .right') : null;
  const list = section ? section.querySelector(':scope > .content > .list') : null;
  const styleEl = document.getElementById('hb-declutter');
  const host = document.getElementById('heybox-dark-mode-root');
  const btn = host && host.shadowRoot ? host.shadowRoot.getElementById('heybox-declutter-toggle') : null;
  const svg = btn ? btn.querySelector('svg') : null;
  const cs = btn ? getComputedStyle(btn) : null;

  return {
    declutterClass: root.classList.contains('hb-declutter'),
    darkClass: root.classList.contains('hb-dark'),
    styleExists: !!styleEl,
    styleOwnMarker: styleEl ? styleEl.hasAttribute('data-hb-own') : false,
    styleInHead: !!(styleEl && styleEl.parentElement === document.head),
    styleText: styleEl ? styleEl.textContent : null,
    stored: (() => { try { return localStorage.getItem('heybox-declutter'); } catch { return 'ERR'; } })(),

    firstNavText: navLinks.length ? navLinks[0].textContent.trim() : null,
    // 导航项是 flex item，display 会被块化（inline-flex -> flex），所以「可见」一律用
    // 宽度判断，「被隐藏」才用 display === 'none'
    firstNavDisplay: navLinks.length ? getComputedStyle(navLinks[0]).display : null,
    firstNavWidth: navLinks.length ? Math.round(navLinks[0].getBoundingClientRect().width) : null,
    secondNavDisplay: navLinks.length > 1 ? getComputedStyle(navLinks[1]).display : null,
    secondNavWidth: navLinks.length > 1 ? Math.round(navLinks[1].getBoundingClientRect().width) : null,

    // 用户给的 `#page-bbs-community > div.content > div` 命中的就是这一个
    divKidsCount: divKids.length,
    divKidIsRail: divKids.length === 1 && !!rail && divKids[0] === rail,
    railDisplay: rail ? getComputedStyle(rail).display : null,
    railWidth: rail ? Math.round(rail.getBoundingClientRect().width) : null,

    contentWidth: content ? Math.round(content.getBoundingClientRect().width) : null,
    listWidth: list ? Math.round(list.getBoundingClientRect().width) : null,
    listMaxWidth: list ? getComputedStyle(list).maxWidth : null,

    label: btn ? btn.getAttribute('aria-label') : null,
    title: btn ? btn.title : null,
    pressed: btn ? btn.getAttribute('aria-pressed') : null,
    iconParts: svg ? [...svg.children].map((e) => e.tagName.toLowerCase() + ':' + (e.getAttribute('d') || '').slice(0, 12)) : null,
    btnBg: cs ? cs.backgroundColor : null,
    btnSize: btn ? [Math.round(btn.getBoundingClientRect().width), Math.round(btn.getBoundingClientRect().height)] : null,
    btnBottom: btn ? Math.round(btn.getBoundingClientRect().bottom) : null,
    darkBtnBottom: (() => {
      const b = host && host.shadowRoot ? host.shadowRoot.getElementById('heybox-dark-toggle') : null;
      return b ? Math.round(b.getBoundingClientRect().bottom) : null;
    })(),
  };
};

const browser = await chromium.launch({ headless: true, executablePath: exe });

async function newPage({ stored = null, viewport = { width: 1440, height: 1000 } } = {}) {
  const context = await browser.newContext({ viewport });
  if (stored !== null) {
    await context.addInitScript((v) => {
      try { localStorage.setItem('heybox-declutter', v); } catch {}
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

// ===========================================================================
console.log('\n===== 场景一：首次访问（无记忆）默认开启精简 =====');
{
  const { context, page, errors } = await newPage();

  const a = await page.evaluate(PROBE);
  check('默认写入记忆 1', a.stored === '1', `stored=${a.stored}`);
  check('<html> 有 hb-declutter', a.declutterClass);
  check('精简样式表已注入 head 且带 data-hb-own（引擎跳过它）', a.styleExists && a.styleOwnMarker && a.styleInHead);
  check('导航首项是「首页」', a.firstNavText === '首页', `text=${a.firstNavText}`);
  check('首页入口被隐藏（压过站点 (0,5,0) 的 display:inline-flex）', a.firstNavDisplay === 'none' && a.firstNavWidth === 0, `display=${a.firstNavDisplay} w=${a.firstNavWidth}`);
  check('导航其它项不受影响（社区仍可见）', a.secondNavDisplay !== 'none' && a.secondNavWidth > 0, `display=${a.secondNavDisplay} w=${a.secondNavWidth}`);
  check('用户的结构选择器指向的就是 .right 这一个 div', a.divKidsCount === 1 && a.divKidIsRail, `divKids=${a.divKidsCount} isRail=${a.divKidIsRail}`);
  check('右侧栏被隐藏', a.railDisplay === 'none', `display=${a.railDisplay}`);
  check('列表取消 660px 上限', a.listMaxWidth === 'none', `max-width=${a.listMaxWidth}`);
  check('列表铺满容器（1032px）', Math.abs(a.listWidth - a.contentWidth) <= 1 && a.listWidth > 900, `list=${a.listWidth} content=${a.contentWidth}`);

  check('按钮尺寸 44x44', a.btnSize && a.btnSize[0] === 44 && a.btnSize[1] === 44, JSON.stringify(a.btnSize));
  check('精简开关叠在深色开关上方且不相交', a.btnBottom !== null && a.darkBtnBottom !== null && a.btnBottom < a.darkBtnBottom - 40, `declutter.bottom=${a.btnBottom} dark.bottom=${a.darkBtnBottom}`);
  check('开启态文案是「关闭精简模式（…）」', String(a.label).startsWith('关闭精简模式'), `label=${a.label}`);
  check('开启态 aria-pressed=true', a.pressed === 'true', `pressed=${a.pressed}`);
  check('开启态图标是「铺满的面板」（3 段 path）', a.iconParts && a.iconParts.length === 3, JSON.stringify(a.iconParts));
  check('无 JS 报错', errors.length === 0, errors.join(' | '));

  // ---------- 场景二：点击关闭 ----------
  console.log('\n===== 场景二：点击关闭精简 =====');
  const center = await page.evaluate(() => {
    const btn = document
      .getElementById('heybox-dark-mode-root')
      .shadowRoot.getElementById('heybox-declutter-toggle');
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(400);
  await page.mouse.move(4, 4); // 指针停在按钮上会让 :hover 生效，读到的就不是静息态配色
  await page.waitForTimeout(200);
  const b = await page.evaluate(PROBE);

  check('类名已撤掉', !b.declutterClass);
  check('样式表已整块移除（不留残余节点）', !b.styleExists && !b.styleInHead);
  check('记忆写入 0', b.stored === '0', `stored=${b.stored}`);
  check('首页入口恢复显示 —— 阴性对照：说明了隐藏确实由本层生效', b.firstNavDisplay !== 'none' && b.firstNavWidth > 0, `display=${b.firstNavDisplay} w=${b.firstNavWidth}`);
  check('右侧栏恢复显示', b.railDisplay !== 'none', `display=${b.railDisplay}`);
  check('列表回到站点原宽 660px', b.listWidth === 660 && b.listMaxWidth === '660px', `w=${b.listWidth} max-width=${b.listMaxWidth}`);
  check('关闭态 icon 是「面板 + 右侧栏」（2 段 path）', b.iconParts && b.iconParts.length === 2, JSON.stringify(b.iconParts));
  check('关闭态文案是「开启精简模式（…）」', String(b.label).startsWith('开启精简模式'), `label=${b.label}`);
  check('关闭态 aria-pressed=false', b.pressed === 'false', `pressed=${b.pressed}`);
  check('title 与 aria-label 同步', b.title === b.label, `title=${b.title} label=${b.label}`);

  // ---------- 场景三：控制台入口与图标同步 ----------
  console.log('\n===== 场景三：__hbSetDeclutter 与图标同步 =====');
  await page.evaluate(() => window.__hbSetDeclutter(true));
  await page.waitForTimeout(300);
  const d = await page.evaluate(PROBE);
  check('__hbSetDeclutter(true) 后类名回来', d.declutterClass);
  check('__hbSetDeclutter(true) 后图标同步为「铺满的面板」', d.iconParts && d.iconParts.length === 3, JSON.stringify(d.iconParts));
  check('__hbSetDeclutter(true) 后文案同步', String(d.label).startsWith('关闭精简模式'), `label=${d.label}`);
  check('__hbIsDeclutter() 与状态一致', (await page.evaluate(() => window.__hbIsDeclutter())) === true);

  // ---------- 场景四：与深色模式互不干扰 ----------
  console.log('\n===== 场景四：与深色模式各管各的 =====');
  const independence = await page.evaluate(() => {
    const before = {
      text: document.getElementById('hb-declutter').textContent,
      declutter: document.documentElement.classList.contains('hb-declutter'),
      dark: document.documentElement.classList.contains('hb-dark'),
    };
    window.__hbSetDark(true);
    window.__hbRebuild(); // 引擎全量重建
    const afterDarkOn = {
      text: document.getElementById('hb-declutter').textContent,
      declutter: document.documentElement.classList.contains('hb-declutter'),
      dark: document.documentElement.classList.contains('hb-dark'),
      firstNav: getComputedStyle(document.querySelector('.nav .nav-links > .nav-link')).display,
      rail: getComputedStyle(document.querySelector('#page-bbs-community > .content > .right')).display,
      errors: window.__hbEngineStats().errors,
    };
    window.__hbSetDark(false);
    return { before, afterDarkOn, darkAfterOff: document.documentElement.classList.contains('hb-dark') };
  });
  check('开关深色不改变精简状态', independence.afterDarkOn.declutter === independence.before.declutter && independence.afterDarkOn.declutter === true);
  check('引擎重建不改写精简样式表（data-hb-own 生效）', independence.afterDarkOn.text === independence.before.text);
  check('引擎重建后首页入口仍然隐藏', independence.afterDarkOn.firstNav === 'none', `display=${independence.afterDarkOn.firstNav}`);
  check('引擎重建后右侧栏仍然隐藏', independence.afterDarkOn.rail === 'none', `display=${independence.afterDarkOn.rail}`);
  check('深色引擎全程 0 报错', independence.afterDarkOn.errors === 0, `errors=${independence.afterDarkOn.errors}`);
  check('关闭深色不影响精简（深色已关、精简仍开）', independence.darkAfterOff === false);

  // ---------- 场景五：深色下按钮仍未被重映射 ----------
  const darkBtn = await page.evaluate(() => {
    window.__hbSetDark(true);
    const btn = document
      .getElementById('heybox-dark-mode-root')
      .shadowRoot.getElementById('heybox-declutter-toggle');
    return { bg: getComputedStyle(btn).backgroundColor };
  });
  check('深色下精简按钮底色仍是设计值（Shadow 隔离）', darkBtn.bg === 'rgb(20, 25, 30)', `bg=${darkBtn.bg}`);
  await page.evaluate(() => window.__hbSetDark(false));

  // ---------- 场景六：刷新后记忆生效 ----------
  console.log('\n===== 场景六：刷新后记忆生效 =====');
  await page.evaluate(() => window.__hbSetDeclutter(false));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const e = await page.evaluate(PROBE);
  check('记忆 0 -> 刷新后仍是关闭态', !e.declutterClass && !e.styleExists && e.firstNavDisplay !== 'none' && e.firstNavWidth > 0, JSON.stringify({ cls: e.declutterClass, nav: e.firstNavDisplay, w: e.firstNavWidth }));
  check('刷新后没有重复挂载宿主', await page.evaluate(() => document.querySelectorAll('#heybox-dark-mode-root').length) === 1);
  check('全流程无 JS 报错', errors.length === 0, errors.join(' | '));

  await context.close();
}

// 记忆为 1 的对照：需要在加载前就写进 localStorage
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    try { localStorage.setItem('heybox-declutter', '1'); } catch {}
  });
  await context.addInitScript(code);
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const f = await page.evaluate(PROBE);
  console.log('\n===== 场景七：记忆 1 时开屏即为精简态 =====');
  check('记忆 1 -> 首屏就是精简态（无闪一下侧栏/首页入口）', f.declutterClass && f.firstNavDisplay === 'none' && f.railDisplay === 'none', JSON.stringify({ cls: f.declutterClass, nav: f.firstNavDisplay, rail: f.railDisplay }));
  await context.close();
}

// 窄屏下站点自己就会隐藏右侧栏 —— 此时精简层的宽度规则不得与站点冲突
{
  const context = await browser.newContext({ viewport: { width: 900, height: 800 } });
  await context.addInitScript(code);
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const g = await page.evaluate(PROBE);
  console.log('\n===== 场景八：窄屏（站点自己的 <1080px 布局）=====');
  check('窄屏下打开精简不出错：列表铺满、两侧一致', g.declutterClass && g.railDisplay === 'none' && Math.abs(g.listWidth - g.contentWidth) <= 1, JSON.stringify({ list: g.listWidth, content: g.contentWidth }));
  await page.evaluate(() => window.__hbSetDeclutter(false));
  const h = await page.evaluate(PROBE);
  check('窄屏下关闭精简仍与站点自身行为一致（右侧栏本就隐藏）', !h.declutterClass && h.railDisplay === 'none', `rail=${h.railDisplay}`);
  await context.close();
}

// ===========================================================================
// 真实站点
// ===========================================================================
if (offlineOnly) {
  console.log('\n（--offline：跳过真实站点部分）');
} else {
  console.log('\n===== 场景九：真实站点 https://www.xiaoheihe.cn/app/bbs/home =====');
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  await context.addInitScript(() => {
    try { localStorage.setItem('heybox-declutter', '1'); } catch {}
  });
  await context.addInitScript(code);
  const page = await context.newPage();
  const liveErrors = [];
  page.on('pageerror', (e) => liveErrors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') liveErrors.push('console: ' + m.text().slice(0, 200)); });

  const LIVE = () => {
    const section = document.getElementById('page-bbs-community');
    const content = section ? section.querySelector(':scope > .content') : null;
    const divKids = content ? [...content.children].filter((el) => el.tagName === 'DIV') : [];
    const rail = content ? content.querySelector(':scope > .right') : null;
    const list = content ? content.querySelector(':scope > .list') : null;
    const navLinks = [...document.querySelectorAll('.nav .nav-links > .nav-link')];
    const nav = navLinks[0] ?? null;
    return {
      navCount: navLinks.length,
      navTexts: navLinks.map((b) => b.textContent.trim()),
      navDisplay: nav ? getComputedStyle(nav).display : null,
      navVisibleWidth: nav ? Math.round(nav.getBoundingClientRect().width) : null,
      railKids: divKids.length,
      railKidMatchesClass: divKids.length === 1 && !!rail && divKids[0] === rail,
      railDisplay: rail ? getComputedStyle(rail).display : null,
      listWidth: list ? Math.round(list.getBoundingClientRect().width) : null,
      listMaxWidth: list ? getComputedStyle(list).maxWidth : null,
      contentWidth: content ? Math.round(content.getBoundingClientRect().width) : null,
      declutterClass: document.documentElement.classList.contains('hb-declutter'),
    };
  };

  await page.goto('https://www.xiaoheihe.cn/app/bbs/home', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(7000);
  const on = await page.evaluate(LIVE);
  await page.screenshot({ path: path.join(outDir, 'live-declutter-on.png') });

  await page.evaluate(() => window.__hbSetDeclutter(false));
  await page.waitForTimeout(400);
  const off = await page.evaluate(LIVE);
  await page.screenshot({ path: path.join(outDir, 'live-declutter-off.png') });

  await page.evaluate(() => window.__hbSetDeclutter(true));
  await page.waitForTimeout(400);

  console.log('  开启:', JSON.stringify(on));
  console.log('  关闭:', JSON.stringify(off));

  check('线上导航首项是「首页」（英文变体是 Home）', on.navTexts[0] === '首页' || on.navTexts[0] === 'Home', JSON.stringify(on.navTexts));
  check('线上：首页入口被隐藏', on.declutterClass && on.navDisplay === 'none', `display=${on.navDisplay}`);
  check('线上：关闭后首页入口恢复可见（阴性对照）', off.navDisplay !== 'none' && off.navVisibleWidth > 0, JSON.stringify({ d: off.navDisplay, w: off.navVisibleWidth }));
  check('线上：用户的结构选择器命中的就是 .right 这一个 div', on.railKids === 1 && on.railKidMatchesClass, `divKids=${on.railKids} match=${on.railKidMatchesClass}`);
  check('线上：右侧栏被隐藏', on.railDisplay === 'none', `display=${on.railDisplay}`);
  check('线上：关闭后右侧栏恢复', off.railDisplay !== 'none', `display=${off.railDisplay}`);
  check('线上：列表取消上限并铺满容器', on.listMaxWidth === 'none' && Math.abs(on.listWidth - on.contentWidth) <= 1, JSON.stringify({ w: on.listWidth, c: on.contentWidth, max: on.listMaxWidth }));
  check('线上：关闭后列表回到站点原宽 660px', off.listWidth === 660, `w=${off.listWidth}`);
  check('线上：无 JS 报错', liveErrors.length === 0, [...new Set(liveErrors)].slice(0, 3).join(' | '));

  await context.close();
}

await browser.close();
server.close();

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n共 ${checks.length} 项断言，失败 ${failed} 项`);
console.log(`截图：output/declutter/`);
if (failed) {
  console.log('########## 页面精简验收：失败 ❌ ##########');
  process.exit(1);
}
console.log('########## 页面精简验收：全部通过 ✅ ##########');
