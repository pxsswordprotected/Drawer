import { useDrawerStore, type DrawerState } from '@/store/drawerStore';
import type { Highlight } from '@/shared/types';
import { debugLog, excerpt, pageTextIncludes, snippetOf } from '@/shared/debugLog';
import { nodeAtXPath, resolveHighlight } from './anchoring';
import { pageUrl } from '@/shared/pageUrl';

// --- Seeded PRNG utilities ---

function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return h;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Mark press timing. Releasing before CLICK_GRACE_MS is a click (opens the drawer);
// holding until HOLD_DELETE_MS deletes the highlight.
const FEEDBACK_DELAY_MS = 150; // press length before the delete feedback (shrink) starts
const CLICK_GRACE_MS = 250; // shorter releases still count as a click, even after feedback started
const HOLD_DELETE_MS = 900; // total press length that deletes

// Unfocused marks fade their colour while another highlight is focused (see initMarkDimming)
const DIM_VAR = '--drawer-mark-dim';
const DIM_LEVEL = 0.4; // colour factor for unfocused marks (text keeps full contrast)
// Each line's own strength, a small ± around 1 (see markCss); separate from the focus dimming
const TONE_VAR = '--drawer-mark-tone';

// Per-line strokes (see "Per-line strokes" below)
const WOBBLE_PX = 1.2; // each line's paint sits up to this far above or below centre
const OVERSHOOT_SPREAD_EM = 0.12; // a line's ends reach up to this much past the base 0.34em / 0.16em
const THICKNESS_SPREAD = 0.15; // each line's height varies by up to this share
const TONE_SPREAD = 0.15; // each line's strength varies by up to this share
const GROW_MS = 450; // one line drawing in
const EXIT_MS = 180; // every line leaving at once
// The last line starts this long after the first when a highlight has two lines; each extra line adds
// STAGGER_GROWTH_MS to that span, up to STAGGER_CAP_MS (see staggerStep)
const STAGGER_PAIR_MS = 100;
const STAGGER_GROWTH_MS = 30;
const STAGGER_CAP_MS = 600;
const RELAYOUT_DEBOUNCE_MS = 150;
const EASE = 'cubic-bezier(0.25, 1, 0.5, 1)';
const GROW_TRANSITION = `background-size ${GROW_MS}ms ${EASE}`;
const EXIT_TRANSITION = `background-size ${EXIT_MS}ms ${EASE}`;
const DIM_TRANSITION = `${DIM_VAR} 150ms cubic-bezier(0.19, 1, 0.22, 1)`; // same duration and easing as the drawer's exit animation
// Each mark carries its colour in a variable so a recolor is a one-property change that fades
const COLOR_VAR = '--drawer-mark-color';
const COLOR_TRANSITION = `${COLOR_VAR} 150ms cubic-bezier(0.19, 1, 0.22, 1)`;
const MARK_TRANSITION = `${GROW_TRANSITION}, ${DIM_TRANSITION}, ${COLOR_TRANSITION}`;
const EXIT_MARK_TRANSITION = `${EXIT_TRANSITION}, ${DIM_TRANSITION}, ${COLOR_TRANSITION}`;
const MARK_SELECTOR = 'mark[data-highlight-id]';

/** The mark's colour at `alpha`% opacity, scaled by the focus dimming and the line's own strength */
const tint = (alpha: number) =>
  `color-mix(in srgb, var(${COLOR_VAR}) calc(${alpha}% * var(${DIM_VAR}, 1) * var(${TONE_VAR}, 1)), transparent)`;

/**
 * Attaches pointer and click handlers directly to a <mark> element.
 * Direct attachment avoids host pages with stopPropagation() blocking events.
 */
