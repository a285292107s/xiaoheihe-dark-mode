// ==UserScript==
// @name         小黑盒深色模式
// @namespace    xiaoheihe-dark-mode
// @version      0.8.0
// @author       油猴脚本-小黑盒页面优化
// @description  为小黑盒网页版（xiaoheihe.cn）提供深色模式、页面精简、复制解锁、一级评论免打扰与楼中楼卡片化：按角色重映射站点 CSS 规则（含伪元素与交互态），可隐藏顶部「首页」入口与社区页右侧栏，可在站点回复编辑器夺焦毁掉选区、剪贴板数据被清空时把选中内容救回剪贴板，可把一级评论「回复此楼」的触发从「点整行」收进发言内容右下方一枚纸飞机 —— 点正文只选中、不弹框；楼中楼每条回复则排成卡片（第一行头像/用户名/回复对象/时间，第二行起正文），回复入口是卡片末尾的纸飞机图标，点它即展开站点回复框并引用这一条。深色、精简、评论区增强（免打扰与卡片化一起开关）三项各自记忆偏好、可随时切换；复制解锁常驻开启，没有开关按钮。
// @license      MIT
// @icon         https://cdn.max-c.com/heybox/logo/app_251.png
// @homepageURL  https://github.com/a285292107s/xiaoheihe-dark-mode
// @downloadURL  https://raw.githubusercontent.com/a285292107s/xiaoheihe-dark-mode/main/dist/xiaoheihe-dark-mode.user.js
// @updateURL    https://raw.githubusercontent.com/a285292107s/xiaoheihe-dark-mode/main/dist/xiaoheihe-dark-mode.user.js
// @match        https://www.xiaoheihe.cn/*
// @match        https://xiaoheihe.cn/*
// @run-at       document-start
// ==/UserScript==

