/**
 * 小黑盒深色引擎
 *
 * ## 为什么是「改写 CSS 规则」而不是「改写 DOM 元素」
 *
 * 逐元素写内联 `!important` 的做法有三处结构性死角（详见 research/FINDINGS.md）：
 *   1. 伪元素（`::before`/`::after`/`::placeholder`）无法施加内联样式；
 *      而站点有 426 条规则作用于伪元素。
 *   2. `:hover` / `:focus` / `:active` 等交互态无法用内联样式表达。
 *   3. 每次扫描要对全部 ~1300 个元素调用 getComputedStyle，而 SPA 会持续变更 DOM。
 *
 * CSS 规则本身天然作用于「当前与未来所有节点，含伪元素与各交互态」。
 * 所以正确做法是：把站点的样式表当数据读出来，按「角色」把字面量颜色
 * 映射为深色等价。一次遍历 4700~5500 条规则约 45ms，零元素级开销。
 *
 * ## 必须就地改写，不能生成覆盖表
 *
 * 覆盖表只能挂在站点所有样式表之后，于是在同优先级下会**抢赢站点自己的状态规则**。
 * 站点用两条**优先级完全相同**（(0,2,1)）的规则、靠先后顺序决定 hover 的表现：
 *
 *   .link-comment__comment-item + .link-comment__comment-item:before { background:#f3f4f5 }   （1px 分隔线）
 *   .link-comment__comment-item:hover:before  { background:rgba(20,25,30,.016); z-index:300; width/height:100% }
 *
 * 把分隔线的深色改写放进末尾的覆盖表，hover 时它就会赢过 hover 规则：覆盖层被换成
 * 不透明色，而尺寸与 z-index 仍来自 hover 规则 —— 鼠标一移上去整层楼被盖住。
 *
 * 因此**直接就地改写站点的声明**（`CSSStyleDeclaration.setProperty`）：
 *   - 层叠顺序、`@media`/`@supports` 条件块、规则位置全部原样保留；
 *   - 不产生重复 CSS（只剩 ~1KB 的例外层）；
 *   - **绝不擅自追加 `!important`** —— 只原样保留原有优先级，否则同样会击穿状态规则。
 * 跨域（CORS）样式表可写，已用「异源 + ACAO」实测验证。
 *
 * 事故经过见 research/FINDINGS.md 第十节；research/test-hover-cascade.mjs 是这条约束的看门人。
 *
 * 前提：站点样式表跨域可读（`crossorigin` + CORS）。已实测 16/16 可读。
 *
 * ## 为什么不能只覆盖 CSS 变量
 *
 * 站点定义了 695 个自定义属性（`--hb-*`、`--hb-general-color-*`），但实测把它们
 * 全部改成刺眼的红色后，页面上 **0 个元素变色** —— 令牌层对渲染是失效的。
 * 真正决定外观的是 546 条含字面量颜色的规则。因此引擎必须处理字面量。
 */

/** 加在 <html> 上的类名 */
export const ROOT_CLASS = 'hb-dark';

const STYLE_ID = 'hb-dark-overrides';
/**
 * 引擎统计。
 *
 * `changed` / `declarations` / `keyframes` 的口径是「引擎当前持有的改动量」，
 * 而不是「本次构建新写入的次数」：重建时，已由引擎写入的声明会被重算并计入。
 * 若只计新写入，采样点一旦落在增量重建之后，数字就会塌缩
 * （实测同一次页面加载内 421 -> 14），指标失去可比性。
 */
export interface EngineStats {
  /** 成功读取的样式表数量 */
  sheets: number;
  /** 遍历过的 CSS 规则数 */
  scanned: number;
  /** 引擎持有的改动：被改写的规则数 */
  changed: number;
  /** 引擎持有的改动：被改写的声明数（一条规则可含多条声明） */
  declarations: number;
  /** 引擎持有的改动：就地改写的关键帧声明数 */
  keyframes: number;
  /** 仍被跟踪以便还原的规则声明块数量（含关键帧） */
  tracked: number;
  /** 无法读取的样式表数（理论上应为 0） */
  errors: number;
}

// ---------------------------------------------------------------------------
// 颜色工具
// ---------------------------------------------------------------------------

interface RGBA { r: number; g: number; b: number; a: number }

const NAMED: Record<string, [number, number, number]> = {
  white: [255, 255, 255], black: [0, 0, 0],
  red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255],
  gray: [128, 128, 128], grey: [128, 128, 128],
  silver: [192, 192, 192], whitesmoke: [245, 245, 245],
  gainsboro: [220, 220, 220], lightgray: [211, 211, 211], lightgrey: [211, 211, 211],
  dimgray: [105, 105, 105], dimgrey: [105, 105, 105],
  darkgray: [169, 169, 169], darkgrey: [169, 169, 169],
  orange: [255, 165, 0], yellow: [255, 255, 0], gold: [255, 215, 0],
  pink: [255, 192, 203], tomato: [255, 99, 71], crimson: [220, 20, 60],
  seagreen: [46, 139, 87], teal: [0, 128, 128], navy: [0, 0, 128],
  purple: [128, 0, 128], maroon: [128, 0, 0], olive: [128, 128, 0],
  lime: [0, 255, 0], aqua: [0, 255, 255], cyan: [0, 255, 255],
  fuchsia: [255, 0, 255], magenta: [255, 0, 255],
};

