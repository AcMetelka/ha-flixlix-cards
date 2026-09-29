import type { PowerFlowCardPlusConfig } from "@flixlix-cards/shared/types";

type Point = { x: number; y: number };
type Rect = { left: number; top: number; width: number; height: number };
type Side = "top" | "right" | "bottom" | "left";
type Port = { point: Point; normal: Point };

const flowNodes = {
  solar: ".solar .circle",
  grid: ".grid .circle",
  battery: ".battery .circle",
  home: "#home-circle",
} as const;

const FLOW_PORT_OFFSET_RATIO = 15 / 114;

// Curved ports use a fixed pixel gap on every edge. Straight-only routes use
// the center so the direct connector remains the middle route of each fanout.
const flowPaths = [
  {
    id: "solar-home-flow",
    from: "solar",
    to: "home",
    start: "bottom",
    startOffset: FLOW_PORT_OFFSET_RATIO,
    end: "left",
    endOffset: -FLOW_PORT_OFFSET_RATIO,
    direction: "curve",
  },
  {
    id: "solar-grid-flow",
    from: "solar",
    to: "grid",
    start: "bottom",
    startOffset: -FLOW_PORT_OFFSET_RATIO,
    end: "right",
    endOffset: -FLOW_PORT_OFFSET_RATIO,
    direction: "curve",
  },
  {
    id: "solar-battery-flow",
    from: "solar",
    to: "battery",
    start: "bottom",
    startOffset: 0,
    end: "top",
    endOffset: 0,
    direction: "straight",
  },
  {
    id: "grid-home-flow",
    from: "grid",
    to: "home",
    start: "right",
    startOffset: 0,
    end: "left",
    endOffset: 0,
    direction: "straight",
  },
  {
    id: "battery-home-flow",
    from: "battery",
    to: "home",
    start: "top",
    startOffset: FLOW_PORT_OFFSET_RATIO,
    end: "left",
    endOffset: FLOW_PORT_OFFSET_RATIO,
    direction: "curve",
  },
  {
    id: "battery-grid-flow",
    from: "battery",
    to: "grid",
    start: "top",
    startOffset: -FLOW_PORT_OFFSET_RATIO,
    end: "right",
    endOffset: FLOW_PORT_OFFSET_RATIO,
    direction: "curve",
  },
] as const;

function center(rect: Rect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Offset by a width-based ratio on every side, keeping all ports evenly spaced. */
export function rectanglePort(rect: Rect, side: Side, offsetRatio: number): Port {
  const c = center(rect);
  const offset = rect.width * offsetRatio;
  switch (side) {
    case "top":
      return {
        point: { x: c.x + offset, y: rect.top },
        normal: { x: 0, y: -1 },
      };
    case "right":
      return {
        point: { x: rect.left + rect.width, y: c.y + offset },
        normal: { x: 1, y: 0 },
      };
    case "bottom":
      return {
        point: { x: c.x + offset, y: rect.top + rect.height },
        normal: { x: 0, y: 1 },
      };
    case "left":
      return {
        point: { x: rect.left, y: c.y + offset },
        normal: { x: -1, y: 0 },
      };
  }
}

export function rectangleCornerRadius(source: Rect, target: Rect): number {
  return Math.min(source.width, source.height, target.width, target.height) / 2;
}

function toSvgPoint(svg: SVGSVGElement, point: Point): Point | undefined {
  const matrix = svg.getScreenCTM();
  if (!matrix) return undefined;
  const svgPoint = svg.createSVGPoint();
  svgPoint.x = point.x;
  svgPoint.y = point.y;
  const local = svgPoint.matrixTransform(matrix.inverse());
  return { x: local.x, y: local.y };
}

function rectangleMaskBounds(
  svg: SVGSVGElement,
  element: HTMLElement
):
  | {
      x: number;
      y: number;
      width: number;
      height: number;
      rx: number;
      ry: number;
    }
  | undefined {
  const rect = element.getBoundingClientRect();
  const topLeft = toSvgPoint(svg, { x: rect.left, y: rect.top });
  const bottomRight = toSvgPoint(svg, { x: rect.right, y: rect.bottom });
  const radiusPoint = toSvgPoint(svg, { x: rect.left + 14, y: rect.top + 14 });
  if (!topLeft || !bottomRight || !radiusPoint) return undefined;
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
    rx: Math.abs(radiusPoint.x - topLeft.x),
    ry: Math.abs(radiusPoint.y - topLeft.y),
  };
}

