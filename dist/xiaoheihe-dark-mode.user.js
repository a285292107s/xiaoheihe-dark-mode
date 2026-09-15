// ==UserScript==
// @name         小黑盒深色模式
// @namespace    xiaoheihe-dark-mode
// @version      0.3.3
// @author       油猴脚本-小黑盒页面优化
// @description  为小黑盒网页版（xiaoheihe.cn）提供深色模式：按角色重映射站点 CSS 规则，覆盖伪元素与交互态，可一键切换并记住偏好。
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
	var ROOT_CLASS = "hb-dark";
	var STYLE_ID = "hb-dark-overrides";
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
					const only = plainColorOf(style.getPropertyValue(style[j]));
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
			if (owner && (owner.id === STYLE_ID || owner.hasAttribute("data-hb-own"))) continue;
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
	var inlineQueue = new Set();
	var inlineTimer = null;
	function flushInline() {
		inlineTimer = null;
		const items = inlineQueue;
		inlineQueue = new Set();
		items.forEach((el) => {
			if (el.isConnected) fixInlineStyle(el);
		});
	}
	function queueInline(el) {
		inlineQueue.add(el);
		if (inlineTimer === null) inlineTimer = window.setTimeout(flushInline, 80);
	}
	function startInlineObserver() {
		if (inlineObserver) return;
		fixInlineTree(document.body ?? document.documentElement);
		inlineObserver = new MutationObserver((records) => {
			for (const r of records) {
				if (r.type === "attributes") {
					queueInline(r.target);
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
		if (inlineTimer !== null) {
			window.clearTimeout(inlineTimer);
			inlineTimer = null;
		}
		inlineQueue = new Set();
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
	var styleEl = null;
	var headObserver = null;
	var headProbe = null;
	var retimer = null;
	var enabled = false;
	function build() {
		collect();
		if (!styleEl) {
			styleEl = document.createElement("style");
			styleEl.id = STYLE_ID;
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
	}
	function scheduleBuild(delay = 400) {
		if (!enabled || retimer !== null) return;
		retimer = window.setTimeout(() => {
			retimer = null;
			if (enabled) build();
		}, delay);
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
			for (const r of records) for (const n of Array.from(r.addedNodes)) {
				if (!(n instanceof Element)) continue;
				const tag = n.tagName.toLowerCase();
				if (tag === "link" || tag === "style") {
					scheduleBuild(400);
					return;
				}
			}
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
		document.documentElement.classList.add(ROOT_CLASS);
		document.documentElement.classList.add("dark");
		document.documentElement.style.colorScheme = "dark";
		scheduleMilestones();
		startInlineObserver();
		startSheetObserver();
	}
	function disableDarkEngine() {
		enabled = false;
		document.documentElement.classList.remove(ROOT_CLASS);
		document.documentElement.classList.remove("dark");
		document.documentElement.style.colorScheme = "";
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
	var STORAGE_KEY = "heybox-dark-mode";
	var BASE_STYLE_ID = "hb-dark-base";
	var listeners = new Set();
	function onDarkChange(fn) {
		listeners.add(fn);
		return () => {
			listeners.delete(fn);
		};
	}
	function isDarkEnabled() {
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved === "1") return true;
			if (saved === "0") return false;
		} catch {}
		return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
	}
	function ensureBaseStyle() {
		const inject = () => {
			if (document.getElementById(BASE_STYLE_ID)) return;
			const el = document.createElement("style");
			el.id = BASE_STYLE_ID;
			el.setAttribute("data-hb-own", "");
			el.textContent = dark_base_default;
			(document.head ?? document.documentElement).appendChild(el);
		};
		inject();
		if (document.getElementById(BASE_STYLE_ID)) return;
		const obs = new MutationObserver(() => {
			if (!document.head && !document.documentElement) return;
			obs.disconnect();
			inject();
		});
		obs.observe(document, {
			childList: true,
			subtree: true
		});
	}
	function applyDark(enabled) {
		const root = document.documentElement;
		if (!root) return;
		if (enabled) {
			root.classList.add(ROOT_CLASS);
			ensureBaseStyle();
			enableDarkEngine();
		} else {
			disableDarkEngine();
			root.classList.remove(ROOT_CLASS);
			document.getElementById(BASE_STYLE_ID)?.remove();
		}
		try {
			localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
		} catch {}
		for (const fn of [...listeners]) try {
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
	var ui_default = ":host{all:initial}#heybox-dark-toggle{z-index:2147483646;cursor:pointer;color:#fff;pointer-events:auto;-webkit-tap-highlight-color:transparent;background:#14191e;border:none;border-radius:50%;justify-content:center;align-items:center;width:44px;height:44px;padding:0;transition:transform .2s,background .2s,box-shadow .2s;display:flex;position:fixed;bottom:24px;right:16px;box-shadow:0 8px 20px #00000047}#heybox-dark-toggle:hover{transform:scale(1.06)}#heybox-dark-toggle:active{transform:scale(.96)}#heybox-dark-toggle:focus-visible{outline-offset:2px;outline:2px solid #7aa2f7}#heybox-dark-toggle svg{width:20px;height:20px;display:block}@media (prefers-reduced-motion:reduce){#heybox-dark-toggle{transition:none}#heybox-dark-toggle:hover,#heybox-dark-toggle:active{transform:none}}";
	var HOST_ID = "heybox-dark-mode-root";
	var BUTTON_ID = "heybox-dark-toggle";
	var SVG_NS = "http://www.w3.org/2000/svg";
	var ICON_MOON = ["M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5z"];
	var ICON_SUN = ["M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"];
	function buildIcon(dark) {
		const svg = document.createElementNS(SVG_NS, "svg");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("fill", "none");
		svg.setAttribute("stroke", "currentColor");
		svg.setAttribute("stroke-width", "1.9");
		svg.setAttribute("stroke-linecap", "round");
		svg.setAttribute("stroke-linejoin", "round");
		svg.setAttribute("aria-hidden", "true");
		svg.setAttribute("focusable", "false");
		if (dark) {
			const circle = document.createElementNS(SVG_NS, "circle");
			circle.setAttribute("cx", "12");
			circle.setAttribute("cy", "12");
			circle.setAttribute("r", "4");
			svg.appendChild(circle);
			for (const d of ICON_SUN) {
				const path = document.createElementNS(SVG_NS, "path");
				path.setAttribute("d", d);
				svg.appendChild(path);
			}
			return svg;
		}
		for (const d of ICON_MOON) {
			const path = document.createElementNS(SVG_NS, "path");
			path.setAttribute("d", d);
			svg.appendChild(path);
		}
		return svg;
	}
	function paint(button, dark) {
		const label = dark ? "切换到浅色模式" : "切换到深色模式";
		button.title = label;
		button.setAttribute("aria-label", label);
		button.setAttribute("aria-pressed", dark ? "true" : "false");
		button.replaceChildren(buildIcon(dark));
	}
	function mountToggle() {
		if (document.getElementById(HOST_ID)) return;
		const host = document.createElement("div");
		host.id = HOST_ID;
		host.setAttribute("data-hb-own", "");
		const shadow = host.attachShadow({ mode: "open" });
		const style = document.createElement("style");
		style.textContent = ui_default;
		shadow.appendChild(style);
		const button = document.createElement("button");
		button.id = BUTTON_ID;
		button.type = "button";
		button.addEventListener("click", () => {
			applyDark(!isDarkEnabled());
		});
		onDarkChange((dark) => paint(button, dark));
		paint(button, isDarkEnabled());
		shadow.appendChild(button);
		document.documentElement.appendChild(host);
	}
	whenDocumentElementReady(() => {
		initDarkMode();
		exposeEngineHooks();
		mountToggle();
	});
})();