/** 解析颜色；非颜色值（transparent / currentColor / var() / 颜色三元组）返回 null */
function parseColor(input: string): RGBA | null {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  if (!s || s === 'transparent' || s === 'currentcolor' || s === 'inherit' ||
      s === 'initial' || s === 'unset' || s === 'none' || s === 'auto') return null;

  if (s.charCodeAt(0) === 35) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      h = h.split('').map((c) => c + c).join('');
    }
    if (h.length !== 6 && h.length !== 8) return null;
    if (!/^[0-9a-f]+$/.test(h)) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }

  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    let a = 1;
    if (parts.length >= 4) {
      a = parts[3].indexOf('%') >= 0 ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    }
    return { r: parseFloat(parts[0]), g: parseFloat(parts[1]), b: parseFloat(parts[2]), a };
  }

  const m2 = s.match(/^hsla?\(([^)]+)\)$/);
  if (m2) {
    const p = m2[1].split(/[,\s/]+/).filter(Boolean);
    if (p.length < 3) return null;
    const rgb = hslToRgb(parseFloat(p[0]), parseFloat(p[1]) / 100, parseFloat(p[2]) / 100);
    const a = p.length >= 4
      ? (p[3].indexOf('%') >= 0 ? parseFloat(p[3]) / 100 : parseFloat(p[3]))
      : 1;
    return { r: rgb[0], g: rgb[1], b: rgb[2], a };
  }

  const named = NAMED[s];
  return named ? { r: named[0], g: named[1], b: named[2], a: 1 } : null;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [
    Math.round(f(hn + 1 / 3) * 255),
    Math.round(f(hn) * 255),
    Math.round(f(hn - 1 / 3) * 255),
  ];
}

/** 感知亮度（近似相对亮度） */
function lum(c: RGBA): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function fmt(c: RGBA): string {
  const r = Math.round(clamp(c.r, 0, 255));
  const g = Math.round(clamp(c.g, 0, 255));
  const b = Math.round(clamp(c.b, 0, 255));
  if (c.a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(c.a * 1000) / 1000})`;
}

// ---------------------------------------------------------------------------
// 角色判定
// ---------------------------------------------------------------------------

type Role = 'bg' | 'fg' | 'border' | 'shadow';

/** 属性名 -> 颜色角色；null 表示不是颜色属性 */
function roleOfProp(prop: string): Role | null {
  const p = prop.toLowerCase();
  if (p.slice(0, 2) === '--') return roleOfVar(p);
  if (p === 'color' || p === 'fill' || p === 'stroke' || p === 'caret-color' ||
      p === 'text-decoration-color' || p === '-webkit-text-fill-color' ||
      p === 'flood-color' || p === '-webkit-text-stroke-color') return 'fg';
  if (p === 'stop-color') return 'bg';
  if (p.indexOf('background') === 0) return 'bg';
  if (p.indexOf('shadow') >= 0) return 'shadow';
  if (p.indexOf('border') >= 0 || p.indexOf('outline') >= 0 ||
      p.indexOf('column-rule') >= 0 || p === 'text-decoration') return 'border';
  if (p === 'accent-color') return 'bg';
  return null;
}

/**
 * 自定义属性：先按名字判定角色，名字无信息时返回 null 交给明度推断。
 *
 * 片段必须整体匹配（`(^|-)` … `($|-)`）。只做子串匹配会漏掉 `--publish-color`
 * 这类「color 在结尾」的名字（却命中 `--el-text-color-primary`）；
 * 漏掉的令牌会落到明度推断，浅色前景令牌被误判成表面色 ——
 * 导航登录按钮的文字会变成与深色渐变底同色，整颗按钮看不见。
 */
function roleOfVar(name: string): Role | null {
  if (/shadow/.test(name)) return 'shadow';
  if (/(border|stroke|divider|outline)/.test(name) || /(^|-)line($|-)/.test(name)) return 'border';
  if (/(^|-)(text|color|fg|foreground|ink|label|title|link)($|-)/.test(name)) return 'fg';
  if (/(bg|background|surface|card|panel|fill|plain|white|mask|overlay|paper)/.test(name)) return 'bg';
  return null;
}

// ---------------------------------------------------------------------------
// 颜色映射
//
// 核心原则：单调，不做简单取反。
//   - 表面：保持「越亮越浮起」的顺序，整体压进深色带 -> 卡片仍浮在页面底之上
//   - 文字：整体压进浅色带 -> 越重要（原色越深）越亮
// 简单取反会丢掉层级关系，页面会变成一片均质灰。
// ---------------------------------------------------------------------------

/** 页面画布色（与 src/dark-base.css 的 html.hb-dark 底色一致） */
const CANVAS: RGBA = { r: 14, g: 17, b: 22, a: 1 }; // #0e1116
/** 浮起卡片色（表面梯度的顶端，带轻微冷调，与站点品牌黑 #14191e 同族） */
const CARD: RGBA = { r: 38, g: 44, b: 51, a: 1 }; // #262c33

/**
 * 判定颜色是否为「中性」。
 *
 * 这里**不能**用 HSL 饱和度。接近白色时 HSL 的分母 `2-max-min` 趋近于 0，
 * 会把极微弱的色偏放大成很高的饱和度：`#f7f8f9` 与纯白只差 2 个色阶，
 * HSL 饱和度却算到 0.143 —— 足以让页面底色被判成「彩色」、走进彩色表面分支。
 * 而页面底色会用在信息流 4px 分隔条与 `#page-bbs-community::before`
 * （position:fixed;height:146px;width:100%）这类整屏色带上，
 * 误判的代价是满屏突兀的灰色色块（见 research/FINDINGS.md 第八节）。
 *
 * 判据用「绝对彩度 + HSV 饱和度」双条件：近白色天然被判为中性。
 */
