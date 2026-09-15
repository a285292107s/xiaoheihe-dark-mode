/**
 * 离线反查：哪个源色 / 哪条规则会产出指定颜色。
 *
 *   node research/trace-color.mjs 37404a
 *
 * 这个脚本起源于一次真实缺陷的定位：站点页面底色 `#f7f8f9` 被错映射成
 * `rgb(55,64,74)`，在信息流 4px 分隔条和 `#page-bbs-community::before`
 * （position:fixed;height:146px;width:100%）上表现为满屏灰色色块。
 *
 * ⚠️ 下面的映射实现是 `src/dark-engine.ts` 的**副本**，用于在没有浏览器时做离线分析。
 *    改动引擎的映射规则时请同步这里，否则结论会失真。
 */
import fs from 'node:fs';
import path from 'node:path';

const TARGET = (process.argv[2] || '37404a').toLowerCase().replace('#', '');

// ---- 与 dark-engine.ts 保持一致的映射实现 ----
const NAMED = {
  white: [255, 255, 255], black: [0, 0, 0], red: [255, 0, 0], green: [0, 128, 0],
  blue: [0, 0, 255], gray: [128, 128, 128], grey: [128, 128, 128],
  silver: [192, 192, 192], whitesmoke: [245, 245, 245], gainsboro: [220, 220, 220],
  lightgray: [211, 211, 211], lightgrey: [211, 211, 211], dimgray: [105, 105, 105],
  dimgrey: [105, 105, 105], darkgray: [169, 169, 169], darkgrey: [169, 169, 169],
  orange: [255, 165, 0], yellow: [255, 255, 0], gold: [255, 215, 0],
  pink: [255, 192, 203], tomato: [255, 99, 71], crimson: [220, 20, 60],
  seagreen: [46, 139, 87], teal: [0, 128, 128], navy: [0, 0, 128],
  purple: [128, 0, 128], maroon: [128, 0, 0], olive: [128, 128, 0],
  lime: [0, 255, 0], aqua: [0, 255, 255], cyan: [0, 255, 255],
  fuchsia: [255, 0, 255], magenta: [255, 0, 255],
};

function parseColor(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  if (!s || ['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'none', 'auto'].includes(s)) return null;
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    if (!/^[0-9a-f]+$/.test(h)) return null;
    return {
      r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean);
    if (p.length < 3) return null;
    const a = p.length >= 4 ? (p[3].includes('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3])) : 1;
    return { r: parseFloat(p[0]), g: parseFloat(p[1]), b: parseFloat(p[2]), a };
  }
  const m2 = s.match(/^hsla?\(([^)]+)\)$/);
  if (m2) {
    const p = m2[1].split(/[,\s/]+/).filter(Boolean);
    if (p.length < 3) return null;
    const rgb = hslToRgb(parseFloat(p[0]), parseFloat(p[1]) / 100, parseFloat(p[2]) / 100);
    const a = p.length >= 4 ? (p[3].includes('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3])) : 1;
    return { r: rgb[0], g: rgb[1], b: rgb[2], a };
  }
  const n = NAMED[s];
  return n ? { r: n[0], g: n[1], b: n[2], a: 1 } : null;
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s, l];
}
function hslToRgb(h, s, l) {
  const hn = (((h % 360) + 360) % 360) / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [Math.round(f(hn + 1 / 3) * 255), Math.round(f(hn) * 255), Math.round(f(hn - 1 / 3) * 255)];
}
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');

const CANVAS = { r: 14, g: 17, b: 22, a: 1 };
const CARD = { r: 38, g: 44, b: 51, a: 1 };

/** 中性判据：绝对彩度 + HSV 饱和度。不能用 HSL 饱和度（近白处会爆掉）。 */
function isNeutral(c) {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const chroma = max - min;
  if (chroma <= 10) return true;
  if (max === 0) return true;
  return chroma / max <= 0.18;
}
function colorKey(c) { return `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`; }
function lerpRgb(a, b, t, alpha) {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: alpha };
}

/** 表面梯度缓出曲线：让近白表面收敛到卡片色，避免放大近白差异 */
function surfaceCurve(t0) {
  const t = clamp(t0, 0, 1);
  const inv = 1 - t;
  return 1 - inv * inv;
}

function mapSurface(c, selector = '', canvasKeys = new Set()) {
  if (canvasKeys.has(colorKey(c))) {
    return /:hover|:focus|:active|\.is-active|\.is-open|\.is-selected|\.is-current|(^|[\s.])active([\s.:,]|$)/.test(selector)
      ? lerpRgb(CANVAS, CARD, 1, c.a)
      : { ...CANVAS, a: c.a };
  }
  const L = lum(c);
  if (isNeutral(c)) {
    if (L < 185) return null;
    return lerpRgb(CANVAS, CARD, surfaceCurve((L - 185) / 70), c.a);
  }
  if (L > 150) {
    const [h, s] = rgbToHsl(c.r, c.g, c.b);
    const t = (clamp(L, 150, 255) - 150) / 105;
    const nl = 0.1 + t * 0.1;
    const rgb = hslToRgb(h, Math.min(s, 0.5), nl);
    return { r: rgb[0], g: rgb[1], b: rgb[2], a: c.a };
  }
  return null;
}

const dir = path.resolve('research/css');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.css'));

// 先扫一遍，收集「页面画布色」（:root / html / body 上的底色）
const CANVAS_SELECTOR = /^(?::root|html|body)(\s*,\s*(?::root|html|body))*$/i;
const canvasKeys = new Set();
for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (!CANVAS_SELECTOR.test(sel.replace(/\s+/g, ' '))) continue;
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      const prop = d.slice(0, i).trim().toLowerCase();
      if (prop !== 'background-color' && prop !== 'background') continue;
      const c = parseColor(d.slice(i + 1).trim());
      if (c) canvasKeys.add(colorKey(c));
    }
  }
}
console.log(`画布色（来自 :root/html/body 底色）：${[...canvasKeys].join(' | ') || '无'}`);

const hits = [];
const seen = new Set();
for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].replace(/\s+/g, ' ').trim();
    const body = m[2];
    for (const decl of body.split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      const prop = decl.slice(0, i).trim();
      const value = decl.slice(i + 1).trim();
      if (!value) continue;
      for (const tm of value.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g)) {
        const c = parseColor(tm[0]);
        if (!c) continue;
        const mapped = mapSurface(c, sel, canvasKeys);
        if (!mapped) continue;
        if (hex(mapped) !== '#' + TARGET) continue;
        const key = prop + '|' + tm[0] + '|' + sel;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({ file, sel: sel.slice(0, 130), prop, source: tm[0], out: hex(mapped), alpha: c.a });
      }
    }
  }
}

console.log(`目标色 #${TARGET}，命中 ${hits.length} 条（角色=表面/bg）\n`);
for (const h of hits.slice(0, 40)) {
  console.log(`  ${h.source.padEnd(22)} -> ${h.out}  [${h.prop}]`);
  console.log(`     ${h.sel}`);
}
if (!hits.length) console.log('  （无命中）');

// 汇总源色
const sources = [...new Set(hits.map((h) => h.source))];
console.log(`\n涉及源色：${sources.join(', ') || '无'}`);
