
export const ROOT_CLASS = 'hb-dark';

const ENGINE_STATE_ATTR = 'hbEngine';

function markEngineReady(): void {
  document.documentElement.dataset[ENGINE_STATE_ATTR] = 'ready';
}

function clearEngineReady(): void {
  delete document.documentElement.dataset[ENGINE_STATE_ATTR];
}

const STYLE_ID = 'hb-dark-overrides';
export interface EngineStats {
  sheets: number;
  scanned: number;
  changed: number;
  declarations: number;
  keyframes: number;
  tracked: number;
  errors: number;
}


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


type Role = 'bg' | 'fg' | 'border' | 'shadow';

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

function roleOfVar(name: string): Role | null {
  if (/shadow/.test(name)) return 'shadow';
  if (/(border|stroke|divider|outline)/.test(name) || /(^|-)line($|-)/.test(name)) return 'border';
  if (/(^|-)(text|color|fg|foreground|ink|label|title|link)($|-)/.test(name)) return 'fg';
  if (/(bg|background|surface|card|panel|fill|plain|white|mask|overlay|paper)/.test(name)) return 'bg';
  return null;
}


const CANVAS: RGBA = { r: 14, g: 17, b: 22, a: 1 };
const CARD: RGBA = { r: 38, g: 44, b: 51, a: 1 };

function isNeutral(c: RGBA): boolean {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const chroma = max - min;
  if (chroma <= 10) return true;
  if (max === 0) return true;
  return chroma / max <= 0.18;
}

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

function surfaceCurve(t0: number): number {
  const t = clamp(t0, 0, 1);
  const inv = 1 - t;
  return 1 - inv * inv;
}

function mapSurface(c: RGBA, selector: string): RGBA | null {
  if (canvasKeys.has(colorKey(c))) {
    return isInteractiveSelector(selector)
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

function mapText(c: RGBA): RGBA | null {
  if (c.a < 0.05) return null;
  const L = lum(c);
  const [h, s, l] = rgbToHsl(c.r, c.g, c.b);

  if (!isNeutral(c)) {
    if (L > 150) return null;
    const nl = clamp(Math.max(l, 0.62), 0.62, 0.8);
    const rgb = hslToRgb(h, Math.min(s, 0.8), nl);
    return { r: rgb[0], g: rgb[1], b: rgb[2], a: c.a };
  }

  if (L >= 190) return null;
  const t = 190 + ((190 - L) / 190) * 55;
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

  if (L < 170) return null;
  const alpha = clamp(0.06 + ((255 - L) / 255) * 0.34, 0.06, 0.3);
  return { r: 255, g: 255, b: 255, a: alpha };
}

function mapColor(role: Role, c: RGBA, selector: string): RGBA | null {
  if (role === 'shadow') return null;
  if (role === 'bg') return mapSurface(c, selector);
  if (role === 'border') return mapBorder(c);
  return mapText(c);
}


const COLOR_TOKEN =
  /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black|whitesmoke|gainsboro|lightgray|lightgrey|silver|darkgray|darkgrey|dimgray|dimgrey|gray|grey|orange|gold|pink|tomato|crimson|seagreen|teal|navy|purple|maroon|olive|lime|aqua|cyan|fuchsia|magenta|red|green|blue|yellow)\b/gi;

const URL_SPAN = /url\([^)]*\)/gi;

const MASK = '\u0001';
const MASK_SPAN = /\u0001(\d+)\u0001/g;

function plainColorOf(value: string): RGBA | null {
  if (value.indexOf('var(') >= 0) return null;
  if (value.indexOf('gradient') >= 0) return null;
  if (value.indexOf('url(') >= 0) return null;
  return parseColor(value.trim());
}