function attachMarkClickHandler(mark: HTMLElement, highlightId: string): void {
  let pendingStartTimer: ReturnType<typeof setTimeout> | null = null;
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let isLongPressCompleted = false;

  // True when the last press must not open the drawer: released after CLICK_GRACE_MS,
  // released off the highlight, or cancelled
  let isHoldInteraction = false;
  let pressStartTime = 0;

  let activeFragments: HTMLElement[] = [];
  let activePointerId: number | null = null;

  let isSelectionLocked = false;
  let originalUserSelect = '';
  let originalWebkitUserSelect = '';

  const preventSelect = (e: Event) => {
    if (isSelectionLocked) e.preventDefault();
  };

  const restoreSelectionState = () => {
    if (isSelectionLocked) {
      document.body.style.userSelect = originalUserSelect;
      document.body.style.webkitUserSelect = originalWebkitUserSelect;
      document.removeEventListener('selectstart', preventSelect);
      isSelectionLocked = false;
    }
  };

  const abortHold = (e?: PointerEvent) => {
    if (activePointerId === null) return;
    if (e && e.pointerId !== activePointerId) return;
    removeReleaseListeners();

    if (pendingStartTimer) {
      clearTimeout(pendingStartTimer);
      pendingStartTimer = null;
    }

    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }

    restoreSelectionState();

    if (mark.hasPointerCapture(activePointerId)) {
      mark.releasePointerCapture(activePointerId);
    }

    if (activeFragments.length > 0) {
      activeFragments.forEach((frag) => {
        frag.style.setProperty('transition', MARK_TRANSITION, 'important');
        frag.style.setProperty('background-size', '100% 100%', 'important');
      });
    }

    activeFragments = [];
    activePointerId = null;
  };

  const finalizeHoldDelete = () => {
    isLongPressCompleted = true;
    removeReleaseListeners();
    if (__DRAWER_DEBUG__) {
      debugLog('mark.holdDelete', { id: highlightId, ms: Math.round(performance.now() - pressStartTime) });
    }

    restoreSelectionState();

    if (activePointerId !== null && mark.hasPointerCapture(activePointerId)) {
      mark.releasePointerCapture(activePointerId);
    }

    //Immediately destroy the DOM elements!
    removeHighlightMarks(highlightId, { skipAnimation: true });

    useDrawerStore.getState().deleteHighlight(highlightId);

    activeFragments = [];
    activePointerId = null;
  };

  // Release is tracked on window: before pointer capture starts, the pointer can leave
  // the mark and be released elsewhere, which the mark itself would never see
  const onRelease = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const releasedOnHighlight = !!hit?.closest(`mark[data-highlight-id="${highlightId}"]`);
    isHoldInteraction =
      !releasedOnHighlight || performance.now() - pressStartTime >= CLICK_GRACE_MS;
    if (__DRAWER_DEBUG__) {
      debugLog('mark.release', {
        id: highlightId,
        ms: Math.round(performance.now() - pressStartTime),
        onHighlight: releasedOnHighlight,
        countsAsClick: !isHoldInteraction,
      });
    }
    abortHold(e);
  };

  const onCancel = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    if (__DRAWER_DEBUG__) debugLog('mark.pressCancelled', { id: highlightId, pointerType: e.pointerType });
    isHoldInteraction = true;
    abortHold(e);
  };

  const removeReleaseListeners = () => {
    window.removeEventListener('pointerup', onRelease, true);
    window.removeEventListener('pointercancel', onCancel, true);
  };

  mark.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    activePointerId = e.pointerId;
    pressStartTime = performance.now();
    isLongPressCompleted = false;
    isHoldInteraction = false;
    window.addEventListener('pointerup', onRelease, true);
    window.addEventListener('pointercancel', onCancel, true);

    activeFragments = Array.from(
      document.querySelectorAll(`mark[data-highlight-id="${highlightId}"]`)
    ) as HTMLElement[];

    // Delete feedback starts after FEEDBACK_DELAY_MS so quick clicks don't flicker
    pendingStartTimer = setTimeout(() => {
      pendingStartTimer = null;

      isSelectionLocked = true;
      originalUserSelect = document.body.style.userSelect;
      originalWebkitUserSelect = document.body.style.webkitUserSelect;
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
      document.addEventListener('selectstart', preventSelect);
      window.getSelection()?.removeAllRanges();

      if (activePointerId !== null) {
        mark.setPointerCapture(activePointerId);
      }

      activeFragments.forEach((frag) => {
        frag.style.setProperty(
          'transition',
          `background-size ${HOLD_DELETE_MS - FEEDBACK_DELAY_MS}ms linear, ${DIM_TRANSITION}, ${COLOR_TRANSITION}`,
          'important'
        );
        frag.style.setProperty('background-size', '0% 100%', 'important');
      });

      pressTimer = setTimeout(() => {
        pressTimer = null;
        finalizeHoldDelete();
      }, HOLD_DELETE_MS - FEEDBACK_DELAY_MS);
    }, FEEDBACK_DELAY_MS);
  });

  mark.addEventListener('pointermove', (e) => {
    if (!pendingStartTimer && !pressTimer) return;
    if (e.pointerId !== activePointerId) return;

    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const isOverHighlight = hit?.closest(`mark[data-highlight-id="${highlightId}"]`);

    if (!isOverHighlight) {
      if (__DRAWER_DEBUG__) {
        debugLog('mark.dragOff', { id: highlightId, ms: Math.round(performance.now() - pressStartTime) });
      }
      isHoldInteraction = true; // dragged off: neither a click nor a delete
      abortHold(e);
    }
  });

  // A click on a highlight opens it, so double/triple-click must not also select the
  // word/paragraph. Only multi-click presses are blocked; drag-selection still works.
  mark.addEventListener('mousedown', (e) => {
    if (e.detail >= 2) e.preventDefault();
  });

  mark.addEventListener('click', (e) => {
    e.stopPropagation();
    // A mark inside a link must not follow it: the click opens the highlight. Covers the click
    // that ends a hold-to-delete too (the mark is gone, the page must not navigate).
    e.preventDefault();

    if (__DRAWER_DEBUG__) {
      const store = useDrawerStore.getState();
      const result =
        isHoldInteraction || isLongPressCompleted
          ? 'blocked'
          : e.detail >= 2
            ? 'multiClickIgnored'
            : store.isOpen && store.selectedHighlightId === highlightId
              ? 'closeDrawer'
              : 'openDrawer';
      debugLog('mark.click', { id: highlightId, detail: e.detail, result });
    }

    // Block the click after a hold, drag-off, cancel, or delete
    if (isHoldInteraction || isLongPressCompleted) {
      e.preventDefault();

      // Reset the flag so you can still standard-click the highlight later if you aborted the delete
      isHoldInteraction = false;
      return;
    }

    // Second/third click of a double/triple-click: the first click already opened the drawer
    if (e.detail >= 2) return;

    const store = useDrawerStore.getState();

    if (store.isOpen && store.selectedHighlightId === highlightId) {
      store.closeDrawer();
      return;
    }

    store.setExpandedGroupUrl(pageUrl());
    store.openDrawer('mark');
    store.setPendingScrollHighlight(highlightId);
  });
}

