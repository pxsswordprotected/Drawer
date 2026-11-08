// Highlight anchoring: describe a selection so it can be found again after a page
// reload or edit, and resolve that description back to a live Range.
//
// Pure DOM code (no React/store) so it runs in the content script and in the
// anchoring benchmark (bench/anchoring) under jsdom.

import type { HighlightPosition } from '../shared/types';
import { XPATH_CONFIG } from '../shared/constants';

const CONTEXT = XPATH_CONFIG.TEXT_CONTEXT_LENGTH;
// Node.TEXT_NODE as a literal so the module also runs where the `Node` global is absent
const TEXT_NODE = 3;

/** XPath of `node` relative to `root`, e.g. `/div[2]/p[1]/text()[3]`. */
function xpathFor(node: Node, root: Node): string {
  const parts: string[] = [];
  let cur: Node | null = node;
  while (cur && cur !== root) {
    const parent: Node | null = cur.parentNode;
    if (!parent) return '';
    let index = 1;
    for (let sib = cur.previousSibling; sib; sib = sib.previousSibling) {
      if (cur.nodeType === TEXT_NODE) {
        if (sib.nodeType === TEXT_NODE) index++;
      } else if (sib.nodeName === cur.nodeName) {
        index++;
      }
    }
    parts.unshift(
      cur.nodeType === TEXT_NODE ? `text()[${index}]` : `${cur.nodeName.toLowerCase()}[${index}]`
    );
    cur = parent;
  }
  return cur === root ? '/' + parts.join('/') : '';
}

function nodeAtXPath(path: string, root: Node): Node | null {
  if (!path) return null;
  const doc = root.ownerDocument ?? (root as Document);
  try {
    return doc.evaluate('.' + path, root, null, 9 /* FIRST_ORDERED_NODE_TYPE */, null)
      .singleNodeValue;
  } catch {
    return null;
  }
}

/** Text of all Text nodes under `root` in document order (same as Range#toString). */
function textNodes(root: Node): Text[] {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const out: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

/** Capture a serializable description of `range` within `root`. */
export function describeRange(range: Range, root: Node): HighlightPosition {
  const doc = root.ownerDocument ?? (root as Document);
  const before = doc.createRange();
  before.setStart(root, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const after = doc.createRange();
  after.setStart(range.endContainer, range.endOffset);
  after.setEnd(root, root.childNodes.length);
  const beforeText = before.toString();
  return {
    startXPath: xpathFor(range.startContainer, root),
    endXPath: xpathFor(range.endContainer, root),
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    textContext: {
      before: beforeText.slice(-CONTEXT),
      after: after.toString().slice(0, CONTEXT),
    },
  };
}

/**
 * Find the highlight described by `text` + `position` inside `root`.
 * Returns null when the highlight can't be located (e.g. its text was removed).
 * Must not mutate the DOM.
 */
export function resolveHighlight(
  text: string,
  position: HighlightPosition,
  root: Node
): Range | null {
  const doc = root.ownerDocument ?? (root as Document);

  // 1. Exact structural match: stored XPaths still point at the same text.
  const startNode = nodeAtXPath(position.startXPath, root);
  const endNode = nodeAtXPath(position.endXPath, root);
  if (startNode && endNode) {
    const startLen = startNode.nodeType === TEXT_NODE ? (startNode as Text).length : startNode.childNodes.length;
    const endLen = endNode.nodeType === TEXT_NODE ? (endNode as Text).length : endNode.childNodes.length;
    if (position.startOffset <= startLen && position.endOffset <= endLen) {
      const range = doc.createRange();
      try {
        range.setStart(startNode, position.startOffset);
        range.setEnd(endNode, position.endOffset);
        if (range.toString() === text) return range;
      } catch {
        /* fall through to text search */
      }
    }
  }

  // 2. Text search: first exact occurrence of the highlight text.
  if (!text) return null;
  const nodes = textNodes(root);
  const full = nodes.map((n) => n.data).join('');
  const at = full.indexOf(text);
  if (at === -1) return null;
  return rangeFromOffsets(nodes, at, at + text.length, doc);
}

/** Map global character offsets over `nodes` back to a Range. */
function rangeFromOffsets(nodes: Text[], start: number, end: number, doc: Document): Range | null {
  const range = doc.createRange();
  let pos = 0;
  let startSet = false;
  for (const node of nodes) {
    const len = node.length;
    if (!startSet && start < pos + len) {
      range.setStart(node, start - pos);
      startSet = true;
    }
    if (startSet && end <= pos + len) {
      range.setEnd(node, end - pos);
      return range;
    }
    pos += len;
  }
  return null;
}
