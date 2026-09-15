/**
 * 表面梯度审计：把站点真实的表面调色板逐个跑一遍映射，
 * 对比「浅色下相对卡片的差异」与「深色映射后的差异」，检查保真度。
 *
 *   node research/surface-ramp.mjs
 *
 * 这个脚本是为了让"近白差异被放大"这类缺陷可审计 —— 它是详情页
 * 图片占位块变成大灰板的根因（详见 research/FINDINGS.md 第九节）。
 */
const CANVAS = { r: 14, g: 17, b: 22 };
const CARD = { r: 38, g: 44, b: 51 };

const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');

const linear = (t) => clamp(t, 0, 1);
const easeOut = (t) => { const i = 1 - clamp(t, 0, 1); return 1 - i * i; };

function map(c, curve) {
  const L = lum(c);
  if (L < 185) return null;
  return lerp(CANVAS, CARD, curve((L - 185) / 70));
}

const palette = [
  ['#ffffff', 255, 255, 255],
  ['#fafbfc', 250, 251, 252],
  ['#f7f8f9', 247, 248, 249],
  ['#f5f7fa', 245, 247, 250],
  ['#f4f4f5', 244, 244, 245],
  ['#f3f4f5', 243, 244, 245],
  ['#f1f2f3', 241, 242, 243],
  ['#ebeef5', 235, 238, 245],
  ['#e8e8e9', 232, 232, 233],
  ['#e4e7ed', 228, 231, 237],
  ['#dadde0', 218, 221, 224],
  ['#d5d8dc', 213, 216, 220],
  ['#c8cdd2', 200, 205, 210],
  ['#c0c4cc', 192, 196, 204],
];

const cardWhite = { r: 255, g: 255, b: 255 };
const cardDark = map(cardWhite, easeOut);
const Lwhite = lum(cardWhite);
const LcardDark = lum(cardDark);

console.log('站点表面调色板的映射保真度对比');
console.log('（“浅色差异” = 相对 #fff 的亮度差；“深色差异” = 相对映射后卡片色的亮度差）\n');
console.log(
  '源色'.padEnd(10) + '源亮度'.padStart(7) +
  '| 线性→深色'.padStart(12) + '线性差异'.padStart(10) +
  '| 缓出→深色'.padStart(12) + '缓出差异'.padStart(10) + '放大倍数'.padStart(10),
);
console.log('-'.repeat(84));

for (const [name, r, g, b] of palette) {
  const c = { r, g, b };
  const L = lum(c);
  const dLight = (Lwhite - L) / Lwhite;
  const outLin = map(c, linear);
  const outEase = map(c, easeOut);
  const dLin = outLin ? (LcardDark - lum(outLin)) / LcardDark : null;
  const dEase = outEase ? (LcardDark - lum(outEase)) / LcardDark : null;
  const ratio = dLight > 1e-6 && dEase !== null ? dEase / dLight : null;
  console.log(
    name.padEnd(10) + L.toFixed(1).padStart(7) +
    ('| ' + (outLin ? hex(outLin) : '—')).padStart(12) +
    ((dLin === null ? '—' : (dLin * 100).toFixed(1) + '%')).padStart(10) +
    ('| ' + (outEase ? hex(outEase) : '—')).padStart(12) +
    ((dEase === null ? '—' : (dEase * 100).toFixed(1) + '%')).padStart(10) +
    ((ratio === null ? '—' : ratio.toFixed(2) + 'x')).padStart(10),
  );
}

console.log(`
判定标准：深色下的差异不应超过浅色下的差异（放大倍数 <= 1.0）。
> 1 意味着某个"浅色下几乎看不见"的底色，在深色下会变成一块可见的板。
`);
