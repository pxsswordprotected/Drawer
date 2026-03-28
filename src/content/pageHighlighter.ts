import { useDrawerStore } from '@/store/drawerStore';

/**
 * Attaches a click handler directly to a <mark> element.
 * Direct attachment avoids host pages with stopPropagation() blocking events.
 */
function attachMarkClickHandler(mark: HTMLElement, highlightId: string): void {
  mark.addEventListener('click', (e) => {
    e.stopPropagation();
    const store = useDrawerStore.getState();
    store.openDrawer();
    store.selectHighlight(highlightId);
    store.setExpandedGroupUrl(window.location.href);
  });
}

/**
 * Wraps the selected text in <mark> elements on the host page DOM.
 * Handles multi-node selections via TreeWalker, processing in reverse
 * document order to avoid offset invalidation when splitting text nodes.
 */
export function applyHighlightToRange(
  range: Range,
  highlightId: string,
  color: string
): void {
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
        return range.intersectsNode(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
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

    // Create the <mark> element
    const mark = document.createElement('mark');
    mark.setAttribute('data-highlight-id', highlightId);
    mark.style.cssText = `
      background-color: ${color} !important;
      color: inherit !important;
      cursor: pointer !important;
      border-radius: 2px !important;
      padding: 0 !important;
      margin: 0 !important;
      display: inline !important;
    `;

    // Wrap: insert mark before the text node, then move text node inside
    targetNode.parentNode!.insertBefore(mark, targetNode);
    mark.appendChild(targetNode);

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
  const marks = document.querySelectorAll(
    `mark[data-highlight-id="${highlightId}"]`
  );

  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;

    // Move all children out before the mark, then remove the mark
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
  });
}
