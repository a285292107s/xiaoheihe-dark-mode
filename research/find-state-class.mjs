import fs from 'node:fs';
import path from 'node:path';

const jsDir = path.resolve('research/js');
const cssDirs = [path.resolve('research/css'), path.resolve('research/css-detail')];

const jsFiles = fs.existsSync(jsDir) ? fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')) : [];
const cssBlob = cssDirs
  .filter((d) => fs.existsSync(d))
  .flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(d, f), 'utf8')))
  .join('\n');

const classLike = new Map();
const strRe = /["']([a-zA-Z][\w-]{1,40})["']/g;
for (const f of jsFiles) {
  const text = fs.readFileSync(path.join(jsDir, f), 'utf8');
  let m;
  while ((m = strRe.exec(text))) {
    const s = m[1];
    if (!classLike.has(s)) classLike.set(s, new Set());
    classLike.get(s).add(f);
  }
}
console.log(`JS 中字符串字面量候选：${classLike.size}`);

const stateLike = [...classLike.keys()].filter((s) =>
  /^(is|has|can)-/.test(s) ||
  /(^|-)(active|selected|current|checked|focus|hover|highlight|chosen|target|open|expanded)($|-)/.test(s),
);
console.log(`其中像状态类名的：${stateLike.length}`);

const rules = [...cssBlob.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  sel: m[1].replace(/\s+/g, ' ').trim(),
  body: m[2].replace(/\s+/g, ' '),
}));

const found = [];
for (const cls of stateLike) {
  const hits = rules.filter((r) => r.sel.includes('.' + cls) && /background|box-shadow|outline/.test(r.body));
  if (!hits.length) continue;
  found.push({ cls, files: [...classLike.get(cls)].slice(0, 2), hits: hits.slice(0, 3) });
}

const related = found.filter((f) => f.hits.some((h) => /comment|reply|floor|link-/.test(h.sel)));
console.log(`\n########## 与 评论/回复 相关的状态类（${related.length}）##########`);
for (const f of related) {
  console.log(`\n.class ${f.cls}   [JS: ${f.files.join(', ')}]`);
  for (const h of f.hits) console.log(`    ${h.sel}\n        ${h.body.slice(0, 200)}`);
}

console.log(`\n########## 其余状态类 TOP（含背景，供参考）##########`);
for (const f of found.filter((x) => !related.includes(x))) {
  console.log(`  .${f.cls}  <- ${f.hits[0].sel.slice(0, 90)} :: ${f.hits[0].body.slice(0, 110)}`);
}
