import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
const kw = process.argv[3];
const win = Number(process.argv[4] || 600);
const max = Number(process.argv[5] || 5);

const p = path.isAbsolute(file) ? file : path.resolve('research/js', file);
const text = fs.readFileSync(p, 'utf8');
console.log(`文件 ${path.basename(p)} (${(text.length / 1024).toFixed(0)}KB)  关键词 "${kw}"`);

let idx = 0;
let n = 0;
while ((idx = text.indexOf(kw, idx)) >= 0 && n < max) {
  n++;
  console.log(`\n===== 命中 ${n} @${idx} =====`);
  console.log(text.slice(Math.max(0, idx - win), Math.min(text.length, idx + win)).replace(/\s+/g, ' '));
  idx += kw.length;
}
if (!n) console.log('（无命中）');
