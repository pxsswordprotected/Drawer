import { useDrawerStore } from '@/store/drawerStore';

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

// Module-level state to track hold-deleted IDs (The Handoff)
const highlightsDeletedViaHold = new Set<string>();

/**
 * Attaches pointer and click handlers directly to a <mark> element.
 * Direct attachment avoids host pages with stopPropagation() blocking events.
 */
/**
 * Attaches pointer and click handlers directly to a <mark> element.
 * Direct attachment avoids host pages with stopPropagation() blocking events.
 */
function attachMarkClickHandler(mark: HTMLElement, highlightId: string): void {
  let pendingStartTimer: ReturnType<typeof setTimeout> | null = null;
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let isLongPressCompleted = false;

  // NEW: Tracks if the user intentionally held longer than 65ms
  let isHoldInteraction = false;

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

    restoreSelectionState();

    if (activePointerId !== null && mark.hasPointerCapture(activePointerId)) {
      mark.releasePointerCapture(activePointerId);
    }

    highlightsDeletedViaHold.add(highlightId);

    //Immediately destroy the DOM elements!
    removeHighlightMarks(highlightId, { skipAnimation: true });

    const store = useDrawerStore.getState();
    if (store.deleteHighlight) {
      store.deleteHighlight(highlightId);
    }

    activeFragments = [];
    activePointerId = null;
  };

  mark.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    activePointerId = e.pointerId;
    isLongPressCompleted = false;

    // RESET the flag on every new press
    isHoldInteraction = false;

    activeFragments = Array.from(
      document.querySelectorAll(`mark[data-highlight-id="${highlightId}"]`)
    ) as HTMLElement[];

    pendingStartTimer = setTimeout(() => {
      pendingStartTimer = null;

      // The 65ms threshold passed. This is now officially a hold.
      isHoldInteraction = true;

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
        frag.style.setProperty('transition', 'background-size 0.75s linear', 'important');
        frag.style.setProperty('background-size', '0% 100%', 'important');
      });

      pressTimer = setTimeout(() => {
        pressTimer = null;
        finalizeHoldDelete();
      }, 750);
    }, 75);
  });

  mark.addEventListener('pointermove', (e) => {
    if (!pendingStartTimer && !pressTimer) return;
    if (e.pointerId !== activePointerId) return;

    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const isOverHighlight = hit?.closest(`mark[data-highlight-id="${highlightId}"]`);

    if (!isOverHighlight) {
      abortHold(e);
    }
  });

  mark.addEventListener('pointerup', abortHold as EventListener);
  mark.addEventListener('pointercancel', abortHold as EventListener);

  mark.addEventListener('click', (e) => {
    e.stopPropagation();

    // Block the click if the interaction lasted longer than 65ms OR was deleted
    if (isHoldInteraction || isLongPressCompleted) {
      e.preventDefault();

      // Reset the flag so you can still standard-click the highlight later if you aborted the delete
      isHoldInteraction = false;
      return;
    }

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
        if (node.parentElement?.closest('mark[data-highlight-id]')) {
          return NodeFilter.FILTER_REJECT;
        }
        return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
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
  const skipAnimation = options?.skipAnimation || highlightsDeletedViaHold.has(highlightId);

  if (skipAnimation) {
    highlightsDeletedViaHold.delete(highlightId);
  }

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