// Whitespace/zero-width characters only
const BLANK_TEXT = /^[\s\u200b-\u200d]*$/;

const isInlineLevel = (node: Node | null): boolean =>
  !!node &&
  (node.nodeType === Node.TEXT_NODE ||
    (node.nodeType === Node.ELEMENT_NODE &&
      getComputedStyle(node as Element).display.startsWith('inline')));

/**
 * True for a whitespace-only text node that is layout filler rather than a space between
 * words: between blocks, or directly inside a flex/grid container. Such nodes render as
 * nothing, but wrapping one in a <mark> gives it a box (padding, background, and in
 * flex/grid a flex item), which highlights an empty line and shifts the layout. A space
 * between two inline siblings is real text and is kept so the highlight has no gap.
 */
function isLayoutWhitespace(node: Text): boolean {
  if (!BLANK_TEXT.test(node.data)) return false;
  const parent = node.parentElement;
  const parentDisplay = parent ? getComputedStyle(parent).display : '';
  if (/flex|grid/.test(parentDisplay)) return true;
  return !(isInlineLevel(node.previousSibling) && isInlineLevel(node.nextSibling));
}

// white-space values that render a "\n" in text as a line break (not collapsed to a space)
const KEEPS_LINE_BREAKS = /^(pre|pre-wrap|pre-line|break-spaces)$/;
const LINE_BREAK_RUN = /[\r\n]+/;

/**
 * Wraps the selected text in <mark> elements on the host page DOM.
 * Handles multi-node selections via TreeWalker, processing in reverse
 * document order to avoid offset invalidation when splitting text nodes.
 * Returns how many layout-whitespace text nodes it skipped (for the debug log).
 */