function isNeutral(c: RGBA): boolean {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const chroma = max - min;
  if (chroma <= 10) return true;   // 绝对彩度极低
  if (max === 0) return true;
  return chroma / max <= 0.18;     // HSV 饱和度低
}

/** 颜色键：用于识别「这个颜色就是页面画布色」 */
function colorKey(c: RGBA): string {
  return `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`;
}

function lerpRgb(a: RGBA, b: RGBA, t: number, alpha: number): RGBA {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: alpha,
  };
}

/**
 * 表面梯度的缓出曲线。
 *
 * 必须是缓出，不能线性：把源亮度 L∈[185,255] 线性压进深色带会**放大近白色的
 * 差异**，而站点的表面几乎全部聚集在近白区间
 * （#fff / #fafbfc / #f7f8f9 / #f5f7fa / #f3f4f5 / #f1f2f3 都在 L 241~255）。
 *
 * 量级：`.hb-cpt__image--default` 的图片占位块 `#f3f4f5` 在浅色下只比卡片 `#fff`
 * 暗 4.4%（几乎不可见），线性映射后变成暗 11.5% —— 放大 2.6 倍。详情页的 4:3
 * 图片网格把两张占位块并排放大到 1256x460，在深色下就是一整块突兀的灰板。
 *
 * 缓出让近白区间收敛到卡片色，中低亮度仍保留可分辨的「下沉表面」。
 * 保真度审计见 research/surface-ramp.mjs。
 */
function surfaceCurve(t0: number): number {
  const t = clamp(t0, 0, 1);
  const inv = 1 - t;
  return 1 - inv * inv;
}

/**
 * 站点在 :root / html / body 上设的底色即「页面画布色」。
 * 它同时会用在分隔条、全屏固定色带、卡片间隙上 —— 那些地方在浅色下
 * 看起来就是"露出的页面底"，深色下也必须回到画布色，否则会出现色块接缝。
 */
function mapSurface(c: RGBA, selector: string): RGBA | null {
  // 画布色：整页底色 / 平台留白 / 卡片间隙
  if (canvasKeys.has(colorKey(c))) {
    // 但交互态（hover/active）下同一颜色是"高亮填充"，应落在浮起表面，
    // 映射成画布会让高亮彻底看不见
    return isInteractiveSelector(selector)
      ? lerpRgb(CANVAS, CARD, 1, c.a)
      : { ...CANVAS, a: c.a };
  }

  const L = lum(c);

  if (isNeutral(c)) {
    // 中性表面：本来就是深色的（实心按钮/遮罩/角标）保留，避免误伤
    if (L < 185) return null;
    return lerpRgb(CANVAS, CARD, surfaceCurve((L - 185) / 70), c.a);
  }

  // 明亮彩色块（亮色标签、彩色底）：转成同色相深色块，配浅色文字
  if (L > 150) {
    const [h, s] = rgbToHsl(c.r, c.g, c.b);
    const t = (clamp(L, 150, 255) - 150) / 105;
    const nl = 0.1 + t * 0.1;
    const rgb = hslToRgb(h, Math.min(s, 0.5), nl);
    return { r: rgb[0], g: rgb[1], b: rgb[2], a: c.a };
  }

  // 品牌主色（饱和且不太亮）与深彩：保留
  return null;
}

function mapText(c: RGBA): RGBA | null {
  if (c.a < 0.05) return null;
  const L = lum(c);
  const [h, s, l] = rgbToHsl(c.r, c.g, c.b);

  if (!isNeutral(c)) {
    // 彩色文字：够亮就保留；太暗则提亮，保证在深底上可读
    if (L > 150) return null;
    const nl = clamp(Math.max(l, 0.62), 0.62, 0.8);
    const rgb = hslToRgb(h, Math.min(s, 0.8), nl);
    return { r: rgb[0], g: rgb[1], b: rgb[2], a: c.a };
  }

  // 中性文字：整体压到浅色带，阈值处连续，保证单调
  // 纯白（L>=190）保留 —— 它本来就在深色或彩色底上
  if (L >= 190) return null;
  const t = 190 + ((190 - L) / 190) * 55; // L=0 -> 245, L=190 -> 190
  const v = Math.round(clamp(t, 150, 245));
  return { r: v, g: v, b: Math.round(clamp(v * 1.012, 0, 255)), a: c.a };
}

function mapBorder(c: RGBA): RGBA | null {
  if (c.a < 0.06) return null;
  const L = lum(c);
  const [h, s] = rgbToHsl(c.r, c.g, c.b);

  if (!isNeutral(c)) {
    if (L < 130) return null;
    const rgb = hslToRgb(h, Math.min(s, 0.5), 0.45);
    return { r: rgb[0], g: rgb[1], b: rgb[2], a: c.a };
  }

  if (L < 170) return null; // 深边框保留
  // 浅边框 -> 半透明白（越浅越弱，避免深色下出现刺眼描边）
  const alpha = clamp(0.06 + ((255 - L) / 255) * 0.34, 0.06, 0.3);
  return { r: 255, g: 255, b: 255, a: alpha };
}

