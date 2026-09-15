/**
 * 小黑盒深色引擎（原型 / 可移植到 userscript）
 *
 * 设计依据（来自 research/ 的实测结论）：
 *   - 站点两套设计令牌（--hb-* 695 个、--el-*）对渲染几乎完全无效：
 *     注入红色令牌后，页面上 0 个元素变色 → 令牌层不可作为主要手段。
 *   - 真正决定外观的是 CSS 规则里的**字面量颜色**（详情页 546 条规则）。
 *   - 其中 426 条规则作用于伪元素（::before/::after），
 *     「逐元素写内联样式」在物理上无法覆盖 → 必须改写 CSS 规则本身。
 *   - 站点 CSS 跨域可读（CORS），因此可以枚举规则并生成覆盖表。
 *
 * 策略：把站点 CSS 规则读出来，按「角色」把字面量颜色映射为深色等价，
 *      生成一份同选择器、同优先级、同媒体条件、排在最末的覆盖样式表。
 *      浏览器级联自动作用于当前与未来所有 DOM 节点（含伪元素/hover/媒体查询），
 *      零元素级开销。
 */
(function () {
  'use strict';

  var STYLE_ID = 'hb-dark-overrides';
  var ROOT_CLASS = 'hb-dark';

  // ---------------- 颜色工具 ----------------

  var NAMED = {
    white: [255, 255, 255, 1], black: [0, 0, 0, 1],
    red: [255, 0, 0, 1], green: [0, 128, 0, 1], blue: [0, 0, 255, 1],
    gray: [128, 128, 128, 1], grey: [128, 128, 128, 1],
    silver: [192, 192, 192, 1], whitesmoke: [245, 245, 245, 1],
    gainsboro: [220, 220, 220, 1], lightgray: [211, 211, 211, 1],
    lightgrey: [211, 211, 211, 1], dimgray: [105, 105, 105, 1],
    dimgrey: [105, 105, 105, 1], darkgray: [169, 169, 169, 1],
    darkgrey: [169, 169, 169, 1], orange: [255, 165, 0, 1], yellow: [255, 255, 0, 1],
    gold: [255, 215, 0, 1], pink: [255, 192, 203, 1], tomato: [255, 99, 71, 1],
    crimson: [220, 20, 60, 1], seagreen: [46, 139, 87, 1], teal: [0, 128, 128, 1],
    navy: [0, 0, 128, 1], purple: [128, 0, 128, 1], maroon: [128, 0, 0, 1],
    olive: [128, 128, 0, 1], lime: [0, 255, 0, 1], aqua: [0, 255, 255, 1],
    cyan: [0, 255, 255, 1], fuchsia: [255, 0, 255, 1], magenta: [255, 0, 255, 1],
  };

  function parseColor(input) {
    if (!input) return null;
    var s = String(input).trim().toLowerCase();
    if (!s || s === 'transparent' || s === 'currentcolor' || s === 'inherit' ||
        s === 'initial' || s === 'unset' || s === 'none' || s === 'auto') return null;

    if (s.charCodeAt(0) === 35) {
      var h = s.slice(1);
      if (h.length === 3 || h.length === 4) {
        h = h.split('').map(function (c) { return c + c; }).join('');
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

    var m = s.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      var parts = m[1].split(/[,\s/]+/).filter(Boolean);
      if (parts.length < 3) return null;
      var a = 1;
      if (parts.length >= 4) {
        a = parts[3].indexOf('%') >= 0 ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
      }
      return { r: parseFloat(parts[0]), g: parseFloat(parts[1]), b: parseFloat(parts[2]), a: a };
    }

    var m2 = s.match(/^hsla?\(([^)]+)\)$/);
    if (m2) {
      var p2 = m2[1].split(/[,\s/]+/).filter(Boolean);
      if (p2.length < 3) return null;
      var hue = parseFloat(p2[0]);
      var sat = parseFloat(p2[1]) / 100;
      var lig = parseFloat(p2[2]) / 100;
      var al = p2.length >= 4 ? (p2[3].indexOf('%') >= 0 ? parseFloat(p2[3]) / 100 : parseFloat(p2[3])) : 1;
      var rgb = hslToRgb(hue, sat, lig);
      return { r: rgb[0], g: rgb[1], b: rgb[2], a: al };
    }

    if (NAMED[s]) return { r: NAMED[s][0], g: NAMED[s][1], b: NAMED[s][2], a: NAMED[s][3] };
    return null;
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2, h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [h * 360, s, l];
  }

  function hslToRgb(h, s, l) {
    var hn = (((h % 360) + 360) % 360) / 360;
    if (s === 0) { var v = Math.round(l * 255); return [v, v, v]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    function f(t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return [Math.round(f(hn + 1 / 3) * 255), Math.round(f(hn) * 255), Math.round(f(hn - 1 / 3) * 255)];
  }

  function lum(c) { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function fmt(c, keepAlpha) {
    var r = Math.round(clamp(c.r, 0, 255));
    var g = Math.round(clamp(c.g, 0, 255));
    var b = Math.round(clamp(c.b, 0, 255));
    if (!keepAlpha || c.a >= 1) return 'rgb(' + r + ', ' + g + ', ' + b + ')';
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + Math.round(c.a * 1000) / 1000 + ')';
  }

  // ---------------- 角色判定 ----------------

  // 属性名 -> 颜色角色
  function roleOfProp(prop) {
    var p = prop.toLowerCase();
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
   * 自定义属性：先看名字，名字无信息时交给明度推断。
   *
   * 注意：片段必须整体匹配。早先写成 /color-/ 只能命中 --el-text-color-primary
   * 这类「color 在中间」的名字，会漏掉 --publish-color 这种「color 在结尾」的，
   * 于是落到明度推断，把浅色的前景令牌误判成表面色 —— 导航登录按钮的文字
   * 因此变成与深色渐变底同色。用 (^|-) … ($|-) 修正。
   */
  function roleOfVar(name) {
    if (/shadow/.test(name)) return 'shadow';
    if (/(border|stroke|divider|outline)/.test(name) || /(^|-)line($|-)/.test(name)) return 'border';
    if (/(^|-)(text|color|fg|foreground|ink|label|title|link)($|-)/.test(name)) return 'fg';
    if (/(bg|background|surface|card|panel|fill|plain|white|mask|overlay|paper)/.test(name)) return 'bg';
    return null; // 交给明度推断
  }

  // ---------------- 颜色映射 ----------------

  var SURFACE_MIN = 0.058;  // 最深表面（页面底）
  var SURFACE_MAX = 0.145;  // 最亮表面（浮起卡片）

  function mapSurface(c) {
    var L = lum(c);
    var hsl = rgbToHsl(c.r, c.g, c.b);
    var h = hsl[0], s = hsl[1];

    if (s <= 0.12) {
      // 中性：保留「越亮越浮起」的层级，压到深色带
      if (L < 185) return null;                     // 本来就是深色表面 -> 保留
      var t = (L - 185) / 70;                       // 0..1
      var l = SURFACE_MIN + clamp(t, 0, 1) * (SURFACE_MAX - SURFACE_MIN);
      var rgb = hslToRgb(h, 0, l);
      return { r: rgb[0], g: rgb[1], b: rgb[2], a: c.a };
    }

    // 有彩色
    if (L > 150) {
      // 明亮色块（淡色标签 / 亮色底）-> 深色同色相底，配浅色文字
      var nl = 0.15 + (clamp(L, 150, 255) - 150) / 105 * 0.11;  // 0.15..0.26
      var rgb2 = hslToRgb(h, Math.min(s, 0.55), nl);
      return { r: rgb2[0], g: rgb2[1], b: rgb2[2], a: c.a };
    }
    // 品牌主色（饱和且不太亮）与深彩 -> 保留
    return null;
  }

  function mapText(c) {
    if (c.a < 0.05) return null;
    var L = lum(c);
    var hsl = rgbToHsl(c.r, c.g, c.b);
    var h = hsl[0], s = hsl[1], l = hsl[2];

    if (s > 0.25) {
      // 彩色文字：够亮就保留，太暗则提亮以在深底上可读
      if (L > 150) return null;
      var nl = clamp(Math.max(l, 0.62), 0.62, 0.80);
      var rgb = hslToRgb(h, Math.min(s, 0.8), nl);
      return { r: rgb[0], g: rgb[1], b: rgb[2], a: c.a };
    }

    // 中性文字：整体压到浅色带（单调，阈值处连续）
    if (L >= 190) return null;
    var t = 190 + (190 - L) / 190 * 55;             // L=0 -> 245, L=190 -> 190
    var v = Math.round(clamp(t, 150, 245));
    return { r: v, g: v, b: Math.round(clamp(v * 1.012, 0, 255)), a: c.a };
  }

  function mapBorder(c) {
    if (c.a < 0.06) return null;
    var L = lum(c);
    var hsl = rgbToHsl(c.r, c.g, c.b);
    var s = hsl[1];

    if (s > 0.25) {
      if (L < 130) return null;
      var rgb = hslToRgb(hsl[0], Math.min(s, 0.5), 0.45);
      return { r: rgb[0], g: rgb[1], b: rgb[2], a: c.a };
    }
    if (L < 170) return null;                        // 深边框保留
    // 浅边框 -> 半透明白，亮度越高越弱
    var alpha = clamp(0.06 + (255 - L) / 255 * 0.34, 0.06, 0.30);
    return { r: 255, g: 255, b: 255, a: alpha };
  }

  function mapColor(role, c) {
    if (!c) return null;
    if (role === 'shadow') return null;              // 深色阴影在深底上无害，不处理
    if (role === 'bg') return mapSurface(c);
    if (role === 'border') return mapBorder(c);
    return mapText(c);
  }

  // ---------------- 值改写 ----------------

  var COLOR_TOKEN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black|whitesmoke|gainsboro|lightgray|lightgrey|silver|darkgray|darkgrey|dimgray|dimgrey|gray|grey|orange|gold|pink|tomato|crimson|seagreen|teal|navy|purple|maroon|olive|lime|aqua|cyan|fuchsia|magenta|red|green|blue|yellow)\b/gi;

  /** 判断一个自定义属性的值是否为「纯颜色」（不是 var()/渐变/triplet） */
  function isPlainColorValue(value) {
    if (value.indexOf('var(') >= 0) return null;
    if (value.indexOf('gradient') >= 0) return null;
    if (value.indexOf('url(') >= 0) return null;
    var c = parseColor(value.trim());
    return c;
  }

  /**
   * 改写一条声明的值。返回 null 表示无需改写。
   */
  function transformDeclaration(prop, value, isCustomProp) {
    var role = roleOfProp(prop);
    if (role === null && !isCustomProp) return null;
    if (role === 'shadow') return null;

    // 自定义属性：值为纯颜色时才处理；角色先看名字，再看明度
    if (isCustomProp) {
      var only = isPlainColorValue(value);
      if (!only) return null;
      var r = role;
      if (!r) {
        // 明度推断：偏亮 -> 表面，偏暗 -> 文字
        r = lum(only) > 170 ? 'bg' : 'fg';
      }
      if (r === 'shadow') return null;
      var mapped0 = mapColor(r, only);
      if (!mapped0) return null;
      return fmt(mapped0, true);
    }

    // 普通属性：逐 token 改写，保留非颜色部分（url() 等）
    var changed = false;
    var out = String(value).replace(COLOR_TOKEN, function (tok) {
      var c = parseColor(tok);
      if (!c) return tok;
      var mapped = mapColor(role, c);
      if (!mapped) return tok;
      changed = true;
      return fmt(mapped, true);
    });
    return changed ? out : null;
  }

  // ---------------- 规则遍历 ----------------

  var stats = { sheets: 0, scanned: 0, changed: 0, emitted: 0, keyframes: 0, errors: 0 };
  var out = [];      // 生成的覆盖规则
  var keyframeJobs = [];

  function walk(rules, mediaStack) {
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      stats.scanned++;

      // 媒体/支持条件：保留条件包裹
      if (rule.cssRules && !rule.selectorText) {
        var cond = null;
        var type = rule.constructor && rule.constructor.name;
        if (type === 'CSSMediaRule') cond = '@media ' + rule.conditionText;
        else if (type === 'CSSSupportsRule') cond = '@supports ' + rule.conditionText;
        else if (type === 'CSSLayerBlockRule') cond = '@layer ' + rule.name;
        else if (rule.media && rule.media.mediaText) cond = '@media ' + rule.media.mediaText;
        walk(rule.cssRules, cond ? mediaStack.concat([cond]) : mediaStack);
        continue;
      }

      // 关键帧：颜色在 @keyframes 内，无法用覆盖规则命中，需就地改写
      if (rule.keyText && rule.style) { keyframeJobs.push(rule); continue; }
      if (!rule.selectorText || !rule.style) continue;

      var decls = [];
      var style = rule.style;
      for (var j = 0; j < style.length; j++) {
        var prop = style[j];
        var value = style.getPropertyValue(prop);
        if (!value) continue;
        var isCustom = prop.slice(0, 2) === '--';
        var newValue = transformDeclaration(prop, value, isCustom);
        if (newValue && newValue !== value) {
          decls.push(prop + ': ' + newValue + (style.getPropertyPriority(prop) ? ' !important' : '') + ';');
        }
      }
      if (!decls.length) continue;

      stats.changed++;
      var sel = rule.selectorText;
      var body = decls.join(' ');
      var text = sel + ' { ' + body + ' }';
      for (var k = mediaStack.length - 1; k >= 0; k--) {
        text = mediaStack[k] + ' { ' + text + ' }';
      }
      out.push(text);
      stats.emitted++;
    }
  }

  function collect() {
    out = [];
    keyframeJobs = [];
    stats = { sheets: 0, scanned: 0, changed: 0, emitted: 0, keyframes: 0, errors: 0 };
    var sheets = document.styleSheets;
    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      if (sheet.ownerNode && (sheet.ownerNode.id === STYLE_ID || sheet.ownerNode.getAttribute &&
          sheet.ownerNode.getAttribute('data-hb-own') !== null)) continue;
      var rules;
      try {
        rules = sheet.cssRules;
        if (!rules) continue;
      } catch (e) { stats.errors++; continue; }
      stats.sheets++;
      try { walk(rules, []); } catch (e) { stats.errors++; }
    }
  }

  // ---------------- 内联样式（JS 写入，CSS 规则无法覆盖）----------------

  var INLINE_PROPS = ['color', 'background-color', 'background-image', 'border-color',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'];

  function fixInlineStyle(el) {
    if (!el || el.nodeType !== 1 || !el.style) return;
    if (el.hasAttribute && el.hasAttribute('data-hb-own')) return;
    var changedAny = false;
    for (var i = 0; i < INLINE_PROPS.length; i++) {
      var prop = INLINE_PROPS[i];
      var value = el.style.getPropertyValue(prop);
      if (!value) continue;
      var role = prop === 'color' ? 'fg' : prop === 'background-image' ? 'bg' : 'bg';
      if (prop.indexOf('border') === 0) role = 'border';
      if (role === 'bg' && prop === 'background-image' && value.indexOf('gradient') < 0) continue;
      var nv = transformDeclaration(prop, value, false);
      if (nv) { el.style.setProperty(prop, nv, el.style.getPropertyPriority(prop) || ''); changedAny = true; }
    }
    return changedAny;
  }

  function fixInlineTree(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.hasAttribute && root.hasAttribute('style')) fixInlineStyle(root);
    var list = root.querySelectorAll ? root.querySelectorAll('[style]') : [];
    for (var i = 0; i < list.length; i++) fixInlineStyle(list[i]);
  }

  var inlineObserver = null;
  var inlineQueue = new Set();
  var inlineTimer = null;

  function flushInline() {
    inlineTimer = null;
    var items = inlineQueue; inlineQueue = new Set();
    items.forEach(function (el) { if (el.isConnected) fixInlineStyle(el); });
  }

  function queueInline(el) {
    inlineQueue.add(el);
    if (inlineTimer === null) inlineTimer = window.setTimeout(flushInline, 80);
  }

  function startInlineObserver() {
    if (inlineObserver) return;
    fixInlineTree(document.body || document.documentElement);
    inlineObserver = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === 'attributes') queueInline(r.target);
        else for (var j = 0; j < r.addedNodes.length; j++) {
          var n = r.addedNodes[j];
          if (n.nodeType === 1) fixInlineTree(n);
        }
      }
    });
    inlineObserver.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['style'],
    });
  }

  function stopInlineObserver() {
    if (inlineObserver) { inlineObserver.disconnect(); inlineObserver = null; }
    if (inlineTimer !== null) { clearTimeout(inlineTimer); inlineTimer = null; }
    inlineQueue = new Set();
  }

  // ---------------- 附加：EP 暗色变量 + 基础层 ----------------

  var BASE_CSS = [
    'html.' + ROOT_CLASS + ' { color-scheme: dark; }',
    'html.' + ROOT_CLASS + ', html.' + ROOT_CLASS + ' body {',
    '  background-color: #0e1116 !important;',
    '  color: #e6e8eb;',
    '}',
    'html.' + ROOT_CLASS + ' ::-webkit-scrollbar { width: 8px; height: 8px; }',
    'html.' + ROOT_CLASS + ' ::-webkit-scrollbar-track { background: #0e1116; }',
    'html.' + ROOT_CLASS + ' ::-webkit-scrollbar-thumb { background: #333b45; border-radius: 4px; }',
    'html.' + ROOT_CLASS + ' ::-webkit-scrollbar-thumb:hover { background: #4a5360; }',
    // Element Plus 暗色令牌（站点未内置 EP 暗色主题）
    'html.' + ROOT_CLASS + ' {',
    '  --el-color-white: #1b1f24;',
    '  --el-color-black: #e6e8eb;',
    '  --el-bg-color: #1b1f24;',
    '  --el-bg-color-page: #0e1116;',
    '  --el-bg-color-overlay: #22272e;',
    '  --el-text-color-primary: #e6e8eb;',
    '  --el-text-color-regular: #c9ced6;',
    '  --el-text-color-secondary: #9aa1ab;',
    '  --el-text-color-placeholder: #6f7782;',
    '  --el-text-color-disabled: #4d545d;',
    '  --el-border-color: #2e3540;',
    '  --el-border-color-light: #2a3138;',
    '  --el-border-color-lighter: #262c33;',
    '  --el-border-color-extra-light: #22272e;',
    '  --el-border-color-dark: #3a424e;',
    '  --el-fill-color: #262c33;',
    '  --el-fill-color-light: #22272e;',
    '  --el-fill-color-lighter: #1f242a;',
    '  --el-fill-color-extra-light: #1b1f24;',
    '  --el-fill-color-blank: #1b1f24;',
    '  --el-mask-color: rgba(14, 17, 22, 0.7);',
    '  --el-box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);',
    '  --el-box-shadow-light: 0 2px 8px rgba(0, 0, 0, 0.4);',
    '}',
  ].join('\n');

  // ---------------- 对外接口 ----------------

  // ---------------- 例外层（人工审计，刻意保持很小）----------------
  //
  // 通用引擎处理「表面/文字/边框」的按角色映射，但有一类东西它原理上判不了：
  // 站点用「深底 + 浅字」表达强调（实心 CTA）。深色主题里强调应当是
  // 「浅底 + 深字」，可是引擎只看单条声明，无法知道某个深色表面是
  // 刻意的反转填充，还是压在图片上的角标遮罩（后者不该反转）。
  //
  // 实测全站这类失效点只有一个：导航的登录/发布按钮（.nav 变体）。
  // 站点自己的 .nav--home 变体本来就是「白底深字」，引擎已能正确反转。
  // 因此这里只补这一处，避免不可预测的全局反转。
  var EXCEPTIONS_CSS = [
    '/* 导航主 CTA：浅色下为「深底浅字」，深色下反转为「浅底深字」 */',
    'html.' + ROOT_CLASS + ' .nav {',
    '  --publish-bg: linear-gradient(46deg, #f2f4f7 -.9%, #dfe3e8 100.9%);',
    '  --publish-color: #14191e;',
    '  --publish-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);',
    '}',
  ].join('\n');

  var styleEl = null;
  var headObserver = null;
  var retimer = null;
  var enabled = false;

  function build() {
    collect();
    var parts = [BASE_CSS];
    if (out.length) parts.push(out.join('\n'));
    parts.push(EXCEPTIONS_CSS);
    var css = parts.join('\n');

    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = STYLE_ID;
      styleEl.setAttribute('data-hb-own', '');
    }
    // 文本没变就不重设，避免无谓的重排
    if (styleEl.textContent !== css) styleEl.textContent = css;

    // 关键：始终排在所有站点样式表之后
    var anchor = document.body || document.documentElement;
    if (styleEl.parentNode !== anchor || anchor.lastElementChild !== styleEl) {
      anchor.appendChild(styleEl);
    }

    // 关键帧就地改写（覆盖表无法命中 @keyframes 内部）
    var kfChanged = 0;
    for (var i = 0; i < keyframeJobs.length; i++) {
      var style = keyframeJobs[i].style;
      for (var j = 0; j < style.length; j++) {
        var prop = style[j];
        var value = style.getPropertyValue(prop);
        var nv = transformDeclaration(prop, value, prop.slice(0, 2) === '--');
        if (nv && nv !== value) {
          try { style.setProperty(prop, nv, style.getPropertyPriority(prop) || ''); kfChanged++; } catch (e) {}
        }
      }
    }
    stats.keyframes = kfChanged;
  }

  function scheduleBuild(delay) {
    if (!enabled) return;
    if (retimer !== null) return;
    retimer = window.setTimeout(function () {
      retimer = null;
      if (!enabled) return;
      build();
    }, delay || 300);
  }

  function startSheetObserver() {
    if (headObserver) return;
    headObserver = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (!n.tagName) continue;
          var t = n.tagName.toLowerCase();
          if (t === 'link' || t === 'style') { scheduleBuild(400); return; }
        }
      }
    });
    headObserver.observe(document.head || document.documentElement, { childList: true, subtree: true });
  }

  function enable() {
    if (enabled) return;
    enabled = true;
    document.documentElement.classList.add(ROOT_CLASS);
    build();
    startInlineObserver();
    startSheetObserver();
  }

  function disable() {
    enabled = false;
    document.documentElement.classList.remove(ROOT_CLASS);
    stopInlineObserver();
    if (headObserver) { headObserver.disconnect(); headObserver = null; }
    if (retimer !== null) { clearTimeout(retimer); retimer = null; }
    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    styleEl = null;
  }

  window.__hbDarkProto = {
    enable: enable,
    disable: disable,
    stats: function () { return stats; },
    cssSize: function () { return styleEl ? styleEl.textContent.length : 0; },
    cssSample: function (n) { return out.slice(0, n || 20); },
  };
})();
