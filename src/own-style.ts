
const pendingStyles = new Map<string, string>();
let headWaiter: MutationObserver | null = null;

function injectNow(id: string, css: string, head: HTMLHeadElement): void {
  const el = document.createElement('style');
  el.id = id;
  el.setAttribute('data-hb-own', '');
  el.textContent = css;
  head.appendChild(el);
  pendingStyles.delete(id);
}

export function ensureOwnStyle(id: string, css: string): void {
  if (document.getElementById(id)) return;

  const head = document.head;
  if (!head) {
    pendingStyles.set(id, css);
    if (headWaiter) return;
    headWaiter = new MutationObserver(() => {
      if (!document.head) return;
      headWaiter?.disconnect();
      headWaiter = null;
      for (const [pendingId, pendingCss] of [...pendingStyles]) {
        ensureOwnStyle(pendingId, pendingCss);
      }
    });
    headWaiter.observe(document, { childList: true, subtree: true });
    return;
  }

  injectNow(id, css, head);
}

export function removeOwnStyle(id: string): void {
  pendingStyles.delete(id);
  document.getElementById(id)?.remove();
}