function mapColor(role: Role, c: RGBA, selector: string): RGBA | null {
  if (role === 'shadow') return null; // 深底上深阴影无害，不动
  if (role === 'bg') return mapSurface(c, selector);
  if (role === 'border') return mapBorder(c);
  return mapText(c);
}

// ---------------------------------------------------------------------------
// 声明改写
// ---------------------------------------------------------------------------

/**
 * 颜色 token 正则。
 *
 * 刻意不匹配 `var(...)` —— 自定义属性的解析交给 roleOfVar。
 * 裸颜色名（`white`/`black`/…）必须列进来，因为站点用它们写颜色；
 * 代价是同一个词也会出现在 url() 里（`icon_white.png`）或引用里（`#fade`），
 * 所以替换前先把 url() 片段摘出去 —— 见 transformDeclaration。
 */
const COLOR_TOKEN =
  /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black|whitesmoke|gainsboro|lightgray|lightgrey|silver|darkgray|darkgrey|dimgray|dimgrey|gray|grey|orange|gold|pink|tomato|crimson|seagreen|teal|navy|purple|maroon|olive|lime|aqua|cyan|fuchsia|magenta|red|green|blue|yellow)\b/gi;

/** `url(...)` 片段：里面的颜色词是文件名，不是颜色 */
const URL_SPAN = /url\([^)]*\)/gi;

/** 摘出 url() 时的占位符。CSS 值里不可能出现 \u0001，不会与真实内容冲突 */
const MASK = '\u0001';
const MASK_SPAN = /\u0001(\d+)\u0001/g;

/** 自定义属性的值是否为「纯颜色」（排除 var() / 渐变 / url / 颜色三元组） */
function plainColorOf(value: string): RGBA | null {
  if (value.indexOf('var(') >= 0) return null;
  if (value.indexOf('gradient') >= 0) return null;
  if (value.indexOf('url(') >= 0) return null;
  return parseColor(value.trim());
}

/**
 * 改写一条声明的值；返回 null 表示无需改写。
 *
 * 自定义属性只在值为纯颜色时处理：渐变色令牌（如 `--publish-bg`）不动，
 * 它们由例外层显式处理。
 */
function transformDeclaration(prop: string, value: string, selector = ''): string | null {
  const isCustom = prop.slice(0, 2) === '--';
  const role = roleOfProp(prop);
  if (role === null && !isCustom) return null;
  if (role === 'shadow') return null;

  if (isCustom) {
    const only = plainColorOf(value);
    if (!only) return null;
    // 名字无信息时按明度推断：偏亮 -> 表面，偏暗 -> 文字
    // （role === 'shadow' 已在上方提前返回，这里不可能是 shadow）
    const r: Exclude<Role, 'shadow'> = role ?? (lum(only) > 170 ? 'bg' : 'fg');
    const mapped = mapColor(r, only, selector);
    return mapped ? fmt(mapped) : null;
  }

  // url() 里的内容逐字节保留：`url(icon_white.png)` 的 white 是文件名，
  // `url(#fade)` 是 SVG 引用，都不是颜色。先摘出、替换完再放回。
  const urls: string[] = [];
  const masked = String(value).replace(URL_SPAN, (m) => {
    urls.push(m);
    return `${MASK}${urls.length - 1}${MASK}`;
  });

  let changed = false;
  const out = masked.replace(COLOR_TOKEN, (tok) => {
    const c = parseColor(tok);
    if (!c) return tok;
    const mapped = mapColor(role as Role, c, selector);
    if (!mapped) return tok;
    changed = true;
    return fmt(mapped);
  });
  if (!changed) return null;
  return urls.length ? out.replace(MASK_SPAN, (_m, i: string) => urls[+i]) : out;
}

// ---------------------------------------------------------------------------
// 规则遍历
// ---------------------------------------------------------------------------

/** CSSOM 的最小鸭子类型：不同规则类型字段不同，避免用 constructor.name 判定 */
interface AnyRule {
  selectorText?: string;
  style?: CSSStyleDeclaration;
  cssRules?: CSSRuleList;
  conditionText?: string;
  media?: MediaList;
  keyText?: string;
  name?: string;
}

/** 待改写的规则。先收集、再统一改写：识别画布色必须先看过全部规则。 */
interface PendingRule {
  selector: string;
  style: CSSStyleDeclaration;
}

/** `:root` / `html` / `body` 上的底色即页面画布色 */
const CANVAS_SELECTOR = /^(?::root|html|body)(\s*,\s*(?::root|html|body))*$/i;

/** 交互态：同一颜色在这里是"高亮填充"，而非"露出的页面底" */
const INTERACTIVE_SELECTOR = /:hover|:focus|:active|\.is-active|\.is-open|\.is-selected|\.is-current|(^|[\s.])active([\s.:,]|$)/;

function isInteractiveSelector(selector: string): boolean {
  return INTERACTIVE_SELECTOR.test(selector);
}

