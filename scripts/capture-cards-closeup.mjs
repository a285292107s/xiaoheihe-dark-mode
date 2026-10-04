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

  const ids = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.comment-children-item[data-hb-tc="1"]')];
    const named = cards.find((c) => (c.querySelector('.children-item__reply-to') || {}).textContent && c.querySelector('.children-item__reply-to').textContent.includes('回复'));
    return { plain: cards[0] ? cards[0].dataset.commentId : null, named: named ? named.dataset.commentId : null, total: cards.length };
  });
  return ids;
}
`;

const dir = mkdtempSync(join(tmpdir(), 'hb-shot-'));
const scriptFile = join(dir, 'shot.js');
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
const ids = JSON.parse(cli(['--raw', 'run-code', `--filename=${scriptFile}`]).trim());
console.log('cards:', JSON.stringify(ids));

if (ids.named) {
  cli(['screenshot', `.comment-children-item[data-comment-id='${ids.named}']`, '--filename=output/cards-live-closeup.png']);
  console.log('wrote output/cards-live-closeup.png（回复某人 的卡片）');
}
cli(['screenshot', `.comment-children-item[data-comment-id='${ids.plain}']`, '--filename=output/cards-live-closeup-plain.png']);
console.log('wrote output/cards-live-closeup-plain.png');