export function applyHighlightToRange(range: Range, highlightId: string, color: string): number {
  const treeWalker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Range check first: it rejects most nodes under a large common ancestor
        // before the costlier closest() selector walk runs.
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('mark[data-highlight-id]')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const textNodes: Text[] = [];
  let currentNode = treeWalker.nextNode();
  while (currentNode) {
    textNodes.push(currentNode as Text);
    currentNode = treeWalker.nextNode();
  }

  if (
    textNodes.length === 0 &&
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE &&
    !range.commonAncestorContainer.parentElement?.closest('mark[data-highlight-id]')
  ) {
    textNodes.push(range.commonAncestorContainer as Text);
  }

  let skippedWhitespaceNodes = 0;
  const validTextNodes = textNodes.filter((textNode) => {
    let startOffset = 0;
    let endOffset = textNode.length;
    if (textNode === range.startContainer) startOffset = range.startOffset;
    if (textNode === range.endContainer) endOffset = range.endOffset;
    if (startOffset >= endOffset) return false;
    if (isLayoutWhitespace(textNode)) {
      skippedWhitespaceNodes++;
      return false;
    }
    return true;
  });

  // 1. Split text nodes at boundaries to isolate the exact selection
  // Doing this in reverse prevents offset shifting, then unshift builds a forward-ordered array.
  const exactNodes: Text[] = [];
  for (let i = validTextNodes.length - 1; i >= 0; i--) {
    const textNode = validTextNodes[i];
    let startOffset = 0;
    let endOffset = textNode.length;

    if (textNode === range.startContainer) startOffset = range.startOffset;
    if (textNode === range.endContainer) endOffset = range.endOffset;

    let targetNode = textNode;
    if (endOffset < textNode.length) {
      targetNode.splitText(endOffset);
    }
    if (startOffset > 0) {
      targetNode = targetNode.splitText(startOffset);
    }
    exactNodes.unshift(targetNode);
  }

  // 1b. In text that keeps its line breaks (pre / pre-wrap / pre-line), a "\n" is a real
  // line break inside the same text node. If a mark wraps it, every blank line gets its own
  // padded, highlighted fragment: an empty box with nothing in it (X/Twitter posts are one
  // text node like this). Cut the text at each line break and mark only the text between.
  const lineNodes: Text[] = [];
  for (const node of exactNodes) {
    if (!KEEPS_LINE_BREAKS.test(getComputedStyle(node.parentElement ?? document.body).whiteSpace)) {
      lineNodes.push(node);
      continue;
    }
    let rest: Text | null = node;
    while (rest) {
      const breakAt: number = rest.data.search(LINE_BREAK_RUN);
      if (breakAt === -1) {
        lineNodes.push(rest);
        break;
      }
      if (breakAt > 0) {
        const lineBreak: Text = rest.splitText(breakAt);
        lineNodes.push(rest);
        rest = lineBreak;
      }
      // rest now starts with the line break(s): leave them outside any mark
      const run: number = rest.data.match(LINE_BREAK_RUN)![0].length;
      skippedWhitespaceNodes++;
      rest = run < rest.length ? rest.splitText(run) : null;
    }
  }
  exactNodes.length = 0;
  exactNodes.push(...lineNodes);

  // 2. Group adjacent text nodes that share the same parent
  const chunks: Text[][] = [];
  let currentChunk: Text[] = [];

  for (let i = 0; i < exactNodes.length; i++) {
    const node = exactNodes[i];
    if (currentChunk.length === 0) {
      currentChunk.push(node);
    } else {
      const lastNode = currentChunk[currentChunk.length - 1];
      // Check if they are direct contiguous siblings in the DOM
      if (lastNode.nextSibling === node && lastNode.parentNode === node.parentNode) {
        currentChunk.push(node);
      } else {
        chunks.push(currentChunk);
        currentChunk = [node];
      }
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  // 3. Wrap each chunk in a <mark>. layoutHighlight cuts them into one mark per wrapped line and
  // gives them their look.
  for (const chunk of chunks) {
    const mark = document.createElement('mark');
    mark.setAttribute('data-highlight-id', highlightId);
    mark.style.setProperty(COLOR_VAR, color);
    chunk[0].parentNode!.insertBefore(mark, chunk[0]);
    chunk.forEach((node) => mark.appendChild(node));
  }
  layoutHighlight(highlightId, true);
  return skippedWhitespaceNodes;
}

// ─── Per-line strokes ───
//
// A highlight is drawn as one <mark> per wrapped line, like a highlighter lifted between lines: each
// line gets its own small variation (reach past the text at its ends, height, wobble, strength) and
// the lines draw in one after another. The variation is seeded from where a mark's text starts inside
// the highlight, not from its line number, so a re-wrap leaves unchanged lines looking the same.
// Padding only ever grows past the old 0.34em / 0.16em, so click targets never get smaller.

interface MarkLook {
  id: string;
  offset: number; // characters of the highlight before this mark
  lineOffset: number; // same, for the first mark on this mark's line (vertical look is shared per line)
  totalLen: number; // characters in the whole highlight
  startsLine: boolean; // the mark begins a visual line: it gets the rounded, padded start
  endsLine: boolean; // ...or ends one: the rounded, padded end (marks inside a line meet flat)
  rtl: boolean;
}

/** The mark's whole inline style. `size` is its background-size, `transition` the full transition list. */
function markCss(look: MarkLook, color: string, size: string, transition: string): string {
  const rand = mulberry32(hashSeed(`${look.id}@${look.offset}`));
  const angle1 = clamp(173 + rand() * 4, 173, 177).toFixed(1);
  const angle2 = clamp(81 + rand() * 5, 81, 86).toFixed(1);
  const leadRaw = clamp(25 + (rand() * 6 - 3), 22, 28);
  const trailRaw = clamp(40 + (rand() * 6 - 3), 37, 43);
  const startOpacity = look.rtl ? trailRaw : leadRaw;
  const endOpacity = look.rtl ? leadRaw : trailRaw;

  // One line's height, wobble and strength, shared by every mark on that line so they meet cleanly
  const lineRand = mulberry32(hashSeed(`${look.id}@${look.lineOffset}#line`));
  const lengthFactor = look.totalLen < 15 ? 1.08 : look.totalLen > 80 ? 0.93 : 1.0;
  const thicknessBias = clamp(0.96 + lineRand() * 0.08, 0.96, 1.04);
  const spread = (amount: number) => 1 + (lineRand() - 0.5) * 2 * amount;
  const finalThickness = clamp(lengthFactor * thicknessBias, 0.92, 1.1) * spread(THICKNESS_SPREAD);
  const wobble = (lineRand() - 0.5) * 2 * WOBBLE_PX;
  const tone = spread(TONE_SPREAD);

  const padTop = (0.27 * finalThickness).toFixed(3);
  const padBot = (0.03 * finalThickness).toFixed(3);

  const rLeft = clamp(0.1 + (rand() * 0.12 - 0.06), 0.04, 0.58);
  const rRight = clamp(0.5 + (rand() * 0.12 - 0.06), 0.04, 0.58);
  const rWobble = rand() * 0.08 - 0.04;
  const br = [
    rLeft.toFixed(2),
    rRight.toFixed(2),
    clamp(0.15 + (rand() * 0.12 - 0.06), 0.04, 0.58).toFixed(2),
    clamp(0.4 + (rand() * 0.12 - 0.06), 0.04, 0.58).toFixed(2),
    clamp(0.5 + rWobble, 0.04, 0.58).toFixed(2),
    clamp(0.1 + rWobble, 0.04, 0.58).toFixed(2),
    clamp(0.4 + rWobble, 0.04, 0.58).toFixed(2),
    clamp(0.15 + rWobble, 0.04, 0.58).toFixed(2),
  ];
  const midDrift1 = clamp(rand() * 4 - 2, -2, 2);
  const midDrift2 = clamp(rand() * 4 - 2, -2, 2);
  const mid1 = clamp(88 + midDrift1, 86, 92).toFixed(0);
  const mid2 = clamp(72 + midDrift2, 70, 76).toFixed(0);

  // How far the stroke reaches past the text at each end: the line's own luck, per end
  const endRand = mulberry32(hashSeed(`${look.id}@${look.offset}#ends`));
  const applyLeftEdge = look.rtl ? look.endsLine : look.startsLine;
  const applyRightEdge = look.rtl ? look.startsLine : look.endsLine;
  const pLeft = applyLeftEdge ? (0.34 + endRand() * OVERSHOOT_SPREAD_EM).toFixed(3) : '0';
  const pRight = applyRightEdge ? (0.16 + endRand() * OVERSHOOT_SPREAD_EM).toFixed(3) : '0';

  const radius = `${applyLeftEdge ? br[0] : '0'}em ${applyRightEdge ? br[1] : '0'}em ${applyRightEdge ? br[2] : '0'}em ${applyLeftEdge ? br[3] : '0'}em / ${applyLeftEdge ? br[4] : '0'}em ${applyRightEdge ? br[5] : '0'}em ${applyRightEdge ? br[6] : '0'}em ${applyLeftEdge ? br[7] : '0'}em`;
  const gradient1 = `linear-gradient(${angle1}deg, transparent 20%, ${tint(15)} 50%, transparent 80%)`;
  const gradient2 = `linear-gradient(${angle2}deg, ${tint(100 - Number(startOpacity.toFixed(0)))}, ${tint(100 - Number(mid1))} 4%, ${tint(100 - Number(mid2))} 96%, ${tint(100 - Number(endOpacity.toFixed(0)))})`;
  // The soft lift along the bottom edge is part of the drawn paint (not a box-shadow), so it grows and
  // shrinks with the stroke instead of showing as an empty outline before the line is drawn
  const lift = `linear-gradient(to top, ${tint(10)}, transparent 3px)`;
  const position = `left calc(50% + ${wobble.toFixed(2)}px)`; // the offset moves only the paint, never the text

  return `
       ${COLOR_VAR}: ${color};
       ${TONE_VAR}: ${tone.toFixed(3)};
       background-color: transparent !important;
       background-image: ${gradient1}, ${gradient2}, ${lift} !important;
       border-radius: ${radius} !important;
       margin: -${padTop}em -${pRight}em -${padBot}em -${pLeft}em !important;
       padding: ${padTop}em ${pRight}em ${padBot}em ${pLeft}em !important;
       box-shadow: none !important;
       -webkit-box-decoration-break: clone !important;
       box-decoration-break: clone !important;
       color: inherit !important;
       cursor: pointer !important;
       display: inline !important;
       background-position: ${position}, ${position}, ${position} !important;
       background-repeat: no-repeat !important;
       background-size: ${size} !important;
       transition: ${transition} !important;
     `;
}

const LINE_TOLERANCE = 0.5; // boxes sharing more than this share of the shorter one's height are on one line
const sameLine = (a: DOMRect, b: DOMRect) =>
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) >
  LINE_TOLERANCE * Math.min(a.height, b.height);
const visibleBoxes = (el: Element | Range) =>
  Array.from(el.getClientRects()).filter((r) => r.height > 0);

/** Top of the first box at or after `from` (characters collapsed to no box are skipped), or null */
function textTop(node: Text, from: number, range: Range): number | null {
  for (let k = from; k < node.length; k++) {
    range.setStart(node, k);
    range.setEnd(node, k + 1);
    const box = visibleBoxes(range)[0];
    if (box) return box.top;
  }
  return null;
}

/** Offsets in `node` where a new visual line starts (each at the line's first visible character). */
function lineStarts(node: Text, range: Range): number[] {
  range.selectNodeContents(node);
  if (visibleBoxes(range).length <= 1) return [];
  let top = textTop(node, 0, range);
  if (top === null) return [];
  const starts: number[] = [];
  let from = 0;
  for (;;) {
    // Tops never decrease along the text, so the first character below this line is found by bisection
    let lo = from + 1;
    let hi = node.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const t = textTop(node, mid, range);
      if (t !== null && t > top + 4) hi = mid;
      else lo = mid + 1;
    }
    let at = lo;
    while (at < node.length && /\s/.test(node.data[at])) at++;
    if (at >= node.length) break;
    starts.push(at);
    top = textTop(node, at, range) ?? top;
    from = at;
  }
  return starts;
}

