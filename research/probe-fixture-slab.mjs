/**
 * 用 fixtures/detail-full.html 的真实结构定位「那块 rgb(34,40,46) 的板」是哪个元素。
 *
 *   node research/probe-fixture-slab.mjs
 *
 * 思路：fixture 是旧引擎抓的（内联样式带 data-hb-dark-*），先把这些内联样式剥掉，
 * 让站点的浅色 CSS 重新生效，然后枚举评论区内的大块元素，看谁占住了整层楼。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const exe =
  process.env.CHROME_PATH ||
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe');

const html = fs.readFileSync(path.resolve('fixtures/detail-full.html'), 'utf8');

const browser = await chromium.launch({ headless: true, executablePath: exe });
const context = await browser.newContext({
  viewport: { width: 1332, height: 900 },
  locale: 'zh-CN',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const page = await context.newPage();
await page.setContent(html, { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(4000);

const report = await page.evaluate(() => {
  // 1) 剥掉旧引擎的痕迹，恢复站点原本的浅色样式
  document.documentElement.classList.remove('heybox-dark', 'dark');
  document.documentElement.removeAttribute('style');
  let stripped = 0;
  for (const el of document.querySelectorAll('[style],[data-hb-dark-bg],[data-hb-dark-fg],[data-hb-dark-bd],[data-hb-dark-grad]')) {
    el.removeAttribute('style');
    for (const a of [...el.attributes]) {
      if (a.name.startsWith('data-hb-')) el.removeAttribute(a.name);
    }
    stripped++;
  }

  const desc = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };

  // 需要关注的「可能盖住整层楼」的候选选择器
  const CANDIDATES = [
    '.hb-cpt__image--default',
    '.hb-cpt__image',
    '.hb-loading',
    '.hb-loading-spinner',
    '.link-comment__comment-item',
    '.comment-item__content-container',
    '.comment-item__content',
    '.link-comment__comment-children',
    '.comment-children-item',
    '.comment-item__image-wrapper',
  ];

  const out = { stripped, commentItems: [], bigBlocks: [], candidateBoxes: {} };

  // 评论项基本信息
  for (const el of document.querySelectorAll('.link-comment__comment-item')) {
    const r = el.getBoundingClientRect();
    out.commentItems.push({ cls: desc(el), box: `${Math.round(r.width)}x${Math.round(r.height)}` });
    if (out.commentItems.length >= 5) break;
  }

  // 候选选择器实际命中情况（含尺寸与背景）
  for (const sel of CANDIDATES) {
    const list = [...document.querySelectorAll(sel)].slice(0, 6).map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        box: `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}`,
        bg: cs.backgroundColor, bgImage: cs.backgroundImage === 'none' ? null : 'has-image',
        opacity: cs.opacity, zIndex: cs.zIndex, position: cs.position,
      };
    });
    if (list.length) out.candidateBoxes[sel] = list;
  }

  // 评论区内所有「面积够大且背景不透明」的元素
  const root = document.querySelector('.link-comment') || document.body;
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < 200 || r.height < 120) continue;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)') continue;
    out.bigBlocks.push({
      sel: desc(el),
      box: `${Math.round(r.width)}x${Math.round(r.height)}`,
      bg,
      pos: cs.position, z: cs.zIndex, op: cs.opacity,
    });
    if (out.bigBlocks.length >= 25) break;
  }

  return out;
});

console.log(JSON.stringify(report, null, 1));
await browser.close();
console.log('DONE');
