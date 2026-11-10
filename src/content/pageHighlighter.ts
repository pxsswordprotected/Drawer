import { useDrawerStore } from '@/store/drawerStore';
import type { Highlight } from '@/shared/types';
import { resolveHighlight } from './anchoring';

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

  mark.style.setProperty('background-position', 'left center', 'important');
  mark.style.setProperty('background-repeat', 'no-repeat', 'important');

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
        frag.style.setProperty(
          'transition',
          'background-size 0.8s cubic-bezier(0.25, 1, 0.5, 1)',
          'important'
        );
        frag.style.setProperty('background-size', '100% 100%', 'important');
      });
    }

    activeFragments = [];
    activePointerId = null;
  };

  const finalizeHoldDelete = () => {
    isLongPressCompleted = true;
    removeReleaseListeners();

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
    abortHold(e);
  };

  const onCancel = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
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
          `background-size ${HOLD_DELETE_MS - FEEDBACK_DELAY_MS}ms linear`,
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

    store.setExpandedGroupUrl(window.location.href);
    store.openDrawer('mark');
    store.setPendingScrollHighlight(highlightId);
  });
}

/**
 * Wraps the selected text in <mark> elements on the host page DOM.
 * Handles multi-node selections via TreeWalker, processing in reverse
 * document order to avoid offset invalidation when splitting text nodes.
 */