/** Cuts a mark (text nodes only) into one mark per visual line; returns them in order. */
function splitIntoLines(mark: HTMLElement, id: string, range: Range): HTMLElement[] {
  const kids = Array.from(mark.childNodes);
  if (kids.length === 0 || !kids.every((n) => n.nodeType === Node.TEXT_NODE)) return [mark];
  const parent = mark.parentElement;
  if (parent && getComputedStyle(parent).writingMode !== 'horizontal-tb') return [mark];

  const pieces: Text[] = [];
  for (const node of kids as Text[]) {
    const tails: Text[] = [];
    const cuts = lineStarts(node, range);
    for (let i = cuts.length - 1; i >= 0; i--) tails.unshift(node.splitText(cuts[i]));
    pieces.push(node, ...tails);
  }

  const groups: Text[][] = [];
  let previous: DOMRect | null = null;
  for (const piece of pieces) {
    range.selectNodeContents(piece);
    const box = visibleBoxes(range)[0] ?? null;
    if (groups.length === 0 || (box && previous && !sameLine(previous, box))) groups.push([piece]);
    else groups[groups.length - 1].push(piece);
    if (box) previous = box;
  }

  const marks = [mark];
  for (let g = 1; g < groups.length; g++) {
    const next = document.createElement('mark');
    next.setAttribute('data-highlight-id', id);
    marks[g - 1].after(next);
    next.append(...groups[g]);
    marks.push(next);
  }
  return marks;
}

