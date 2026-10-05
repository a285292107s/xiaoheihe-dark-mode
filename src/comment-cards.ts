
import { lookupMeta, type ThreadReplyMeta } from './comment-api-cache';
import { ensureOwnStyle, removeOwnStyle } from './own-style';
import { appendToRowDock, dropRowControl, pruneEmptyRowDocks } from './row-dock';
import commentCardsCss from './comment-cards.css?inline';
import rowDockCss from './row-dock.css?inline';
import tokensCss from './tokens.css?inline';

const STORAGE_KEY = 'heybox-comment-cards';
const ROOT_CLASS = 'hb-comment-cards';
const STYLE_ID = 'hb-comment-cards';

const CARD_CLASS = 'hb-tc';
const AVATAR_CLASS = 'hb-tc__avatar';
const AVATAR_FALLBACK_CLASS = 'hb-tc__avatar--fallback';
const REPLYTO_CLASS = 'hb-tc__replyto';
export const CARD_REPLY_CLASS = 'hb-card-reply';
const CARD_FLOOR_CLASS = 'hb-tc__floor';
const CARD_FOLD_CLASS = 'hb-tc__fold';
const CARD_LINK_CLASS = 'hb-tc__link';
const FLASH_CLASS = 'hb-tc--flash';
const FLASH_MS = 1200;
const FOLDED_CLASS = 'hb-tc--folded';

export const CARD_ATTR = 'data-hb-tc';
const OWN_ATTR = 'data-hb-own';

const CHILD_ROW_SELECTOR = '.comment-children-item';
const MAIN_ROW_SELECTOR = '.link-comment__comment-item';
const THREAD_SELECTOR = '.link-comment__comment-children';
const CONTENT_CONTAINER_SELECTOR = '.comment-item__content-container';
const CONTENT_SELECTOR = '.children-item__comment-content';
const CREATOR_SELECTOR = '.children-item__comment-creator';
const REPLYTO_SITE_SELECTOR = '.children-item__reply-to';
const OTHER_INFO_SELECTOR = '.children-item__other-info';
const SVG_NS = 'http://www.w3.org/2000/svg';
const RETRY_DELAYS = [500, 1500, 4000];

const PLANE_PATHS = ['M21.3 3.2 2.9 10.4 12.6 20.4Z', 'M9.1 12.7 21.3 3.2'];

type CardsListener = (enabled: boolean) => void;

const listeners = new Set<CardsListener>();

let applied = false;
let observer: MutationObserver | null = null;
let retryTimer: number | null = null;
const pendingMeta = new Set<HTMLElement>();


function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function useridFromProfileHref(href: string | null): string {
  if (!href) return '';
  const m = /\/profile\/(\w+)/.exec(href);
  return m ? m[1] : '';
}

function mainRowOf(row: Element): HTMLElement | null {
  return row.closest<HTMLElement>(MAIN_ROW_SELECTOR);
}

function rootUserIdOf(row: Element): string {
  const main = mainRowOf(row);
  if (!main) return '';
  const avatarLink = main.querySelector<HTMLAnchorElement>('.comment-item-header__avatar')?.closest('a');
  const links: (HTMLAnchorElement | null)[] = [
    avatarLink ?? null,
    main.querySelector<HTMLAnchorElement>('.info-box__username'),
  ];
  for (const link of links) {
    if (!link) continue;
    const id = useridFromProfileHref(link.getAttribute('href'));
    if (id) return id;
  }
  return '';
}

function creatorNameOf(row: Element): string {
  return normalizeText(row.querySelector(CREATOR_SELECTOR)?.textContent);
}

function creatorUserIdOf(row: Element): string {
  return useridFromProfileHref(row.querySelector<HTMLAnchorElement>(CREATOR_SELECTOR)?.getAttribute('href') ?? null);
}

function threadOf(row: Element): HTMLElement | null {
  return row.closest<HTMLElement>(THREAD_SELECTOR);
}

function ordinalOf(row: HTMLElement): number {
  const thread = threadOf(row);
  if (!thread) return 0;
  const rows = thread.querySelectorAll<HTMLElement>(CHILD_ROW_SELECTOR);
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i] === row) return i + 1;
  }
  return 0;
}

