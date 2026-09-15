/**
 * 深色模式的开关与偏好状态。
 *
 * 只做三件事：
 *   1) 记住/读取用户偏好（localStorage，未设置时跟随系统）
 *   2) 在 <html> 上加类名，并尽早注入基础层（防首屏白闪）
 *   3) 启停 src/dark-engine.ts 的规则重映射引擎
 */

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

/**
 * 订阅开关状态。任何一处调用 applyDark（按钮、控制台 __hbSetDark、
 * 将来的其它入口）都会通知到，UI 因此不需要自己存一份状态。
 */
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
    /* localStorage 可能被禁用 */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** 尽早注入基础层。站点 CSS 异步到达，这一步先给画布上深色。 */
function ensureBaseStyle(): void {
  const inject = (): void => {
    if (document.getElementById(BASE_STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = BASE_STYLE_ID;
    el.setAttribute('data-hb-own', '');
    el.textContent = baseCss;
    (document.head ?? document.documentElement).appendChild(el);
  };

  inject();
  if (document.getElementById(BASE_STYLE_ID)) return;

  // document-start 阶段 <head> 可能还不存在
  const obs = new MutationObserver(() => {
    if (!document.head && !document.documentElement) return;
    obs.disconnect();
    inject();
  });
  obs.observe(document, { childList: true, subtree: true });
}

export function applyDark(enabled: boolean): void {
  const root = document.documentElement;
  if (!root) return;

  if (enabled) {
    // 先上类名与基础层，再启动引擎：引擎需要遍历样式表，可能晚一点才就绪
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
    /* ignore */
  }

  // 复制一份再遍历：监听器里若反过来调用 applyDark，不会破坏本次遍历
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

/**
 * document-start 阶段 document.documentElement 可能还不存在。
 * 这里等到它出现再执行，保证类名尽可能早地落到 <html> 上。
 */
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

/** 供验收脚本读取引擎状态（生产环境无副作用） */
export function exposeEngineHooks(): void {
  const w = window as unknown as Record<string, unknown>;
  w.__hbSetDark = (on: boolean): void => applyDark(on);
  w.__hbEngineStats = () => getEngineStats();
  w.__hbEngineCss = () => getEngineCss();
  w.__hbRebuild = () => rebuildDarkEngine();
  w.__hbIsDark = () => isDarkEnabled();
}
