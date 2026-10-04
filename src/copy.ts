
import copyCss from './copy.css?inline';

const STORAGE_KEY = 'heybox-copy';
const STYLE_ID = 'hb-copy';

export const COPY_CLASS = 'hb-copy';

const SNAPSHOT_TTL = 3000;

const FOCUS_GRAB_WINDOW = 500;

let headProbe: MutationObserver | null = null;

let rescueAttached = false;
let snapshot: { text: string; revokedAt: number } | null = null;
let focusGrabAt = 0;
let lastMouseDownAt = 0;
let lastMouseDownInEditable = false;

function nodeToElement(node: EventTarget | Node | null): HTMLElement | null {
  if (!node) return null;
  const n = node as Node;
  if (n.nodeType === 1) return n as HTMLElement;
  return n.parentElement;
}

function selectionInEditable(sel: Selection): boolean {
  for (const node of [sel.anchorNode, sel.focusNode]) {
    const el = nodeToElement(node);
    if (el && el.isContentEditable) return true;
  }
  return false;
}

function onSelectionChange(): void {
  const sel = window.getSelection();
  if (!sel) return;

  if (sel.rangeCount > 0 && !sel.isCollapsed) {
    const text = sel.toString();
    if (text && !selectionInEditable(sel)) {
      snapshot = { text, revokedAt: 0 };
    }
    return;
  }

  if (snapshot && snapshot.revokedAt === 0) {
    if (focusGrabAt !== 0 && Date.now() - focusGrabAt <= FOCUS_GRAB_WINDOW) {
      snapshot.revokedAt = Date.now();
    } else {
      snapshot = null;
    }
  }
}

function onMouseDown(event: MouseEvent): void {
  lastMouseDownAt = Date.now();
  const el = nodeToElement(event.target);
  lastMouseDownInEditable = !!(el && (el.isContentEditable || el.closest('input, textarea')));
}

function onFocusIn(event: FocusEvent): void {
  const el = nodeToElement(event.target);
  if (!el || !el.isContentEditable) return;
  if (Date.now() - lastMouseDownAt <= FOCUS_GRAB_WINDOW && lastMouseDownInEditable) {
    snapshot = null;
    focusGrabAt = 0;
    return;
  }
  focusGrabAt = Date.now();
}

function onCopy(event: ClipboardEvent): void {
  const sel = window.getSelection();
  const cd = event.clipboardData;
  if (!cd) return;

  let text = '';
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed && !selectionInEditable(sel)) {
    text = sel.toString();
  }
  if (!text && snapshot && snapshot.revokedAt !== 0 && Date.now() - snapshot.revokedAt <= SNAPSHOT_TTL) {
    text = snapshot.text;
  }
  if (!text) return;

  if (cd.getData('text/plain') !== '') return;

  cd.setData('text/plain', text);
  event.preventDefault();
}

function attach(): void {
  if (rescueAttached) return;
  rescueAttached = true;
  document.addEventListener('selectionchange', onSelectionChange);
  window.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('focusin', onFocusIn, true);
  window.addEventListener('copy', onCopy, false);
}

function detach(): void {
  if (!rescueAttached) return;
  rescueAttached = false;
  document.removeEventListener('selectionchange', onSelectionChange);
  window.removeEventListener('mousedown', onMouseDown, true);
  document.removeEventListener('focusin', onFocusIn, true);
  window.removeEventListener('copy', onCopy, false);
  snapshot = null;
  focusGrabAt = 0;
}

export function isCopyEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
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
  el.textContent = copyCss;
  head.appendChild(el);
}

function stopHeadProbe(): void {
  headProbe?.disconnect();
  headProbe = null;
}

export function applyCopy(enabled: boolean): void {
  const root = document.documentElement;
  if (!root) return;

  if (enabled) {
    root.classList.add(COPY_CLASS);
    ensureStyle();
    attach();
  } else {
    detach();
    root.classList.remove(COPY_CLASS);
    stopHeadProbe();
    document.getElementById(STYLE_ID)?.remove();
  }

  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
  }
}

export function initCopy(): boolean {
  const enabled = isCopyEnabled();
  applyCopy(enabled);
  return enabled;
}

export function exposeCopyHooks(): void {
  const w = window as unknown as Record<string, unknown>;
  w.__hbSetCopy = (on: boolean): void => applyCopy(on);
  w.__hbIsCopy = () => isCopyEnabled();
}
