
import declutterCss from './declutter.css?inline';

const STORAGE_KEY = 'heybox-declutter';
const STYLE_ID = 'hb-declutter';

export const DECLUTTER_CLASS = 'hb-declutter';

type DeclutterListener = (enabled: boolean) => void;
const listeners = new Set<DeclutterListener>();
let headProbe: MutationObserver | null = null;

export function onDeclutterChange(fn: DeclutterListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isDeclutterEnabled(): boolean {
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
  el.textContent = declutterCss;
  head.appendChild(el);
}

function stopHeadProbe(): void {
  headProbe?.disconnect();
  headProbe = null;
}

export function applyDeclutter(enabled: boolean): void {
  const root = document.documentElement;
  if (!root) return;

  if (enabled) {
    root.classList.add(DECLUTTER_CLASS);
    ensureStyle();
  } else {
    root.classList.remove(DECLUTTER_CLASS);
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
      console.error('[hb-declutter] listener failed', err);
    }
  }
}

export function initDeclutter(): boolean {
  const enabled = isDeclutterEnabled();
  applyDeclutter(enabled);
  return enabled;
}

export function exposeDeclutterHooks(): void {
  const w = window as unknown as Record<string, unknown>;
  w.__hbSetDeclutter = (on: boolean): void => applyDeclutter(on);
  w.__hbIsDeclutter = () => isDeclutterEnabled();
}
