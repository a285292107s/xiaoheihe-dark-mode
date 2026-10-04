import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [session = 'hb'] = process.argv.slice(2);

const code = `
async (page) => {
  const clickAll = async () => await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.comment-children__load-all')].filter((b) => b.offsetParent !== null);
    for (const b of btns) b.click();
    return btns.length;
  });

  const before = await page.evaluate(() => ({
    main: document.querySelectorAll('.link-comment__comment-item').length,
    children: document.querySelectorAll('.comment-children-item').length,
    loadAll: document.querySelectorAll('.comment-children__load-all').length,
  }));

  let rounds = 0;
  for (let i = 0; i < 8; i++) {
    const n = await clickAll();
    rounds = i + 1;
    await page.waitForTimeout(2500);
    const left = await page.evaluate(() => document.querySelectorAll('.comment-children__load-all').length);
    if (left === 0) break;
  }
  await page.waitForTimeout(1500);

  const after = await page.evaluate(() => ({
    main: document.querySelectorAll('.link-comment__comment-item').length,
    children: document.querySelectorAll('.comment-children-item').length,
    loadAll: document.querySelectorAll('.comment-children__load-all').length,
  }));

  const el = await page.$('.link-comment');
  if (el) {
    await el.evaluate((node) => {
      const blob = new Blob([node.outerHTML], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'hb-comment-expanded.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }
  const download = await page.waitForEvent('download', { timeout: 20000 });
  const path = await download.path();
  return { before, after, rounds, path };
}
`;

const dir = mkdtempSync(join(tmpdir(), 'hb-expand-'));
const scriptFile = join(dir, 'expand.js');
writeFileSync(scriptFile, code, 'utf8');

const bin = 'C:\\Users\\28529\\AppData\\Roaming\\npm\\playwright-cli.cmd';
let out;
try {
  out = execFileSync('cmd.exe', ['/c', bin, `-s=${session}`, '--raw', 'run-code', `--filename=${scriptFile}`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 180000,
  });
} catch (err) {
  out = String(err.stdout ?? '') + String(err.stderr ?? '');
}

let info;
try {
  info = JSON.parse(out.trim());
} catch {
  console.error('CLI 输出无法解析：', out.slice(0, 600));
  process.exit(1);
}
console.log(JSON.stringify(info, null, 2));

if (info.path) {
  const { copyFileSync } = await import('node:fs');
  const target = 'research/live-comment-expanded.html';
  copyFileSync(info.path, target);
  const { statSync } = await import('node:fs');
  console.log(`\nsaved ${statSync(target).size} bytes -> ${target}`);
}
