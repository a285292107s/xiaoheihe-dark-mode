/**
 * 右下角的两个开关：深色模式、页面精简。
 *
 * 早期版本用 React + react-dom 渲染这一个按钮，代价是整个包体积的 95.6%
 * （585.7 KB 里的 561.7 KB）。按钮本身只有「一个 svg + 一个 click 监听」，
 * 用原生 DOM 表达更直接，也免掉了框架在宿主页面里注册事件系统/调度器
 * 带来的额外副作用。
 *
 * 两个按钮同挂在一个 Shadow DOM 里（站点样式彻底隔离），宿主打 data-hb-own，
 * 让深色引擎跳过它（否则按钮自身也会被引擎重映射）。
 * 它们是一套控件里的两个开关：同一套材质、同一尺寸、竖着叠成一列。
 *
 * 视觉规格全在 ui.css（含线宽、尺寸、间距、动效令牌），这里只提供图标几何。
 */

import { applyDark, isDarkEnabled, onDarkChange } from './dark-mode';
import { applyDeclutter, isDeclutterEnabled, onDeclutterChange } from './declutter';
import uiCss from './ui.css?inline';

const HOST_ID = 'heybox-dark-mode-root';
const DARK_BUTTON_ID = 'heybox-dark-toggle';
const DECLUTTER_BUTTON_ID = 'heybox-declutter-toggle';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 月亮：深色模式下点击可切回浅色 */
const ICON_MOON = ['M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5z'];
/** 太阳：浅色模式下点击可切到深色。八条射线写成一条 path（多段 M）而不是八个节点 */
const ICON_SUN = [
  'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41',
];

/**
 * 面板 + 右侧栏：精简模式关闭时页面就是这个样子。
 *
 * 这两个图标画的是**当前**状态，而不是「点击后会变成什么」（深色按钮是后者）：
 * 这里画的就是页面上那块布局，一张写实的图必须跟屏幕上看到的一致才不会误读。
 * 动作名交给 title / aria-label，它们本来就写着「点一下会发生什么」。
 */
const ICON_PANEL_WITH_RAIL = [
  'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  // 分隔线落在 2/3 处，贴近站点 660 : 356 的实际栏宽比
  'M15 5v14',
];
/** 面板铺满：精简模式开启后右侧栏已隐藏，内容占满整个宽度 */
const ICON_PANEL_FULL = [
  'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  'M6 9.5h12',
  'M6 14h8',
];

/**
 * 用 createElementNS 而不是 innerHTML 拼图标：
 * 宿主站点若启用 Trusted Types，innerHTML 会被 CSP 直接拒绝。
 *
 * 只描述几何：线宽/端点/颜色都由 ui.css 的令牌决定，换视觉不用改这里。
 * circle 排在 children 最前（太阳的圆心），验收脚本按这个顺序断言过图标。
 */
function buildIcon(paths: readonly string[], withCircle = false): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  if (withCircle) {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '4');
    svg.appendChild(circle);
  }
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

interface Control {
  button: HTMLButtonElement;
  iconSlot: HTMLElement;
}

function createControl(shadow: ShadowRoot, id: string): Control {
  const button = document.createElement('button');
  button.id = id;
  // 材质类：两个圆点共用一套外观，各自只在 ui.css 里补一条纵向位置
  button.className = 'hbd-btn';
  button.type = 'button';

  const iconSlot = document.createElement('span');
  iconSlot.className = 'hbd-icon';
  button.appendChild(iconSlot);

  shadow.appendChild(button);
  return { button, iconSlot };
}

/** 图标几何由调用方给，文案与 aria 由这里统一同步 */
function paint(control: Control, paths: readonly string[], withCircle: boolean, label: string, pressed: boolean): void {
  control.button.title = label;
  control.button.setAttribute('aria-label', label);
  control.button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  // 只换图标槽的内容：ui.css 靠「节点被替换」让入场动画重放，
  // 按钮自身不重建，焦点也不会丢。
  control.iconSlot.replaceChildren(buildIcon(paths, withCircle));
}

function paintDark(control: Control, dark: boolean): void {
  // 深色下点一下会回到浅色，所以图标画的是「点击后的样子」
  paint(control, dark ? ICON_SUN : ICON_MOON, dark, dark ? '切换到浅色模式' : '切换到深色模式', dark);
}

function paintDeclutter(control: Control, on: boolean): void {
  paint(
    control,
    on ? ICON_PANEL_FULL : ICON_PANEL_WITH_RAIL,
    false,
    on ? '关闭精简模式（恢复首页入口与右侧栏）' : '开启精简模式（隐藏首页入口与右侧栏）',
    on,
  );
}

export function mountControls(): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-hb-own', '');

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = uiCss;
  shadow.appendChild(style);

  const darkControl = createControl(shadow, DARK_BUTTON_ID);
  const declutterControl = createControl(shadow, DECLUTTER_BUTTON_ID);

  // 以实际状态取反，而不是闭包里的旧值：控制台调用 __hbSetDark 后也不会错位
  darkControl.button.addEventListener('click', () => applyDark(!isDarkEnabled()));
  declutterControl.button.addEventListener('click', () => applyDeclutter(!isDeclutterEnabled()));

  // 订阅而不是各存一份状态：任何入口（按钮、控制台、未来其它 UI）改状态都会同步图标
  onDarkChange((dark) => paintDark(darkControl, dark));
  onDeclutterChange((on) => paintDeclutter(declutterControl, on));
  paintDark(darkControl, isDarkEnabled());
  paintDeclutter(declutterControl, isDeclutterEnabled());

  // 最后整体挂上去：两个按钮同属一列，避免只出现一个的中间态被画出来
  document.documentElement.appendChild(host);
}