interface MarkLines {
  startsLine: boolean[];
  endsLine: boolean[];
  wrapped: boolean; // some mark is still broken over several lines (the page reflowed)
}

function measureLines(marks: HTMLElement[]): MarkLines {
  const boxes = marks.map((m) => visibleBoxes(m)[0] ?? null);
  const joined = (i: number) => {
    const a = boxes[i];
    const b = boxes[i + 1];
    return !!a && !!b && sameLine(a, b);
  };
  return {
    startsLine: marks.map((_, i) => i === 0 || !joined(i - 1)),
    endsLine: marks.map((_, i) => i === marks.length - 1 || !joined(i)),
    wrapped: marks.some((m) => visibleBoxes(m).length > 1),
  };
}

const lineFlags = (m: MarkLines) => m.startsLine.map((s) => (s ? '1' : '0')).join('');
const laidOut = new Map<string, string>(); // highlight id -> line structure it was last drawn for
const handled = new WeakSet<HTMLElement>(); // marks that already have their press handlers

/**
 * Delay between one line starting and the next, from how many lines the highlight has. Few lines get a
 * wide gap so the staggering can be seen (two lines: STAGGER_PAIR_MS); the total span grows with every
 * extra line, so a long highlight gets a tight gap and still finishes drawing quickly (capped).
 */
function staggerStep(lineCount: number): number {
  if (lineCount < 2) return 0; // a single line just draws
  const span = Math.min(STAGGER_CAP_MS, STAGGER_PAIR_MS + STAGGER_GROWTH_MS * (lineCount - 2));
  return span / (lineCount - 1);
}

/**
 * (Re)draws a highlight: joins its marks back into whole chunks, cuts them at the current line
 * breaks, and styles every piece. `animate` draws the lines in one after another (a new or restored
 * highlight); a re-layout after the page reflowed just swaps the shapes in place.
 */
function layoutHighlight(id: string, animate: boolean): void {
  const found = Array.from(
    document.querySelectorAll<HTMLElement>(`mark[data-highlight-id="${id}"]`)
  );
  if (found.length === 0) return;
  const color = found[0].style.getPropertyValue(COLOR_VAR);
  const range = document.createRange();

  const chunks: HTMLElement[] = [];
  for (const mark of found) {
    const previous = chunks[chunks.length - 1];
    // Adjacent sibling marks of one highlight are pieces of the same chunk
    if (previous && mark.previousSibling === previous) {
      while (mark.firstChild) previous.appendChild(mark.firstChild);
      mark.remove();
    } else {
      chunks.push(mark);
    }
  }
  const marks = chunks.flatMap((chunk) => splitIntoLines(chunk, id, range));
  const lines = measureLines(marks);

  let offset = 0;
  let lineOffset = 0;
  let line = -1;
  const placed = marks.map((mark, i) => {
    if (lines.startsLine[i]) {
      lineOffset = offset;
      line++;
    }
    const at = { offset, lineOffset, line };
    offset += mark.textContent?.length ?? 0;
    return at;
  });
  const lineCount = line + 1;
  const step = staggerStep(lineCount);

  marks.forEach((mark, i) => {
    const look: MarkLook = {
      id,
      ...placed[i],
      totalLen: offset,
      startsLine: lines.startsLine[i],
      endsLine: lines.endsLine[i],
      rtl: getComputedStyle(mark.parentElement ?? document.body).direction === 'rtl',
    };
    const delay = Math.round(placed[i].line * step);
    const transition = animate
      ? `background-size ${GROW_MS}ms ${EASE} ${delay}ms, ${DIM_TRANSITION}, ${COLOR_TRANSITION}`
      : MARK_TRANSITION;
    mark.style.cssText = markCss(look, color, animate ? '0% 100%' : '100% 100%', transition);
  });

  if (animate) {
    // Commit the 0% start style now, then grow to 100% so the transition always runs.
    // A requestAnimationFrame alone races: its callback runs before the browser has ever
    // computed this new element's style, so 0% -> 100% often collapsed to "no change" and
    // the mark appeared without animating (always, when restored from a timer).
    void marks[0].offsetWidth;
    for (const mark of marks) mark.style.setProperty('background-size', '100% 100%', 'important');
  }
  for (const mark of marks) {
    if (handled.has(mark)) continue;
    handled.add(mark);
    attachMarkClickHandler(mark, id);
  }
  laidOut.set(id, lineFlags(measureLines(marks)));
}

/** True when the page reflowed since the highlight was drawn: a mark wraps, or lines joined or split. */
function needsLayout(id: string): boolean {
  const marks = Array.from(
    document.querySelectorAll<HTMLElement>(`mark[data-highlight-id="${id}"]`)
  );
  const lines = measureLines(marks);
  return lines.wrapped || lineFlags(lines) !== laidOut.get(id);
}

