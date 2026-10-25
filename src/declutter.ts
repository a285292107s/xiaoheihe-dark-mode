
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

const NAV_LOGO_SELECTOR = '.nav .nav-content .nav-icon';
const NAV_LINK_SELECTOR = '.nav .nav-content .nav-links > .nav-link';
const COMMUNITY_LABELS = new Set(['社区', 'Community']);

function findCommunityLink(): HTMLButtonElement | null {
  const links = document.querySelectorAll<HTMLButtonElement>(NAV_LINK_SELECTOR);
  for (const link of links) {
    if (COMMUNITY_LABELS.has(link.textContent?.trim() ?? '')) return link;
  }
  return links[1] ?? null;
}

function handleNavLogoClick(event: MouseEvent): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const target = event.target;
  if (!(target instanceof Element) || !target.closest(NAV_LOGO_SELECTOR)) return;

  const community = findCommunityLink();
  if (!community) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  community.click();
}

let navLogoBound = false;

function bindNavLogo(): void {
  if (navLogoBound) return;
  navLogoBound = true;
  window.addEventListener('click', handleNavLogoClick, true);
}

function unbindNavLogo(): void {
  if (!navLogoBound) return;
  navLogoBound = false;
  window.removeEventListener('click', handleNavLogoClick, true);
}

export function applyDeclutter(enabled: boolean): void {
  const root = document.documentElement;
  if (!root) return;

  if (enabled) {
    root.classList.add(DECLUTTER_CLASS);
    ensureOwnStyle(STYLE_ID, declutterCss);
    bindNavLogo();
  } else {
    root.classList.remove(DECLUTTER_CLASS);
    removeOwnStyle(STYLE_ID);
    unbindNavLogo();
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
