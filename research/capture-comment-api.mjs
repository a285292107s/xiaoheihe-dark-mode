import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [outFile = 'research/live-comment-tree.json', session = 'hb'] = process.argv.slice(2);

const code = `
async (page) => {
  await page.addInitScript(() => {
    window.__hbApi = [];
    const of = window.fetch;
    window.fetch = function (...args) {
      const u = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
      const p = of.apply(this, args);
      try {
        if (u && /\\/bbs\\/app\\/link\\/tree|\\/bbs\\/app\\/comment/.test(u)) {
          p.then((r) => {
            r.clone().text().then((t) => window.__hbApi.push({ url: u, text: t })).catch(() => {});
          }).catch(() => {});
        }
      } catch (e) {}
      return p;
    };
    const oo = XMLHttpRequest.prototype.open;
    const os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u, ...r) {
      this.__hbUrl = u;
      return oo.call(this, m, u, ...r);
    };
    XMLHttpRequest.prototype.send = function (...a) {
      try {
        if (this.__hbUrl && /\\/bbs\\/app\\/link\\/tree|\\/bbs\\/app\\/comment/.test(this.__hbUrl)) {
          const self = this;
          this.addEventListener('load', () => {
            window.__hbApi.push({ url: self.__hbUrl, text: self.responseText });
          });
        }
      } catch (e) {}
      return os.apply(this, a);
    };
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  return await page.evaluate(() => window.__hbApi || []);
}
`;

const dir = mkdtempSync(join(tmpdir(), 'hb-probe-'));
const scriptFile = join(dir, 'capture-api.js');
writeFileSync(scriptFile, code, 'utf8');

const bin = 'C:\\Users\\28529\\AppData\\Roaming\\npm\\playwright-cli.cmd';
const out = execFileSync('cmd.exe', ['/c', bin, `-s=${session}`, '--raw', 'run-code', `--filename=${scriptFile}`], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

const trimmed = out.trim();
let payloads = [];
try {
  const parsed = JSON.parse(trimmed);
  payloads = Array.isArray(parsed) ? parsed : [parsed];
} catch (err) {
  console.error('CLI 输出不是 JSON：', trimmed.slice(0, 300));
  process.exit(1);
}

if (!payloads.length) {
  console.error('没有抓到评论树响应');
  process.exit(1);
}

const last = payloads[payloads.length - 1];
let text = last.text;
try {
  text = JSON.parse(text);
  text = JSON.stringify(text, null, 2);
} catch {
}
writeFileSync(outFile, text, 'utf8');
console.log(`wrote ${text.length} bytes -> ${outFile} (from ${last.url.slice(0, 90)}...)`);
