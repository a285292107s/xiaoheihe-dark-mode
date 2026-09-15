/**
 * 打印 fixture 中某一选择器附近的原始 HTML（用于看清真实结构与内联样式）。
 *   node research/html-context.mjs <文件> <关键词> [窗口=2500] [最多=2]
 */
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.argv[2]);
const kw = process.argv[3];
const win = Number(process.argv[4] || 2500);
const max = Number(process.argv[5] || 2);

const text = fs.readFileSync(file, 'utf8');
console.log(`${path.basename(file)} (${(text.length / 1024).toFixed(0)}KB)  关键词 "${kw}"`);

let idx = 0;
let n = 0;
while ((idx = text.indexOf(kw, idx)) >= 0 && n < max) {
  n++;
  console.log(`\n===== 命中 ${n} @${idx} =====`);
  // 美化：按标签断行，便于阅读
  const chunk = text.slice(Math.max(0, idx - 400), Math.min(text.length, idx + win));
  console.log(chunk.replace(/></g, '>\n<'));
  idx += kw.length;
}
if (!n) console.log('（无命中）');