function transformDeclaration(prop: string, value: string, selector = ''): string | null {
  const isCustom = prop.slice(0, 2) === '--';
  const role = roleOfProp(prop);
  if (role === null && !isCustom) return null;
  if (role === 'shadow') return null;

  if (isCustom) {
    const only = plainColorOf(value);
    if (!only) return null;
    const r: Exclude<Role, 'shadow'> = role ?? (lum(only) > 170 ? 'bg' : 'fg');
    const mapped = mapColor(r, only, selector);
    return mapped ? fmt(mapped) : null;
  }

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


interface AnyRule {
  selectorText?: string;
  style?: CSSStyleDeclaration;
  cssRules?: CSSRuleList;
  keyText?: string;
}

interface PendingRule {
  selector: string;
  style: CSSStyleDeclaration;
}

const CANVAS_SELECTOR = /^(?::root|html|body)(\s*,\s*(?::root|html|body))*$/i;

const INTERACTIVE_SELECTOR = /:hover|:focus|:active|\.is-active|\.is-open|\.is-selected|\.is-current|(^|[\s.])active([\s.:,]|$)/;

function isInteractiveSelector(selector: string): boolean {
  return INTERACTIVE_SELECTOR.test(selector);
}

interface RewriteState {
  orig: string;
  applied: string;
  priority: string;
}

let stats: EngineStats = emptyStats();
let keyframeRules: AnyRule[] = [];
let pending: PendingRule[] = [];
const canvasKeys = new Set<string>();

const ruleState = new WeakMap<CSSStyleDeclaration, Map<string, RewriteState>>();
const ruleStyles = new Set<CSSStyleDeclaration>();
const mutations: string[] = [];

const kfState = new WeakMap<CSSStyleDeclaration, Map<string, RewriteState>>();
const kfStyles = new Set<CSSStyleDeclaration>();

function sourceValue(style: CSSStyleDeclaration, prop: string): string {
  const current = style.getPropertyValue(prop);
  const entry = ruleState.get(style)?.get(prop);
  return entry && current === entry.applied ? entry.orig : current;
}

function emptyStats(): EngineStats {
  return { sheets: 0, scanned: 0, changed: 0, declarations: 0, keyframes: 0, tracked: 0, errors: 0 };
}

function walk(rules: CSSRuleList): void {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i] as unknown as AnyRule;
    stats.scanned++;

    if (!rule.selectorText && rule.cssRules) {
      walk(rule.cssRules);
      continue;
    }

    if (rule.keyText !== undefined && rule.style) {
      keyframeRules.push(rule);
      continue;
    }

    if (!rule.selectorText || !rule.style) continue;
    pending.push({ selector: rule.selectorText, style: rule.style });

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

function transformStyle(style: CSSStyleDeclaration, selector: string): number {
  const props: string[] = [];
  for (let j = 0; j < style.length; j++) props.push(style[j]);

  let state = ruleState.get(style);
  let changed = 0;

  for (const prop of props) {
    const current = style.getPropertyValue(prop);
    if (!current) continue;

    const entry = state?.get(prop);
    const mine = !!entry && current === entry.applied;
    const source = mine && entry ? entry.orig : current;
    const next = transformDeclaration(prop, source, selector);
    if (!next) continue;
    if (next === current) {
      if (mine) changed++;
      continue;
    }

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
    }
  }
  return changed;
}

function transform(): void {
  for (const item of pending) {
    const n = transformStyle(item.style, item.selector);
    if (!n) continue;
    stats.changed++;
    stats.declarations += n;
  }
}