function maskFlowThroughEntities(
  svg: SVGSVGElement,
  path: SVGPathElement,
  source: HTMLElement,
  target: HTMLElement,
  flowId: string
): void {
  const sourceBounds = rectangleMaskBounds(svg, source);
  const targetBounds = rectangleMaskBounds(svg, target);
  if (!sourceBounds || !targetBounds) return;

  const namespace = "http://www.w3.org/2000/svg";
  const defs =
    svg.querySelector<SVGDefsElement>("defs") ??
    (() => {
      const element = document.createElementNS(namespace, "defs");
      svg.prepend(element);
      return element;
    })();
  const maskId = `${flowId}-entity-cutout`;
  let mask = defs.querySelector<SVGMaskElement>(`#${maskId}`);
  if (!mask) {
    mask = document.createElementNS(namespace, "mask");
    mask.id = maskId;
    defs.append(mask);
  }
  mask.setAttribute("maskUnits", "userSpaceOnUse");
  mask.setAttribute("maskContentUnits", "userSpaceOnUse");
  mask.setAttribute("mask-type", "luminance");
  const viewBox = svg.viewBox.baseVal;
  mask.setAttribute("x", String(viewBox.x));
  mask.setAttribute("y", String(viewBox.y));
  mask.setAttribute("width", String(viewBox.width || 100));
  mask.setAttribute("height", String(viewBox.height || 100));
  mask.replaceChildren();

  const visibleArea = document.createElementNS(namespace, "rect");
  visibleArea.setAttribute("x", String(viewBox.x));
  visibleArea.setAttribute("y", String(viewBox.y));
  visibleArea.setAttribute("width", String(viewBox.width || 100));
  visibleArea.setAttribute("height", String(viewBox.height || 100));
  visibleArea.setAttribute("fill", "white");
  mask.append(visibleArea);

  for (const bounds of [sourceBounds, targetBounds]) {
    const cutout = document.createElementNS(namespace, "rect");
    cutout.setAttribute("x", String(bounds.x));
    cutout.setAttribute("y", String(bounds.y));
    cutout.setAttribute("width", String(bounds.width));
    cutout.setAttribute("height", String(bounds.height));
    cutout.setAttribute("rx", String(bounds.rx));
    cutout.setAttribute("ry", String(bounds.ry));
    cutout.setAttribute("fill", "black");
    mask.append(cutout);
  }

  // Apply the cutout to a stationary parent group, not to the animated circles.
  // A mask on an animateMotion circle moves with that circle and clips it into
  // a wedge; the parent group's mask remains fixed in the SVG coordinate space.
  let group = path.closest<SVGGElement>("g[data-rectangle-flow-mask]");
  if (!group) {
    group = document.createElementNS(namespace, "g");
    group.setAttribute("data-rectangle-flow-mask", flowId);
    svg.append(group);
    for (const child of Array.from(svg.children)) {
      if (child !== defs && child !== group) group.append(child);
    }
  }
  group.setAttribute("mask", `url(#${maskId})`);
}

