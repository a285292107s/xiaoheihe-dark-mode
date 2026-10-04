
import { applyDark, isDarkEnabled, onDarkChange } from './dark-mode';
import { applyDeclutter, isDeclutterEnabled, onDeclutterChange } from './declutter';
import { applyReplyBtn, isReplyBtnEnabled, onReplyBtnChange } from './reply-btn';
import { applyCommentCards, isCommentCardsEnabled, onCommentCardsChange } from './comment-cards';
import uiCss from './ui.css?inline';

const HOST_ID = 'heybox-dark-mode-root';
const DARK_BUTTON_ID = 'heybox-dark-toggle';
const DECLUTTER_BUTTON_ID = 'heybox-declutter-toggle';
const REPLY_BUTTON_ID = 'heybox-reply-toggle';
const CARDS_BUTTON_ID = 'heybox-cards-toggle';
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

const ICON_REPLY = [
  'M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 16.5H12l-4.2 3.2a.5.5 0 0 1-.8-.4V16.5H4A1.5 1.5 0 0 1 2.5 15V7A1.5 1.5 0 0 1 4 5.5Z',
];
const ICON_REPLY_OFF = [
  'M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 16.5H12l-4.2 3.2a.5.5 0 0 1-.8-.4V16.5H4A1.5 1.5 0 0 1 2.5 15V7A1.5 1.5 0 0 1 4 5.5Z',
  'M3.8 20.2 20.2 3.8',
];

const ICON_CARDS = [
  'M3.25 5.25h17.5a1 1 0 0 1 1 1v11.5a1 1 0 0 1-1 1H3.25a1 1 0 0 1-1-1V6.25a1 1 0 0 1 1-1Z',
  'M7.7 10.5h11.4',
  'M7.7 13.7h7.4',
];
const ICON_CARDS_OFF = [...ICON_CARDS, 'M3.8 20.2 20.2 3.8'];
const CARDS_AVATAR_DOT = { cx: 6.4, cy: 10.6, r: 1.7 };

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
  paint(control, dark ? ICON_SUN : ICON_MOON, dark ? SUN_CORE : undefined, dark ? '切换到浅色模式' : '切换到深色模式', dark);
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

function paintReplyBtn(control: Control, on: boolean): void {
  paint(
    control,
    on ? ICON_REPLY : ICON_REPLY_OFF,
    undefined,
    on ? '关闭评论免打扰（恢复点整行弹回复框）' : '点正文不再弹回复框（改用行内「回复」按钮）',
    on,
  );
}

function paintCards(control: Control, on: boolean): void {
  paint(
    control,
    on ? ICON_CARDS : ICON_CARDS_OFF,
    on ? CARDS_AVATAR_DOT : undefined,
    on ? '恢复楼中楼原本的一行式显示' : '把楼中楼每条回复显示成卡片',
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
  const replyControl = createControl(shadow, REPLY_BUTTON_ID);
  const cardsControl = createControl(shadow, CARDS_BUTTON_ID);

  darkControl.button.addEventListener('click', () => applyDark(!isDarkEnabled()));
  declutterControl.button.addEventListener('click', () => applyDeclutter(!isDeclutterEnabled()));
  replyControl.button.addEventListener('click', () => applyReplyBtn(!isReplyBtnEnabled()));
  cardsControl.button.addEventListener('click', () => applyCommentCards(!isCommentCardsEnabled()));

  onDarkChange((dark) => paintDark(darkControl, dark));
  onDeclutterChange((on) => paintDeclutter(declutterControl, on));
  onReplyBtnChange((on) => paintReplyBtn(replyControl, on));
  onCommentCardsChange((on) => paintCards(cardsControl, on));
  paintDark(darkControl, isDarkEnabled());
  paintDeclutter(declutterControl, isDeclutterEnabled());
  paintReplyBtn(replyControl, isReplyBtnEnabled());
  paintCards(cardsControl, isCommentCardsEnabled());

  document.documentElement.appendChild(host);
}
