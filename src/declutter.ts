/**
 * 页面精简：隐藏顶部导航的「首页」入口与社区页的右侧栏。
 *
 * 与深色模式是两件互不依赖的事：各一个开关、各一份偏好、各一层样式。
 * 可以只精简不深色，也可以反过来；一方的开关不会碰到另一方的状态。
 *
 * 只做两件事：
 *   1) 往 <html> 上加 hb-declutter 类名 —— 给 CSS 与验收脚本读的单一状态出口
 *   2) 注入一层带 data-hb-own 的样式表（规则全部挂在 html.hb-declutter 下）
 * 关闭时两者一起撤掉，页面回到站点原样，<head> 里不留残余节点。
 */

import declutterCss from './declutter.css?inline';

const STORAGE_KEY = 'heybox-declutter';
const STYLE_ID = 'hb-declutter';

/** 加在 <html> 上的类名 */
export const DECLUTTER_CLASS = 'hb-declutter';

type DeclutterListener = (enabled: boolean) => void;
const listeners = new Set<DeclutterListener>();
/** 等 <head> 出现的探针（document-start 阶段 <head> 可能还没有） */
let headProbe: MutationObserver | null = null;

/**
 * 订阅开关状态。按钮、控制台、将来其它入口都走 applyDeclutter，
 * UI 因而不需要自己存一份状态。
 */
export function onDeclutterChange(fn: DeclutterListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * 默认开启：这个脚本的用途就是精简，装上即生效，只有显式存过 '0' 才保持站点原样。
 * （与深色模式相反 —— 那里默认跟随系统，因为深色是个口味问题。）
 */
export function isDeclutterEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    /* localStorage 被禁用时仍按默认开启 */
    return true;
  }
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;

  const head = document.head;
  if (!head) {
    // document-start 时 <html> 已经出现、而 <head> 可能还没被解析出来。
    // 挂到 <html> 上其实也生效，但「样式表在 head 里」是个验收得住的形状，
    // 所以这里等 head —— 站点导航由 JS 渲染，晚这几毫秒不会闪出侧栏。
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
  // 引擎遍历 document.styleSheets 时会整块跳过 data-hb-own，规则不会被当成站点内容再映射
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
    // 先把类名挂上：类名是状态出口，样式表晚一个任务到达也不会漏过任何一帧
    root.classList.add(DECLUTTER_CLASS);
    ensureStyle();
  } else {
    root.classList.remove(DECLUTTER_CLASS);
    // 连等待 head 的探针一起撤掉，否则「关掉之后又被补上一张样式表」
    stopHeadProbe();
    document.getElementById(STYLE_ID)?.remove();
  }

  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }

  // 复制一份再遍历：监听器里若反过来调用 applyDeclutter，不会破坏本次遍历
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

/** 供验收脚本与调试使用（正常使用不需要） */
export function exposeDeclutterHooks(): void {
  const w = window as unknown as Record<string, unknown>;
  w.__hbSetDeclutter = (on: boolean): void => applyDeclutter(on);
  w.__hbIsDeclutter = () => isDeclutterEnabled();
}
