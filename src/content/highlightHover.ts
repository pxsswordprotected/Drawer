import { useDrawerStore } from '@/store/drawerStore';
import type { TooltipTarget } from '@/shared/types';
import {
  isInRect,
  isInSafeZone,
  placeTooltip,
  tooltipRect,
  type Point,
  type Rect,
  type TooltipPlacement,
} from './tooltipGeometry';

// Timing
const OPEN_DELAY_MS = 300; // cursor must rest on a highlight this long (NN/g: 0.3 to 0.5 s)
const CLOSE_GRACE_MS = 120; // cursor outside the highlight, cone and tooltip this long closes it
const CONE_STALL_MS = 400; // cursor stopped inside the cone without arriving closes it

const MARK_SELECTOR = 'mark[data-highlight-id]';
const TOOLTIP_SELECTOR = '[data-highlight-tooltip]';
const LISTEN = { capture: true, passive: true } as const;

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
const exists = (id: string | undefined): id is string =>
  !!id && useDrawerStore.getState().allHighlights.some((h) => h.id === id);

/** The <mark> under an event target (a click inside our shadow root retargets to its host, which has none) */
const markAt = (target: EventTarget | null): HTMLElement | null =>
  target instanceof Element ? target.closest<HTMLElement>(MARK_SELECTOR) : null;

/** The mark's line box under `point`; the nearest line when the point is in a gap between lines */
function lineAt(mark: HTMLElement, point: Point): Rect {
  const rects = Array.from(mark.getClientRects());
  if (rects.length === 0) rects.push(mark.getBoundingClientRect());
  const distance = (r: Rect) => Math.max(r.top - point.y, 0, point.y - r.bottom);
  const containing = rects.find(
    (r) =>
      point.x >= r.left - 1 && point.x <= r.right + 1 && point.y >= r.top - 1 && point.y <= r.bottom + 1
  );
  const r = containing ?? rects.reduce((best, cur) => (distance(cur) < distance(best) ? cur : best));
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
}

function buildTarget(mark: HTMLElement, id: string, point: Point): TooltipTarget {
  return { highlightId: id, pointerX: point.x, line: lineAt(mark, point) };
}

/**
 * Hovering a highlight (cursor at rest) opens its notes tooltip; see `HighlightTooltip`.
 * A "safe cone" keeps the tooltip open while the cursor travels from the highlight to it:
 * the triangle from where the cursor left the highlight to the tooltip's near corners, plus
 * the strip between the two (`isInSafeZone`). `ui` is the extension's shadow root.
 */