(function() {
	"use strict";
	var ROOT_CLASS$1 = "hb-dark";
	var ENGINE_STATE_ATTR = "hbEngine";
	function markEngineReady() {
		document.documentElement.dataset[ENGINE_STATE_ATTR] = "ready";
	}
	function clearEngineReady() {
		delete document.documentElement.dataset[ENGINE_STATE_ATTR];
	}
	var STYLE_ID$4 = "hb-dark-overrides";
	var NAMED = {
		white: [
			255,
			255,
			255
		],
		black: [
			0,
			0,
			0
		],
		red: [
			255,
			0,
			0
		],
		green: [
			0,
			128,
			0
		],
		blue: [
			0,
			0,
			255
		],
		gray: [
			128,
			128,
			128
		],
		grey: [
			128,
			128,
			128
		],
		silver: [
			192,
			192,
			192
		],
		whitesmoke: [
			245,
			245,
			245
		],
		gainsboro: [
			220,
			220,
			220
		],
		lightgray: [
			211,
			211,
			211
		],
		lightgrey: [
			211,
			211,
			211
		],
		dimgray: [
			105,
			105,
			105
		],
		dimgrey: [
			105,
			105,
			105
		],
		darkgray: [
			169,
			169,
			169
		],
		darkgrey: [
			169,
			169,
			169
		],
		orange: [
			255,
			165,
			0
		],
		yellow: [
			255,
			255,
			0
		],
		gold: [
			255,
			215,
			0
		],
		pink: [
			255,
			192,
			203
		],
		tomato: [
			255,
			99,
			71
		],
		crimson: [
			220,
			20,
			60
		],
		seagreen: [
			46,
			139,
			87
		],
		teal: [
			0,
			128,
			128
		],
		navy: [
			0,
			0,
			128
		],
		purple: [
			128,
			0,
			128
		],
		maroon: [
			128,
			0,
			0
		],
		olive: [
			128,
			128,
			0
		],
		lime: [
			0,
			255,
			0
		],
		aqua: [
			0,
			255,
			255
		],
		cyan: [
			0,
			255,
			255
		],
		fuchsia: [
			255,
			0,
			255
		],
		magenta: [
			255,
			0,
			255
		]
	};
	function parseColor(input) {
		if (!input) return null;
		const s = String(input).trim().toLowerCase();
		if (!s || s === "transparent" || s === "currentcolor" || s === "inherit" || s === "initial" || s === "unset" || s === "none" || s === "auto") return null;
		if (s.charCodeAt(0) === 35) {
			let h = s.slice(1);
			if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
			if (h.length !== 6 && h.length !== 8) return null;
			if (!/^[0-9a-f]+$/.test(h)) return null;
			return {
				r: parseInt(h.slice(0, 2), 16),
				g: parseInt(h.slice(2, 4), 16),
				b: parseInt(h.slice(4, 6), 16),
				a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
			};
		}
		const m = s.match(/^rgba?\(([^)]+)\)$/);
		if (m) {
			const parts = m[1].split(/[,\s/]+/).filter(Boolean);
			if (parts.length < 3) return null;
			let a = 1;
			if (parts.length >= 4) a = parts[3].indexOf("%") >= 0 ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
			return {
				r: parseFloat(parts[0]),
				g: parseFloat(parts[1]),
				b: parseFloat(parts[2]),
				a
			};
		}
		const m2 = s.match(/^hsla?\(([^)]+)\)$/);
		if (m2) {
			const p = m2[1].split(/[,\s/]+/).filter(Boolean);
			if (p.length < 3) return null;
			const rgb = hslToRgb(parseFloat(p[0]), parseFloat(p[1]) / 100, parseFloat(p[2]) / 100);
			const a = p.length >= 4 ? p[3].indexOf("%") >= 0 ? parseFloat(p[3]) / 100 : parseFloat(p[3]) : 1;
			return {
				r: rgb[0],
				g: rgb[1],
				b: rgb[2],
				a
			};
		}
		const named = NAMED[s];
		return named ? {
			r: named[0],
			g: named[1],
			b: named[2],
			a: 1
		} : null;
	}
	function rgbToHsl(r, g, b) {
		r /= 255;
		g /= 255;
		b /= 255;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const l = (max + min) / 2;
		let h = 0;
		let s = 0;
		if (max !== min) {
			const d = max - min;
			s = l > .5 ? d / (2 - max - min) : d / (max + min);
			if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
			else if (max === g) h = ((b - r) / d + 2) / 6;
			else h = ((r - g) / d + 4) / 6;
		}
		return [
			h * 360,
			s,
			l
		];
	}
	function hslToRgb(h, s, l) {
		const hn = (h % 360 + 360) % 360 / 360;
		if (s === 0) {
			const v = Math.round(l * 255);
			return [
				v,
				v,
				v
			];
		}
		const q = l < .5 ? l * (1 + s) : l + s - l * s;
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
		return [
			Math.round(f(hn + 1 / 3) * 255),
			Math.round(f(hn) * 255),
			Math.round(f(hn - 1 / 3) * 255)
		];
	}
	function lum(c) {
		return .2126 * c.r + .7152 * c.g + .0722 * c.b;
	}
	function clamp(v, lo, hi) {
		return v < lo ? lo : v > hi ? hi : v;
	}
	function fmt(c) {
		const r = Math.round(clamp(c.r, 0, 255));
		const g = Math.round(clamp(c.g, 0, 255));
		const b = Math.round(clamp(c.b, 0, 255));
		if (c.a >= 1) return `rgb(${r}, ${g}, ${b})`;
		return `rgba(${r}, ${g}, ${b}, ${Math.round(c.a * 1e3) / 1e3})`;
	}
	function roleOfProp(prop) {
		const p = prop.toLowerCase();
		if (p.slice(0, 2) === "--") return roleOfVar(p);
		if (p === "color" || p === "fill" || p === "stroke" || p === "caret-color" || p === "text-decoration-color" || p === "-webkit-text-fill-color" || p === "flood-color" || p === "-webkit-text-stroke-color") return "fg";
		if (p === "stop-color") return "bg";
		if (p.indexOf("background") === 0) return "bg";
		if (p.indexOf("shadow") >= 0) return "shadow";
		if (p.indexOf("border") >= 0 || p.indexOf("outline") >= 0 || p.indexOf("column-rule") >= 0 || p === "text-decoration") return "border";
		if (p === "accent-color") return "bg";
		return null;
	}
	function roleOfVar(name) {
		if (/shadow/.test(name)) return "shadow";
		if (/(border|stroke|divider|outline)/.test(name) || /(^|-)line($|-)/.test(name)) return "border";
		if (/(^|-)(text|color|fg|foreground|ink|label|title|link)($|-)/.test(name)) return "fg";
		if (/(bg|background|surface|card|panel|fill|plain|white|mask|overlay|paper)/.test(name)) return "bg";
		return null;
	}
	var CANVAS = {
		r: 14,
		g: 17,
		b: 22,
		a: 1
	};
	var CARD = {
		r: 38,
		g: 44,
		b: 51,
		a: 1
	};
	function isNeutral(c) {
		const max = Math.max(c.r, c.g, c.b);
		const chroma = max - Math.min(c.r, c.g, c.b);
		if (chroma <= 10) return true;
		if (max === 0) return true;
		return chroma / max <= .18;
	}
	function colorKey(c) {
		return `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`;
	}
	function lerpRgb(a, b, t, alpha) {
		return {
			r: a.r + (b.r - a.r) * t,
			g: a.g + (b.g - a.g) * t,
			b: a.b + (b.b - a.b) * t,
			a: alpha
		};
	}
	function surfaceCurve(t0) {
		const inv = 1 - clamp(t0, 0, 1);
		return 1 - inv * inv;
	}
	function mapSurface(c, selector) {
		if (canvasKeys.has(colorKey(c))) return isInteractiveSelector(selector) ? lerpRgb(CANVAS, CARD, 1, c.a) : {
			...CANVAS,
			a: c.a
		};
		const L = lum(c);
		if (isNeutral(c)) {
			if (L < 185) return null;
			return lerpRgb(CANVAS, CARD, surfaceCurve((L - 185) / 70), c.a);
		}
		if (L > 150) {
			const [h, s] = rgbToHsl(c.r, c.g, c.b);
			const nl = .1 + (clamp(L, 150, 255) - 150) / 105 * .1;
			const rgb = hslToRgb(h, Math.min(s, .5), nl);
			return {
				r: rgb[0],
				g: rgb[1],
				b: rgb[2],
				a: c.a
			};
		}
		return null;
	}
	function mapText(c) {
		if (c.a < .05) return null;
		const L = lum(c);
		const [h, s, l] = rgbToHsl(c.r, c.g, c.b);
		if (!isNeutral(c)) {
			if (L > 150) return null;
			const nl = clamp(Math.max(l, .62), .62, .8);
			const rgb = hslToRgb(h, Math.min(s, .8), nl);
			return {
				r: rgb[0],
				g: rgb[1],
				b: rgb[2],
				a: c.a
			};
		}
		if (L >= 190) return null;
		const t = 190 + (190 - L) / 190 * 55;
		const v = Math.round(clamp(t, 150, 245));
		return {
			r: v,
			g: v,
			b: Math.round(clamp(v * 1.012, 0, 255)),
			a: c.a
		};
	}
	function mapBorder(c) {
		if (c.a < .06) return null;
		const L = lum(c);
		const [h, s] = rgbToHsl(c.r, c.g, c.b);
		if (!isNeutral(c)) {
			if (L < 130) return null;
			const rgb = hslToRgb(h, Math.min(s, .5), .45);
			return {
				r: rgb[0],
				g: rgb[1],
				b: rgb[2],
				a: c.a
			};
		}
		if (L < 170) return null;
		return {
			r: 255,
			g: 255,
			b: 255,
			a: clamp(.06 + (255 - L) / 255 * .34, .06, .3)
		};
	}
	function mapColor(role, c, selector) {
		if (role === "shadow") return null;
		if (role === "bg") return mapSurface(c, selector);
		if (role === "border") return mapBorder(c);
		return mapText(c);
	}
	var COLOR_TOKEN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black|whitesmoke|gainsboro|lightgray|lightgrey|silver|darkgray|darkgrey|dimgray|dimgrey|gray|grey|orange|gold|pink|tomato|crimson|seagreen|teal|navy|purple|maroon|olive|lime|aqua|cyan|fuchsia|magenta|red|green|blue|yellow)\b/gi;
	var URL_SPAN = /url\([^)]*\)/gi;
	var MASK = "";
	var MASK_SPAN = /\u0001(\d+)\u0001/g;
	function plainColorOf(value) {
		if (value.indexOf("var(") >= 0) return null;
		if (value.indexOf("gradient") >= 0) return null;
		if (value.indexOf("url(") >= 0) return null;
		return parseColor(value.trim());
	}
	function transformDeclaration(prop, value, selector = "") {
		const isCustom = prop.slice(0, 2) === "--";
		const role = roleOfProp(prop);
		if (role === null && !isCustom) return null;
		if (role === "shadow") return null;
		if (isCustom) {
			const only = plainColorOf(value);
			if (!only) return null;
			const mapped = mapColor(role ?? (lum(only) > 170 ? "bg" : "fg"), only, selector);
			return mapped ? fmt(mapped) : null;
		}
		const urls = [];
		const masked = String(value).replace(URL_SPAN, (m) => {
			urls.push(m);
			return `${MASK}${urls.length - 1}${MASK}`;
		});
		let changed = false;
		const out = masked.replace(COLOR_TOKEN, (tok) => {
			const c = parseColor(tok);
			if (!c) return tok;
			const mapped = mapColor(role, c, selector);
			if (!mapped) return tok;
			changed = true;
			return fmt(mapped);
		});
		if (!changed) return null;
		return urls.length ? out.replace(MASK_SPAN, (_m, i) => urls[+i]) : out;
	}
	var CANVAS_SELECTOR = /^(?::root|html|body)(\s*,\s*(?::root|html|body))*$/i;
	var INTERACTIVE_SELECTOR = /:hover|:focus|:active|\.is-active|\.is-open|\.is-selected|\.is-current|(^|[\s.])active([\s.:,]|$)/;
	function isInteractiveSelector(selector) {
		return INTERACTIVE_SELECTOR.test(selector);
	}
	var stats = emptyStats();
	var keyframeRules = [];
	var pending = [];
	var canvasKeys = new Set();
	var ruleState = new WeakMap();
	var ruleStyles = new Set();
	var mutations = [];
	var kfState = new WeakMap();
	var kfStyles = new Set();
	function sourceValue(style, prop) {
		const current = style.getPropertyValue(prop);
		const entry = ruleState.get(style)?.get(prop);
		return entry && current === entry.applied ? entry.orig : current;
	}
	function emptyStats() {
		return {
			sheets: 0,
			scanned: 0,
			changed: 0,
			declarations: 0,
			keyframes: 0,
			tracked: 0,
			errors: 0
		};
	}
	function walk(rules) {
		for (let i = 0; i < rules.length; i++) {
			const rule = rules[i];
			stats.scanned++;
			if (!rule.selectorText && rule.cssRules) {
				walk(rule.cssRules);
				continue;
			}
			if (rule.keyText !== void 0 && rule.style) {
				keyframeRules.push(rule);
				continue;
			}
			if (!rule.selectorText || !rule.style) continue;
			pending.push({
				selector: rule.selectorText,
				style: rule.style
			});
			if (CANVAS_SELECTOR.test(rule.selectorText.trim())) {
				const style = rule.style;
				for (let j = 0; j < style.length; j++) {
					const prop = style[j].toLowerCase();
					if (prop !== "background-color" && prop !== "background") continue;
					const only = plainColorOf(sourceValue(style, style[j]));
					if (only) canvasKeys.add(colorKey(only));
				}
			}
		}
	}
	function transformStyle(style, selector) {
		const props = [];
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
			state.set(prop, {
				orig: source,
				applied: next,
				priority
			});
			try {
				style.setProperty(prop, next, priority);
				ruleStyles.add(style);
				changed++;
				if (mutations.length < 60) mutations.push(`${selector} { ${prop}: ${source} -> ${next}${priority ? " !important" : ""} }`);
			} catch {}
		}
		return changed;
	}
	function transform() {
		for (const item of pending) {
			const n = transformStyle(item.style, item.selector);
			if (!n) continue;
			stats.changed++;
			stats.declarations += n;
		}
	}
	function pruneDetachedStyles() {
		const isAttachedOwnerless = (sheet) => document.adoptedStyleSheets.includes(sheet);
		for (const styles of [ruleStyles, kfStyles]) styles.forEach((style) => {
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
	function collect() {
		keyframeRules = [];
		pending = [];
		canvasKeys.clear();
		mutations.length = 0;
		stats = emptyStats();
		const sheets = document.styleSheets;
		for (let i = 0; i < sheets.length; i++) {
			const sheet = sheets[i];
			const owner = sheet.ownerNode;
			if (owner && (owner.id === STYLE_ID$4 || owner.hasAttribute("data-hb-own"))) continue;
			let rules = null;
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
	var INLINE_PROPS = [
		"color",
		"background-color",
		"background-image",
		"border-top-color",
		"border-right-color",
		"border-bottom-color",
		"border-left-color",
		"border-color"
	];
	var inlineState = new WeakMap();
	function fixInlineStyle(el) {
		if (!el.style || el.hasAttribute("data-hb-own")) return;
		let state = inlineState.get(el);
		for (const prop of INLINE_PROPS) {
			const current = el.style.getPropertyValue(prop);
			if (!current) continue;
			if (prop === "background-image" && current.indexOf("gradient") < 0) continue;
			const entry = state?.get(prop);
			const source = entry && current === entry.applied ? entry.orig : current;
			const next = transformDeclaration(prop, source);
			if (!next || next === current) continue;
			const priority = el.style.getPropertyPriority(prop);
			if (!state) {
				state = new Map();
				inlineState.set(el, state);
			}
			state.set(prop, {
				orig: source,
				applied: next,
				priority
			});
			el.style.setProperty(prop, next, priority);
		}
	}
	function fixInlineTree(root) {
		if (root instanceof HTMLElement && root.hasAttribute("style")) fixInlineStyle(root);
		for (const el of root.querySelectorAll("[style]")) fixInlineStyle(el);
	}
	var inlineObserver = null;
	function startInlineObserver() {
		if (inlineObserver) return;
		fixInlineTree(document.body ?? document.documentElement);
		inlineObserver = new MutationObserver((records) => {
			for (const r of records) {
				if (r.type === "attributes") {
					const el = r.target;
					if (el.isConnected) fixInlineStyle(el);
					continue;
				}
				for (const n of Array.from(r.addedNodes)) if (n instanceof Element) fixInlineTree(n);
			}
		});
		inlineObserver.observe(document.documentElement, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["style"]
		});
	}
	function stopInlineObserver() {
		if (inlineObserver) {
			inlineObserver.disconnect();
			inlineObserver = null;
		}
	}
	function restoreInline() {
		for (const el of document.querySelectorAll("[style]")) {
			const state = inlineState.get(el);
			if (!state) continue;
			state.forEach((entry, prop) => {
				if (el.style.getPropertyValue(prop) === entry.applied) el.style.setProperty(prop, entry.orig, entry.priority);
			});
		}
	}
	var EXCEPTIONS_CSS = `
html.${ROOT_CLASS$1} .nav {
  --publish-bg: #f2f4f7;
  --publish-color: #14191e;
  --publish-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}

html.${ROOT_CLASS$1} .hot-topic__look,
html.${ROOT_CLASS$1} .link-section-user .link-user__follow-btn:not(.followed),
html.${ROOT_CLASS$1} #page-bbs-link .page-header__user-info .page-header__follow-btn:not(.followed) {
  background-image: none;
  background-color: #464b50;
}

html.${ROOT_CLASS$1} .search-input .el-input__wrapper {
  box-shadow: none;
}

html.${ROOT_CLASS$1} .bbs-content__image {
  box-shadow: none;
}

@media (prefers-color-scheme: dark) {
  html.${ROOT_CLASS$1} .article-vote .vote-wrapper .vote-submit.active p {
    background-image: none;
    background-color: #a1a7b2;
    color: #101112;
  }
}

html.${ROOT_CLASS$1} {
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
	var styleEl = null;
	var headObserver = null;
	var headProbe = null;
	var retimer = null;
	var enabled = false;
	function build() {
		collect();
		if (!styleEl) {
			styleEl = document.createElement("style");
			styleEl.id = STYLE_ID$4;
			styleEl.setAttribute("data-hb-own", "");
		}
		if (styleEl.textContent !== EXCEPTIONS_CSS) styleEl.textContent = EXCEPTIONS_CSS;
		const anchor = document.body ?? document.documentElement;
		if (styleEl.parentNode !== anchor || anchor.lastElementChild !== styleEl) anchor.appendChild(styleEl);
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
				state.set(prop, {
					orig: source,
					applied: next,
					priority
				});
				try {
					style.setProperty(prop, next, priority);
					kf++;
				} catch {}
			}
		}
		stats.keyframes = kf;
		stats.tracked = ruleStyles.size + kfStyles.size;
		markEngineReady();
	}
	function scheduleBuild(delay = 400) {
		if (!enabled || retimer !== null) return;
		retimer = window.setTimeout(() => {
			retimer = null;
			if (enabled) build();
		}, delay);
	}
	var immediateQueued = false;
	function scheduleImmediateBuild() {
		if (!enabled || immediateQueued) return;
		immediateQueued = true;
		Promise.resolve().then(() => {
			immediateQueued = false;
			if (enabled) build();
		});
	}
	var visibilityBound = false;
	function startVisibilityCatchUp() {
		if (visibilityBound) return;
		visibilityBound = true;
		document.addEventListener("visibilitychange", () => {
			if (!document.hidden) scheduleImmediateBuild();
		});
	}
	function startSheetObserver() {
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
			headProbe.observe(document, {
				childList: true,
				subtree: true
			});
			return;
		}
		headObserver = new MutationObserver((records) => {
			let landed = false;
			for (const r of records) for (const n of Array.from(r.addedNodes)) {
				if (!(n instanceof Element)) continue;
				const tag = n.tagName.toLowerCase();
				if (tag === "style") {
					landed = true;
					continue;
				}
				if (tag !== "link") continue;
				const link = n;
				if ((link.getAttribute("rel") || "").toLowerCase() !== "stylesheet") continue;
				if (link.sheet) landed = true;
				else link.addEventListener("load", () => scheduleImmediateBuild(), { once: true });
			}
			scheduleBuild(400);
			if (landed) scheduleImmediateBuild();
		});
		headObserver.observe(head, {
			childList: true,
			subtree: true
		});
	}
	var milestonesBound = false;
	function scheduleMilestones() {
		[
			0,
			300,
			1200,
			2800
		].forEach((t) => {
			if (t === 0) build();
			else window.setTimeout(() => {
				if (enabled) build();
			}, t);
		});
		if (milestonesBound) return;
		milestonesBound = true;
		document.addEventListener("DOMContentLoaded", () => scheduleBuild(0), { once: true });
		window.addEventListener("load", () => scheduleBuild(0), { once: true });
	}
	function enableDarkEngine() {
		if (enabled) return;
		enabled = true;
		document.documentElement.classList.add(ROOT_CLASS$1);
		document.documentElement.classList.add("dark");
		document.documentElement.style.colorScheme = "dark";
		scheduleMilestones();
		startInlineObserver();
		startSheetObserver();
		startVisibilityCatchUp();
	}
	function disableDarkEngine() {
		enabled = false;
		document.documentElement.classList.remove(ROOT_CLASS$1);
		document.documentElement.classList.remove("dark");
		document.documentElement.style.colorScheme = "";
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
		const restore = (styles, map) => {
			styles.forEach((style) => {
				const state = map.get(style);
				if (!state) return;
				state.forEach((entry, prop) => {
					try {
						if (style.getPropertyValue(prop) === entry.applied) style.setProperty(prop, entry.orig, entry.priority);
					} catch {}
				});
			});
			styles.clear();
		};
		restore(ruleStyles, ruleState);
		restore(kfStyles, kfState);
		if (styleEl?.parentNode) styleEl.parentNode.removeChild(styleEl);
		styleEl = null;
	}
	function getEngineStats() {
		return { ...stats };
	}
	function rebuildDarkEngine() {
		if (enabled) build();
	}
	function getEngineCss() {
		return {
			bytes: styleEl?.textContent?.length ?? 0,
			sample: mutations.slice(0, 40)
		};
	}
	var dark_base_default = "html.hb-dark{--lightningcss-light: ;--lightningcss-dark:initial;color-scheme:dark;background-color:#0e1116!important}html.hb-dark body{background-color:#0e1116}html.hb-dark ::-webkit-scrollbar{width:8px;height:8px}html.hb-dark ::-webkit-scrollbar-track{background:#0e1116}html.hb-dark ::-webkit-scrollbar-thumb{background:#333b45;border-radius:4px}html.hb-dark ::-webkit-scrollbar-thumb:hover{background:#4a5360}html.hb-dark input::placeholder,html.hb-dark textarea::placeholder{color:#6f7782}html.hb-dark ::selection{background:#5eb0ff52}";
	var STORAGE_KEY$4 = "heybox-dark-mode";
	var BASE_STYLE_ID = "hb-dark-base";
	var listeners$3 = new Set();
	function onDarkChange(fn) {
		listeners$3.add(fn);
		return () => {
			listeners$3.delete(fn);
		};
	}
	function isDarkEnabled() {
		try {
			const saved = localStorage.getItem(STORAGE_KEY$4);
			if (saved === "1") return true;
			if (saved === "0") return false;
		} catch {}
		return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
	}
	function ensureBaseStyle() {
		if (document.getElementById(BASE_STYLE_ID)) return;
		const el = document.createElement("style");
		el.id = BASE_STYLE_ID;
		el.setAttribute("data-hb-own", "");
		el.textContent = dark_base_default;
		(document.head ?? document.documentElement).appendChild(el);
	}
	function applyDark(enabled) {
		const root = document.documentElement;
		if (!root) return;
		if (enabled) {
			root.classList.add(ROOT_CLASS$1);
			ensureBaseStyle();
			enableDarkEngine();
		} else {
			disableDarkEngine();
			root.classList.remove(ROOT_CLASS$1);
			document.getElementById(BASE_STYLE_ID)?.remove();
		}
		try {
			localStorage.setItem(STORAGE_KEY$4, enabled ? "1" : "0");
		} catch {}
		for (const fn of [...listeners$3]) try {
			fn(enabled);
		} catch (err) {
			console.error("[hb-dark] listener failed", err);
		}
	}
	function initDarkMode() {
		const enabled = isDarkEnabled();
		applyDark(enabled);
		return enabled;
	}
	function whenDocumentElementReady(fn) {
		if (document.documentElement) {
			fn();
			return;
		}
		const observer = new MutationObserver(() => {
			if (document.documentElement) {
				observer.disconnect();
				fn();
			}
		});
		observer.observe(document, {
			childList: true,
			subtree: true
		});
	}
	function exposeEngineHooks() {
		const w = window;
		w.__hbSetDark = (on) => applyDark(on);
		w.__hbEngineStats = () => getEngineStats();
		w.__hbEngineCss = () => getEngineCss();
		w.__hbRebuild = () => rebuildDarkEngine();
		w.__hbIsDark = () => isDarkEnabled();
	}
	var declutter_default = "html.hb-declutter .nav .nav-content .nav-links>.nav-link:first-child,html.hb-declutter #page-bbs-community>.content>.right{display:none}html.hb-declutter #page-bbs-community>.content{justify-content:center}html.hb-declutter #page-bbs-community>.content>.list{max-width:none}";
	var pendingStyles = new Map();
	var headWaiter = null;
	function injectNow(id, css, head) {
		const el = document.createElement("style");
		el.id = id;
		el.setAttribute("data-hb-own", "");
		el.textContent = css;
		head.appendChild(el);
		pendingStyles.delete(id);
	}
	function ensureOwnStyle(id, css) {
		if (document.getElementById(id)) return;
		const head = document.head;
		if (!head) {
			pendingStyles.set(id, css);
			if (headWaiter) return;
			headWaiter = new MutationObserver(() => {
				if (!document.head) return;
				headWaiter?.disconnect();
				headWaiter = null;
				for (const [pendingId, pendingCss] of [...pendingStyles]) ensureOwnStyle(pendingId, pendingCss);
			});
			headWaiter.observe(document, {
				childList: true,
				subtree: true
			});
			return;
		}
		injectNow(id, css, head);
	}
	function removeOwnStyle(id) {
		pendingStyles.delete(id);
		document.getElementById(id)?.remove();
	}
	var STORAGE_KEY$3 = "heybox-declutter";
	var STYLE_ID$3 = "hb-declutter";
	var DECLUTTER_CLASS = "hb-declutter";
	var listeners$2 = new Set();
	function onDeclutterChange(fn) {
		listeners$2.add(fn);
		return () => {
			listeners$2.delete(fn);
		};
	}
	function isDeclutterEnabled() {
		try {
			return localStorage.getItem(STORAGE_KEY$3) !== "0";
		} catch {
			return true;
		}
	}
	function applyDeclutter(enabled) {
		const root = document.documentElement;
		if (!root) return;
		if (enabled) {
			root.classList.add(DECLUTTER_CLASS);
			ensureOwnStyle(STYLE_ID$3, declutter_default);
		} else {
			root.classList.remove(DECLUTTER_CLASS);
			removeOwnStyle(STYLE_ID$3);
		}
		try {
			localStorage.setItem(STORAGE_KEY$3, enabled ? "1" : "0");
		} catch {}
		for (const fn of [...listeners$2]) try {
			fn(enabled);
		} catch (err) {
			console.error("[hb-declutter] listener failed", err);
		}
	}
	function initDeclutter() {
		const enabled = isDeclutterEnabled();
		applyDeclutter(enabled);
		return enabled;
	}
	function exposeDeclutterHooks() {
		const w = window;
		w.__hbSetDeclutter = (on) => applyDeclutter(on);
		w.__hbIsDeclutter = () => isDeclutterEnabled();
	}
	var copy_default = "html.hb-copy,html.hb-copy body{-webkit-user-select:text;user-select:text}";
	var STORAGE_KEY$2 = "heybox-copy";
	var STYLE_ID$2 = "hb-copy";
	var COPY_CLASS = "hb-copy";
	var SNAPSHOT_TTL = 3e3;
	var FOCUS_GRAB_WINDOW = 500;
	var rescueAttached = false;
	var snapshot = null;
	var focusGrabAt = 0;
	var lastMouseDownAt = 0;
	var lastMouseDownInEditable = false;
	function nodeToElement$1(node) {
		if (!node) return null;
		const n = node;
		if (n.nodeType === 1) return n;
		return n.parentElement;
	}
	function selectionInEditable(sel) {
		for (const node of [sel.anchorNode, sel.focusNode]) {
			const el = nodeToElement$1(node);
			if (el && el.isContentEditable) return true;
		}
		return false;
	}
	function onSelectionChange() {
		const sel = window.getSelection();
		if (!sel) return;
		if (sel.rangeCount > 0 && !sel.isCollapsed) {
			const text = sel.toString();
			if (text && !selectionInEditable(sel)) snapshot = {
				text,
				revokedAt: 0
			};
			return;
		}
		if (snapshot && snapshot.revokedAt === 0) {
			if (focusGrabAt !== 0 && Date.now() - focusGrabAt <= FOCUS_GRAB_WINDOW) snapshot.revokedAt = Date.now();
			else snapshot = null;
		}
	}
	function onMouseDown(event) {
		lastMouseDownAt = Date.now();
		const el = nodeToElement$1(event.target);
		lastMouseDownInEditable = !!(el && (el.isContentEditable || el.closest("input, textarea")));
	}
	function onFocusIn(event) {
		const el = nodeToElement$1(event.target);
		if (!el || !el.isContentEditable) return;
		if (Date.now() - lastMouseDownAt <= FOCUS_GRAB_WINDOW && lastMouseDownInEditable) {
			snapshot = null;
			focusGrabAt = 0;
			return;
		}
		focusGrabAt = Date.now();
	}
	function onCopy(event) {
		const sel = window.getSelection();
		const cd = event.clipboardData;
		if (!cd) return;
		let text = "";
		if (sel && sel.rangeCount > 0 && !sel.isCollapsed && !selectionInEditable(sel)) text = sel.toString();
		if (!text && snapshot && snapshot.revokedAt !== 0 && Date.now() - snapshot.revokedAt <= SNAPSHOT_TTL) text = snapshot.text;
		if (!text) return;
		if (cd.getData("text/plain") !== "") return;
		cd.setData("text/plain", text);
		event.preventDefault();
	}
	function attach$2() {
		if (rescueAttached) return;
		rescueAttached = true;
		document.addEventListener("selectionchange", onSelectionChange);
		window.addEventListener("mousedown", onMouseDown, true);
		document.addEventListener("focusin", onFocusIn, true);
		window.addEventListener("copy", onCopy, false);
	}
	function detach$2() {
		if (!rescueAttached) return;
		rescueAttached = false;
		document.removeEventListener("selectionchange", onSelectionChange);
		window.removeEventListener("mousedown", onMouseDown, true);
		document.removeEventListener("focusin", onFocusIn, true);
		window.removeEventListener("copy", onCopy, false);
		snapshot = null;
		focusGrabAt = 0;
	}
	function isCopyEnabled() {
		try {
			return localStorage.getItem(STORAGE_KEY$2) !== "0";
		} catch {
			return true;
		}
	}
	function applyCopy(enabled) {
		const root = document.documentElement;
		if (!root) return;
		if (enabled) {
			root.classList.add(COPY_CLASS);
			ensureOwnStyle(STYLE_ID$2, copy_default);
			attach$2();
		} else {
			detach$2();
			root.classList.remove(COPY_CLASS);
			removeOwnStyle(STYLE_ID$2);
		}
		try {
			localStorage.setItem(STORAGE_KEY$2, enabled ? "1" : "0");
		} catch {}
	}
	function initCopy() {
		const enabled = isCopyEnabled();
		applyCopy(enabled);
		return enabled;
	}
	function exposeCopyHooks() {
		const w = window;
		w.__hbSetCopy = (on) => applyCopy(on);
		w.__hbIsCopy = () => isCopyEnabled();
	}
	var cache = new Map();
	var API_URL_PATTERN = /\/bbs\/app\/(?:link\/tree|comment)(?:[/?#]|$)/;
	var MAX_DEPTH = 24;
	function isPlainObject(value) {
		return !!value && typeof value === "object" && !Array.isArray(value);
	}
	function toIdString(value) {
		if (typeof value === "number") return Number.isFinite(value) ? String(value) : void 0;
		if (typeof value === "string") {
			const trimmed = value.trim();
			return trimmed === "" ? void 0 : trimmed;
		}
	}
	function nonEmptyString(value) {
		if (typeof value !== "string") return void 0;
		return value.length > 0 && value.trim() !== "" ? value : void 0;
	}
	function metaFromBody(body) {
		const meta = {};
		const author = isPlainObject(body.user) ? body.user : null;
		if (author) {
			const avatar = nonEmptyString(author.avatar) ?? nonEmptyString(author.avartar);
			if (avatar) meta.authorAvatar = avatar;
			const name = nonEmptyString(author.username);
			if (name) meta.authorName = name;
		}
		const replyId = toIdString(body.replyid);
		if (replyId) meta.replyId = replyId;
		const replyUser = isPlainObject(body.replyuser) ? body.replyuser : null;
		if (replyUser) {
			const name = nonEmptyString(replyUser.username);
			if (name) meta.replyToName = name;
			const id = toIdString(body.replyuserid) ?? toIdString(replyUser.userid);
			if (id) meta.replyToUserId = id;
		}
		return Object.keys(meta).length > 0 ? meta : null;
	}
	function collectBodies(value, out, depth = 0) {
		if (depth > MAX_DEPTH || !value || typeof value !== "object") return;
		if (Array.isArray(value)) {
			for (const item of value) collectBodies(item, out, depth + 1);
			return;
		}
		const obj = value;
		if (Array.isArray(obj.comments)) collectBodies(obj.comments, out, depth + 1);
		if (Array.isArray(obj.comment)) collectBodies(obj.comment, out, depth + 1);
		if (obj.commentid !== void 0 && obj.commentid !== null) {
			out.push(obj);
			return;
		}
		if (obj.result && typeof obj.result === "object") collectBodies(obj.result, out, depth + 1);
	}
	function mergeMeta(id, incoming) {
		const prev = cache.get(id);
		cache.set(id, prev ? {
			...prev,
			...incoming
		} : incoming);
	}
	function ingest(payload) {
		const bodies = [];
		collectBodies(payload, bodies);
		let stored = 0;
		for (const body of bodies) {
			const id = toIdString(body.commentid);
			if (!id) continue;
			const meta = metaFromBody(body);
			if (!meta) continue;
			mergeMeta(id, meta);
			stored += 1;
		}
		return stored;
	}
	function __ingestTreeResponse(payload) {
		try {
			if (typeof payload === "string") {
				const text = payload.trim();
				if (text === "") return 0;
				return ingest(JSON.parse(text));
			}
			return ingest(payload);
		} catch {
			return 0;
		}
	}
	function lookupMeta(commentId) {
		try {
			const id = toIdString(commentId);
			if (!id) return null;
			const hit = cache.get(id);
			return hit ? { ...hit } : null;
		} catch {
			return null;
		}
	}
	function cacheSize() {
		return cache.size;
	}
	var xhrUrls = new WeakMap();
	var xhrListening = new WeakSet();
	var attached = false;
	function matchesApiUrl(url) {
		return url !== "" && API_URL_PATTERN.test(url);
	}
	function urlFromOpenArgs(args) {
		const raw = args[1];
		if (typeof raw === "string") return raw;
		if (raw instanceof URL) return raw.href;
		return "";
	}
	function urlFromFetchInput(input) {
		try {
			if (typeof input === "string") return input;
			if (input instanceof URL) return input.href;
			const req = input;
			return typeof req?.url === "string" ? req.url : "";
		} catch {
			return "";
		}
	}
	function readXhrPayload(xhr) {
		try {
			const text = xhr.responseText;
			if (typeof text === "string" && text.trim() !== "") return JSON.parse(text);
		} catch {}
		try {
			const data = xhr.response;
			if (isPlainObject(data) || Array.isArray(data)) return data;
		} catch {}
		return null;
	}
	function patchXhr() {
		const proto = globalThis.XMLHttpRequest?.prototype;
		if (!proto) return;
		const openFn = proto.open;
		const sendFn = proto.send;
		const nextOpen = function(...args) {
			try {
				const url = urlFromOpenArgs(args);
				if (url) xhrUrls.set(this, url);
			} catch {}
			return openFn.apply(this, args);
		};
		const nextSend = function(...args) {
			try {
				const xhr = this;
				if (!xhrListening.has(xhr)) {
					xhrListening.add(xhr);
					xhr.addEventListener("load", () => {
						try {
							if (!matchesApiUrl(xhrUrls.get(xhr) ?? "")) return;
							__ingestTreeResponse(readXhrPayload(xhr));
						} catch {}
					});
				}
			} catch {}
			return sendFn.apply(this, args);
		};
		proto.open = nextOpen;
		proto.send = nextSend;
	}
	function patchFetch() {
		const g = globalThis;
		const fn = g.fetch;
		if (typeof fn !== "function") return;
		const nextFetch = function(input, init) {
			const url = urlFromFetchInput(input);
			const result = fn.call(globalThis, input, init);
			try {
				if (matchesApiUrl(url)) result.then((res) => {
					try {
						res.clone().json().then((data) => {
							__ingestTreeResponse(data);
						}, () => {});
					} catch {}
				}, () => {});
			} catch {}
			return result;
		};
		g.fetch = nextFetch;
	}
	function attachApiCache() {
		if (attached) return;
		attached = true;
		try {
			patchXhr();
		} catch {}
		try {
			patchFetch();
		} catch {}
	}
	function exposeApiCacheHooks() {
		const w = window;
		w.__hbApiCacheSize = () => cacheSize();
		w.__hbApiCacheAttached = () => attached;
		w.__hbLookupCommentMeta = (commentId) => lookupMeta(commentId);
		w.__hbIngestCommentTree = (payload) => __ingestTreeResponse(payload);
	}
	var DOCK_CLASS = "hb-row-dock";
	var OWN_ATTR$1 = "data-hb-own";
	var SVG_NS$2 = "http://www.w3.org/2000/svg";
	var PLANE_PATHS$1 = ["M21.3 3.2 2.9 10.4 12.6 20.4Z", "M9.1 12.7 21.3 3.2"];
	function rowDockOf(row) {
		return row.querySelector(`:scope > .${DOCK_CLASS}`);
	}
	function appendToRowDock(row, control, beforeSelector) {
		const existing = rowDockOf(row);
		if (existing) {
			existing.appendChild(control);
			return;
		}
		const dock = document.createElement("div");
		dock.className = DOCK_CLASS;
		dock.setAttribute(OWN_ATTR$1, "");
		dock.appendChild(control);
		const before = row.querySelector(beforeSelector);
		if (before) row.insertBefore(dock, before);
		else row.appendChild(dock);
	}
	function dropRowControl(row, controlClass) {
		const dock = rowDockOf(row);
		dock?.querySelector(`:scope > .${controlClass}`)?.remove();
		if (dock && dock.childElementCount === 0) dock.remove();
	}
	function pruneEmptyRowDocks() {
		for (const dock of document.querySelectorAll(`.${DOCK_CLASS}`)) if (dock.childElementCount === 0) dock.remove();
	}
	function buildPlaneIcon() {
		const svg = document.createElementNS(SVG_NS$2, "svg");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("aria-hidden", "true");
		svg.setAttribute("focusable", "false");
		for (const d of PLANE_PATHS$1) {
			const path = document.createElementNS(SVG_NS$2, "path");
			path.setAttribute("d", d);
			svg.appendChild(path);
		}
		return svg;
	}
	var comment_cards_default = "html.hb-comment-cards [data-hb-tc].hb-tc{padding:var(--hb-ui-pad-y) var(--hb-ui-pad-x) var(--hb-ui-pad-y) calc(var(--hb-ui-pad-x) + var(--hb-ui-avatar-size) + var(--hb-ui-avatar-gap));border-radius:var(--hb-ui-radius-card);background-color:var(--hb-ui-surface);color:var(--hb-ui-ink);outline-offset:2px;outline:2px solid #0000;flex-wrap:wrap;align-items:flex-start;gap:0 8px;transition:outline-color .16s cubic-bezier(.2,0,0,1),background-color .16s cubic-bezier(.2,0,0,1);display:flex;position:relative}html.hb-comment-cards [data-hb-tc].hb-tc--flash{outline-color:var(--hb-ui-accent-strong)}html.hb-comment-cards [data-hb-tc].hb-tc>*{order:3}html.hb-comment-cards [data-hb-tc]>.children-item__writer-tag{height:var(--hb-ui-line-1);flex:none;order:2;margin-left:5px}html.hb-comment-cards .link-comment__comment-children .comment-children-item.hb-tc:hover:after{display:none}html.hb-comment-cards [data-hb-tc].hb-tc:hover{background-color:var(--hb-ui-accent-wash)}html.hb-comment-cards [data-hb-tc]>.hb-tc__avatar{top:var(--hb-ui-pad-y);left:var(--hb-ui-pad-x);width:var(--hb-ui-avatar-size);height:var(--hb-ui-avatar-size);position:absolute}html.hb-comment-cards [data-hb-tc]>.children-item__comment-creator{white-space:nowrap;font-size:var(--hb-ui-font-title);font-weight:700;line-height:var(--hb-ui-line-1);flex:none;order:1;text-decoration:none}html.hb-comment-cards [data-hb-tc]>.hb-tc__replyto{white-space:nowrap;color:var(--hb-ui-ink-muted);font-size:var(--hb-ui-font-label);flex:none;order:2;margin-right:-8px}html.hb-comment-cards [data-hb-tc]>.children-item__reply-to{white-space:nowrap;flex:none;order:3;margin-left:0;display:inline}html.hb-comment-cards [data-hb-tc][data-hb-reply-kind=root]>.children-item__reply-to{color:var(--hb-ui-ink-muted)}html.hb-comment-cards [data-hb-tc]>.hb-tc__replyto>.hb-tc__link{font:inherit;color:var(--hb-ui-accent-strong);cursor:pointer;text-underline-offset:2px;-webkit-user-select:none;user-select:none;background:0 0;border:0;margin:0;padding:0;text-decoration:underline;text-decoration-thickness:1px;display:inline}html.hb-comment-cards [data-hb-tc]>.hb-tc__replyto>.hb-tc__link:hover{text-decoration-thickness:2px}html.hb-comment-cards [data-hb-tc]>.hb-tc__replyto>.hb-tc__link:focus-visible{box-shadow:0 0 0 2px var(--hb-ui-ring-light), 0 0 0 3px var(--hb-ui-ring-dark);border-radius:2px;outline:none}html.hb-comment-cards [data-hb-tc]>.children-item__other-info{margin-left:0;margin-top:var(--hb-ui-gap-line);min-width:0;font-size:var(--hb-ui-font-meta);line-height:var(--hb-ui-line-2);white-space:nowrap;flex:0 0 100%;order:5;align-items:center;display:flex}html.hb-comment-cards [data-hb-tc]>.children-item__other-info>span+span{margin-left:2px}html.hb-comment-cards [data-hb-tc]>.hb-tc__floor{color:var(--hb-ui-ink-soft);font-size:var(--hb-ui-font-meta);font-weight:500;line-height:var(--hb-ui-line-1);font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none;-webkit-user-select:none;user-select:none;flex:none;order:4;margin-left:auto;padding-left:6px}html.hb-comment-cards [data-hb-tc]>p.children-item__comment-content,html.hb-comment-cards [data-hb-tc]>.children-item__comment-content{margin-left:0;margin-top:var(--hb-ui-gap-block);white-space:pre-wrap;overflow-wrap:anywhere;flex:100%;order:9;min-width:0;margin-bottom:0;padding-left:0;display:block}html.hb-comment-cards [data-hb-tc]>.children-item__comment-content.cy{padding-left:0}html.hb-comment-cards [data-hb-tc]>.children-item__comment-content.cy:before{width:14px;height:14px;top:0;left:0}html.hb-comment-cards [data-hb-tc]>.hb-card-reply{-webkit-user-select:none;user-select:none;vertical-align:middle;width:var(--hb-ui-size-control);height:var(--hb-ui-size-control);border-radius:var(--hb-ui-radius-control);color:var(--hb-ui-ink-muted);cursor:pointer;-webkit-tap-highlight-color:transparent;background:0 0;border:1px solid #0000;flex:none;order:11;justify-content:center;align-items:center;margin-left:auto;padding:0;transition:color .12s,border-color .12s,background-color .12s,transform 90ms;display:inline-flex}html.hb-comment-cards [data-hb-tc]>.hb-card-reply svg{fill:none;stroke:currentColor;stroke-width:1.6px;stroke-linecap:round;stroke-linejoin:round;width:16px;height:16px;display:block}html.hb-comment-cards [data-hb-tc]>.hb-card-reply:hover{color:var(--hb-ui-accent-strong);border-color:var(--hb-ui-edge-control-hover);background-color:var(--hb-ui-accent-wash)}html.hb-comment-cards [data-hb-tc]>.hb-card-reply:active{transform:translateY(1px)}html.hb-comment-cards [data-hb-tc]>.hb-card-reply:focus-visible{box-shadow:0 0 0 2px var(--hb-ui-ring-light), 0 0 0 3px var(--hb-ui-ring-dark);outline:none}html.hb-comment-cards [data-hb-tc]>.hb-tc__avatar{box-sizing:border-box;pointer-events:none;background-color:#0000;border-radius:50%;justify-content:center;align-items:center;text-decoration:none;display:flex;overflow:hidden}html.hb-comment-cards [data-hb-tc]>.hb-tc__avatar img{object-fit:cover;border-radius:50%;width:100%;height:100%}html.hb-comment-cards [data-hb-tc]>.hb-tc__avatar.hb-tc__avatar--fallback{background-color:var(--hb-ui-avatar-tile);color:var(--hb-ui-avatar-ink);-webkit-user-select:none;user-select:none;font-size:14px;font-weight:600;line-height:1}html.hb-comment-cards .hb-tc__fold{height:var(--hb-ui-size-control);border-radius:var(--hb-ui-radius-pill);color:var(--hb-ui-ink-soft);font-size:var(--hb-ui-font-label);white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;vertical-align:middle;background:0 0;border:1px solid #0000;align-items:center;gap:3px;margin-left:4px;padding:0 6px;line-height:1;transition:color .12s,background-color .12s;display:inline-flex}html.hb-comment-cards .hb-tc__fold svg{fill:none;stroke:currentColor;stroke-width:2px;stroke-linecap:round;stroke-linejoin:round;width:12px;height:12px;transition:transform .16s cubic-bezier(.2,0,0,1);display:block}html.hb-comment-cards .hb-tc__fold[data-expanded=false] svg{transform:rotate(180deg)}html.hb-comment-cards .hb-tc__fold:hover{color:var(--hb-ui-accent-strong);background-color:var(--hb-ui-accent-wash)}html.hb-comment-cards .hb-tc__fold:focus-visible{box-shadow:0 0 0 2px var(--hb-ui-ring-light), 0 0 0 3px var(--hb-ui-ring-dark);outline:none}html.hb-comment-cards .link-comment__comment-children.hb-tc--folded>.comment-children-item{display:none}@media (prefers-reduced-motion:reduce){html.hb-comment-cards [data-hb-tc].hb-tc,html.hb-comment-cards [data-hb-tc]>.hb-card-reply,html.hb-comment-cards .hb-tc__fold,html.hb-comment-cards .hb-tc__fold svg{transition:none}html.hb-comment-cards [data-hb-tc]>.hb-card-reply:active{transform:none}}@media (forced-colors:active){html.hb-comment-cards [data-hb-tc]>.hb-card-reply{color:buttontext;border-color:buttontext}html.hb-comment-cards [data-hb-tc]>.hb-card-reply:hover{color:highlight;border-color:highlight}html.hb-comment-cards .hb-tc__fold{color:buttontext;border-color:buttontext}html.hb-comment-cards .hb-tc__fold:hover{color:highlight;border-color:highlight}html.hb-comment-cards [data-hb-tc]>.hb-tc__replyto>.hb-tc__link{color:linktext}html.hb-comment-cards [data-hb-tc].hb-tc--flash{outline-color:highlight}html.hb-comment-cards [data-hb-tc]>.hb-tc__avatar.hb-tc__avatar--fallback{color:buttontext;background-color:buttonface}}";
	var row_dock_default = ".hb-row-dock{margin-top:var(--hb-ui-gap-block);justify-content:flex-end;align-items:center;gap:4px;display:flex}.hb-row-dock>*{order:1;margin-left:0}.hb-row-dock>.hb-tc__fold{order:0}";
	var tokens_default = "html.hb-comment-cards [data-hb-tc],html.hb-comment-cards .hb-tc__fold,html.hb-reply-btn .hb-reply,html.hb-comment-cards .hb-row-dock,html.hb-reply-btn .hb-row-dock{--hb-ui-hue:210;--hb-ui-font-meta:10px;--hb-ui-font-label:13px;--hb-ui-font-title:14px;--hb-ui-size-control:24px;--hb-ui-radius-card:5px;--hb-ui-radius-control:5px;--hb-ui-radius-pill:999px;--hb-ui-pad-x:12px;--hb-ui-pad-y:10px;--hb-ui-avatar-size:34px;--hb-ui-avatar-gap:10px;--hb-ui-line-1:20px;--hb-ui-line-2:14px;--hb-ui-gap-line:1px;--hb-ui-gap-block:10px;--hb-ui-surface:#fff;--hb-ui-ink:#14191e;--hb-ui-ink-muted:#4b5359;--hb-ui-ink-soft:#697077;--hb-ui-accent:#3ea3e3;--hb-ui-accent-strong:#1a6da6;--hb-ui-accent-wash:#3ea3e31a;--hb-ui-edge-control:#14191e47;--hb-ui-edge-control-hover:#1a6da68c;--hb-ui-avatar-tile:hsl(var(--hb-ui-hue) 34% 90%);--hb-ui-avatar-ink:hsl(var(--hb-ui-hue) 45% 26%);--hb-ui-ring-light:#f4f7fa;--hb-ui-ring-dark:#0b0f13}html.hb-dark.hb-comment-cards [data-hb-tc],html.hb-dark.hb-comment-cards .hb-tc__fold,html.hb-dark.hb-reply-btn .hb-reply,html.hb-dark.hb-comment-cards .hb-row-dock,html.hb-dark.hb-reply-btn .hb-row-dock{--hb-ui-surface:#2e353d;--hb-ui-ink:#dce3ea;--hb-ui-ink-muted:#b6bec7;--hb-ui-ink-soft:#9aa3ac;--hb-ui-accent:#62a3e3;--hb-ui-accent-strong:#8ec7f2;--hb-ui-accent-wash:#62a3e329;--hb-ui-edge-control:#ffffff47;--hb-ui-edge-control-hover:#8ec7f299;--hb-ui-avatar-tile:hsl(var(--hb-ui-hue) 26% 30%);--hb-ui-avatar-ink:hsl(var(--hb-ui-hue) 30% 88%)}";
	var STORAGE_KEY$1 = "heybox-comment-cards";
	var ROOT_CLASS = "hb-comment-cards";
	var STYLE_ID$1 = "hb-comment-cards";
	var CARD_CLASS = "hb-tc";
	var AVATAR_CLASS = "hb-tc__avatar";
	var AVATAR_FALLBACK_CLASS = "hb-tc__avatar--fallback";
	var REPLYTO_CLASS = "hb-tc__replyto";
	var CARD_REPLY_CLASS = "hb-card-reply";
	var CARD_FLOOR_CLASS = "hb-tc__floor";
	var CARD_FOLD_CLASS = "hb-tc__fold";
	var CARD_LINK_CLASS = "hb-tc__link";
	var FLASH_CLASS = "hb-tc--flash";
	var FLASH_MS = 1200;
	var FOLDED_CLASS = "hb-tc--folded";
	var CARD_ATTR = "data-hb-tc";
	var OWN_ATTR = "data-hb-own";
	var CHILD_ROW_SELECTOR$1 = ".comment-children-item";
	var MAIN_ROW_SELECTOR$1 = ".link-comment__comment-item";
	var THREAD_SELECTOR$1 = ".link-comment__comment-children";
	var CONTENT_CONTAINER_SELECTOR = ".comment-item__content-container";
	var CONTENT_SELECTOR = ".children-item__comment-content";
	var CREATOR_SELECTOR = ".children-item__comment-creator";
	var REPLYTO_SITE_SELECTOR = ".children-item__reply-to";
	var OTHER_INFO_SELECTOR = ".children-item__other-info";
	var SVG_NS$1 = "http://www.w3.org/2000/svg";
	var RETRY_DELAYS = [
		500,
		1500,
		4e3
	];
	var PLANE_PATHS = ["M21.3 3.2 2.9 10.4 12.6 20.4Z", "M9.1 12.7 21.3 3.2"];
	var listeners$1 = new Set();
	var applied = false;
	var observer$1 = null;
	var retryTimer = null;
	var pendingMeta = new Set();
	function normalizeText(value) {
		return (value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
	}
	function useridFromProfileHref(href) {
		if (!href) return "";
		const m = /\/profile\/(\w+)/.exec(href);
		return m ? m[1] : "";
	}
	function mainRowOf(row) {
		return row.closest(MAIN_ROW_SELECTOR$1);
	}
	function rootUserIdOf(row) {
		const main = mainRowOf(row);
		if (!main) return "";
		const links = [main.querySelector(".comment-item-header__avatar")?.closest("a") ?? null, main.querySelector(".info-box__username")];
		for (const link of links) {
			if (!link) continue;
			const id = useridFromProfileHref(link.getAttribute("href"));
			if (id) return id;
		}
		return "";
	}
	function creatorNameOf(row) {
		return normalizeText(row.querySelector(CREATOR_SELECTOR)?.textContent);
	}
	function creatorUserIdOf(row) {
		return useridFromProfileHref(row.querySelector(CREATOR_SELECTOR)?.getAttribute("href") ?? null);
	}
	function threadOf(row) {
		return row.closest(THREAD_SELECTOR$1);
	}
	function ordinalOf(row) {
		const thread = threadOf(row);
		if (!thread) return 0;
		const rows = thread.querySelectorAll(CHILD_ROW_SELECTOR$1);
		for (let i = 0; i < rows.length; i += 1) if (rows[i] === row) return i + 1;
		return 0;
	}
	function rowByCommentId(thread, commentId) {
		if (!commentId) return null;
		for (const row of thread.querySelectorAll(CHILD_ROW_SELECTOR$1)) if (row.dataset.commentId === commentId) return row;
		return null;
	}
	function replyKindOf(row, meta) {
		const replyToId = normalizeText(meta?.replyToUserId);
		if (!replyToId) return "";
		const rootId = rootUserIdOf(row);
		if (!rootId) return "";
		return replyToId === rootId ? "root" : "other";
	}
	function hueOf(seed) {
		let h = 0;
		for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
		return h;
	}
	function softHue(seed) {
		return (hueOf(seed) * 3 + 205) % 360;
	}
	function applyFallbackHue(box, row) {
		box.style.setProperty("--hb-ui-hue", String(softHue(creatorUserIdOf(row) || creatorNameOf(row) || "hb")));
	}
	function buildAvatar(row) {
		const meta = lookupMeta(row.dataset.commentId ?? "");
		const box = document.createElement("span");
		box.className = AVATAR_CLASS;
		box.setAttribute(OWN_ATTR, "");
		box.setAttribute("aria-hidden", "true");
		const avatarUrl = typeof meta?.authorAvatar === "string" ? meta.authorAvatar.trim() : "";
		if (avatarUrl) {
			const img = document.createElement("img");
			img.className = "hb-tc__avatar-img";
			img.alt = "";
			img.loading = "lazy";
			img.decoding = "async";
			img.referrerPolicy = "no-referrer";
			img.src = avatarUrl;
			img.addEventListener("error", () => {
				img.remove();
				applyFallbackHue(box, row);
				box.classList.add(AVATAR_FALLBACK_CLASS);
				box.textContent = avatarLetter(row);
			});
			box.appendChild(img);
			return box;
		}
		box.classList.add(AVATAR_FALLBACK_CLASS);
		applyFallbackHue(box, row);
		box.textContent = avatarLetter(row);
		return box;
	}
	function avatarLetter(row) {
		const name = creatorNameOf(row);
		return name ? Array.from(name)[0] : "匿";
	}
	function buildReplyTo(row) {
		const site = row.querySelector(REPLYTO_SITE_SELECTOR);
		if (!site) return null;
		if (normalizeText(site.textContent) !== ":") return null;
		const meta = lookupMeta(row.dataset.commentId ?? "");
		if (!meta) return null;
		const thread = threadOf(row);
		const targetId = normalizeText(meta.replyId);
		const target = thread ? rowByCommentId(thread, targetId) : null;
		let kind;
		let label = "";
		let jump = 0;
		if (target && target !== row) {
			kind = "other";
			const index = ordinalOf(target);
			const name = normalizeText(meta.replyToName) || creatorNameOf(target);
			if (!name) return null;
			if (index > 0) {
				jump = index;
				label = `回复 #${index} ${name}`;
			} else label = `回复 @${name}`;
		} else {
			kind = replyKindOf(row, meta);
			if (kind === "root") label = "回复楼主";
			else if (kind === "other") {
				const name = normalizeText(meta.replyToName);
				if (!name) return null;
				label = `回复 @${name}`;
			} else return null;
		}
		const span = document.createElement("span");
		span.className = REPLYTO_CLASS;
		span.setAttribute(OWN_ATTR, "");
		if (jump > 0) {
			span.appendChild(document.createTextNode("回复 "));
			span.appendChild(buildJumpLink(jump));
			span.appendChild(document.createTextNode(` ${label.slice(`回复 #${jump} `.length)}`));
		} else span.textContent = label;
		row.dataset.hbReplyKind = kind;
		return span;
	}
	function buildJumpLink(index) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = CARD_LINK_CLASS;
		btn.setAttribute(OWN_ATTR, "");
		btn.textContent = `#${index}`;
		const label = `跳到本楼第 ${index} 条回复`;
		btn.title = label;
		btn.setAttribute("aria-label", label);
		btn.addEventListener("mousedown", (e) => e.stopPropagation());
		btn.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			jumpToFloor(btn, index);
		});
		return btn;
	}
	var flashTimer = null;
	function jumpToFloor(from, index) {
		const row = from.closest(CHILD_ROW_SELECTOR$1);
		const thread = row ? threadOf(row) : null;
		if (!thread) return;
		const target = thread.querySelectorAll(CHILD_ROW_SELECTOR$1)[index - 1];
		if (!target) return;
		const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
		target.scrollIntoView({
			behavior: reduced ? "auto" : "smooth",
			block: "center"
		});
		if (flashTimer !== null) window.clearTimeout(flashTimer);
		for (const el of document.querySelectorAll(`.${FLASH_CLASS}`)) el.classList.remove(FLASH_CLASS);
		target.classList.add(FLASH_CLASS);
		flashTimer = window.setTimeout(() => {
			flashTimer = null;
			target.classList.remove(FLASH_CLASS);
		}, FLASH_MS);
	}
	function buildFloor(index) {
		const el = document.createElement("span");
		el.className = CARD_FLOOR_CLASS;
		el.setAttribute(OWN_ATTR, "");
		el.textContent = `${index}#`;
		return el;
	}
	function buildReplyButton() {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = CARD_REPLY_CLASS;
		btn.setAttribute(OWN_ATTR, "");
		btn.setAttribute("aria-label", "回复这条评论");
		btn.title = "回复这条评论";
		const svg = document.createElementNS(SVG_NS$1, "svg");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("aria-hidden", "true");
		svg.setAttribute("focusable", "false");
		for (const d of PLANE_PATHS) {
			const path = document.createElementNS(SVG_NS$1, "path");
			path.setAttribute("d", d);
			svg.appendChild(path);
		}
		btn.appendChild(svg);
		btn.addEventListener("mousedown", (e) => e.stopPropagation());
		return btn;
	}
	function attachReplyButton(row, btn) {
		btn.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (!row.isConnected) return;
			row.click();
		});
	}
	function rowStamped(row) {
		return row.getAttribute("data-hb-tc") === "1" && row.classList.contains(CARD_CLASS);
	}
	function decorateRow$1(row) {
		if (!row.isConnected) return false;
		const hadStamp = rowStamped(row);
		let touched = false;
		if (!row.querySelector(CONTENT_SELECTOR) || !row.querySelector(OTHER_INFO_SELECTOR)) return false;
		let avatar = row.querySelector(`:scope > .${AVATAR_CLASS}`);
		if (!avatar) {
			avatar = buildAvatar(row);
			const siteFirst = row.firstElementChild;
			if (siteFirst) row.insertBefore(avatar, siteFirst);
			else row.appendChild(avatar);
			touched = true;
		}
		if (row.classList.contains(CARD_CLASS) === false) {
			row.classList.add(CARD_CLASS);
			touched = true;
		}
		const index = ordinalOf(row);
		let floor = row.querySelector(`:scope > .${CARD_FLOOR_CLASS}`);
		if (!floor && index > 0) {
			floor = buildFloor(index);
			row.appendChild(floor);
			touched = true;
		} else if (floor && index > 0 && normalizeText(floor.textContent) !== `${index}#`) {
			floor.textContent = `${index}#`;
			touched = true;
		}
		if (!row.querySelector(`:scope > .${REPLYTO_CLASS}`)) {
			const candidate = buildReplyTo(row);
			if (candidate) {
				const site = row.querySelector(REPLYTO_SITE_SELECTOR);
				if (site && site.parentElement === row) row.insertBefore(candidate, site);
				else row.appendChild(candidate);
				touched = true;
			}
		}
		let btn = row.querySelector(`:scope > .${CARD_REPLY_CLASS}`);
		if (!btn) {
			btn = buildReplyButton();
			row.appendChild(btn);
			attachReplyButton(row, btn);
			touched = true;
		}
		if (avatar !== row.firstElementChild) {
			row.insertBefore(avatar, row.firstElementChild);
			touched = true;
		}
		row.setAttribute(CARD_ATTR, "1");
		if (!hadStamp || touched) {
			const fallbackAvatar = !avatar || avatar.classList.contains(AVATAR_FALLBACK_CLASS);
			const noReplyTo = row.querySelector(`:scope > .${REPLYTO_CLASS}`) === null;
			if (fallbackAvatar || noReplyTo) pendingMeta.add(row);
			else pendingMeta.delete(row);
		}
		return touched || !hadStamp;
	}
	function decorateAll$1() {
		for (const row of document.querySelectorAll(CHILD_ROW_SELECTOR$1)) decorateRow$1(row);
		decorateThreads();
		if (pendingMeta.size > 0) scheduleRetry();
	}
	var foldedRoots = new Set();
	function mainRowKey(mainRow) {
		return normalizeText(mainRow.dataset.commentId);
	}
	var CHEVRON_UP_PATH = "M6 15 12 9 18 15";
	var FOLD_LABEL_CLASS = "hb-tc__fold-label";
	function createFoldButton(mainRow) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = CARD_FOLD_CLASS;
		btn.setAttribute(OWN_ATTR, "");
		btn.dataset.expanded = "true";
		const svg = document.createElementNS(SVG_NS$1, "svg");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("aria-hidden", "true");
		svg.setAttribute("focusable", "false");
		const path = document.createElementNS(SVG_NS$1, "path");
		path.setAttribute("d", CHEVRON_UP_PATH);
		svg.appendChild(path);
		const label = document.createElement("span");
		label.className = FOLD_LABEL_CLASS;
		btn.append(svg, label);
		btn.addEventListener("mousedown", (e) => e.stopPropagation());
		btn.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			const key = mainRowKey(mainRow);
			if (!key) return;
			if (foldedRoots.has(key)) foldedRoots.delete(key);
			else foldedRoots.add(key);
			decorateFold(mainRow);
		});
		return btn;
	}
	function syncFoldButton(btn, count, folded) {
		const label = folded ? `展开 ${count} 条` : "折叠";
		const span = btn.querySelector(`:scope > .${FOLD_LABEL_CLASS}`);
		if (span && normalizeText(span.textContent) !== label) span.textContent = label;
		const expanded = folded ? "false" : "true";
		if (btn.getAttribute("aria-expanded") !== expanded) btn.setAttribute("aria-expanded", expanded);
		if (btn.dataset.expanded !== expanded) btn.dataset.expanded = expanded;
		const aria = folded ? `展开这条评论下的 ${count} 条回复` : "折叠这条评论下的楼中楼";
		if (btn.getAttribute("aria-label") !== aria) btn.setAttribute("aria-label", aria);
		if (btn.title !== aria) btn.title = aria;
		const countAttr = String(count);
		if (btn.dataset.hbFoldCount !== countAttr) btn.dataset.hbFoldCount = countAttr;
	}
	function decorateFold(mainRow) {
		if (!mainRow.isConnected) return;
		const key = mainRowKey(mainRow);
		const thread = mainRow.querySelector(THREAD_SELECTOR$1);
		const count = thread ? thread.querySelectorAll(CHILD_ROW_SELECTOR$1).length : 0;
		const anchor = mainRow.querySelector(CONTENT_CONTAINER_SELECTOR);
		const existing = anchor ? anchor.querySelector(`.${CARD_FOLD_CLASS}`) : null;
		const folded = count > 0 && key !== "" && foldedRoots.has(key);
		if (thread) thread.classList.toggle(FOLDED_CLASS, folded);
		if (!anchor || count === 0 || key === "") {
			if (anchor) dropRowControl(anchor, CARD_FOLD_CLASS);
			else pruneEmptyRowDocks();
			return;
		}
		const btn = existing ?? createFoldButton(mainRow);
		if (!existing) appendToRowDock(anchor, btn, THREAD_SELECTOR$1);
		syncFoldButton(btn, count, folded);
	}
	function decorateThreads() {
		for (const mainRow of document.querySelectorAll(MAIN_ROW_SELECTOR$1)) decorateFold(mainRow);
	}
	function ensureFoldsInPlace() {
		for (const mainRow of document.querySelectorAll(MAIN_ROW_SELECTOR$1)) {
			if (!mainRow.isConnected) continue;
			if (!mainRow.querySelector(`.${CARD_FOLD_CLASS}`)) decorateFold(mainRow);
		}
	}
	var retryRound = 0;
	function scheduleRetry() {
		if (retryTimer !== null) return;
		if (retryRound >= RETRY_DELAYS.length) {
			pendingMeta.clear();
			return;
		}
		const delay = RETRY_DELAYS[retryRound];
		retryRound += 1;
		retryTimer = window.setTimeout(() => {
			retryTimer = null;
			if (!applied) return;
			const rows = [...pendingMeta];
			if (rows.length === 0) return;
			for (const row of rows) {
				if (!row.isConnected) {
					pendingMeta.delete(row);
					continue;
				}
				if (lookupMeta(row.dataset.commentId ?? "")) {
					pendingMeta.delete(row);
					decorateRow$1(row);
				}
			}
			if (pendingMeta.size > 0) scheduleRetry();
		}, delay);
	}
	function ensureObserver$1() {
		if (observer$1) return;
		observer$1 = new MutationObserver((records) => {
			const touchedThreads = new Set();
			for (const record of records) for (const node of record.addedNodes) {
				if (node.nodeType !== 1) continue;
				const el = node;
				if (el.matches(CHILD_ROW_SELECTOR$1)) {
					decorateRow$1(el);
					const main = mainRowOf(el);
					if (main) touchedThreads.add(main);
				}
				for (const row of el.querySelectorAll(CHILD_ROW_SELECTOR$1)) {
					decorateRow$1(row);
					const main = mainRowOf(row);
					if (main) touchedThreads.add(main);
				}
				if (el.matches(MAIN_ROW_SELECTOR$1)) touchedThreads.add(el);
				for (const main of el.querySelectorAll(MAIN_ROW_SELECTOR$1)) touchedThreads.add(main);
			}
			for (const main of touchedThreads) decorateFold(main);
			ensureFoldsInPlace();
			if (pendingMeta.size > 0) scheduleRetry();
		});
		observer$1.observe(document.documentElement, {
			childList: true,
			subtree: true
		});
	}
	function attach$1() {
		if (applied) return;
		applied = true;
		decorateAll$1();
		ensureObserver$1();
	}
	function detach$1() {
		if (!applied) return;
		applied = false;
		observer$1?.disconnect();
		observer$1 = null;
		if (retryTimer !== null) {
			window.clearTimeout(retryTimer);
			retryTimer = null;
		}
		if (flashTimer !== null) {
			window.clearTimeout(flashTimer);
			flashTimer = null;
		}
		retryRound = 0;
		pendingMeta.clear();
		for (const node of document.querySelectorAll(`.${AVATAR_CLASS}, .${REPLYTO_CLASS}, .${CARD_REPLY_CLASS}, .${CARD_FLOOR_CLASS}, .${CARD_FOLD_CLASS}`)) node.remove();
		for (const row of document.querySelectorAll(`[${CARD_ATTR}]`)) {
			row.removeAttribute(CARD_ATTR);
			row.removeAttribute("data-hb-reply-kind");
			row.classList.remove(CARD_CLASS);
			row.classList.remove(FLASH_CLASS);
		}
		for (const thread of document.querySelectorAll(`.${FOLDED_CLASS}`)) thread.classList.remove(FOLDED_CLASS);
		pruneEmptyRowDocks();
		foldedRoots.clear();
	}
	function onCommentCardsChange(fn) {
		listeners$1.add(fn);
		return () => {
			listeners$1.delete(fn);
		};
	}
	function isCommentCardsEnabled() {
		try {
			return localStorage.getItem(STORAGE_KEY$1) !== "0";
		} catch {
			return true;
		}
	}
	function applyCommentCards(enabled) {
		const root = document.documentElement;
		if (!root) return;
		if (enabled) {
			root.classList.add(ROOT_CLASS);
			ensureOwnStyle(STYLE_ID$1, `${tokens_default}\n${row_dock_default}\n${comment_cards_default}`);
			attach$1();
		} else {
			root.classList.remove(ROOT_CLASS);
			detach$1();
			removeOwnStyle(STYLE_ID$1);
		}
		try {
			localStorage.setItem(STORAGE_KEY$1, enabled ? "1" : "0");
		} catch {}
		for (const fn of [...listeners$1]) try {
			fn(enabled);
		} catch (err) {
			console.error("[hb-comment-cards] listener failed", err);
		}
	}
	function initCommentCards() {
		const enabled = isCommentCardsEnabled();
		applyCommentCards(enabled);
		return enabled;
	}
	function exposeCommentCardsHooks() {
		const w = window;
		w.__hbSetCommentCards = (on) => applyCommentCards(on);
		w.__hbIsCommentCards = () => isCommentCardsEnabled();
	}
	var reply_btn_default = "html.hb-reply-btn .hb-reply{box-sizing:border-box;width:var(--hb-ui-size-control);height:var(--hb-ui-size-control);border-radius:var(--hb-ui-radius-control);color:var(--hb-ui-ink-muted);cursor:pointer;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;vertical-align:middle;background:0 0;border:1px solid #0000;justify-content:center;align-items:center;padding:0;transition:color .12s,border-color .12s,background-color .12s,transform 90ms;display:inline-flex}html.hb-reply-btn .hb-reply svg{fill:none;stroke:currentColor;stroke-width:1.6px;stroke-linecap:round;stroke-linejoin:round;width:16px;height:16px;display:block}html.hb-reply-btn .hb-reply:hover{color:var(--hb-ui-accent-strong);border-color:var(--hb-ui-edge-control-hover);background-color:var(--hb-ui-accent-wash)}html.hb-reply-btn .hb-reply:active{transform:translateY(1px)}html.hb-reply-btn .hb-reply:focus-visible{box-shadow:0 0 0 2px var(--hb-ui-ring-light), 0 0 0 3px var(--hb-ui-ring-dark);outline:none}@media (prefers-reduced-motion:reduce){html.hb-reply-btn .hb-reply{transition:none}html.hb-reply-btn .hb-reply:active{transform:none}}@media (forced-colors:active){html.hb-reply-btn .hb-reply{color:buttontext;border-color:buttontext}html.hb-reply-btn .hb-reply:hover{color:highlight;border-color:highlight}html.hb-reply-btn .hb-reply:focus-visible{outline-offset:2px;box-shadow:none;outline:2px solid highlight}}";
	var STORAGE_KEY = "heybox-reply-btn";
	var STYLE_ID = "hb-reply-btn";
	var REPLY_CLASS = "hb-reply-btn";
	var MAIN_ROW_SELECTOR = ".link-comment__comment-item";
	var CHILD_ROW_SELECTOR = ".comment-children-item";
	var MAIN_ANCHOR_SELECTOR = ".comment-item__content-container";
	var THREAD_SELECTOR = ".link-comment__comment-children";
	var BTN_CLASS = "hb-reply";
	var ROW_BTN_SELECTOR = `.${BTN_CLASS}, .${CARD_REPLY_CLASS}`;
	var listeners = new Set();
	var observer = null;
	var guardAttached = false;
	var passThrough = 0;
	function nodeToElement(node) {
		if (!node) return null;
		const n = node;
		if (n.nodeType === 1) return n;
		return n.parentElement;
	}
	function isSiteInteractive(el) {
		if (!el) return false;
		return !!el.closest("a, button, input, textarea, [contenteditable], [role=\"button\"]");
	}
	function isImageZone(el) {
		if (!el) return false;
		return !!el.closest(".comment-item__image-box, .comment-item__image-wrapper, img");
	}
	function shouldBlock(el) {
		if (!el) return false;
		if (isSiteInteractive(el) || isImageZone(el)) return false;
		if (el.closest(`[data-hb-tc]`) || el.closest(CHILD_ROW_SELECTOR)) return true;
		if (!el.closest(MAIN_ROW_SELECTOR)) return false;
		if (el.closest(".link-comment__comment-children")) return false;
		return true;
	}
	function onClickCapture(event) {
		const el = nodeToElement(event.target);
		const btn = el ? el.closest(ROW_BTN_SELECTOR) : null;
		if (btn) {
			const host = btn.closest(CHILD_ROW_SELECTOR) || btn.closest(MAIN_ROW_SELECTOR);
			if (host) {
				passThrough += 1;
				try {
					host.click();
				} finally {
					passThrough -= 1;
				}
			}
			event.stopPropagation();
			event.preventDefault();
			return;
		}
		if (passThrough > 0) return;
		if (!shouldBlock(el)) return;
		event.stopPropagation();
	}
	function createButton() {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = BTN_CLASS;
		btn.setAttribute("data-hb-own", "");
		btn.title = "回复这条评论";
		btn.setAttribute("aria-label", "回复这条评论");
		btn.appendChild(buildPlaneIcon());
		btn.addEventListener("mousedown", (e) => e.stopPropagation());
		return btn;
	}
	function decorateRow(row) {
		if (row.matches(CHILD_ROW_SELECTOR)) return;
		if (row.querySelector(`.${BTN_CLASS}`)) return;
		const anchor = row.querySelector(MAIN_ANCHOR_SELECTOR);
		if (!anchor) return;
		appendToRowDock(anchor, createButton(), THREAD_SELECTOR);
	}
	function decorateAll() {
		for (const row of document.querySelectorAll(MAIN_ROW_SELECTOR)) decorateRow(row);
	}
	function ensureObserver() {
		if (observer) return;
		observer = new MutationObserver((records) => {
			for (const r of records) for (const node of r.addedNodes) {
				if (node.nodeType !== 1) continue;
				const el = node;
				if (el.matches(MAIN_ROW_SELECTOR)) decorateRow(el);
				for (const row of el.querySelectorAll(MAIN_ROW_SELECTOR)) decorateRow(row);
			}
			for (const anchor of document.querySelectorAll(MAIN_ANCHOR_SELECTOR)) if (!anchor.querySelector(`.${BTN_CLASS}`)) decorateRow(anchor.closest(MAIN_ROW_SELECTOR) ?? anchor);
		});
		observer.observe(document.documentElement, {
			childList: true,
			subtree: true
		});
	}
	function attach() {
		if (guardAttached) return;
		guardAttached = true;
		document.addEventListener("click", onClickCapture, true);
		decorateAll();
		ensureObserver();
	}
	function detach() {
		if (!guardAttached) return;
		guardAttached = false;
		document.removeEventListener("click", onClickCapture, true);
		observer?.disconnect();
		observer = null;
		for (const b of document.querySelectorAll(`.${BTN_CLASS}`)) {
			const anchor = b.closest(MAIN_ANCHOR_SELECTOR);
			b.remove();
			if (anchor) dropRowControl(anchor, BTN_CLASS);
		}
		pruneEmptyRowDocks();
	}
	function onReplyBtnChange(fn) {
		listeners.add(fn);
		return () => {
			listeners.delete(fn);
		};
	}
	function isReplyBtnEnabled() {
		try {
			return localStorage.getItem(STORAGE_KEY) !== "0";
		} catch {
			return true;
		}
	}
	function applyReplyBtn(enabled) {
		const root = document.documentElement;
		if (!root) return;
		if (enabled) {
			root.classList.add(REPLY_CLASS);
			ensureOwnStyle(STYLE_ID, `${tokens_default}\n${row_dock_default}\n${reply_btn_default}`);
			attach();
		} else {
			detach();
			root.classList.remove(REPLY_CLASS);
			removeOwnStyle(STYLE_ID);
		}
		try {
			localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
		} catch {}
		for (const fn of [...listeners]) try {
			fn(enabled);
		} catch (err) {
			console.error("[hb-reply-btn] listener failed", err);
		}
	}
	function initReplyBtn() {
		const enabled = isReplyBtnEnabled();
		applyReplyBtn(enabled);
		return enabled;
	}
	function exposeReplyBtnHooks() {
		const w = window;
		w.__hbSetReplyBtn = (on) => applyReplyBtn(on);
		w.__hbIsReplyBtn = () => isReplyBtnEnabled();
	}
	var ui_default = ":host{all:initial;--hbd-face:#14191e;--hbd-face-hover:#1a1f25;--hbd-ink:#dce3ea;--hbd-edge:#ffffff21;--hbd-edge-hover:#ffffff38;--hbd-ring-light:#f4f7fa;--hbd-ring-dark:#0b0f13;--hbd-contact:0 1px 2px #00000047;--hbd-size:44px;--hbd-gap:12px;--hbd-inset:16px;--hbd-bottom:24px;--hbd-icon-size:20px;--hbd-icon-stroke:1.75;--hbd-ease:cubic-bezier(.2, 0, 0, 1);--hbd-t-hover:.16s;--hbd-t-press:90ms;--hbd-t-icon:.16s}.hbd-btn{right:var(--hbd-inset);z-index:2147483646;box-sizing:border-box;width:var(--hbd-size);height:var(--hbd-size);background:var(--hbd-face);color:var(--hbd-ink);cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent;box-shadow:0 0 0 1px var(--hbd-edge), var(--hbd-contact);transition:background-color var(--hbd-t-hover) var(--hbd-ease), box-shadow var(--hbd-t-hover) var(--hbd-ease), transform var(--hbd-t-press) var(--hbd-ease);border:0;border-radius:50%;justify-content:center;align-items:center;padding:0;display:flex;position:fixed}#heybox-dark-toggle{bottom:var(--hbd-bottom)}#heybox-declutter-toggle{bottom:calc(var(--hbd-bottom) + var(--hbd-size) + var(--hbd-gap))}#heybox-comment-toggle{bottom:calc(var(--hbd-bottom) + 2 * (var(--hbd-size) + var(--hbd-gap)))}.hbd-btn:hover{background:var(--hbd-face-hover);box-shadow:0 0 0 1px var(--hbd-edge-hover), var(--hbd-contact)}.hbd-btn:active{box-shadow:0 0 0 1px var(--hbd-edge), var(--hbd-contact);transform:translateY(1px)}.hbd-btn:focus-visible{box-shadow:0 0 0 2px var(--hbd-ring-light), 0 0 0 4px var(--hbd-ring-dark), var(--hbd-contact);outline:none}.hbd-icon{justify-content:center;align-items:center;display:flex}.hbd-btn svg{width:var(--hbd-icon-size);height:var(--hbd-icon-size);fill:none;stroke:currentColor;stroke-width:var(--hbd-icon-stroke);stroke-linecap:round;stroke-linejoin:round;animation:hbd-icon-in var(--hbd-t-icon) var(--hbd-ease) both;display:block}@keyframes hbd-icon-in{0%{opacity:0}to{opacity:1}}@media (prefers-reduced-motion:reduce){.hbd-btn{transition:none}.hbd-btn svg{animation:none}}@media (forced-colors:active){.hbd-btn{color:buttontext;box-shadow:none;background:buttonface;border:1px solid buttontext}.hbd-btn:focus-visible{outline-offset:2px;outline:2px solid highlight}}";
	var HOST_ID = "heybox-dark-mode-root";
	var DARK_BUTTON_ID = "heybox-dark-toggle";
	var DECLUTTER_BUTTON_ID = "heybox-declutter-toggle";
	var COMMENT_BUTTON_ID = "heybox-comment-toggle";
	var SVG_NS = "http://www.w3.org/2000/svg";
	var ICON_MOON = ["M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5z"];
	var ICON_SUN = ["M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"];
	var ICON_PANEL_WITH_RAIL = ["M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z", "M15 5v14"];
	var ICON_PANEL_FULL = [
		"M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
		"M6 9.5h12",
		"M6 14h8"
	];
	var ICON_BUBBLE = [
		"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
		"M8.5 8.5h7",
		"M8.5 12h4.5"
	];
	var ICON_BUBBLE_OFF = [...ICON_BUBBLE, "M3.8 20.2 20.2 3.8"];
	function buildIcon(paths, circle) {
		const svg = document.createElementNS(SVG_NS, "svg");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("aria-hidden", "true");
		svg.setAttribute("focusable", "false");
		if (circle) {
			const dot = document.createElementNS(SVG_NS, "circle");
			dot.setAttribute("cx", String(circle.cx));
			dot.setAttribute("cy", String(circle.cy));
			dot.setAttribute("r", String(circle.r));
			svg.appendChild(dot);
		}
		for (const d of paths) {
			const path = document.createElementNS(SVG_NS, "path");
			path.setAttribute("d", d);
			svg.appendChild(path);
		}
		return svg;
	}
	function createControl(shadow, id) {
		const button = document.createElement("button");
		button.id = id;
		button.className = "hbd-btn";
		button.type = "button";
		const iconSlot = document.createElement("span");
		iconSlot.className = "hbd-icon";
		button.appendChild(iconSlot);
		shadow.appendChild(button);
		return {
			button,
			iconSlot
		};
	}
	function paint(control, paths, circle, label, pressed) {
		control.button.title = label;
		control.button.setAttribute("aria-label", label);
		control.button.setAttribute("aria-pressed", pressed ? "true" : "false");
		control.iconSlot.replaceChildren(buildIcon(paths, circle));
	}
	var SUN_CORE = {
		cx: 12,
		cy: 12,
		r: 4
	};
	function paintDark(control, dark) {
		paint(control, dark ? ICON_MOON : ICON_SUN, dark ? void 0 : SUN_CORE, dark ? "切换到浅色模式" : "切换到深色模式", dark);
	}
	function paintDeclutter(control, on) {
		paint(control, on ? ICON_PANEL_FULL : ICON_PANEL_WITH_RAIL, void 0, on ? "关闭精简模式（恢复首页入口与右侧栏）" : "开启精简模式（隐藏首页入口与右侧栏）", on);
	}
	function paintCommentEnhance(control, on) {
		paint(control, on ? ICON_BUBBLE : ICON_BUBBLE_OFF, void 0, on ? "关闭评论区增强（恢复一行式楼中楼，点正文重新弹回复框）" : "开启评论区增强（楼中楼卡片化 + 点正文不弹回复框）", on);
	}
	function mountControls() {
		if (document.getElementById(HOST_ID)) return;
		const host = document.createElement("div");
		host.id = HOST_ID;
		host.setAttribute("data-hb-own", "");
		const shadow = host.attachShadow({ mode: "open" });
		const style = document.createElement("style");
		style.textContent = ui_default;
		shadow.appendChild(style);
		const darkControl = createControl(shadow, DARK_BUTTON_ID);
		const declutterControl = createControl(shadow, DECLUTTER_BUTTON_ID);
		const commentControl = createControl(shadow, COMMENT_BUTTON_ID);
		const commentEnhanceOn = () => isReplyBtnEnabled() && isCommentCardsEnabled();
		darkControl.button.addEventListener("click", () => applyDark(!isDarkEnabled()));
		declutterControl.button.addEventListener("click", () => applyDeclutter(!isDeclutterEnabled()));
		commentControl.button.addEventListener("click", () => {
			const next = !commentEnhanceOn();
			applyReplyBtn(next);
			applyCommentCards(next);
		});
		onDarkChange((dark) => paintDark(darkControl, dark));
		onDeclutterChange((on) => paintDeclutter(declutterControl, on));
		onReplyBtnChange(() => paintCommentEnhance(commentControl, commentEnhanceOn()));
		onCommentCardsChange(() => paintCommentEnhance(commentControl, commentEnhanceOn()));
		paintDark(darkControl, isDarkEnabled());
		paintDeclutter(declutterControl, isDeclutterEnabled());
		paintCommentEnhance(commentControl, commentEnhanceOn());
		document.documentElement.appendChild(host);
	}
	attachApiCache();
	whenDocumentElementReady(() => {
		initDarkMode();
		initDeclutter();
		initCopy();
		initReplyBtn();
		initCommentCards();
		exposeEngineHooks();
		exposeDeclutterHooks();
		exposeCopyHooks();
		exposeReplyBtnHooks();
		exposeCommentCardsHooks();
		exposeApiCacheHooks();
		mountControls();
	});
})();