function makeThreePartPath(
  svg: SVGSVGElement,
  source: Rect,
  target: Rect,
  flow: (typeof flowPaths)[number]
): string | undefined {
  const startPort = rectanglePort(source, flow.start, flow.startOffset);
  const endPort = rectanglePort(target, flow.end, flow.endOffset);
  const inset = 12;
  // The path runs beneath each rectangle so its foreground layer can mask
  // moving particles naturally as they enter/leave the entity.
  const start = {
    x: startPort.point.x - startPort.normal.x * inset,
    y: startPort.point.y - startPort.normal.y * inset,
  };
  const end = {
    x: endPort.point.x - endPort.normal.x * inset,
    y: endPort.point.y - endPort.normal.y * inset,
  };

  // Straight-only links stay centered on their sides/edges.
  if (flow.direction === "straight") {
    const p1 = toSvgPoint(svg, start);
    const p2 = toSvgPoint(svg, end);
    return p1 && p2 ? `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}` : undefined;
  }

  const n1 = startPort.normal;
  const n2 = { x: -endPort.normal.x, y: -endPort.normal.y };
  const between = { x: end.x - start.x, y: end.y - start.y };
  const verticalDistance = between.x * n1.x + between.y * n1.y;
  const horizontalDistance = between.x * n2.x + between.y * n2.y;
  if (verticalDistance <= 0 || horizontalDistance <= 0) return undefined;

  // Quarter-circle bend radius: half the shortest side of the two rectangles.
  const requestedRadius = rectangleCornerRadius(source, target);
  const radius = Math.min(requestedRadius, verticalDistance * 0.8, horizontalDistance * 0.8);
  const firstStraight = verticalDistance - radius;
  const lastStraight = horizontalDistance - radius;
  const p1 = { x: start.x + n1.x * firstStraight, y: start.y + n1.y * firstStraight };
  const p2 = { x: end.x - n2.x * lastStraight, y: end.y - n2.y * lastStraight };
  const k = 0.55228475;
  const c1 = { x: p1.x + n1.x * radius * k, y: p1.y + n1.y * radius * k };
  const c2 = { x: p2.x - n2.x * radius * k, y: p2.y - n2.y * radius * k };

  const points = [start, p1, c1, c2, p2, end].map((point) => toSvgPoint(svg, point));
  if (points.some((point) => !point)) return undefined;
  const s = points[0]!;
  const lineEnd = points[1]!;
  const control1 = points[2]!;
  const control2 = points[3]!;
  const curveEnd = points[4]!;
  const e = points[5]!;

  // Three pieces: straight departure, exact quarter-circle cubic, straight arrival.
  return `M ${s.x} ${s.y} L ${lineEnd.x} ${lineEnd.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${curveEnd.x} ${curveEnd.y} L ${e.x} ${e.y}`;
}

/** Recalculate rectangle-only routes from the current entity dimensions. */
export function updateRectangleFlowGeometry(
  root: ShadowRoot,
  config: PowerFlowCardPlusConfig
): void {
  if (config.entity_shape !== "rectangle") return;
  const card = root.querySelector<HTMLElement>("#power-flow-card-plus");
  if (!card) return;

  const viewportWidth = card.clientWidth;
  const viewportHeight = card.clientHeight;
  if (!viewportWidth || !viewportHeight) return;

  for (const flow of flowPaths) {
    const svg = root.querySelector<SVGSVGElement>(`svg#${flow.id}`);
    const path = svg?.querySelector<SVGPathElement>("path");
    const source = root.querySelector<HTMLElement>(flowNodes[flow.from]);
    const target = root.querySelector<HTMLElement>(flowNodes[flow.to]);
    if (!svg || !path || !source || !target) continue;
    // Use card-local CSS pixels as SVG units. This avoids scaling/cropping the
    // full-card route canvas and makes animated circles remain circular.
    svg.setAttribute("viewBox", `0 0 ${viewportWidth} ${viewportHeight}`);
    svg.setAttribute("preserveAspectRatio", "none");
    const lines = svg.closest<HTMLElement>(".lines");
    // Reproduce the old circle-mode SVG's content box (its .lines wrapper had
    // 16px horizontal and bottom padding, plus 80px entity gutters).
    const legacyLineHeight = lines?.classList.contains("high") ? 140 : 130;
    const legacyLineWidth = lines?.classList.contains("multi-individual")
      ? Math.max(0, ((viewportWidth - 32) * 1.29 - 242) * 0.5)
      : Math.min(340, Math.max(0, viewportWidth - 192));
    const legacyDotRadius = Math.max(legacyLineWidth, legacyLineHeight) / 100;
    svg.querySelectorAll<SVGCircleElement>("circle").forEach((dot) => {
      dot.setAttribute("r", String(legacyDotRadius));
    });
    const a = source.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    maskFlowThroughEntities(svg, path, source, target, flow.id);
    const d = makeThreePartPath(
      svg,
      { left: a.left, top: a.top, width: a.width, height: a.height },
      { left: b.left, top: b.top, width: b.width, height: b.height },
      flow
    );
    if (d) {
      path.removeAttribute("transform");
      path.setAttribute("d", d);
    }
  }
}