function rowByCommentId(thread: Element, commentId: string): HTMLElement | null {
  if (!commentId) return null;
  for (const row of thread.querySelectorAll<HTMLElement>(CHILD_ROW_SELECTOR)) {
    if (row.dataset.commentId === commentId) return row;
  }
  return null;
}

function replyKindOf(row: Element, meta: ThreadReplyMeta | null): 'root' | 'other' | '' {
  const replyToId = normalizeText(meta?.replyToUserId);
  if (!replyToId) return '';
  const rootId = rootUserIdOf(row);
  if (!rootId) return '';
  return replyToId === rootId ? 'root' : 'other';
}

function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function softHue(seed: string): number {
  const raw = hueOf(seed);
  return (raw * 3 + 205) % 360;
}


function applyFallbackHue(box: HTMLElement, row: HTMLElement): void {
  box.style.setProperty('--hb-ui-hue', String(softHue(creatorUserIdOf(row) || creatorNameOf(row) || 'hb')));
}

function buildAvatar(row: HTMLElement): HTMLElement {
  const meta = lookupMeta(row.dataset.commentId ?? '');

  const box = document.createElement('span');
  box.className = AVATAR_CLASS;
  box.setAttribute(OWN_ATTR, '');
  box.setAttribute('aria-hidden', 'true');

  const avatarUrl = typeof meta?.authorAvatar === 'string' ? meta.authorAvatar.trim() : '';
  if (avatarUrl) {
    const img = document.createElement('img');
    img.className = 'hb-tc__avatar-img';
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.src = avatarUrl;
    img.addEventListener('error', () => {
      img.remove();
      applyFallbackHue(box, row);
      box.classList.add(AVATAR_FALLBACK_CLASS);
      box.textContent = avatarLetter(row);
    });
    box.appendChild(img);
    return box;
  }

  box.classList.add(AVATAR_FALLBACK_CLASS);
  applyFallbackHue(box, row);
  box.textContent = avatarLetter(row);
  return box;
}

function avatarLetter(row: HTMLElement): string {
  const name = creatorNameOf(row);
  return name ? Array.from(name)[0] : '匿';
}

function buildReplyTo(row: HTMLElement): HTMLElement | null {
  const site = row.querySelector<HTMLElement>(REPLYTO_SITE_SELECTOR);
  if (!site) return null;
  if (normalizeText(site.textContent) !== ':') return null;

  const meta = lookupMeta(row.dataset.commentId ?? '');
  if (!meta) return null;

  const thread = threadOf(row);
  const targetId = normalizeText(meta.replyId);
  const target = thread ? rowByCommentId(thread, targetId) : null;
  let kind: 'root' | 'other' | '';
  let label = '';
  let jump = 0;
  if (target && target !== row) {
    kind = 'other';
    const index = ordinalOf(target);
    const name = normalizeText(meta.replyToName) || creatorNameOf(target);
    if (!name) return null;
    if (index > 0) {
      jump = index;
      label = `回复 #${index} ${name}`;
    } else {
      label = `回复 @${name}`;
    }
  } else {
    kind = replyKindOf(row, meta);
    if (kind === 'root') {
      label = '回复楼主';
    } else if (kind === 'other') {
      const name = normalizeText(meta.replyToName);
      if (!name) return null;
      label = `回复 @${name}`;
    } else {
      return null;
    }
  }

  const span = document.createElement('span');
  span.className = REPLYTO_CLASS;
  span.setAttribute(OWN_ATTR, '');
  if (jump > 0) {
    span.appendChild(document.createTextNode('回复 '));
    span.appendChild(buildJumpLink(jump));
    span.appendChild(document.createTextNode(` ${label.slice(`回复 #${jump} `.length)}`));
  } else {
    span.textContent = label;
  }
  row.dataset.hbReplyKind = kind;
  return span;
}

function buildJumpLink(index: number): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = CARD_LINK_CLASS;
  btn.setAttribute(OWN_ATTR, '');
  btn.textContent = `#${index}`;
  const label = `跳到本楼第 ${index} 条回复`;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.addEventListener('mousedown', (e) => e.stopPropagation());
  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    jumpToFloor(btn, index);
  });
  return btn;
}

