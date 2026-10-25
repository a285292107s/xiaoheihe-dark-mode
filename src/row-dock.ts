import { buildSvg } from './svg';

const DOCK_CLASS = 'hb-row-dock';
const OWN_ATTR = 'data-hb-own';

const PLANE_PATHS = ['M21.3 3.2 2.9 10.4 12.6 20.4Z', 'M9.1 12.7 21.3 3.2'];

export function rowDockOf(row: Element): HTMLElement | null {
  return row.querySelector<HTMLElement>(`:scope > .${DOCK_CLASS}`);
}

export function appendToRowDock(row: HTMLElement, control: HTMLElement, beforeSelector: string): void {
  const existing = rowDockOf(row);
  if (existing) {
    existing.appendChild(control);
    return;
  }
  const dock = document.createElement('div');
  dock.className = DOCK_CLASS;
  dock.setAttribute(OWN_ATTR, '');
  dock.appendChild(control);
  const before = row.querySelector(beforeSelector);
  if (before) row.insertBefore(dock, before);
  else row.appendChild(dock);
}

export function dropRowControl(row: Element, controlClass: string): void {
  const dock = rowDockOf(row);
  dock?.querySelector(`:scope > .${controlClass}`)?.remove();
  if (dock && dock.childElementCount === 0) dock.remove();
}

export function pruneEmptyRowDocks(): void {
  for (const dock of document.querySelectorAll<HTMLElement>(`.${DOCK_CLASS}`)) {
    if (dock.childElementCount === 0) dock.remove();
  }
}

export function buildPlaneIcon(): SVGSVGElement {
  return buildSvg(PLANE_PATHS);
}