let relayoutTimer: ReturnType<typeof setTimeout> | undefined;
/** Redraws highlights whose lines changed (window resize, late fonts or images, a hidden tab shown). */
function scheduleRelayout(): void {
  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(() => {
    if (document.hidden) return;
    const ids = new Set<string>();
    document
      .querySelectorAll<HTMLElement>(MARK_SELECTOR)
      .forEach((m) => ids.add(m.dataset.highlightId ?? ''));
    for (const id of ids) if (id && needsLayout(id)) layoutHighlight(id, false);
  }, RELAYOUT_DEBOUNCE_MS);
}

/**
 * Removes all <mark> elements for a given highlight ID.
 * Does NOT call .normalize() leaves text nodes fragmented to avoid
 * breaking host page framework state.
 */
export function removeHighlightMarks(
  highlightId: string,
  options?: { skipAnimation?: boolean }
): void {
  const skipAnimation = options?.skipAnimation;
  tracked.delete(highlightId); // deleted: the restore observer must not bring it back

  const marks = document.querySelectorAll<HTMLElement>(`mark[data-highlight-id="${highlightId}"]`);

  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;

    if (skipAnimation) {
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
      return;
    }

    // Animate out: reverse the enter animation (100% to 0%). Only the grow-out ends it: the
    // dim fade can finish first (a group delete also clears the focused highlight).
    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'background-size') return;
      mark.removeEventListener('transitionend', onEnd);
      // Unwrap: move children out, then remove the mark
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    };

    mark.addEventListener('transitionend', onEnd);
    mark.style.setProperty('transition', EXIT_MARK_TRANSITION, 'important');
    mark.style.setProperty('background-size', '0% 100%', 'important');
  });
}

/** Recolors a highlight's marks in place; the crossfade is the colour variable's transition. */
export function recolorHighlightMarks(highlightId: string, color: string): void {
  document
    .querySelectorAll<HTMLElement>(`mark[data-highlight-id="${highlightId}"]`)
    .forEach((mark) => mark.style.setProperty(COLOR_VAR, color));
}

/**
 * While a highlight is focused in the open drawer, or hovered with its notes tooltip open, fade
 * the colour of every other mark on this page. `html:has(<focused mark>)` keeps the rule off
 * when the focused highlight has no marks here (another page's highlight, or not restored), so
 * a whole page is never dimmed.
 */
export function initMarkDimming(): void {
  const style = document.createElement('style');
  style.setAttribute('data-drawer-mark-dim', '');
  document.head.appendChild(style);
  // Registered so the variable can transition (unregistered, it still works but snaps)
  const registration =
    `@property ${DIM_VAR} { syntax: '<number>'; inherits: false; initial-value: 1; }\n` +
    `@property ${COLOR_VAR} { syntax: '<color>'; inherits: false; initial-value: transparent; }`;
  const render = (s: DrawerState) => {
    const focusedId = s.isOpen ? s.selectedHighlightId : (s.tooltip?.highlightId ?? null);
    if (!focusedId) {
      style.textContent = registration;
      return;
    }
    const focused = `[data-highlight-id="${CSS.escape(focusedId)}"]`;
    style.textContent = `${registration}
html:has(mark${focused}) mark[data-highlight-id]:not(${focused}) { ${DIM_VAR}: ${DIM_LEVEL} !important; }`;
  };
  render(useDrawerStore.getState());
  useDrawerStore.subscribe((s, prev) => {
    if (
      s.isOpen !== prev.isOpen ||
      s.selectedHighlightId !== prev.selectedHighlightId ||
      s.tooltip?.highlightId !== prev.tooltip?.highlightId
    ) {
      render(s);
    }
  });
}

// ─── Restoring marks on revisit ───
//
// Marks are plain DOM nodes inside a page we don't control. Hydrating server-rendered
// pages (Substack) rebuild their DOM shortly after load and drop our marks, and client-
// rendered pages (X/Twitter) add their text after we first look for it. So restoring is
// not a one-shot: every saved highlight of the current URL stays "tracked", and a
// debounced MutationObserver re-resolves and re-marks any whose marks are missing.

const RESTORE_DEBOUNCE_MS = 200; // wait for a burst of page mutations to settle…
const RESTORE_MAX_WAIT_MS = 1000; // …but never longer than this on pages that never settle
const RESTORE_MAX_BACKOFF_MS = 10000; // spacing between searches for text that isn't there
const RESTORE_MAX_APPLICATIONS = 25; // stop re-marking a highlight the page keeps wiping
const SETTLE_QUIET_MS = 400; // page must be loaded and mutation-free this long…
const SETTLE_DEADLINE_MS = 3000; // …or this much time since navigation start has passed

interface RestoreState {
  highlight: Highlight;
  applications: number; // times marks were applied (>1 means the page removed them)
  misses: number; // consecutive searches that found nothing
  nextTryAt: number;
}

const tracked = new Map<string, RestoreState>();
let restoreObserver: MutationObserver | null = null;
let restoreTimer: ReturnType<typeof setTimeout> | null = null;
let firstPendingAt = 0;
let restoreReady = false; // set by the settle gate; nothing is restored before it
let settleTimer: ReturnType<typeof setTimeout> | null = null;

const hasMarks = (id: string) => !!document.querySelector(`mark[data-highlight-id="${id}"]`);

/** Marks the highlight for restoring (used right after saving, before the store has it) */
export function trackHighlight(h: Highlight): void {
  if (!tracked.has(h.id)) tracked.set(h.id, { highlight: h, applications: 1, misses: 0, nextTryAt: 0 });
  watchPageChanges();
}

