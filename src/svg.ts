const SVG_NS = 'http://www.w3.org/2000/svg';

export function buildSvg(
  paths: readonly string[],
  circle?: { cx: number; cy: number; r: number },
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  if (circle) {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', String(circle.cx));
    dot.setAttribute('cy', String(circle.cy));
    dot.setAttribute('r', String(circle.r));
    svg.appendChild(dot);
  }
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}
