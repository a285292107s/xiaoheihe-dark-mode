/**
 * 抓取真站 DOM 结构样本，辅助写深色选择器。
 * node scripts/dump-dom.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli');
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const outDir = path.resolve('output/playwright');
fs.mkdirSync(outDir, { recursive: true });

const exe =
  process.env.CHROME_PATH ||
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe');

const browser = await chromium.launch({ headless: true, executablePath: exe });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
});
const page = await context.newPage();
await page.goto('https://www.xiaoheihe.cn/app/bbs/home', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(5000);

const dump = await page.evaluate(() => {
  function walk(el, depth, maxDepth) {
    if (!el || depth > maxDepth) return null;
    const tag = el.tagName?.toLowerCase();
    if (!tag || tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta') return null;
    const cls = typeof el.className === 'string' ? el.className : '';
    const id = el.id || '';
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const color = cs.color;
    const rect = el.getBoundingClientRect();
    const node = {
      tag,
      id: id || undefined,
      class: cls.slice(0, 120) || undefined,
      bg,
      color,
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    };
    const kids = [...el.children]
      .map((c) => walk(c, depth + 1, maxDepth))
      .filter(Boolean)
      .slice(0, 12);
    if (kids.length) node.children = kids;
    return node;
  }

  // 收集带背景色的“表面”元素
  const surfaces = [];
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    if (surfaces.length > 80) break;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;
    // 只要明显偏白的底
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) continue;
    const [, r, g, b] = m.map(Number);
    if (r > 230 && g > 230 && b > 230) {
      const cls = typeof el.className === 'string' ? el.className : '';
      surfaces.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        class: cls.slice(0, 140) || undefined,
        bg,
        w: Math.round(el.getBoundingClientRect().width),
        h: Math.round(el.getBoundingClientRect().height),
      });
    }
  }

  return {
    bodyHtmlStart: document.body?.innerHTML?.slice(0, 3000) ?? '',
    tree: walk(document.body, 0, 4),
    whiteSurfaces: surfaces,
  };
});

fs.writeFileSync(path.join(outDir, 'dom-dump.json'), JSON.stringify(dump, null, 2));
console.log(JSON.stringify({ whiteSurfaceCount: dump.whiteSurfaces.length, sample: dump.whiteSurfaces.slice(0, 25) }, null, 2));
console.log('TREE_SNIPPET');
console.log(JSON.stringify(dump.tree, null, 2).slice(0, 4000));
await browser.close();
console.log('DONE');
