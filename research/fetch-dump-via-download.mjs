import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [selector, outFile, session = 'hb'] = process.argv.slice(2);
if (!selector || !outFile) {
  console.error('usage: node research/fetch-dump-via-download.mjs <selector> <outFile> [session]');
  process.exit(2);
}

const target = resolve(outFile);
const code = `
async (page) => {
  const sel = ${JSON.stringify(selector)};
  const el = await page.$(sel);
  if (!el) return { ok: false, reason: 'selector not found: ' + sel };
  const d = await el.evaluate((node) => {
    const html = node.outerHTML;
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hb-dump.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return { length: html.length };
  });
  const download = await page.waitForEvent('download', { timeout: 20000 });
  const path = await download.path();
  return { ok: true, length: d.length, path };
}
`;

const dir = mkdtempSync(join(tmpdir(), 'hb-dump-'));
const scriptFile = join(dir, 'dump.js');
writeFileSync(scriptFile, code, 'utf8');

const bin = 'C:\\Users\\28529\\AppData\\Roaming\\npm\\playwright-cli.cmd';
let out;
try {
  out = execFileSync('cmd.exe', ['/c', bin, `-s=${session}`, '--raw', 'run-code', `--filename=${scriptFile}`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  out = String(err.stdout ?? '') + String(err.stderr ?? '');
}

let info;
try {
  info = JSON.parse(out.trim());
} catch {
  console.error('CLI 输出无法解析：', out.slice(0, 500));
  process.exit(1);
}
console.log('page:', JSON.stringify(info));
if (!info.ok) process.exit(1);

const { copyFileSync } = await import('node:fs');
copyFileSync(info.path, target);
console.log(`saved ${info.length} chars -> ${target}`);