function pruneDetachedStyles(): void {
  const isAttachedOwnerless = (sheet: CSSStyleSheet): boolean =>
    document.adoptedStyleSheets.includes(sheet);

  for (const styles of [ruleStyles, kfStyles]) {
    styles.forEach((style) => {
      const sheet = style.parentRule?.parentStyleSheet;
      if (!sheet) return;
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

function startInlineObserver(): void {
  if (inlineObserver) return;
  fixInlineTree(document.body ?? document.documentElement);
  inlineObserver = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') {
        const el = r.target as HTMLElement;
        if (el.isConnected) fixInlineStyle(el);
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
}

function restoreInline(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[style]')) {
    const state = inlineState.get(el);
    if (!state) continue;
    state.forEach((entry, prop) => {
      if (el.style.getPropertyValue(prop) === entry.applied) {
        el.style.setProperty(prop, entry.orig, entry.priority);
      }
    });
  }
}


const EXCEPTIONS_CSS = `
html.${ROOT_CLASS} .nav {
  --publish-bg: #f2f4f7;
  --publish-color: #14191e;
  --publish-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}

html.${ROOT_CLASS} .hot-topic__look,
html.${ROOT_CLASS} .link-section-user .link-user__follow-btn:not(.followed),
html.${ROOT_CLASS} #page-bbs-link .page-header__user-info .page-header__follow-btn:not(.followed) {
  background-image: none;
  background-color: #464b50;
}

html.${ROOT_CLASS} .search-input .el-input__wrapper {
  box-shadow: none;
}

html.${ROOT_CLASS} .bbs-content__image {
  box-shadow: none;
}

@media (prefers-color-scheme: dark) {
  html.${ROOT_CLASS} .article-vote .vote-wrapper .vote-submit.active p {
    background-image: none;
    background-color: #a1a7b2;
    color: #101112;
  }
}

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


let styleEl: HTMLStyleElement | null = null;
let headObserver: MutationObserver | null = null;
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

  if (styleEl.textContent !== EXCEPTIONS_CSS) styleEl.textContent = EXCEPTIONS_CSS;

  const anchor = document.body ?? document.documentElement;
  if (styleEl.parentNode !== anchor || anchor.lastElementChild !== styleEl) {
    anchor.appendChild(styleEl);
  }

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
      const mine = !!entry && current === entry.applied;
      const source = mine && entry ? entry.orig : current;
      const next = transformDeclaration(prop, source);
      if (!next) continue;
      if (next === current) {
        if (mine) kf++;
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
      }
    }
  }
  stats.keyframes = kf;
  stats.tracked = ruleStyles.size + kfStyles.size;
  markEngineReady();
}

function scheduleBuild(delay = 400): void {
  if (!enabled || retimer !== null) return;
  retimer = window.setTimeout(() => {
    retimer = null;
    if (enabled) build();
  }, delay);
}

let immediateQueued = false;

function scheduleImmediateBuild(): void {
  if (!enabled || immediateQueued) return;
  immediateQueued = true;
  Promise.resolve().then(() => {
    immediateQueued = false;
    if (enabled) build();
  });
}

let visibilityBound = false;

function startVisibilityCatchUp(): void {
  if (visibilityBound) return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleImmediateBuild();
  });
}

function startSheetObserver(): void {
  if (headObserver) return;
  const head = document.head;
  if (!head) {
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
    let landed = false;
    for (const r of records) {
      for (const n of Array.from(r.addedNodes)) {
        if (!(n instanceof Element)) continue;
        const tag = n.tagName.toLowerCase();
        if (tag === 'style') {
          landed = true;
          continue;
        }
        if (tag !== 'link') continue;
        const link = n as HTMLLinkElement;
        const rel = (link.getAttribute('rel') || '').toLowerCase();
        if (rel !== 'stylesheet') continue;
        if (link.sheet) landed = true;
        else link.addEventListener('load', () => scheduleImmediateBuild(), { once: true });
      }
    }
    scheduleBuild(400);
    if (landed) scheduleImmediateBuild();
  });
  headObserver.observe(head, { childList: true, subtree: true });
}

let milestonesBound = false;

function scheduleMilestones(): void {
  [0, 300, 1200, 2800].forEach((t) => {
    if (t === 0) build();
    else window.setTimeout(() => { if (enabled) build(); }, t);
  });

  if (milestonesBound) return;
  milestonesBound = true;
  document.addEventListener('DOMContentLoaded', () => scheduleBuild(0), { once: true });
  window.addEventListener('load', () => scheduleBuild(0), { once: true });
}

export function enableDarkEngine(): void {
  if (enabled) return;
  enabled = true;

  document.documentElement.classList.add(ROOT_CLASS);
  document.documentElement.classList.add('dark');
  document.documentElement.style.colorScheme = 'dark';

  scheduleMilestones();
  startInlineObserver();
  startSheetObserver();
  startVisibilityCatchUp();
}

export function disableDarkEngine(): void {
  enabled = false;

  document.documentElement.classList.remove(ROOT_CLASS);
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
  clearEngineReady();

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

export function rebuildDarkEngine(): void {
  if (enabled) build();
}

export function getEngineCss(): { bytes: number; sample: string[] } {
  return {
    bytes: styleEl?.textContent?.length ?? 0,
    sample: mutations.slice(0, 40),
  };
}
