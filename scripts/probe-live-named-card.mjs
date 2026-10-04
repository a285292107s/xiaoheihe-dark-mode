import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PAGE_URL = 'https://www.xiaoheihe.cn/app/bbs/link/192688392';
const SESSION = 'live';
const CLI = 'C:\\Users\\28529\\AppData\\Roaming\\npm\\playwright-cli.cmd';
const userscript = readFileSync(resolve('dist/xiaoheihe-dark-mode.user.js'), 'utf8');

const code = `
async (page) => {
  await page.addInitScript((src) => { try { new Function(src)(); } catch (e) {} }, ${JSON.stringify(userscript)});
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(${JSON.stringify(PAGE_URL)}, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);
  }
  await page.evaluate(() => { const el = document.querySelector('.link-comment'); if (el) el.scrollIntoView({ block: 'start' }); });
  await page.waitForTimeout(2500);

  return await page.evaluate(() => {
    const card = document.querySelector('.comment-children-item[data-comment-id="967572600"]');
    if (!card) return { ok: false };
    const cs = getComputedStyle(card);
    const rows = [];
    for (const child of card.children) {
      const s = getComputedStyle(child);
      const r = child.getBoundingClientRect();
      rows.push({
        cls: child.className,
        text: (child.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30),
        row: s.gridRowStart + ' / ' + s.gridRowEnd,
        col: s.gridColumnStart + ' / ' + s.gridColumnEnd,
        display: s.display,
        w: Math.round(r.width),
        h: Math.round(r.height),
        l: Math.round(r.left),
        t: Math.round(r.top),
      });
    }
    const replyTo = card.querySelector('.children-item__reply-to');
    let lineBoxes = null;
    if (replyTo) {
      const range = document.createRange();
      range.selectNodeContents(replyTo);
      lineBoxes = [...range.getClientRects()].map((r) => ({ t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width) }));
    }
    return {
      ok: true,
      cols: cs.gridTemplateColumns,
      cardH: Math.round(card.getBoundingClientRect().height),
      children: rows,
      replyToLineBoxes: lineBoxes,
      replyToStyle: replyTo ? { display: getComputedStyle(replyTo).display, gridColumn: getComputedStyle(replyTo).gridColumn, alignSelf: getComputedStyle(replyTo).alignSelf } : null,
    };
  });
}
`;

const dir = mkdtempSync(join(tmpdir(), 'hb-named-'));
const scriptFile = join(dir, 'probe.js');
writeFileSync(scriptFile, code, 'utf8');
const cli = (args) => execFileSync('cmd.exe', ['/c', CLI, `-s=${SESSION}`, ...args], {
  encoding: 'utf8',
  maxBuffer: 128 * 1024 * 1024,
  timeout: 300000,
});
try {
  cli(['open', '--browser=chrome', '--headed', `--profile=${resolve('.playwright-data')}`]);
} catch {
}
console.log(JSON.stringify(JSON.parse(cli(['--raw', 'run-code', `--filename=${scriptFile}`]).trim()), null, 2));