/**
 * 就地改写（关键帧 / 内联样式）的幂等状态。
 *
 * 覆盖表那条路径永远读站点的原始值，天然幂等；
 * 但关键帧和内联样式是**就地**改写的，站点样式表里存的就是我们写过的值。
 * 若不加处理，多次重建就会把「已映射过的值」再映射一次 ——
 * 边框映射成半透明白后会被反复衰减到 0.06，页面描边逐轮消失。
 *
 * 所以这里记录 orig（原值）与 applied（我们写入的值）：
 * 只要当前值仍等于 applied，就始终从 orig 重新计算。
 *
 * 三处改写点都用 `next === current` 作为「无需写入」的判据，而不是
 * `next === source`：后者在「值已经是我们写的那个」时会判定为需要写入，
 * 于是重复写入同一个值。内联样式写入会触发 style 属性变更记录，
 * 而内联观察器正监听该属性 —— 重复写入是否演变成常驻写循环，
 * 取决于「写入相同值是否派发变更记录」这一浏览器特定行为。
 * 与 current 比较可让该路径与浏览器语义无关。
 */
interface RewriteState {
  orig: string;
  applied: string;
  priority: string;
}

let stats: EngineStats = emptyStats();
let keyframeRules: AnyRule[] = [];
let pending: PendingRule[] = [];
/** 站点在 :root/html/body 上用的底色 —— 这些颜色的角色是「页面画布」 */
const canvasKeys = new Set<string>();

/** 就地改写的幂等状态（同 kfState），并提供精确还原 */
const ruleState = new WeakMap<CSSStyleDeclaration, Map<string, RewriteState>>();
const ruleStyles = new Set<CSSStyleDeclaration>();
/** 调试用：最近一次构建里被改写的前若干条声明 */
const mutations: string[] = [];

const kfState = new WeakMap<CSSStyleDeclaration, Map<string, RewriteState>>();
const kfStyles = new Set<CSSStyleDeclaration>();

/**
 * 读取「站点自己写的值」。
 *
 * 就地改写意味着站点样式表里存的就是我们写过的值，所以**凡是拿站点样式反推结论**
 * 的地方都必须先经这里还原 —— 否则引擎会把自己的输出当成输入。识别页面画布色
 * 正是这种地方：`:root` 的底色自己也在这轮被改写成画布色，第二次构建时
 * `walk()` 就会把「上轮的输出」登记为画布色，于是画布色集合从 `#f7f8f9`
 * 变成 `#0e1116`，此后整屏固定色带与信息流分隔条全部翻成卡片色 ——
 * 一次构建正确、再构建就错，而构建次数由站点加载节奏决定（见 FINDINGS 第八节）。
 *
 * `transformStyle` / 关键帧 / 内联样式各自缓存了同一份 orig，不走这里。
 */
function sourceValue(style: CSSStyleDeclaration, prop: string): string {
  const current = style.getPropertyValue(prop);
  const entry = ruleState.get(style)?.get(prop);
  return entry && current === entry.applied ? entry.orig : current;
}

function emptyStats(): EngineStats {
  return { sheets: 0, scanned: 0, changed: 0, declarations: 0, keyframes: 0, tracked: 0, errors: 0 };
}

/** 阶段一：只收集，不改写。识别画布色必须先看过全部规则。 */
function walk(rules: CSSRuleList): void {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i] as unknown as AnyRule;
    stats.scanned++;

    // 条件规则（@media / @supports / @layer）：递归即可。
    // 就地改写天然保留规则所处的条件块，不需要再重新包裹。
    if (!rule.selectorText && rule.cssRules) {
      walk(rule.cssRules);
      continue;
    }

    // 关键帧内部的颜色无法用覆盖规则命中，收集起来就地改写
    if (rule.keyText !== undefined && rule.style) {
      keyframeRules.push(rule);
      continue;
    }

    if (!rule.selectorText || !rule.style) continue;
    pending.push({ selector: rule.selectorText, style: rule.style });

    // 记录页面画布色。这里必须读站点原值（sourceValue）：这条声明本轮也会被
    // 改写，读当前值会把引擎自己的输出登记成画布色。
    if (CANVAS_SELECTOR.test(rule.selectorText.trim())) {
      const style = rule.style;
      for (let j = 0; j < style.length; j++) {
        const prop = style[j].toLowerCase();
        if (prop !== 'background-color' && prop !== 'background') continue;
        const only = plainColorOf(sourceValue(style, style[j]));
        if (only) canvasKeys.add(colorKey(only));
      }
    }
  }
}

