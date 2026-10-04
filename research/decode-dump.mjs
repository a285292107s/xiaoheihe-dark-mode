import { readFileSync, writeFileSync } from 'node:fs';

const [inFile, outFile] = process.argv.slice(2);
if (!inFile) {
  console.error('usage: node research/decode-dump.mjs <inFile> [outFile]');
  process.exit(2);
}

let raw = readFileSync(inFile, 'utf8').replace(/^\uFEFF/, '').trim();
let html = raw;
try {
  const parsed = JSON.parse(raw);
  if (typeof parsed === 'string') html = parsed;
} catch {
}

writeFileSync(outFile ?? inFile, html, 'utf8');
console.log(`${inFile}: ${raw.length} -> ${html.length} bytes${outFile ? ` -> ${outFile}` : ''}`);
