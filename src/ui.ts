/**
 * 深色模式开关按钮。
 *
 * 早期版本用 React + react-dom 渲染这一个按钮，代价是整个包体积的 95.6%
 * （585.7 KB 里的 561.7 KB）。按钮本身只有「一个 svg + 一个 click 监听」，
 * 用原生 DOM 表达更直接，也免掉了框架在宿主页面里注册事件系统/调度器
 * 带来的额外副作用。
 *
 * 挂在 Shadow DOM 里，与站点样式彻底隔离；宿主打 data-hb-own，
 * 让深色引擎跳过它（否则按钮自身也会被引擎重映射）。
 */

import { applyDark, isDarkEnabled, onDarkChange } from './dark-mode';
import uiCss from './ui.css?inline';

const HOST_ID = 'heybox-dark-mode-root';
const BUTTON_ID = 'heybox-dark-toggle';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 月亮：深色模式下点击可切回浅色 */
const ICON_MOON = ['M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5z'];
/** 太阳：浅色模式下点击可切到深色 */
const ICON_SUN = [
  'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41',
];

/**
 * 用 createElementNS 而不是 innerHTML 拼图标：
 * 宿主站点若启用 Trusted Types，innerHTML 会被 CSP 直接拒绝。
 */
function buildIcon(dark: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  if (dark) {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '4');
    svg.appendChild(circle);
    for (const d of ICON_SUN) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    }
    return svg;
  }

  for (const d of ICON_MOON) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

function paint(button: HTMLButtonElement, dark: boolean): void {
  const label = dark ? '切换到浅色模式' : '切换到深色模式';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', dark ? 'true' : 'false');
  button.replaceChildren(buildIcon(dark));
}

export function mountToggle(): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-hb-own', '');

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = uiCss;
  shadow.appendChild(style);

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.addEventListener('click', () => {
    // 以实际状态取反，而不是闭包里的旧值：控制台调用 __hbSetDark 后也不会错位
    applyDark(!isDarkEnabled());
  });
  // 订阅而不是各存一份状态：任何入口（按钮、控制台、未来其它 UI）改状态都会同步图标
  onDarkChange((dark) => paint(button, dark));
  paint(button, isDarkEnabled());
  shadow.appendChild(button);

  document.documentElement.appendChild(host);
}