/** 就地改写一个声明块；返回改动的声明数 */
function transformStyle(style: CSSStyleDeclaration, selector: string): number {
  // 先快照属性名：写入 shorthand 时 length/索引可能变化，避免边写边遍历
  const props: string[] = [];
  for (let j = 0; j < style.length; j++) props.push(style[j]);

  let state = ruleState.get(style);
  let changed = 0;

  for (const prop of props) {
    const current = style.getPropertyValue(prop);
    if (!current) continue;

    // 幂等：仍是我们写入的值 -> 从原值重算
    const entry = state?.get(prop);
    const mine = !!entry && current === entry.applied;
    const source = mine && entry ? entry.orig : current;
    const next = transformDeclaration(prop, source, selector);
    if (!next) continue;
    if (next === current) {
      // 无需写入。但这个值若仍由我们持有，它照样是「引擎持有的改动」，
      // 必须计入；否则指标会随采样点是否落在增量重建之后而塌缩。
      if (mine) changed++;
      continue;
    }

    // 关键：原样保留原有优先级。擅自加 !important 会击穿站点自己的状态规则
    // （例如 :hover），把半透明覆盖层变成不透明板（见文件顶部说明）。
    const priority = style.getPropertyPriority(prop);
    if (!state) {
      state = new Map();
      ruleState.set(style, state);
    }
    state.set(prop, { orig: source, applied: next, priority });
    try {
      style.setProperty(prop, next, priority);
      ruleStyles.add(style);
      changed++;
      if (mutations.length < 60) {
        mutations.push(`${selector} { ${prop}: ${source} -> ${next}${priority ? ' !important' : ''} }`);
      }
    } catch {
      /* 只读样式表：忽略 */
    }
  }
  return changed;
}

/** 阶段二：按已知的画布色集合统一改写（就地，保持层叠顺序） */
function transform(): void {
  for (const item of pending) {
    const n = transformStyle(item.style, item.selector);
    if (!n) continue;
    stats.changed++;
    stats.declarations += n;
  }
}

/**
 * 丢掉已脱离文档的样式表在 ruleStyles / kfStyles 里的强引用。
 *
 * collect() 只遍历 document.styleSheets，被卸载的样式表不会再出现在其中，
 * 此后也无法（且没有意义）还原它；继续强引用只会让已卸载的样式表无法回收。
 * 每次重建清一次，把跟踪集约束在当前文档的规模内。
 *
 * 判定用 parentRule -> parentStyleSheet -> ownerNode，嵌套在 @media/@supports
 * 里的规则同样能解析到所属 <style>/<link>。注意 ownerNode 为 null 有两种含义：
 *   - 元素被 remove() 掉：Chrome 实测会把 ownerNode 置为 null（已实测确认）
 *   - 由 API 创建（adoptedStyleSheets / new CSSStyleSheet）：这个 null 是常态，不该剪
 * 所以只剪「ownerNode 为 null 且不属于 adoptedStyleSheets」和「ownerNode 已断开」两种。
 */
function pruneDetachedStyles(): void {
  const isAttachedOwnerless = (sheet: CSSStyleSheet): boolean =>
    document.adoptedStyleSheets.includes(sheet);

  for (const styles of [ruleStyles, kfStyles]) {
    styles.forEach((style) => {
      const sheet = style.parentRule?.parentStyleSheet;
      if (!sheet) return; // 内联样式 / 构造式声明块：不归这里管
      const owner = sheet.ownerNode;
      if (owner === null) {
        if (!isAttachedOwnerless(sheet)) styles.delete(style);
        return;
      }
      if (!owner.isConnected) styles.delete(style);
    });
  }
}

function collect(): void {
  keyframeRules = [];
  pending = [];
  canvasKeys.clear();
  mutations.length = 0;
  stats = emptyStats();

  const sheets = document.styleSheets;
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    const owner = sheet.ownerNode as HTMLElement | null;
    if (owner && (owner.id === STYLE_ID || owner.hasAttribute('data-hb-own'))) continue;
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      // 跨域且未带 CORS 的样式表会抛 SecurityError；本站实测 0 例，留作兜底
      stats.errors++;
      continue;
    }
    if (!rules) continue;
    stats.sheets++;
    try {
      walk(rules);
    } catch {
      stats.errors++;
    }
  }

  pruneDetachedStyles();
  transform();
}

// ---------------------------------------------------------------------------
// 内联样式
//
// 站点有约 20 个元素带 JS 写入的内联颜色（富文本渲染器），
// 值取自与令牌同名的 JS 调色板常量。CSS 规则管不到内联样式，
// 所以这部分单独处理 —— 但只处理「确实带内联颜色」的元素，不做全量扫描。
// ---------------------------------------------------------------------------

const INLINE_PROPS = [
  'color',
  'background-color',
  'background-image',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-color',
];

const inlineState = new WeakMap<HTMLElement, Map<string, RewriteState>>();

/**
 * 就地改写元素的内联颜色。与关键帧同样处理幂等：
 * 站点（Vue）会重写 style，所以当前值既可能是原值、也可能是我们写过的值。
 *   - 当前值 == applied  -> 仍由我们持有，从 orig 重算
 *   - 否则               -> 站点刚写的，把当前值当作新的原值
 */
function fixInlineStyle(el: HTMLElement): void {
  if (!el.style || el.hasAttribute('data-hb-own')) return;

  let state = inlineState.get(el);
  for (const prop of INLINE_PROPS) {
    const current = el.style.getPropertyValue(prop);
    if (!current) continue;
    if (prop === 'background-image' && current.indexOf('gradient') < 0) continue;

    const entry = state?.get(prop);
    const source = entry && current === entry.applied ? entry.orig : current;
    const next = transformDeclaration(prop, source);
    if (!next || next === current) continue;

    const priority = el.style.getPropertyPriority(prop);
    if (!state) {
      state = new Map();
      inlineState.set(el, state);
    }
    state.set(prop, { orig: source, applied: next, priority });
    el.style.setProperty(prop, next, priority);
  }
}

