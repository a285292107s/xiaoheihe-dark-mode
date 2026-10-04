
export interface ThreadReplyMeta {
  authorAvatar?: string;
  authorName?: string;
  replyToName?: string;
  replyToUserId?: string;
  replyId?: string;
}

const cache = new Map<string, ThreadReplyMeta>();

const API_URL_PATTERN = /\/bbs\/app\/(?:link\/tree|comment)(?:[/?#]|$)/;

const MAX_DEPTH = 24;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toIdString(value: unknown): string | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.length > 0 && value.trim() !== '' ? value : undefined;
}

function metaFromBody(body: Record<string, unknown>): ThreadReplyMeta | null {
  const meta: ThreadReplyMeta = {};

  const author = isPlainObject(body.user) ? body.user : null;
  if (author) {
    const avatar = nonEmptyString(author.avatar) ?? nonEmptyString(author.avartar);
    if (avatar) meta.authorAvatar = avatar;
    const name = nonEmptyString(author.username);
    if (name) meta.authorName = name;
  }

  const replyId = toIdString(body.replyid);
  if (replyId) meta.replyId = replyId;

  const replyUser = isPlainObject(body.replyuser) ? body.replyuser : null;
  if (replyUser) {
    const name = nonEmptyString(replyUser.username);
    if (name) meta.replyToName = name;
    const id = toIdString(body.replyuserid) ?? toIdString(replyUser.userid);
    if (id) meta.replyToUserId = id;
  }

  return Object.keys(meta).length > 0 ? meta : null;
}

function collectBodies(value: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (depth > MAX_DEPTH || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectBodies(item, out, depth + 1);
    return;
  }
  const obj = value as Record<string, unknown>;
  if (Array.isArray(obj.comments)) collectBodies(obj.comments, out, depth + 1);
  if (Array.isArray(obj.comment)) collectBodies(obj.comment, out, depth + 1);
  if (obj.commentid !== undefined && obj.commentid !== null) {
    out.push(obj);
    return;
  }
  if (obj.result && typeof obj.result === 'object') collectBodies(obj.result, out, depth + 1);
}

function mergeMeta(id: string, incoming: ThreadReplyMeta): void {
  const prev = cache.get(id);
  cache.set(id, prev ? { ...prev, ...incoming } : incoming);
}

function ingest(payload: unknown): number {
  const bodies: Record<string, unknown>[] = [];
  collectBodies(payload, bodies);

  let stored = 0;
  for (const body of bodies) {
    const id = toIdString(body.commentid);
    if (!id) continue;
    const meta = metaFromBody(body);
    if (!meta) continue;
    mergeMeta(id, meta);
    stored += 1;
  }
  return stored;
}

export function __ingestTreeResponse(payload: unknown): number {
  try {
    if (typeof payload === 'string') {
      const text = payload.trim();
      if (text === '') return 0;
      return ingest(JSON.parse(text));
    }
    return ingest(payload);
  } catch {
    return 0;
  }
}

export function lookupMeta(commentId: string): ThreadReplyMeta | null {
  try {
    const id = toIdString(commentId);
    if (!id) return null;
    const hit = cache.get(id);
    return hit ? { ...hit } : null;
  } catch {
    return null;
  }
}

export function cacheSize(): number {
  return cache.size;
}


type AnyFn = (...args: unknown[]) => unknown;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const xhrUrls = new WeakMap<object, string>();
const xhrListening = new WeakSet<object>();

let attached = false;

let origXhrOpen: AnyFn | null = null;
let origXhrSend: AnyFn | null = null;
let patchedXhrOpen: AnyFn | null = null;
let patchedXhrSend: AnyFn | null = null;

let origFetch: FetchLike | null = null;
let patchedFetch: FetchLike | null = null;

function matchesApiUrl(url: string): boolean {
  try {
    return url !== '' && API_URL_PATTERN.test(url);
  } catch {
    return false;
  }
}

function urlFromOpenArgs(args: unknown[]): string {
  const raw = args[1];
  if (typeof raw === 'string') return raw;
  if (raw instanceof URL) return raw.href;
  return '';
}

function urlFromFetchInput(input: RequestInfo | URL): string {
  try {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    const req = input as Request;
    return typeof req?.url === 'string' ? req.url : '';
  } catch {
    return '';
  }
}

function readXhrPayload(xhr: XMLHttpRequest): unknown {
  try {
    const text = xhr.responseText;
    if (typeof text === 'string' && text.trim() !== '') return JSON.parse(text);
  } catch {
  }
  try {
    const data = xhr.response;
    if (isPlainObject(data) || Array.isArray(data)) return data;
  } catch {
  }
  return null;
}

function patchXhr(): void {
  if (origXhrOpen) return;
  const proto = (globalThis as { XMLHttpRequest?: { prototype: XMLHttpRequest } }).XMLHttpRequest?.prototype;
  if (!proto) return;

  const openFn = proto.open as unknown as AnyFn;
  const sendFn = proto.send as unknown as AnyFn;

  const nextOpen: AnyFn = function (this: unknown, ...args: unknown[]): unknown {
    try {
      const url = urlFromOpenArgs(args);
      if (url) xhrUrls.set(this as object, url);
    } catch {
    }
    return openFn.apply(this, args);
  };

  const nextSend: AnyFn = function (this: unknown, ...args: unknown[]): unknown {
    try {
      const xhr = this as XMLHttpRequest;
      if (!xhrListening.has(xhr as unknown as object)) {
        xhrListening.add(xhr as unknown as object);
        xhr.addEventListener('load', () => {
          try {
            if (!matchesApiUrl(xhrUrls.get(xhr as unknown as object) ?? '')) return;
            __ingestTreeResponse(readXhrPayload(xhr));
          } catch {
          }
        });
      }
    } catch {
    }
    return sendFn.apply(this, args);
  };

  proto.open = nextOpen as unknown as XMLHttpRequest['open'];
  proto.send = nextSend as unknown as XMLHttpRequest['send'];
  origXhrOpen = openFn;
  origXhrSend = sendFn;
  patchedXhrOpen = nextOpen;
  patchedXhrSend = nextSend;
}

function unpatchXhr(): void {
  if (!origXhrOpen) return;
  const proto = (globalThis as { XMLHttpRequest?: { prototype: XMLHttpRequest } }).XMLHttpRequest?.prototype;
  if (proto) {
    if ((proto.open as unknown) === patchedXhrOpen) proto.open = origXhrOpen as unknown as XMLHttpRequest['open'];
    if ((proto.send as unknown) === patchedXhrSend) proto.send = origXhrSend as unknown as XMLHttpRequest['send'];
  }
  origXhrOpen = null;
  origXhrSend = null;
  patchedXhrOpen = null;
  patchedXhrSend = null;
}

function patchFetch(): void {
  if (origFetch) return;
  const g = globalThis as { fetch?: FetchLike };
  const fn = g.fetch;
  if (typeof fn !== 'function') return;

  const nextFetch: FetchLike = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = urlFromFetchInput(input);
    const result = fn.call(globalThis, input, init);
    try {
      if (matchesApiUrl(url)) {
        result.then(
          (res) => {
            try {
              res
                .clone()
                .json()
                .then(
                  (data) => {
                    __ingestTreeResponse(data);
                  },
                  () => {
                  },
                );
            } catch {
            }
          },
          () => {
          },
        );
      }
    } catch {
    }
    return result;
  };

  g.fetch = nextFetch;
  origFetch = fn;
  patchedFetch = nextFetch;
}

function unpatchFetch(): void {
  if (!origFetch) return;
  const g = globalThis as { fetch?: FetchLike };
  if (g.fetch === patchedFetch) g.fetch = origFetch;
  origFetch = null;
  patchedFetch = null;
}

export function attachApiCache(): void {
  if (attached) return;
  attached = true;
  try {
    patchXhr();
  } catch {
  }
  try {
    patchFetch();
  } catch {
  }
}

export function detachApiCache(): void {
  if (!attached) return;
  attached = false;
  try {
    unpatchXhr();
  } catch {
  }
  try {
    unpatchFetch();
  } catch {
  }
}

export function exposeApiCacheHooks(): void {
  const w = window as unknown as Record<string, unknown>;
  w.__hbApiCacheSize = (): number => cacheSize();
  w.__hbApiCacheAttached = (): boolean => attached;
  w.__hbLookupCommentMeta = (commentId: string): ThreadReplyMeta | null => lookupMeta(commentId);
  w.__hbIngestCommentTree = (payload: unknown): number => __ingestTreeResponse(payload);
}
