import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [outFile = 'research/live-reply-open.json', session = 'hb'] = process.argv.slice(2);

const code = `
async (page) => {
  const snap = async (label) => await page.evaluate((l) => {
    const wrap = document.querySelector('[data-reply_wrapper]');
    const target = document.querySelector('.link-comment__target-box');
    const confirm = document.querySelector('.link-reply__menu-btn.hb-color__btn--confirm');
    const modals = [...document.querySelectorAll('[class*=login], [class*=modal], [class*=dialog]')]
      .map((e) => e.className)
      .filter((c) => typeof c === 'string')
      .slice(0, 10);
    return {
      label: l,
      wrapClass: wrap ? wrap.className : null,
      targetText: target ? target.innerText.replace(/\\n+/g, ' / ') : null,
      targetAvatar: target ? (target.querySelector('img') || {}).src : null,
      hasConfirm: !!confirm,
      confirmVisible: confirm ? getComputedStyle(confirm).display !== 'none' : null,
      modals: modals,
      activeEl: document.activeElement ? (document.activeElement.className || document.activeElement.tagName) : null,
    };
  }, label);

  const out = [];
  out.push(await snap('initial'));

  const row = await page.$('.comment-children-item');
  if (row) {
    await row.scrollIntoViewIfNeeded();
    await row.click();
    await page.waitForTimeout(1500);
  }
  out.push(await snap('after-child-click'));

  const main = await page.$('.comment-item__content');
  if (main) {
    await main.scrollIntoViewIfNeeded();
    await main.click();
    await page.waitForTimeout(1500);
  }
  out.push(await snap('after-main-click'));

  const editable = await page.$('.ProseMirror[contenteditable=true]');
  if (editable) {
    await editable.click();
    await page.keyboard.type('测试');
    await page.waitForTimeout(1200);
  }
  out.push(await snap('after-typing'));

  return out;
}
`;

const dir = mkdtempSync(join(tmpdir(), 'hb-probe-'));
const scriptFile = join(dir, 'probe-reply-open.js');
writeFileSync(scriptFile, code, 'utf8');

const bin = 'C:\\Users\\28529\\AppData\\Roaming\\npm\\playwright-cli.cmd';
const out = execFileSync('cmd.exe', ['/c', bin, `-s=${session}`, '--raw', 'run-code', `--filename=${scriptFile}`], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

let parsed;
try {
  parsed = JSON.parse(out.trim());
} catch {
  console.log(out.slice(0, 3000));
  process.exit(1);
}
writeFileSync(outFile, JSON.stringify(parsed, null, 2), 'utf8');
for (const s of parsed) {
  console.log(`\n[${s.label}] wrap=${s.wrapClass}`);
  console.log(`  targetText=${s.targetText}`);
  console.log(`  hasConfirm=${s.hasConfirm} visible=${s.confirmVisible} active=${s.activeEl}`);
  console.log(`  modals=${JSON.stringify(s.modals)}`);
}
