
import declutterCss from './declutter.css?inline';
import { ensureOwnStyle, removeOwnStyle } from './own-style';

const STORAGE_KEY = 'heybox-declutter';
const STYLE_ID = 'hb-declutter';
const DECLUTTER_CLASS = 'hb-declutter';

type DeclutterListener = (enabled: boolean) => void;
const listeners = new Set<DeclutterListener>();

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

export function applyDeclutter(enabled: boolean): void {
  const root = document.documentElement;
  if (!root) return;

  if (enabled) {
    root.classList.add(DECLUTTER_CLASS);
    ensureOwnStyle(STYLE_ID, declutterCss);
  } else {
    root.classList.remove(DECLUTTER_CLASS);
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
