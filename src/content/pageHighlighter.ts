import { useDrawerStore } from '@/store/drawerStore';

// ─── Seeded PRNG utilities ───

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

/**
 * Attaches a click handler directly to a <mark> element.
 * Direct attachment avoids host pages with stopPropagation() blocking events.
 */
function attachMarkClickHandler(mark: HTMLElement, highlightId: string): void {
  mark.addEventListener('click', (e) => {
    e.stopPropagation();
    const store = useDrawerStore.getState();

    // Toggle: if this highlight is already expanded, close the drawer
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
        // Skip text nodes already inside a highlight mark
        if (node.parentElement?.closest('mark[data-highlight-id]')) {
          return NodeFilter.FILTER_REJECT;
        }
        // Only accept nodes that intersect the selection range
        return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    }
  );

  // Collect all matching text nodes
  const textNodes: Text[] = [];
  let currentNode = treeWalker.nextNode();
  while (currentNode) {
    textNodes.push(currentNode as Text);
    currentNode = treeWalker.nextNode();
  }

  // Edge case: commonAncestorContainer is itself a text node
  if (
    textNodes.length === 0 &&
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE &&
    !range.commonAncestorContainer.parentElement?.closest('mark[data-highlight-id]')
  ) {
    textNodes.push(range.commonAncestorContainer as Text);
  }

  // ─── Per-highlight seeded variation (shared across all fragments) ───
  const rand = mulberry32(hashSeed(highlightId));

  // Gradient angles
  const angle1 = clamp(173 + rand() * 4, 173, 177).toFixed(1);
  const angle2 = clamp(81 + rand() * 5, 81, 86).toFixed(1);

  // Leading/trailing asymmetry (writing-direction-aware)
  const isRTL =
    getComputedStyle(range.commonAncestorContainer.parentElement ?? document.body).direction ===
    'rtl';
  const leadRaw = clamp(25 + (rand() * 6 - 3), 22, 28);
  const trailRaw = clamp(40 + (rand() * 6 - 3), 37, 43);
  const startOpacity = isRTL ? trailRaw : leadRaw;
  const endOpacity = isRTL ? leadRaw : trailRaw;

  // Thickness from total highlight length + RNG bias
  const totalLen = range.toString().length;
  const lengthFactor = totalLen < 15 ? 1.08 : totalLen > 80 ? 0.93 : 1.0;
  const thicknessBias = clamp(0.96 + rand() * 0.08, 0.96, 1.04);
  const finalThickness = clamp(lengthFactor * thicknessBias, 0.92, 1.10);
  const padTop = (0.27 * finalThickness).toFixed(2);
  const padBot = (0.03 * finalThickness).toFixed(2);
  const margTop = (-0.27 * finalThickness).toFixed(2);
  const margBot = (-0.03 * finalThickness).toFixed(2);

  // Border-radius from 3 correlated knobs
  const rLeft = clamp(0.10 + (rand() * 0.12 - 0.06), 0.04, 0.58);
  const rRight = clamp(0.50 + (rand() * 0.12 - 0.06), 0.04, 0.58);
  const rWobble = rand() * 0.08 - 0.04;
  const br = [
    rLeft.toFixed(2),                              // top-left h
    rRight.toFixed(2),                             // top-right h
    clamp(0.15 + (rand() * 0.12 - 0.06), 0.04, 0.58).toFixed(2), // bottom-right h
    clamp(0.40 + (rand() * 0.12 - 0.06), 0.04, 0.58).toFixed(2), // bottom-left h
    clamp(0.50 + rWobble, 0.04, 0.58).toFixed(2), // top-left v
    clamp(0.10 + rWobble, 0.04, 0.58).toFixed(2), // top-right v
    clamp(0.40 + rWobble, 0.04, 0.58).toFixed(2), // bottom-right v
    clamp(0.15 + rWobble, 0.04, 0.58).toFixed(2), // bottom-left v
  ];
  const borderRadius = `${br[0]}em ${br[1]}em ${br[2]}em ${br[3]}em / ${br[4]}em ${br[5]}em ${br[6]}em ${br[7]}em`;

  // Shadow
  const shadowBlur = clamp(1.5 + rand() * 1, 1.5, 2.5).toFixed(1);

  // Edge curve mask parameters (per-highlight, shared across fragments)
  const topBow = clamp(rand() * 3 - 1.5, -1.5, 1.5).toFixed(1);
  const botBow = clamp(rand() * 3 - 1.5, -1.5, 1.5).toFixed(1);
  const topWidth = clamp(120 + rand() * 60, 120, 180).toFixed(0);
  const botWidth = clamp(120 + rand() * 60, 120, 180).toFixed(0);
  const maskPhaseBase = rand() * 40; // 0-40px base offset

  // Precomputed shared CSS strings
  const sharedGradient1 = `linear-gradient(${angle1}deg, transparent 20%, color-mix(in srgb, ${color}, transparent 85%) 50%, transparent 80%)`;
  const sharedShadow = `inset 0 -1px ${shadowBlur}px color-mix(in srgb, ${color}, transparent 90%)`;
  const sharedPadding = `${padTop}em 0.16em ${padBot}em 0.34em`;
  const sharedMargin = `${margTop}em -0.16em ${margBot}em -0.34em`;
  const sharedMaskImage = [
    `radial-gradient(ellipse ${topWidth}% ${topBow}px at 50% -0.5px, black 40%, transparent 100%)`,
    `radial-gradient(ellipse ${botWidth}% ${botBow}px at 50% calc(100% + 0.5px), black 40%, transparent 100%)`,
    `linear-gradient(to bottom, transparent 0px, black 2px, black calc(100% - 2px), transparent 100%)`,
  ].join(', ');
  const sharedMaskSize = '100% 100%, 100% 100%, 100% 100%';

  // Process in reverse document order to maintain valid offsets
  for (let i = textNodes.length - 1; i >= 0; i--) {
    const textNode = textNodes[i];

    let startOffset = 0;
    let endOffset = textNode.length;

    // Adjust offsets for boundary nodes
    if (textNode === range.startContainer) {
      startOffset = range.startOffset;
    }
    if (textNode === range.endContainer) {
      endOffset = range.endOffset;
    }

    // Skip empty splits (browser quirk: intersectsNode can match boundary nodes with 0 chars)
    if (startOffset >= endOffset) continue;

    // Split the text node to isolate the selected portion
    let targetNode = textNode;

    // Split off the end portion first (so start offset stays valid)
    if (endOffset < textNode.length) {
      targetNode.splitText(endOffset);
    }

    // Split off the start portion
    if (startOffset > 0) {
      targetNode = targetNode.splitText(startOffset);
    }

    // ─── Per-fragment micro-jitter ───
    const bgOffsetX = clamp(rand() * 4 - 2, -2, 2).toFixed(1);
    const midDrift1 = clamp(rand() * 4 - 2, -2, 2);
    const midDrift2 = clamp(rand() * 4 - 2, -2, 2);
    const fragMid1 = clamp(88 + midDrift1, 86, 92).toFixed(0);
    const fragMid2 = clamp(72 + midDrift2, 70, 76).toFixed(0);
    const maskDriftX = clamp(rand() * 6 - 3, -3, 3);
    const maskPosX = clamp(maskPhaseBase + maskDriftX, -3, 43).toFixed(1);
    const maskPos = `${maskPosX}px 0, ${maskPosX}px 0, 0 0`;

    const gradient2 = `linear-gradient(${angle2}deg, color-mix(in srgb, ${color}, transparent ${startOpacity.toFixed(0)}%), color-mix(in srgb, ${color}, transparent ${fragMid1}%) 4%, color-mix(in srgb, ${color}, transparent ${fragMid2}%) 96%, color-mix(in srgb, ${color}, transparent ${endOpacity.toFixed(0)}%))`;

    // Create the <mark> element
    const mark = document.createElement('mark');
    mark.setAttribute('data-highlight-id', highlightId);
    mark.style.cssText = `
      background-color: transparent !important;
      background-image: ${sharedGradient1}, ${gradient2} !important;
      border-radius: ${borderRadius} !important;
      margin: ${sharedMargin} !important;
      padding: ${sharedPadding} !important;
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
      -webkit-mask-image: ${sharedMaskImage} !important;
      mask-image: ${sharedMaskImage} !important;
      -webkit-mask-size: ${sharedMaskSize} !important;
      mask-size: ${sharedMaskSize} !important;
      -webkit-mask-repeat: no-repeat !important;
      mask-repeat: no-repeat !important;
      -webkit-mask-position: ${maskPos} !important;
      mask-position: ${maskPos} !important;
    `;

    // Wrap: insert mark before the text node, then move text node inside
    targetNode.parentNode!.insertBefore(mark, targetNode);
    mark.appendChild(targetNode);

    // Trigger the animation on the next frame
    requestAnimationFrame(() => {
      mark.style.backgroundSize = '100% 100%';
    });

    // Attach click handler directly to this mark
    attachMarkClickHandler(mark, highlightId);
  }
}

/**
 * Removes all <mark> elements for a given highlight ID.
 * Does NOT call .normalize() — leaves text nodes fragmented to avoid
 * breaking host page framework state.
 */
export function removeHighlightMarks(highlightId: string): void {
  const marks = document.querySelectorAll<HTMLElement>(`mark[data-highlight-id="${highlightId}"]`);

  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;

    // Animate out: reverse the enter animation (100% → 0%)
    const onEnd = () => {
      mark.removeEventListener('transitionend', onEnd);
      // Unwrap: move children out, then remove the mark
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    };

    mark.addEventListener('transitionend', onEnd);
    mark.style.backgroundSize = '0% 100%';
  });
}
