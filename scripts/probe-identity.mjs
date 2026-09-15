/**
 * 身份追踪：确认详情页的浅灰 div 是否被反复重建，以及写入为何不生效。
 * node scripts/probe-identity.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userscript = fs.readFileSync(path.resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');
const code = userscript.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const browser = await chromium.launch({
  headless: false,
  executablePath: CHROME,
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
await context.addInitScript(() => {
  window.GM_addStyle = (css) => {
    const el = document.createElement('style');
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  };
  try {
    localStorage.setItem('heybox-dark-mode', '1');
  } catch (_) {}
});
await context.addInitScript(code);
const page = await context.newPage();

await page.goto('https://www.xiaoheihe.cn/app/bbs/home', {
  waitUntil: 'domcontentloaded',
  timeout: 90000,
});
await page.waitForTimeout(7000);

// 依次尝试多篇帖子，直到出现目标浅灰块
const links = await page.$$eval('a[href*="/app/bbs/link/"]', (as) =>
  as.map((a) => a.getAttribute('href')).filter(Boolean).slice(0, 5),
);
console.log(JSON.stringify({ links }));

let done = false;
for (const href of links) {
  if (done) break;
  await page.evaluate((h) => {
    const a = [...document.querySelectorAll('a[href*="/app/bbs/link/"]')].find(
      (x) => x.getAttribute('href') === h,
    );
    if (a) a.click();
  }, href);
  await page.waitForTimeout(9000);

  // 与交互验收一致：先滚动加载，再回到顶部
  await page.evaluate(async () => {
    for (let i = 0; i < 16; i++) {
      window.scrollBy(0, 800);
      await new Promise((r) => setTimeout(r, 320));
    }
  });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(4500);

  const report = await page.evaluate(() => {
    const targets = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      const m = cs.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 30 || r.height < 16) continue;
      if (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3] <= 200) continue;
      if (el.tagName === 'IFRAME' || el.closest('[data-hb-skip]')) continue;
      targets.push({
        el,
        before: {
          bg: cs.backgroundColor,
          inline: el.style.getPropertyValue('background-color') || null,
          inlinePrio: el.style.getPropertyPriority('background-color') || null,
          marked: el.dataset.hbDarkBg ?? null,
          hasStyleAttr: el.hasAttribute('style'),
          styleAttrLen: (el.getAttribute('style') || '').length,
          transition: cs.transitionProperty,
          anim: cs.animationName,
          cls: typeof el.className === 'string' ? el.className : '',
          chain: (() => {
            const out = [];
            let n = el.parentElement;
            for (let i = 0; i < 4 && n && n !== document.body; i++) {
              out.push(
                n.tagName.toLowerCase() +
                  (typeof n.className === 'string' && n.className.trim()
                    ? '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.')
                    : ''),
              );
              n = n.parentElement;
            }
            return out.join(' < ');
          })(),
        },
      });
    }
    // 打标便于追踪同一节点
    targets.forEach((t, i) => {
      t.el.setAttribute('data-probe-id', String(i));
    });
    return targets.map((t) => t.before);
  });

  if (report.length === 0) {
    console.log(JSON.stringify({ href, note: 'no light divs on this page' }));
    // 回首页再试
    await page.goto('https://www.xiaoheihe.cn/app/bbs/home', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(6000);
    continue;
  }

  console.log(JSON.stringify({ href, count: report.length, report }, null, 2));

  // 立刻重扫并马上读取
  const immediate = await page.evaluate(() => {
    if (window.__hbRefresh) window.__hbRefresh();
    return 'refresh-called';
  });
  const afterRefresh = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[data-probe-id]')) {
      out.push({
        id: el.getAttribute('data-probe-id'),
        connected: el.isConnected,
        bg: getComputedStyle(el).backgroundColor,
        inline: el.style.getPropertyValue('background-color') || null,
        marked: el.dataset.hbDarkBg || null,
      });
    }
    return out;
  });
  console.log(JSON.stringify({ immediate, afterRefresh }, null, 2));

  await page.waitForTimeout(2000);
  const later = await page.evaluate(() => {
    const stillTagged = document.querySelectorAll('[data-probe-id]').length;
    let light = 0;
    for (const el of document.querySelectorAll('body *')) {
      const m = getComputedStyle(el).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 30 || r.height < 16) continue;
      if (el.tagName === 'IFRAME') continue;
      if (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3] > 200) light++;
    }
    return { stillTagged, lightAfter2s: light };
  });
  console.log(JSON.stringify({ later }, null, 2));

  done = true;
}

await browser.close();
console.log('DONE');