let flashTimer: number | null = null;

function jumpToFloor(from: HTMLElement, index: number): void {
  const row = from.closest<HTMLElement>(CHILD_ROW_SELECTOR);
  const thread = row ? threadOf(row) : null;
  if (!thread) return;
  const target = thread.querySelectorAll<HTMLElement>(CHILD_ROW_SELECTOR)[index - 1];
  if (!target) return;

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });

  if (flashTimer !== null) window.clearTimeout(flashTimer);
  for (const el of document.querySelectorAll<HTMLElement>(`.${FLASH_CLASS}`)) el.classList.remove(FLASH_CLASS);
  target.classList.add(FLASH_CLASS);
  flashTimer = window.setTimeout(() => {
    flashTimer = null;
    target.classList.remove(FLASH_CLASS);
  }, FLASH_MS);
}

function buildFloor(index: number): HTMLElement {
  const el = document.createElement('span');
  el.className = CARD_FLOOR_CLASS;
  el.setAttribute(OWN_ATTR, '');
  el.textContent = `${index}#`;
  return el;
}

function buildReplyButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = CARD_REPLY_CLASS;
  btn.setAttribute(OWN_ATTR, '');
  btn.setAttribute('aria-label', '回复这条评论');
  btn.title = '回复这条评论';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of PLANE_PATHS) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  btn.appendChild(svg);

  btn.addEventListener('mousedown', (e) => e.stopPropagation());
  return btn;
}


function attachReplyButton(row: HTMLElement, btn: HTMLButtonElement): void {
  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!row.isConnected) return;

    row.click();
  });
}


function rowStamped(row: HTMLElement): boolean {
  return row.getAttribute(CARD_ATTR) === '1' && row.classList.contains(CARD_CLASS);
}

function decorateRow(row: HTMLElement): boolean {
  if (!row.isConnected) return false;

  const hadStamp = rowStamped(row);
  let touched = false;

  const content = row.querySelector<HTMLElement>(CONTENT_SELECTOR);
  if (!content || !row.querySelector(OTHER_INFO_SELECTOR)) return false;

  let avatar = row.querySelector<HTMLElement>(`:scope > .${AVATAR_CLASS}`);
  if (!avatar) {
    avatar = buildAvatar(row);
    const siteFirst = row.firstElementChild;
    if (siteFirst) row.insertBefore(avatar, siteFirst);
    else row.appendChild(avatar);
    touched = true;
  }
  if (row.classList.contains(CARD_CLASS) === false) {
    row.classList.add(CARD_CLASS);
    touched = true;
  }

  const index = ordinalOf(row);
  let floor = row.querySelector<HTMLElement>(`:scope > .${CARD_FLOOR_CLASS}`);
  if (!floor && index > 0) {
    floor = buildFloor(index);
    row.appendChild(floor);
    touched = true;
  } else if (floor && index > 0 && normalizeText(floor.textContent) !== `${index}#`) {
    floor.textContent = `${index}#`;
    touched = true;
  }

  if (!row.querySelector<HTMLElement>(`:scope > .${REPLYTO_CLASS}`)) {
    const candidate = buildReplyTo(row);
    if (candidate) {
      const site = row.querySelector<HTMLElement>(REPLYTO_SITE_SELECTOR);
      if (site && site.parentElement === row) row.insertBefore(candidate, site);
      else row.appendChild(candidate);
      touched = true;
    }
  }

  let btn = row.querySelector<HTMLButtonElement>(`:scope > .${CARD_REPLY_CLASS}`);
  if (!btn) {
    btn = buildReplyButton();
    row.appendChild(btn);
    attachReplyButton(row, btn);
    touched = true;
  }

  if (avatar !== row.firstElementChild) {
    row.insertBefore(avatar, row.firstElementChild);
    touched = true;
  }

  row.setAttribute(CARD_ATTR, '1');

  if (!hadStamp || touched) {
    const fallbackAvatar = !avatar || avatar.classList.contains(AVATAR_FALLBACK_CLASS);
    const noReplyTo = row.querySelector<HTMLElement>(`:scope > .${REPLYTO_CLASS}`) === null;
    if (fallbackAvatar || noReplyTo) pendingMeta.add(row);
    else pendingMeta.delete(row);
  }
  return touched || !hadStamp;
}

