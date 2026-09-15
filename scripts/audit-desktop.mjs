/**
 * 桌面断点深色模式审计脚本
 * node scripts/audit-desktop.mjs
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const cliRoot = path.join(
  process.env.APPDATA || '',
  'npm/node_modules/@playwright/cli',
);
const { chromium } = require(path.join(cliRoot, 'node_modules/playwright'));

const outDir = path.resolve('output/playwright');
fs.mkdirSync(outDir, { recursive: true });

const htmlPath = path.resolve('index.html');
const url = pathToFileURL(htmlPath).href;

const viewports = [
  { name: 'mobile-390', width: 390, height: 844, kind: 'mobile' },
  { name: 'tablet-820', width: 820, height: 1180, kind: 'tablet' },
  { name: 'laptop-1280', width: 1280, height: 800, kind: 'desktop' },
  { name: 'desktop-1440', width: 1440, height: 900, kind: 'desktop' },
  { name: 'desktop-1920', width: 1920, height: 1080, kind: 'desktop' },
];

const exe =
  process.env.CHROME_PATH ||
  path.join(
    process.env.LOCALAPPDATA || '',
    'ms-playwright/chromium-1234/chrome-win64/chrome.exe',
  );
const browser = await chromium.launch({ headless: true, executablePath: exe });

const allIssues = [];

for (const vp of viewports) {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: theme === 'dark' ? 'dark' : 'light',
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate((mode) => {
      localStorage.setItem('heybox-dark-mode', mode === 'dark' ? '1' : '0');
      document.documentElement.classList.toggle('heybox-dark', mode === 'dark');
      const meta = document.getElementById('meta-theme');
      if (meta) meta.setAttribute('content', mode === 'dark' ? '#0f1216' : '#fafbfc');
      const moon = document.getElementById('icon-moon');
      const sun = document.getElementById('icon-sun');
      if (moon && sun) {
        moon.style.display = mode === 'dark' ? 'none' : 'block';
        sun.style.display = mode === 'dark' ? 'block' : 'none';
      }
    }, theme);

    const shot = path.join(outDir, `${vp.name}-${theme}.png`);
    await page.screenshot({ path: shot, fullPage: false });

    const metrics = await page.evaluate((kind) => {
      const app = document.querySelector('.app');
      const layout = document.querySelector('.layout');
      const fab = document.querySelector('.theme-fab');
      const bottom = document.querySelector('.bottom-nav');
      const side = document.querySelector('.side-col');
      const main = document.querySelector('.main-col');
      const desktopNav = document.querySelector('.desktop-nav');
      const publish = document.querySelector('.publish-btn');
      const topbar = document.querySelector('.topbar');
      const cards = [...document.querySelectorAll('.card')];
      const body = getComputedStyle(document.body);
      const layoutStyle = layout ? getComputedStyle(layout) : null;

      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
        };
      };

      const issues = [];
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isDesktop = vw >= 768;

      if (document.documentElement.scrollWidth > vw + 2) {
        issues.push(
          `horizontal overflow: scrollWidth=${document.documentElement.scrollWidth} vw=${vw}`,
        );
      }

      // bottom nav visibility
      if (bottom) {
        const display = getComputedStyle(bottom).display;
        if (isDesktop && display !== 'none') {
          issues.push(`bottom-nav should be hidden on desktop, display=${display}`);
        }
        if (!isDesktop && display === 'none') {
          issues.push('bottom-nav should be visible on mobile');
        }
      }

      // desktop nav
      if (desktopNav) {
        const display = getComputedStyle(desktopNav).display;
        if (isDesktop && display === 'none') issues.push('desktop-nav hidden on desktop');
        if (!isDesktop && display !== 'none') issues.push('desktop-nav should hide on mobile');
      }

      // layout columns
      if (layoutStyle) {
        const cols = layoutStyle.gridTemplateColumns;
        if (isDesktop) {
          if (!cols.includes('px') && cols.split(' ').filter(Boolean).length < 2) {
            issues.push(`desktop layout should be 2-col, got ${cols}`);
          }
          if (side && getComputedStyle(side).display === 'none') {
            issues.push('sidebar hidden on desktop');
          }
          const layoutR = layout.getBoundingClientRect();
          if (layoutR.width < 600) {
            issues.push(`layout too narrow on desktop: ${Math.round(layoutR.width)}`);
          }
        } else {
          if (side && getComputedStyle(side).display !== 'none') {
            issues.push('sidebar should hide on mobile');
          }
        }
      }

      // main column reading width
      if (main) {
        const mw = Math.round(main.getBoundingClientRect().width);
        if (isDesktop && (mw < 480 || mw > 800)) {
          issues.push(`main-col width suboptimal on desktop: ${mw}px (want ~480-720)`);
        }
      }

      // FAB not overlapping bottom nav on mobile
      if (fab && bottom && !isDesktop && getComputedStyle(bottom).display !== 'none') {
        const fr = fab.getBoundingClientRect();
        const br = bottom.getBoundingClientRect();
        if (fr.bottom > br.top + 1) {
          issues.push(
            `FAB overlaps bottom nav: fab.bottom=${Math.round(fr.bottom)} nav.top=${Math.round(br.top)}`,
          );
        }
      }

      // FAB in viewport
      if (fab) {
        const fr = fab.getBoundingClientRect();
        if (fr.right > vw + 1 || fr.left < -1 || fr.bottom > vh + 1 || fr.top < -1) {
          issues.push(`FAB out of viewport: ${JSON.stringify(rect(fab))}`);
        }
        // On desktop, FAB shouldn't sit in the empty middle void overlapping text cards badly
        // It's OK to float bottom-right
      }

      // topbar full width sticky
      if (topbar) {
        const tr = topbar.getBoundingClientRect();
        if (Math.abs(tr.width - vw) > 2 && Math.abs(tr.width - document.documentElement.clientWidth) > 2) {
          // topbar is full width of body, should match
          if (tr.width < vw * 0.9) {
            issues.push(`topbar not full-width: ${Math.round(tr.width)} vs ${vw}`);
          }
        }
      }

      // empty side gutters: content should not be a thin phone strip
      if (isDesktop && app && layout) {
        const lr = layout.getBoundingClientRect();
        const gutters = vw - lr.width;
        if (gutters > vw * 0.55) {
          issues.push(
            `too much empty gutter on desktop: content=${Math.round(lr.width)} vw=${vw} gutters=${Math.round(gutters)}`,
          );
        }
      }

      // color sample
      const title = document.querySelector('.title');
      const firstCard = cards[0];

      return {
        kind,
        vw,
        vh,
        isDark: document.documentElement.classList.contains('heybox-dark'),
        bodyBg: body.backgroundColor,
        bodyColor: body.color,
        layout: rect(layout),
        layoutCols: layoutStyle?.gridTemplateColumns,
        mainW: main ? Math.round(main.getBoundingClientRect().width) : null,
        sideW: side ? Math.round(side.getBoundingClientRect().width) : null,
        sideDisplay: side ? getComputedStyle(side).display : null,
        bottomDisplay: bottom ? getComputedStyle(bottom).display : null,
        desktopNavDisplay: desktopNav ? getComputedStyle(desktopNav).display : null,
        publishDisplay: publish ? getComputedStyle(publish).display : null,
        fab: rect(fab),
        bottom: rect(bottom),
        cardBg: firstCard ? getComputedStyle(firstCard).backgroundColor : null,
        titleColor: title ? getComputedStyle(title).color : null,
        cardCount: cards.length,
        issues,
      };
    }, vp.kind);

    if (metrics.issues.length) {
      allIssues.push({ vp: vp.name, theme, issues: metrics.issues });
    }

    console.log(
      JSON.stringify({ vp: vp.name, theme, shot, metrics }, null, 2),
    );

    await context.close();
  }
}

await browser.close();
console.log('\n==== SUMMARY ====');
if (allIssues.length === 0) {
  console.log('No issues found across viewports.');
} else {
  for (const item of allIssues) {
    console.log(`${item.vp} / ${item.theme}:`);
    for (const i of item.issues) console.log(`  - ${i}`);
  }
}
console.log('DONE');