export function initHighlightHover(ui: ShadowRoot): void {
  let lastPoint: Point | null = null;
  let armedId: string | null = null; // highlight the open timer is for (or that already opened)
  let hoverMark: HTMLElement | null = null;
  let armTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let closeKind: 'grace' | 'stall' | null = null;
  let apex: Point = { x: 0, y: 0 }; // cursor's last position on the highlight
  let landed = false; // cursor has reached the tooltip: only the strip between counts now
  let dismissing = false; // inside the Escape handler

  const store = () => useDrawerStore.getState();

  /** The tooltip's live box: its height follows its content (`offsetHeight` ignores the enter/exit scale) */
  const tooltipBox = (place: TooltipPlacement): Rect => {
    const el = ui.querySelector<HTMLElement>(TOOLTIP_SELECTOR);
    return tooltipRect(place, el ? el.offsetHeight : place.maxHeight);
  };

  const focusWithin = () => {
    const active = ui.activeElement;
    return !!active && !!ui.querySelector(TOOLTIP_SELECTOR)?.contains(active);
  };

  const cancelArm = () => {
    clearTimeout(armTimer);
    armedId = null;
    hoverMark = null;
  };

  const clearClose = () => {
    clearTimeout(closeTimer);
    closeKind = null;
  };

  const startClose = (kind: 'grace' | 'stall', ms: number) => {
    clearTimeout(closeTimer);
    closeKind = kind;
    closeTimer = setTimeout(() => {
      closeKind = null;
      // A note box has focus: stay open for typing. Click-away, Escape or focusout close it.
      if (!focusWithin()) store().hideTooltip();
    }, ms);
  };

  const showFor = (mark: HTMLElement, id: string, point: Point) => {
    store().showTooltip(buildTarget(mark, id, point));
    landed = false;
    apex = point;
    clearClose();
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return;
      const point = { x: e.clientX, y: e.clientY };
      lastPoint = point;
      const state = store();

      // Drawer open, or a button held (text selection, logo drag, hold-to-delete)
      if (state.isOpen || e.buttons !== 0) {
        clearTimeout(armTimer);
        return;
      }

      const mark = markAt(e.target);
      const id = mark?.dataset.highlightId;
      const hovered = mark && exists(id) ? { mark, id } : null;

      const tip = state.tooltip;
      if (tip) {
        const place = placeTooltip(tip, viewport());
        const rect = tooltipBox(place);
        if (isInRect(point, rect)) {
          landed = true;
          clearClose();
        } else if (hovered?.id === tip.highlightId) {
          landed = false;
          apex = point;
          clearClose();
        } else if (isInSafeZone(point, place, rect, tip.line, apex, landed)) {
          // Other highlights crossed on the way to the tooltip are ignored
          startClose('stall', CONE_STALL_MS);
        } else if (hovered) {
          armedId = hovered.id;
          hoverMark = hovered.mark;
          showFor(hovered.mark, hovered.id, point);
        } else if (closeKind !== 'grace') {
          startClose('grace', CLOSE_GRACE_MS);
        }
        return;
      }

      if (!hovered) {
        cancelArm();
        return;
      }
      hoverMark = hovered.mark;
      if (hovered.id === armedId) return;
      clearTimeout(armTimer);
      armedId = hovered.id;
      armTimer = setTimeout(() => {
        const openId = hovered.id;
        const m = hoverMark;
        if (store().isOpen || !exists(openId) || !m?.isConnected || !lastPoint) return;
        showFor(m, openId, lastPoint);
      }, OPEN_DELAY_MS);
    },
    LISTEN
  );

  // Pressing a mark (click, hold-to-delete) or the page closes it; pressing the tooltip does not
  window.addEventListener(
    'pointerdown',
    (e) => {
      cancelArm();
      const tip = store().tooltip;
      if (!tip) return;
      const rect = tooltipBox(placeTooltip(tip, viewport()));
      if (!isInRect({ x: e.clientX, y: e.clientY }, rect)) store().hideTooltip();
    },
    LISTEN
  );

  // The tooltip is position: fixed, so it would detach from its highlight
  const closeNow = () => {
    cancelArm();
    store().hideTooltip();
  };
  window.addEventListener('scroll', closeNow, LISTEN);
  window.addEventListener('resize', closeNow, { passive: true });
  // No capture: with capture this would also fire for every element losing focus
  window.addEventListener('blur', closeNow, { passive: true });

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      dismissing = true;
      store().hideTooltip();
      dismissing = false;
    },
    { capture: true, passive: true }
  );

  // Focus left the tooltip (the one thing that kept it open): close unless the cursor is still on its way
  ui.addEventListener('focusout', () => {
    requestAnimationFrame(() => {
      const tip = store().tooltip;
      if (!tip || focusWithin()) return;
      if (lastPoint) {
        const place = placeTooltip(tip, viewport());
        const rect = tooltipBox(place);
        const overMark = markAt(document.elementFromPoint(lastPoint.x, lastPoint.y));
        if (
          overMark?.dataset.highlightId === tip.highlightId ||
          isInRect(lastPoint, rect) ||
          isInSafeZone(lastPoint, place, rect, tip.line, apex, landed)
        ) {
          return;
        }
      }
      startClose('grace', CLOSE_GRACE_MS);
    });
  });

  // Cursor left the window
  document.documentElement.addEventListener(
    'pointerleave',
    () => {
      cancelArm();
      if (store().tooltip) startClose('grace', CLOSE_GRACE_MS);
    },
    { passive: true }
  );

  useDrawerStore.subscribe((s, prev) => {
    if (prev.tooltip && !s.tooltip) {
      clearClose();
      landed = false;
      // Back on the highlight later reopens it, except right after Escape (stay dismissed
      // until the cursor leaves the highlight)
      if (!dismissing) armedId = null;
    }
    if (s.isOpen && !prev.isOpen) clearTimeout(armTimer);
  });
}