function decorateAll(): void {
  for (const row of document.querySelectorAll<HTMLElement>(CHILD_ROW_SELECTOR)) decorateRow(row);
  decorateThreads();
  if (pendingMeta.size > 0) scheduleRetry();
}


const foldedRoots = new Set<string>();

function mainRowKey(mainRow: HTMLElement): string {
  return normalizeText(mainRow.dataset.commentId);
}

const CHEVRON_UP_PATH = 'M6 15 12 9 18 15';
const FOLD_LABEL_CLASS = 'hb-tc__fold-label';

function createFoldButton(mainRow: HTMLElement): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = CARD_FOLD_CLASS;
  btn.setAttribute(OWN_ATTR, '');
  btn.dataset.expanded = 'true';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', CHEVRON_UP_PATH);
  svg.appendChild(path);

  const label = document.createElement('span');
  label.className = FOLD_LABEL_CLASS;
  btn.append(svg, label);

  btn.addEventListener('mousedown', (e) => e.stopPropagation());
  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const key = mainRowKey(mainRow);
    if (!key) return;
    if (foldedRoots.has(key)) foldedRoots.delete(key);
    else foldedRoots.add(key);
    decorateFold(mainRow);
  });
  return btn;
}

function syncFoldButton(btn: HTMLButtonElement, count: number, folded: boolean): void {
  const label = folded ? `展开 ${count} 条` : '折叠';
  const span = btn.querySelector<HTMLElement>(`:scope > .${FOLD_LABEL_CLASS}`);
  if (span && normalizeText(span.textContent) !== label) span.textContent = label;
  const expanded = folded ? 'false' : 'true';
  if (btn.getAttribute('aria-expanded') !== expanded) btn.setAttribute('aria-expanded', expanded);
  if (btn.dataset.expanded !== expanded) btn.dataset.expanded = expanded;
  const aria = folded ? `展开这条评论下的 ${count} 条回复` : '折叠这条评论下的楼中楼';
  if (btn.getAttribute('aria-label') !== aria) btn.setAttribute('aria-label', aria);
  if (btn.title !== aria) btn.title = aria;
  const countAttr = String(count);
  if (btn.dataset.hbFoldCount !== countAttr) btn.dataset.hbFoldCount = countAttr;
}

function decorateFold(mainRow: HTMLElement): void {
  if (!mainRow.isConnected) return;

  const key = mainRowKey(mainRow);
  const thread = mainRow.querySelector<HTMLElement>(THREAD_SELECTOR);
  const count = thread ? thread.querySelectorAll<HTMLElement>(CHILD_ROW_SELECTOR).length : 0;
  const anchor = mainRow.querySelector<HTMLElement>(CONTENT_CONTAINER_SELECTOR);
  const existing = anchor
    ? anchor.querySelector<HTMLButtonElement>(`.${CARD_FOLD_CLASS}`)
    : null;
  const folded = count > 0 && key !== '' && foldedRoots.has(key);

  if (thread) thread.classList.toggle(FOLDED_CLASS, folded);

  if (!anchor || count === 0 || key === '') {
    if (anchor) dropRowControl(anchor, CARD_FOLD_CLASS);
    else pruneEmptyRowDocks();
    return;
  }

  const btn = existing ?? createFoldButton(mainRow);
  if (!existing) appendToRowDock(anchor, btn, THREAD_SELECTOR);
  syncFoldButton(btn, count, folded);
}

function decorateThreads(): void {
  for (const mainRow of document.querySelectorAll<HTMLElement>(MAIN_ROW_SELECTOR)) decorateFold(mainRow);
}