/**
 * Re-applies marks for saved highlights of the current page that aren't on the page
 * (page reload / revisit / page rebuilt its DOM). `highlights` is the full saved list.
 * Highlights that can't be located yet are retried when the page changes.
 */
export function restoreHighlights(highlights: Highlight[]): void {
  const ids = new Set(highlights.map((h) => h.id));
  for (const id of tracked.keys()) if (!ids.has(id)) tracked.delete(id);
  for (const h of highlights) {
    const state = tracked.get(h.id);
    if (state) state.highlight = h;
    else tracked.set(h.id, { highlight: h, applications: 0, misses: 0, nextTryAt: 0 });
  }
  restorePending();
  watchPageChanges();
}

function watchPageChanges(): void {
  if (restoreObserver) return;
  restoreObserver = new MutationObserver(() =>
    restoreReady ? scheduleRestore() : armSettleGate()
  );
  restoreObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('load', armSettleGate, { once: true });
  // Retry when the user comes back to a tab that changed while hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    scheduleRelayout(); // marks drawn while the tab was hidden had no line boxes to measure
    if (restoreReady) scheduleRestore();
  });
  // Redraw per-line marks when the page reflows: resize, late images, web fonts
  window.addEventListener('resize', scheduleRelayout);
  new ResizeObserver(scheduleRelayout).observe(document.documentElement);
  document.fonts?.addEventListener('loadingdone', scheduleRelayout);
  armSettleGate();
}

// Settle gate: marks applied while the page is still hydrating are thrown away a moment
// later and then re-applied, which shows as highlights flashing on, off, and on again.
// So the first restore waits until the page has finished loading and gone quiet; the
// deadline (counted from navigation start) keeps pages that never settle, like X, working.
function armSettleGate(): void {
  if (restoreReady) return;
  clearTimeout(settleTimer ?? undefined);
  const untilDeadline = Math.max(0, SETTLE_DEADLINE_MS - performance.now());
  settleTimer = setTimeout(
    () => {
      const loaded = document.readyState === 'complete';
      if (!loaded && performance.now() < SETTLE_DEADLINE_MS) return; // the load event re-arms
      restoreReady = true;
      restorePending();
    },
    Math.min(SETTLE_QUIET_MS, untilDeadline)
  );
}

function scheduleRestore(): void {
  const now = performance.now();
  if (!firstPendingAt) firstPendingAt = now;
  clearTimeout(restoreTimer ?? undefined);
  const wait = Math.max(0, Math.min(RESTORE_DEBOUNCE_MS, firstPendingAt + RESTORE_MAX_WAIT_MS - now));
  restoreTimer = setTimeout(() => {
    restoreTimer = null;
    firstPendingAt = 0;
    restorePending();
  }, wait);
}

function restorePending(): void {
  if (!restoreReady || document.hidden) return;
  const url = pageUrl();
  const now = performance.now();
  for (const state of tracked.values()) {
    const h = state.highlight;
    if (h.url !== url || hasMarks(h.id)) continue;
    if (state.applications >= RESTORE_MAX_APPLICATIONS || now < state.nextTryAt) continue;

    const started = __DRAWER_DEBUG__ ? performance.now() : 0;
    const range = resolveHighlight(h.text, h.position, document.body);
    // Read before marks are inserted, which split the range's text nodes
    const foundText = __DRAWER_DEBUG__ && range ? range.toString() : null;
    if (range) {
      applyHighlightToRange(range, h.id, h.color);
      state.applications++;
      state.misses = 0;
    } else {
      state.misses++;
      state.nextTryAt = now + Math.min(RESTORE_MAX_BACKOFF_MS, 250 * 2 ** state.misses);
    }
    if (__DRAWER_DEBUG__) logRestore(state, performance.now() - started, foundText);
  }
}

// Debug builds: one event per successful restore, and per failed search at attempts 1, 2,
// 4, 8… (retries run on every page change, so logging each miss would flood the log).
// `application` > 1 means the page removed the marks and they were re-applied.
function logRestore(state: RestoreState, ms: number, foundText: string | null): void {
  const h = state.highlight;
  const squeeze = (s: string) => s.replace(/\s+/g, '');
  const base = { id: h.id, text: excerpt(h.text), ms: Math.round(ms), sincePageLoadMs: Math.round(performance.now()) };

  if (foundText !== null) {
    const exact = squeeze(foundText) === squeeze(h.text);
    debugLog('restore.found', {
      ...base,
      application: state.applications,
      exact,
      ...(exact
        ? {}
        : {
            foundText: excerpt(foundText),
            snippet: snippetOf(document.querySelector(`mark[data-highlight-id="${h.id}"]`)),
          }),
    });
    return;
  }

  if (state.misses & (state.misses - 1)) return; // log misses 1, 2, 4, 8… only
  debugLog('restore.notFound', {
    ...base,
    misses: state.misses,
    textInPage: pageTextIncludes(h.text),
    position: {
      hasXPath: !!h.position.startXPath,
      hasBlock: !!h.position.block,
      twins: h.position.twins,
    },
    snippetAtSavedPath: state.misses === 1 ? snippetOf(nodeAtXPath(h.position.startXPath, document.body)) : null,
  });
}
