
import replyBtnCss from './reply-btn.css?inline';
import tokensCss from './tokens.css?inline';

const STORAGE_KEY = 'heybox-reply-btn';
const STYLE_ID = 'hb-reply-btn';
const REPLY_CLASS = 'hb-reply-btn';

const MAIN_ROW_SELECTOR = '.link-comment__comment-item';
const CHILD_ROW_SELECTOR = '.comment-children-item';
const ROW_SELECTOR = MAIN_ROW_SELECTOR;
const MAIN_ANCHOR_SELECTOR = '.comment-item-header__operation-box';
const BTN_CLASS = 'hb-reply';
const CARD_REPLY_CLASS = 'hb-card-reply';
const ROW_BTN_SELECTOR = `.${BTN_CLASS}, .${CARD_REPLY_CLASS}`;

const HB_CARD_ATTR = 'data-hb-tc';

type ReplyListener = (enabled: boolean) => void;
const listeners = new Set<ReplyListener>();

let headProbe: MutationObserver | null = null;
let observer: MutationObserver | null = null;
let guardAttached = false;

let passThrough = 0;

let syntheticTarget: HTMLElement | null = null;

function setSyntheticTarget(el: HTMLElement | null): void {
  syntheticTarget = el;
}

export function isRowClickSynthesized(el?: Element | null): boolean {
  if (passThrough <= 0) return false;
  if (!el) return true;
  const target = el as HTMLElement;
  return syntheticTarget === target || target.contains(syntheticTarget);
}

function nodeToElement(node: EventTarget | Node | null): HTMLElement | null {
  if (!node) return null;
  const n = node as Node;
  if (n.nodeType === 1) return n as HTMLElement;
  return n.parentElement;
}

function isSiteInteractive(el: HTMLElement | null): boolean {
  if (!el) return false;
  return !!el.closest('a, button, input, textarea, [contenteditable], [role="button"]');
}

function isImageZone(el: HTMLElement | null): boolean {
  if (!el) return false;
  return !!el.closest('.comment-item__image-box, .comment-item__image-wrapper, img');
}

function shouldBlock(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (isSiteInteractive(el) || isImageZone(el)) return false;

  if (el.closest(`[${HB_CARD_ATTR}]`) || el.closest(CHILD_ROW_SELECTOR)) return true;

  const mainRow = el.closest(MAIN_ROW_SELECTOR);
  if (!mainRow) return false;

  if (el.closest('.link-comment__comment-children')) return false;
  return true;
}

function onClickCapture(event: MouseEvent): void {
  const el = nodeToElement(event.target);

  const btn = el ? el.closest<HTMLElement>(ROW_BTN_SELECTOR) : null;
  if (btn) {
    const host = btn.closest<HTMLElement>(CHILD_ROW_SELECTOR) || btn.closest<HTMLElement>(MAIN_ROW_SELECTOR);
    if (host) {
      passThrough += 1;
      try {
        setSyntheticTarget(el);
        host.click();
      } finally {
        setSyntheticTarget(null);
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

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;

  const head = document.head;
  if (!head) {
    if (headProbe) return;
    headProbe = new MutationObserver(() => {
      if (!document.head) return;
      stopHeadProbe();
      ensureStyle();
    });
    headProbe.observe(document, { childList: true, subtree: true });
    return;
  }

  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.setAttribute('data-hb-own', '');
  el.textContent = `${tokensCss}\n${replyBtnCss}`;
  head.appendChild(el);
}

function stopHeadProbe(): void {
  headProbe?.disconnect();
  headProbe = null;
}

function createButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = BTN_CLASS;
  btn.setAttribute('data-hb-own', '');
  btn.textContent = '回复';
  btn.title = '回复这条评论';
  btn.setAttribute('aria-label', '回复这条评论');
  btn.addEventListener('mousedown', (e) => e.stopPropagation());
  return btn;
}

function decorateRow(row: Element): void {
  if (row.matches(CHILD_ROW_SELECTOR)) return;
  if (row.querySelector(`.${BTN_CLASS}`)) return;

  const anchor = row.querySelector(MAIN_ANCHOR_SELECTOR);
  if (!anchor || !anchor.parentElement) return;

  anchor.appendChild(createButton());
}

function decorateAll(): void {
  for (const row of document.querySelectorAll(ROW_SELECTOR)) decorateRow(row);
}

function ensureObserver(): void {
  if (observer) return;
  observer = new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node.nodeType !== 1) continue;
        const el = node as HTMLElement;
        if (el.matches(ROW_SELECTOR)) decorateRow(el);
        for (const row of el.querySelectorAll(ROW_SELECTOR)) decorateRow(row);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function attach(): void {
  if (guardAttached) return;
  guardAttached = true;
  document.addEventListener('click', onClickCapture, true);
  decorateAll();
  ensureObserver();
}

function detach(): void {
  if (!guardAttached) return;
  guardAttached = false;
  document.removeEventListener('click', onClickCapture, true);
  observer?.disconnect();
  observer = null;
  for (const b of document.querySelectorAll(`.${BTN_CLASS}`)) b.remove();
}

export function onReplyBtnChange(fn: ReplyListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isReplyBtnEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function applyReplyBtn(enabled: boolean): void {
  const root = document.documentElement;
  if (!root) return;

  if (enabled) {
    root.classList.add(REPLY_CLASS);
    ensureStyle();
    attach();
  } else {
    detach();
    root.classList.remove(REPLY_CLASS);
    stopHeadProbe();
    document.getElementById(STYLE_ID)?.remove();
  }

  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
  }

  for (const fn of [...listeners]) {
    try {
      fn(enabled);
    } catch (err) {
      console.error('[hb-reply-btn] listener failed', err);
    }
  }
}

export function initReplyBtn(): boolean {
  const enabled = isReplyBtnEnabled();
  applyReplyBtn(enabled);
  return enabled;
}

export function exposeReplyBtnHooks(): void {
  const w = window as unknown as Record<string, unknown>;
  w.__hbSetReplyBtn = (on: boolean): void => applyReplyBtn(on);
  w.__hbIsReplyBtn = () => isReplyBtnEnabled();
}