function ensureFoldsInPlace(): void {
  for (const mainRow of document.querySelectorAll<HTMLElement>(MAIN_ROW_SELECTOR)) {
    if (!mainRow.isConnected) continue;
    if (!mainRow.querySelector(`.${CARD_FOLD_CLASS}`)) decorateFold(mainRow);
  }
}

let retryRound = 0;

function scheduleRetry(): void {
  if (retryTimer !== null) return;
  if (retryRound >= RETRY_DELAYS.length) {
    pendingMeta.clear();
    return;
  }
  const delay = RETRY_DELAYS[retryRound];
  retryRound += 1;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    if (!applied) return;
    const rows = [...pendingMeta];
    if (rows.length === 0) return;
    for (const row of rows) {
      if (!row.isConnected) {
        pendingMeta.delete(row);
        continue;
      }
      const meta = lookupMeta(row.dataset.commentId ?? '');
      if (meta) {
        pendingMeta.delete(row);
        decorateRow(row);
      }
    }
    if (pendingMeta.size > 0) scheduleRetry();
  }, delay);
}


function ensureObserver(): void {
  if (observer) return;
  observer = new MutationObserver((records) => {
    const touchedThreads = new Set<HTMLElement>();
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        const el = node as HTMLElement;
        if (el.matches(CHILD_ROW_SELECTOR)) {
          decorateRow(el);
          const main = mainRowOf(el);
          if (main) touchedThreads.add(main);
        }
        for (const row of el.querySelectorAll<HTMLElement>(CHILD_ROW_SELECTOR)) {
          decorateRow(row);
          const main = mainRowOf(row);
          if (main) touchedThreads.add(main);
        }
        if (el.matches(MAIN_ROW_SELECTOR)) touchedThreads.add(el);
        for (const main of el.querySelectorAll<HTMLElement>(MAIN_ROW_SELECTOR)) touchedThreads.add(main);
      }
    }
    for (const main of touchedThreads) decorateFold(main);
    ensureFoldsInPlace();
    if (pendingMeta.size > 0) scheduleRetry();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function attach(): void {
  if (applied) return;
  applied = true;
  decorateAll();
  ensureObserver();
}

function detach(): void {
  if (!applied) return;
  applied = false;

  observer?.disconnect();
  observer = null;

  if (retryTimer !== null) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (flashTimer !== null) {
    window.clearTimeout(flashTimer);
    flashTimer = null;
  }
  retryRound = 0;
  pendingMeta.clear();

  for (const node of document.querySelectorAll(
    `.${AVATAR_CLASS}, .${REPLYTO_CLASS}, .${CARD_REPLY_CLASS}, .${CARD_FLOOR_CLASS}, .${CARD_FOLD_CLASS}`,
  )) {
    node.remove();
  }
  for (const row of document.querySelectorAll(`[${CARD_ATTR}]`)) {
    row.removeAttribute(CARD_ATTR);
    row.removeAttribute('data-hb-reply-kind');
    row.classList.remove(CARD_CLASS);
    row.classList.remove(FLASH_CLASS);
  }
  for (const thread of document.querySelectorAll(`.${FOLDED_CLASS}`)) thread.classList.remove(FOLDED_CLASS);
  pruneEmptyRowDocks();
  foldedRoots.clear();
}


export function onCommentCardsChange(fn: CardsListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isCommentCardsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function applyCommentCards(enabled: boolean): void {
  const root = document.documentElement;
  if (!root) return;

  if (enabled) {
    root.classList.add(ROOT_CLASS);
    ensureOwnStyle(STYLE_ID, `${tokensCss}\n${rowDockCss}\n${commentCardsCss}`);
    attach();
  } else {
    root.classList.remove(ROOT_CLASS);
    detach();
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
      console.error('[hb-comment-cards] listener failed', err);
    }
  }
}

export function initCommentCards(): boolean {
  const enabled = isCommentCardsEnabled();
  applyCommentCards(enabled);
  return enabled;
}

export function exposeCommentCardsHooks(): void {
  const w = window as unknown as Record<string, unknown>;
  w.__hbSetCommentCards = (on: boolean): void => applyCommentCards(on);
  w.__hbIsCommentCards = () => isCommentCardsEnabled();
}
