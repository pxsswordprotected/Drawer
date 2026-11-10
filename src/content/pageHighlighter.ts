import { useDrawerStore } from '@/store/drawerStore';
import type { Highlight } from '@/shared/types';
import { debugLog, excerpt, pageTextIncludes, snippetOf } from '@/shared/debugLog';
import { nodeAtXPath, resolveHighlight } from './anchoring';

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

    store.setExpandedGroupUrl(window.location.href);
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
  return skippedWhitespaceNodes;
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
  restoreObserver = new MutationObserver(scheduleRestore);
  restoreObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
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
  if (document.hidden) return;
  const url = window.location.href;
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