function fixInlineTree(root: Element): void {
  if (root instanceof HTMLElement && root.hasAttribute('style')) fixInlineStyle(root);
  for (const el of root.querySelectorAll<HTMLElement>('[style]')) fixInlineStyle(el);
}

let inlineObserver: MutationObserver | null = null;
let inlineQueue = new Set<HTMLElement>();
let inlineTimer: number | null = null;

function flushInline(): void {
  inlineTimer = null;
  const items = inlineQueue;
  inlineQueue = new Set();
  items.forEach((el) => {
    if (el.isConnected) fixInlineStyle(el);
  });
}

function queueInline(el: HTMLElement): void {
  inlineQueue.add(el);
  if (inlineTimer === null) inlineTimer = window.setTimeout(flushInline, 80);
}

function startInlineObserver(): void {
  if (inlineObserver) return;
  fixInlineTree(document.body ?? document.documentElement);
  inlineObserver = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') {
        queueInline(r.target as HTMLElement);
        continue;
      }
      for (const n of Array.from(r.addedNodes)) {
        if (n instanceof Element) fixInlineTree(n);
      }
    }
  });
  inlineObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style'],
  });
}

function stopInlineObserver(): void {
  if (inlineObserver) {
    inlineObserver.disconnect();
    inlineObserver = null;
  }
  if (inlineTimer !== null) {
    window.clearTimeout(inlineTimer);
    inlineTimer = null;
  }
  inlineQueue = new Set();
}

function restoreInline(): void {
  // WeakMap 不可枚举，改为在退出时遍历带内联样式的元素
  for (const el of document.querySelectorAll<HTMLElement>('[style]')) {
    const state = inlineState.get(el);
    if (!state) continue;
    state.forEach((entry, prop) => {
      // 仅当该声明仍是我们写入的值时才还原，避免覆盖站点自己的更新
      if (el.style.getPropertyValue(prop) === entry.applied) {
        el.style.setProperty(prop, entry.orig, entry.priority);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// 例外层（人工审计，刻意保持很小）
//
// 通用引擎按「单条声明」判断角色，有一类东西它原理上判不了：
// 站点用「深底 + 浅字」表达强调（实心 CTA）。深色主题里强调应当是
// 「浅底 + 深字」，可引擎无法区分某个深色表面是刻意的反转填充，
// 还是压在图片上的角标遮罩（后者不该反转）。
//
// 实测全站这类失效点只有一处：导航的登录/发布按钮（.nav 变体）。
// 站点自己的 .nav--home 变体本来就是「白底深字」，引擎已能正确反转。
// ---------------------------------------------------------------------------

const EXCEPTIONS_CSS = `
/* 导航主 CTA：浅色下为「深底浅字」，深色下反转为「浅底深字」 */
html.${ROOT_CLASS} .nav {
  --publish-bg: linear-gradient(46deg, #f2f4f7 -.9%, #dfe3e8 100.9%);
  --publish-color: #14191e;
  --publish-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}

/* Element Plus 未内置暗色主题，这里补齐弹层/表单所需令牌 */
html.${ROOT_CLASS} {
  --el-color-white: #1b1f24;
  --el-color-black: #e6e8eb;
  --el-bg-color: #1b1f24;
  --el-bg-color-page: #0e1116;
  --el-bg-color-overlay: #22272e;
  --el-text-color-primary: #e6e8eb;
  --el-text-color-regular: #c9ced6;
  --el-text-color-secondary: #9aa1ab;
  --el-text-color-placeholder: #6f7782;
  --el-text-color-disabled: #4d545d;
  --el-border-color: #2e3540;
  --el-border-color-light: #2a3138;
  --el-border-color-lighter: #262c33;
  --el-border-color-extra-light: #22272e;
  --el-border-color-dark: #3a424e;
  --el-fill-color: #262c33;
  --el-fill-color-light: #22272e;
  --el-fill-color-lighter: #1f242a;
  --el-fill-color-extra-light: #1b1f24;
  --el-fill-color-blank: #1b1f24;
  --el-mask-color: rgba(14, 17, 22, 0.7);
  --el-box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  --el-box-shadow-light: 0 2px 8px rgba(0, 0, 0, 0.4);
}
`;

// ---------------------------------------------------------------------------
// 调度与对外接口
// ---------------------------------------------------------------------------

let styleEl: HTMLStyleElement | null = null;
let headObserver: MutationObserver | null = null;
/** 等 <head> 出现的探针，装上 headObserver 之前临时存在 */
let headProbe: MutationObserver | null = null;
let retimer: number | null = null;
let enabled = false;

function build(): void {
  collect();

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.setAttribute('data-hb-own', '');
  }

  // 例外表刻意保持很小：站点声明本身已被就地改写；生成一张排在末尾的大覆盖表
  // 会打乱站点自己的层叠顺序（见文件顶部说明）。
  if (styleEl.textContent !== EXCEPTIONS_CSS) styleEl.textContent = EXCEPTIONS_CSS;

  // 例外层用更高优先级的选择器（html.hb-dark …），因此挂在哪里都能生效
  const anchor = document.body ?? document.documentElement;
  if (styleEl.parentNode !== anchor || anchor.lastElementChild !== styleEl) {
    anchor.appendChild(styleEl);
  }

  // 关键帧就地改写（覆盖规则无法命中 @keyframes 内部）
  let kf = 0;
  for (const rule of keyframeRules) {
    const style = rule.style;
    if (!style) continue;
    kfStyles.add(style);
    let state = kfState.get(style);
    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      const current = style.getPropertyValue(prop);
      if (!current) continue;
      const entry = state?.get(prop);
      // 仍是我们写入的值 -> 从原值重算，保证幂等
      const mine = !!entry && current === entry.applied;
      const source = mine && entry ? entry.orig : current;
      const next = transformDeclaration(prop, source);
      if (!next) continue;
      if (next === current) {
        if (mine) kf++; // 同 transformStyle：仍由引擎持有就计入
        continue;
      }
      const priority = style.getPropertyPriority(prop);
      if (!state) {
        state = new Map();
        kfState.set(style, state);
      }
      state.set(prop, { orig: source, applied: next, priority });
      try {
        style.setProperty(prop, next, priority);
        kf++;
      } catch {
        /* 只读样式表：忽略 */
      }
    }
  }
  stats.keyframes = kf;
  stats.tracked = ruleStyles.size + kfStyles.size;
}

function scheduleBuild(delay = 400): void {
  if (!enabled || retimer !== null) return;
  retimer = window.setTimeout(() => {
    retimer = null;
    if (enabled) build();
  }, delay);
}

/** SPA 换路由会加载新的 CSS 分片，需要增量重建 */
function startSheetObserver(): void {
  if (headObserver) return;
  const head = document.head;
  if (!head) {
    // document-start 时 <html> 已存在而 <head> 可能还没有被解析出来
    //（与 dark-mode.ts 的 ensureBaseStyle 同一前提）。
    // 这里不能直接放弃：一旦放弃，此后新增的 CSS 分片就再也不会触发重建，
    // 整个会话都会漏掉换路由带来的样式。
    if (headProbe) return;
    headProbe = new MutationObserver(() => {
      if (!document.head) return;
      headProbe?.disconnect();
      headProbe = null;
      if (enabled) startSheetObserver();
    });
    headProbe.observe(document, { childList: true, subtree: true });
    return;
  }
  headObserver = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of Array.from(r.addedNodes)) {
        if (!(n instanceof Element)) continue;
        const tag = n.tagName.toLowerCase();
        if (tag === 'link' || tag === 'style') {
          scheduleBuild(400);
          return;
        }
      }
    }
  });
  headObserver.observe(head, { childList: true, subtree: true });
}

