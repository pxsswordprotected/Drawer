import { DRAWER_CONFIG } from '@/shared/constants';
import type { TooltipTarget } from '@/shared/types';

export const TOOLTIP_GAP = 12; // px between the highlight line and the tooltip
export const CONE_TOLERANCE = 24; // px the cone's base extends past each side of the tooltip

export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export type TooltipSide = 'above' | 'below';
export interface TooltipPlacement {
  side: TooltipSide;
  x: number; // top-left of the tooltip, viewport px
  y: number;
  origin: Point; // CSS transform-origin in tooltip-local px: the point on the highlight's near edge, below the cursor
}

const { WIDTH, HEIGHT, EDGE_MARGIN } = DRAWER_CONFIG;

/** Above the highlight when it fits, else below, else the side with more room; clamped into the viewport */
export function placeTooltip(
  target: TooltipTarget,
  viewport: { width: number; height: number }
): TooltipPlacement {
  const { line, pointerX } = target;
  const fitsAbove = line.top - TOOLTIP_GAP - HEIGHT >= EDGE_MARGIN;
  const fitsBelow = viewport.height - line.bottom - TOOLTIP_GAP - HEIGHT >= EDGE_MARGIN;
  const side: TooltipSide = fitsAbove
    ? 'above'
    : fitsBelow
      ? 'below'
      : line.top >= viewport.height - line.bottom
        ? 'above'
        : 'below';

  const yRaw = side === 'above' ? line.top - TOOLTIP_GAP - HEIGHT : line.bottom + TOOLTIP_GAP;
  const y = Math.max(EDGE_MARGIN, Math.min(yRaw, viewport.height - HEIGHT - EDGE_MARGIN));
  const x = Math.max(EDGE_MARGIN, Math.min(pointerX - WIDTH / 2, viewport.width - WIDTH - EDGE_MARGIN));

  return {
    side,
    x,
    y,
    origin: { x: pointerX - x, y: (side === 'above' ? line.top : line.bottom) - y },
  };
}

export function tooltipRect(p: TooltipPlacement): Rect {
  return { left: p.x, right: p.x + WIDTH, top: p.y, bottom: p.y + HEIGHT };
}

/** Edges inclusive */
export function isInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function isInTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * True while the cursor is on a path from the highlight to the tooltip: the rectangular
 * bridge between them, or (until the cursor has landed on the tooltip) the triangle from
 * `apex` (where the cursor last was on the highlight) to the tooltip's near corners.
 * A point inside the tooltip itself is the caller's job (`isInRect`).
 */
export function isInSafeZone(
  point: Point,
  p: TooltipPlacement,
  line: Rect,
  apex: Point,
  landed: boolean
): boolean {
  const rect = tooltipRect(p);
  const above = p.side === 'above';

  const bridge: Rect = {
    left: Math.max(rect.left, line.left),
    right: Math.min(rect.right, line.right),
    top: above ? rect.bottom : line.bottom,
    bottom: above ? line.top : rect.top,
  };
  const bridgeNonEmpty = bridge.right - bridge.left > 0 && bridge.bottom - bridge.top > 0;
  if (bridgeNonEmpty && isInRect(point, bridge)) return true;

  if (landed) return false;

  const nearY = above ? rect.bottom : rect.top;
  return isInTriangle(
    point,
    apex,
    { x: rect.left - CONE_TOLERANCE, y: nearY },
    { x: rect.right + CONE_TOLERANCE, y: nearY }
  );
}
