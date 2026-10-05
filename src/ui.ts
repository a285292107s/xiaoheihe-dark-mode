
import { applyDark, isDarkEnabled, onDarkChange } from './dark-mode';
import { applyDeclutter, isDeclutterEnabled, onDeclutterChange } from './declutter';
import { applyReplyBtn, isReplyBtnEnabled, onReplyBtnChange } from './reply-btn';
import { applyCommentCards, isCommentCardsEnabled, onCommentCardsChange } from './comment-cards';
import uiCss from './ui.css?inline';

const HOST_ID = 'heybox-dark-mode-root';
const DARK_BUTTON_ID = 'heybox-dark-toggle';
const DECLUTTER_BUTTON_ID = 'heybox-declutter-toggle';
const COMMENT_BUTTON_ID = 'heybox-comment-toggle';
const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_MOON = ['M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5z'];
const ICON_SUN = [
  'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41',
];

const ICON_PANEL_WITH_RAIL = [
  'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  'M15 5v14',
];
const ICON_PANEL_FULL = [
  'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  'M6 9.5h12',
  'M6 14h8',
];

const ICON_BUBBLE = [
  'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  'M8.5 8.5h7',
  'M8.5 12h4.5',
];
const ICON_BUBBLE_OFF = [...ICON_BUBBLE, 'M3.8 20.2 20.2 3.8'];

function buildIcon(
  paths: readonly string[],
  circle?: { cx: number; cy: number; r: number },
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  if (circle) {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', String(circle.cx));
    dot.setAttribute('cy', String(circle.cy));
    dot.setAttribute('r', String(circle.r));
    svg.appendChild(dot);
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
  button.className = 'hbd-btn';
  button.type = 'button';

  const iconSlot = document.createElement('span');
  iconSlot.className = 'hbd-icon';
  button.appendChild(iconSlot);

  shadow.appendChild(button);
  return { button, iconSlot };
}

function paint(
  control: Control,
  paths: readonly string[],
  circle: { cx: number; cy: number; r: number } | undefined,
  label: string,
  pressed: boolean,
): void {
  control.button.title = label;
  control.button.setAttribute('aria-label', label);
  control.button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  control.iconSlot.replaceChildren(buildIcon(paths, circle));
}

const SUN_CORE = { cx: 12, cy: 12, r: 4 };

function paintDark(control: Control, dark: boolean): void {
  paint(control, dark ? ICON_MOON : ICON_SUN, dark ? undefined : SUN_CORE, dark ? '切换到浅色模式' : '切换到深色模式', dark);
}

function paintDeclutter(control: Control, on: boolean): void {
  paint(
    control,
    on ? ICON_PANEL_FULL : ICON_PANEL_WITH_RAIL,
    undefined,
    on ? '关闭精简模式（恢复首页入口与右侧栏）' : '开启精简模式（隐藏首页入口与右侧栏）',
    on,
  );
}

function paintCommentEnhance(control: Control, on: boolean): void {
  paint(
    control,
    on ? ICON_BUBBLE : ICON_BUBBLE_OFF,
    undefined,
    on ? '关闭评论区增强（恢复一行式楼中楼，点正文重新弹回复框）' : '开启评论区增强（楼中楼卡片化 + 点正文不弹回复框）',
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
  const commentControl = createControl(shadow, COMMENT_BUTTON_ID);

  const commentEnhanceOn = (): boolean => isReplyBtnEnabled() && isCommentCardsEnabled();

  darkControl.button.addEventListener('click', () => applyDark(!isDarkEnabled()));
  declutterControl.button.addEventListener('click', () => applyDeclutter(!isDeclutterEnabled()));
  commentControl.button.addEventListener('click', () => {
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