export function applyHighlightToRange(range: Range, highlightId: string, color: string): void {
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

  const validTextNodes = textNodes.filter((textNode) => {
    let startOffset = 0;
    let endOffset = textNode.length;
    if (textNode === range.startContainer) startOffset = range.startOffset;
    if (textNode === range.endContainer) endOffset = range.endOffset;
    return startOffset < endOffset;
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

  // Pre-calculations for styles
  const rand = mulberry32(hashSeed(highlightId));
  const angle1 = clamp(173 + rand() * 4, 173, 177).toFixed(1);
  const angle2 = clamp(81 + rand() * 5, 81, 86).toFixed(1);

  const isRTL =
    getComputedStyle(range.commonAncestorContainer.parentElement ?? document.body).direction ===
    'rtl';

  const leadRaw = clamp(25 + (rand() * 6 - 3), 22, 28);
  const trailRaw = clamp(40 + (rand() * 6 - 3), 37, 43);
  const startOpacity = isRTL ? trailRaw : leadRaw;
  const endOpacity = isRTL ? leadRaw : trailRaw;

  const totalLen = range.toString().length;
  const lengthFactor = totalLen < 15 ? 1.08 : totalLen > 80 ? 0.93 : 1.0;
  const thicknessBias = clamp(0.96 + rand() * 0.08, 0.96, 1.04);
  const finalThickness = clamp(lengthFactor * thicknessBias, 0.92, 1.1);

  const padTop = (0.27 * finalThickness).toFixed(2);
  const padBot = (0.03 * finalThickness).toFixed(2);
  const margTop = (-0.27 * finalThickness).toFixed(2);
  const margBot = (-0.03 * finalThickness).toFixed(2);

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

  const shadowBlur = clamp(1.5 + rand() * 1, 1.5, 2.5).toFixed(1);
  const sharedGradient1 = `linear-gradient(${angle1}deg, transparent 20%, color-mix(in srgb, ${color}, transparent 85%) 50%, transparent 80%)`;
  const sharedShadow = `inset 0 -1px ${shadowBlur}px color-mix(in srgb, ${color}, transparent 90%)`;

  // 3. Process grouped chunks (in reverse to safely modify DOM)
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];

    const isFirstChunk = i === 0;
    const isLastChunk = i === chunks.length - 1;

    // Apply flat "puzzle piece" edges only if the chunks are separated by HTML elements
    const applyLeftEdge = isRTL ? isLastChunk : isFirstChunk;
    const applyRightEdge = isRTL ? isFirstChunk : isLastChunk;

    const pLeft = applyLeftEdge ? '0.34em' : '0em';
    const pRight = applyRightEdge ? '0.16em' : '0em';
    const mLeft = applyLeftEdge ? '-0.34em' : '0em';
    const mRight = applyRightEdge ? '-0.16em' : '0em';

    const fragPadding = `${padTop}em ${pRight} ${padBot}em ${pLeft}`;
    const fragMargin = `${margTop}em ${mRight} ${margBot}em ${mLeft}`;

    const brTL = applyLeftEdge ? br[0] : '0';
    const brTR = applyRightEdge ? br[1] : '0';
    const brBR = applyRightEdge ? br[2] : '0';
    const brBL = applyLeftEdge ? br[3] : '0';
    const brTLV = applyLeftEdge ? br[4] : '0';
    const brTRV = applyRightEdge ? br[5] : '0';
    const brBRV = applyRightEdge ? br[6] : '0';
    const brBLV = applyLeftEdge ? br[7] : '0';

    const fragBorderRadius = `${brTL}em ${brTR}em ${brBR}em ${brBL}em / ${brTLV}em ${brTRV}em ${brBRV}em ${brBLV}em`;

    const bgOffsetX = clamp(rand() * 4 - 2, -2, 2).toFixed(1);
    const midDrift1 = clamp(rand() * 4 - 2, -2, 2);
    const midDrift2 = clamp(rand() * 4 - 2, -2, 2);
    const fragMid1 = clamp(88 + midDrift1, 86, 92).toFixed(0);
    const fragMid2 = clamp(72 + midDrift2, 70, 76).toFixed(0);

    const gradient2 = `linear-gradient(${angle2}deg, color-mix(in srgb, ${color}, transparent ${startOpacity.toFixed(0)}%), color-mix(in srgb, ${color}, transparent ${fragMid1}%) 4%, color-mix(in srgb, ${color}, transparent ${fragMid2}%) 96%, color-mix(in srgb, ${color}, transparent ${endOpacity.toFixed(0)}%))`;

    const mark = document.createElement('mark');
    mark.setAttribute('data-highlight-id', highlightId);
    mark.style.cssText = `
       background-color: transparent !important;
       background-image: ${sharedGradient1}, ${gradient2} !important;
       border-radius: ${fragBorderRadius} !important;
       margin: ${fragMargin} !important;
       padding: ${fragPadding} !important;
       box-shadow: ${sharedShadow} !important;
       -webkit-box-decoration-break: clone !important;
       box-decoration-break: clone !important;
       color: inherit !important;
       cursor: pointer !important;
       display: inline !important;
       background-position: ${bgOffsetX}px center !important;
       background-repeat: no-repeat !important;
       background-size: 0% 100% !important;
       transition: background-size 0.8s cubic-bezier(0.25, 1, 0.5, 1) !important;
     `;

    // Wrap the entire chunk in a single <mark>
    const firstNode = chunk[0];
    firstNode.parentNode!.insertBefore(mark, firstNode);

    chunk.forEach((node) => mark.appendChild(node));

    requestAnimationFrame(() => {
      mark.style.backgroundSize = '100% 100%';
    });

    attachMarkClickHandler(mark, highlightId);
  }
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

    // Animate out: reverse the enter animation (100% to 0%)
    const onEnd = () => {
      mark.removeEventListener('transitionend', onEnd);
      // Unwrap: move children out, then remove the mark
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    };

    mark.addEventListener('transitionend', onEnd);
    mark.style.setProperty(
      'transition',
      'background-size 0.8s cubic-bezier(0.25, 1, 0.5, 1)',
      'important'
    );
    mark.style.setProperty('background-size', '0% 100%', 'important');
  });
}

// Highlights we've already tried to restore on this page load (found or orphaned),
// so repeated store updates don't re-run the search.
const restoreAttempted = new Set<string>();

/**
 * Re-applies marks for saved highlights of the current page that aren't on the page
 * yet (page reload / revisit). Highlights that can't be located are left unmarked.
 */
export function restoreHighlights(highlights: Highlight[]): void {
  const url = window.location.href;
  for (const h of highlights) {
    if (h.url !== url || restoreAttempted.has(h.id)) continue;
    restoreAttempted.add(h.id);
    if (document.querySelector(`mark[data-highlight-id="${h.id}"]`)) continue;
    const range = resolveHighlight(h.text, h.position, document.body);
    if (range) applyHighlightToRange(range, h.id, h.color);
  }
}