let milestonesBound = false;

function scheduleMilestones(): void {
  // 首屏 CSS 分片陆续到位，多打几个点，代价可忽略
  [0, 300, 1200, 2800].forEach((t) => {
    if (t === 0) build();
    else window.setTimeout(() => { if (enabled) build(); }, t);
  });

  // 文档生命周期事件只绑一次，避免反复开关时累积监听器
  if (milestonesBound) return;
  milestonesBound = true;
  document.addEventListener('DOMContentLoaded', () => scheduleBuild(0), { once: true });
  window.addEventListener('load', () => scheduleBuild(0), { once: true });
}

export function enableDarkEngine(): void {
  if (enabled) return;
  enabled = true;

  document.documentElement.classList.add(ROOT_CLASS);
  // 站点 CSS 里残留两条 `.dark .el-color-picker*` 规则，补上以让 EP 颜色选择器自洽
  document.documentElement.classList.add('dark');
  document.documentElement.style.colorScheme = 'dark';

  scheduleMilestones();
  startInlineObserver();
  startSheetObserver();
}

export function disableDarkEngine(): void {
  enabled = false;

  document.documentElement.classList.remove(ROOT_CLASS);
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';

  stopInlineObserver();
  if (headObserver) {
    headObserver.disconnect();
    headObserver = null;
  }
  if (headProbe) {
    headProbe.disconnect();
    headProbe = null;
  }
  if (retimer !== null) {
    window.clearTimeout(retimer);
    retimer = null;
  }

  restoreInline();

  // 还原就地改写过的站点声明（关键帧 + 普通规则）
  const restore = (styles: Set<CSSStyleDeclaration>, map: WeakMap<CSSStyleDeclaration, Map<string, RewriteState>>) => {
    styles.forEach((style) => {
      const state = map.get(style);
      if (!state) return;
      state.forEach((entry, prop) => {
        try {
          if (style.getPropertyValue(prop) === entry.applied) {
            style.setProperty(prop, entry.orig, entry.priority);
          }
        } catch {
          /* ignore */
        }
      });
    });
    styles.clear();
  };
  restore(ruleStyles, ruleState);
  restore(kfStyles, kfState);

  if (styleEl?.parentNode) styleEl.parentNode.removeChild(styleEl);
  styleEl = null;
}

export function getEngineStats(): EngineStats {
  return { ...stats };
}

/**
 * 强制重建。正常情况由「样式表变化 + 生命周期事件」驱动，
 * 这里供调试与幂等性验收使用（反复重建的结果必须完全一致）。
 */
export function rebuildDarkEngine(): void {
  if (enabled) build();
}

/** 仅用于调试/验收：例外表大小 + 最近一次构建中被改写的前若干条声明 */
export function getEngineCss(): { bytes: number; sample: string[] } {
  return {
    bytes: styleEl?.textContent?.length ?? 0,
    sample: mutations.slice(0, 40),
  };
}
