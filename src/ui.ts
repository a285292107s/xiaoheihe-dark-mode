
import { applyDark, isDarkEnabled, onDarkChange } from './dark-mode';
import { applyDeclutter, isDeclutterEnabled, onDeclutterChange } from './declutter';
import { applyReplyBtn, isReplyBtnEnabled, onReplyBtnChange } from './reply-btn';
import { applyCommentCards, isCommentCardsEnabled, onCommentCardsChange } from './comment-cards';
import { buildSvg } from './svg';
import uiCss from './ui.css?inline';

const HOST_ID = 'heybox-dark-mode-root';
const DARK_BUTTON_ID = 'heybox-dark-toggle';
const DECLUTTER_BUTTON_ID = 'heybox-declutter-toggle';
const COMMENT_BUTTON_ID = 'heybox-comment-toggle';

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

interface Control {
  button: HTMLButtonElement;
  iconSlot: HTMLElement;
  labelSlot: HTMLElement;
}

function createControl(dock: HTMLElement, id: string): Control {
  const button = document.createElement('button');
  button.id = id;
  button.className = 'hbd-btn';
  button.type = 'button';

  const iconSlot = document.createElement('span');
  iconSlot.className = 'hbd-icon';

  const labelSlot = document.createElement('span');
  labelSlot.className = 'hbd-label';
  labelSlot.setAttribute('aria-hidden', 'true');

  button.append(iconSlot, labelSlot);
  dock.appendChild(button);
  return { button, iconSlot, labelSlot };
}

function paint(
  control: Control,
  paths: readonly string[],
  circle: { cx: number; cy: number; r: number } | undefined,
  state: string,
  action: string,
  pressed: boolean,
): void {
  control.button.title = action;
  control.button.setAttribute('aria-label', `${state}，点击${action}`);
  control.button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  control.iconSlot.replaceChildren(buildSvg(paths, circle));
  control.labelSlot.textContent = state;
}

const SUN_CORE = { cx: 12, cy: 12, r: 4 };

function paintDark(control: Control, dark: boolean): void {
  paint(
    control,
    dark ? ICON_MOON : ICON_SUN,
    dark ? undefined : SUN_CORE,
    dark ? '深色模式' : '浅色模式',
    dark ? '切换到浅色模式' : '切换到深色模式',
    dark,
  );
}

function paintDeclutter(control: Control, on: boolean): void {
  paint(
    control,
    on ? ICON_PANEL_FULL : ICON_PANEL_WITH_RAIL,
    undefined,
    on ? '纯净模式' : '常规模式',
    on ? '切换到常规模式' : '切换到纯净模式',
    on,
  );
}

function paintCommentEnhance(control: Control, on: boolean): void {
  paint(
    control,
    on ? ICON_BUBBLE : ICON_BUBBLE_OFF,
    undefined,
    on ? '评论增强' : '默认评论',
    on ? '恢复默认评论' : '开启评论增强',
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

  const dock = document.createElement('div');
  dock.className = 'hbd-dock';
  dock.setAttribute('role', 'group');
  dock.setAttribute('aria-label', '页面显示选项');
  shadow.appendChild(dock);

  const darkControl = createControl(dock, DARK_BUTTON_ID);
  const declutterControl = createControl(dock, DECLUTTER_BUTTON_ID);
  const commentControl = createControl(dock, COMMENT_BUTTON_ID);

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
