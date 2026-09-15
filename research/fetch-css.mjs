/**
 * 拉取小黑盒首页引用的全部 CSS 分片，落盘到 research/css/，并生成索引。
 * node research/fetch-css.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('research/css');
fs.mkdirSync(outDir, { recursive: true });

const INDEX_HTML = process.argv[2] || null;

// 从捕获的 fixture 里读出样式表清单（真实浏览器渲染后引用的全部 CSS）
const fixture = fs.readFileSync(path.resolve('fixtures/home.html'), 'utf8');
const hrefs = [...fixture.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)]
  .map((m) => m[0].match(/href="([^"]+)"/)?.[1])
  .filter(Boolean);

const uniq = [...new Set(hrefs)];
console.log(JSON.stringify({ found: hrefs.length, unique: uniq.length }));

const index = [];
for (const url of uniq) {
  const name = url.split('/').pop();
  const dest = path.join(outDir, name);
  let text;
  if (fs.existsSync(dest)) {
    text = fs.readFileSync(dest, 'utf8');
  } else {
    const res = await fetch(url);
    text = await res.text();
    fs.writeFileSync(dest, text, 'utf8');
  }
  index.push({ name, url, bytes: text.length });
  console.log(`${String(text.length).padStart(9)}  ${name}`);
}

fs.writeFileSync(path.join(outDir, '_index.json'), JSON.stringify(index, null, 2), 'utf8');
console.log('TOTAL BYTES', index.reduce((a, b) => a + b.bytes, 0));
