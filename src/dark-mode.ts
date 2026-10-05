
import {
  disableDarkEngine,
  enableDarkEngine,
  getEngineCss,
  getEngineStats,
  rebuildDarkEngine,
  ROOT_CLASS,
} from './dark-engine';
import baseCss from './dark-base.css?inline';

const STORAGE_KEY = 'heybox-dark-mode';
const BASE_STYLE_ID = 'hb-dark-base';

type DarkListener = (enabled: boolean) => void;
const listeners = new Set<DarkListener>();

export function onDarkChange(fn: DarkListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isDarkEnabled(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === '1') return true;
    if (saved === '0') return false;
  } catch {
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function ensureBaseStyle(): void {
  if (document.getElementById(BASE_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = BASE_STYLE_ID;
  el.setAttribute('data-hb-own', '');
  el.textContent = baseCss;
  (document.head ?? document.documentElement).appendChild(el);
}

export function applyDark(enabled: boolean): void {
  const root = document.documentElement;
  if (!root) return;

  if (enabled) {
    root.classList.add(ROOT_CLASS);
    ensureBaseStyle();
    enableDarkEngine();
  } else {
    disableDarkEngine();
    root.classList.remove(ROOT_CLASS);
    document.getElementById(BASE_STYLE_ID)?.remove();
  }

  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
  }

  for (const fn of [...listeners]) {
    try {
      fn(enabled);
    } catch (err) {
      console.error('[hb-dark] listener failed', err);
    }
  }
}

export function initDarkMode(): boolean {
  const enabled = isDarkEnabled();
  applyDark(enabled);
  return enabled;
}

export function whenDocumentElementReady(fn: () => void): void {
  if (document.documentElement) {
    fn();
    return;
  }
  const observer = new MutationObserver(() => {
    if (document.documentElement) {
      observer.disconnect();
      fn();
    }
  });
  observer.observe(document, { childList: true, subtree: true });
}

export function exposeEngineHooks(): void {
  const w = window as unknown as Record<string, unknown>;
  w.__hbSetDark = (on: boolean): void => applyDark(on);
  w.__hbEngineStats = () => getEngineStats();
  w.__hbEngineCss = () => getEngineCss();
  w.__hbRebuild = () => rebuildDarkEngine();
  w.__hbIsDark = () => isDarkEnabled();
}
