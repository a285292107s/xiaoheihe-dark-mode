
import { CARD_ATTR, CARD_REPLY_CLASS } from './comment-cards';
import { ensureOwnStyle, removeOwnStyle } from './own-style';
import { appendToRowDock, buildPlaneIcon, dropRowControl, pruneEmptyRowDocks } from './row-dock';
import replyBtnCss from './reply-btn.css?inline';
import rowDockCss from './row-dock.css?inline';
import tokensCss from './tokens.css?inline';

const STORAGE_KEY = 'heybox-reply-btn';
const STYLE_ID = 'hb-reply-btn';
const REPLY_CLASS = 'hb-reply-btn';

const MAIN_ROW_SELECTOR = '.link-comment__comment-item';
const CHILD_ROW_SELECTOR = '.comment-children-item';
const MAIN_ANCHOR_SELECTOR = '.comment-item__content-container';
const THREAD_SELECTOR = '.link-comment__comment-children';
const BTN_CLASS = 'hb-reply';
const ROW_BTN_SELECTOR = `.${BTN_CLASS}, .${CARD_REPLY_CLASS}`;

type ReplyListener = (enabled: boolean) => void;
const listeners = new Set<ReplyListener>();

let observer: MutationObserver | null = null;
let guardAttached = false;

let passThrough = 0;

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

  if (el.closest(`[${CARD_ATTR}]`) || el.closest(CHILD_ROW_SELECTOR)) return true;

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

function createButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = BTN_CLASS;
  btn.setAttribute('data-hb-own', '');
  btn.title = '回复这条评论';
  btn.setAttribute('aria-label', '回复这条评论');
  btn.appendChild(buildPlaneIcon());
  btn.addEventListener('mousedown', (e) => e.stopPropagation());
  return btn;
}

function decorateRow(row: Element): void {
  if (row.matches(CHILD_ROW_SELECTOR)) return;
  if (row.querySelector(`.${BTN_CLASS}`)) return;

  const anchor = row.querySelector(MAIN_ANCHOR_SELECTOR);
  if (!anchor) return;

  appendToRowDock(anchor as HTMLElement, createButton(), THREAD_SELECTOR);
}

function decorateAll(): void {
  for (const row of document.querySelectorAll(MAIN_ROW_SELECTOR)) decorateRow(row);
}

function ensureObserver(): void {
  if (observer) return;
  observer = new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node.nodeType !== 1) continue;
        const el = node as HTMLElement;
        if (el.matches(MAIN_ROW_SELECTOR)) decorateRow(el);
        for (const row of el.querySelectorAll(MAIN_ROW_SELECTOR)) decorateRow(row);
      }
    }
    for (const anchor of document.querySelectorAll(MAIN_ANCHOR_SELECTOR)) {
      if (!anchor.querySelector(`.${BTN_CLASS}`)) decorateRow(anchor.closest(MAIN_ROW_SELECTOR) ?? anchor);
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
  for (const b of document.querySelectorAll(`.${BTN_CLASS}`)) {
    const anchor = b.closest(MAIN_ANCHOR_SELECTOR);
    b.remove();
    if (anchor) dropRowControl(anchor, BTN_CLASS);
  }
  pruneEmptyRowDocks();
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
    ensureOwnStyle(STYLE_ID, `${tokensCss}\n${rowDockCss}\n${replyBtnCss}`);
    attach();
  } else {
    detach();
    root.classList.remove(REPLY_CLASS);
    removeOwnStyle(STYLE_ID);
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
