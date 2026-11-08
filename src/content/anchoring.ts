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

// ── Text index ──────────────────────────────────────────────────────────────
// Matching runs on "squeezed" text: every whitespace character removed. That makes
// it immune to source reformatting, block boundaries (the browser's selection text
// has "\n\n" between paragraphs where the DOM may have nothing) and inline splits.

const isSpace = (c: number) =>
  c === 32 ||
  (c >= 9 && c <= 13) ||
  c === 160 ||
  (c >= 0x2000 && c <= 0x200a) ||
  c === 0x2028 ||
  c === 0x2029 ||
  c === 0x202f ||
  c === 0x205f ||
  c === 0x3000 ||
  c === 0xfeff;

function squeeze(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) if (!isSpace(s.charCodeAt(i))) out += s[i];
  return out;
}

const SKIP_TAGS: Record<string, true> = { SCRIPT: true, STYLE: true, NOSCRIPT: true, TEMPLATE: true };

interface TextIndex {
  nodes: Text[];
  text: string; // squeezed page text
  nodeOf: Int32Array; // squeezed index -> index into nodes
  offsetOf: Int32Array; // squeezed index -> offset within that node
}

function buildIndex(root: Node): TextIndex {
  const nodes = textNodes(root).filter((n) => !(n.parentElement && SKIP_TAGS[n.parentElement.tagName]));
  let total = 0;
  for (const n of nodes) total += n.length;
  const nodeOf = new Int32Array(total);
  const offsetOf = new Int32Array(total);
  const parts: string[] = [];
  let k = 0;
  for (let ni = 0; ni < nodes.length; ni++) {
    const data = nodes[ni].data;
    let chunk = '';
    for (let i = 0; i < data.length; i++) {
      if (isSpace(data.charCodeAt(i))) continue;
      chunk += data[i];
      nodeOf[k] = ni;
      offsetOf[k] = i;
      k++;
    }
    parts.push(chunk);
  }
  return { nodes, text: parts.join(''), nodeOf: nodeOf.subarray(0, k), offsetOf: offsetOf.subarray(0, k) };
}

function toRange(idx: TextIndex, start: number, end: number, doc: Document): Range {
  const range = doc.createRange();
  range.setStart(idx.nodes[idx.nodeOf[start]], idx.offsetOf[start]);
  range.setEnd(idx.nodes[idx.nodeOf[end - 1]], idx.offsetOf[end - 1] + 1);
  return range;
}

// ── Similarity helpers ──────────────────────────────────────────────────────

/** Sørensen–Dice coefficient over character bigrams (0..1). */
function dice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.substr(i, 2);
    counts.set(bg, (counts.get(bg) ?? 0) + 1);
  }
  let shared = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.substr(i, 2);
    const c = counts.get(bg);
    if (c) {
      shared++;
      counts.set(bg, c - 1);
    }
  }
  return (2 * shared) / (a.length + b.length - 2);
}

/** Levenshtein distance, giving up (returns max+1) once it must exceed `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = new Int32Array(b.length + 1);
  let cur = new Int32Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca === b.charCodeAt(j - 1) ? 0 : 1));
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

function occurrences(hay: string, needle: string, cap: number): number[] {
  const out: number[] = [];
  if (!needle) return out;
  for (let at = hay.indexOf(needle); at !== -1 && out.length < cap; at = hay.indexOf(needle, at + 1)) out.push(at);
  return out;
}

// Candidates whose surrounding text matches the stored context less than this are
// treated as a different passage that merely repeats the words.
const MIN_CONTEXT = 0.3;
const MAX_CANDIDATES = 2000;

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
  const needle = squeeze(text);
  if (!needle) return null;
  const idx = buildIndex(root);
  const page = idx.text;

  const before = squeeze(position.textContext?.before ?? '');
  const after = squeeze(position.textContext?.after ?? '');
  const hasContext = before.length > 0 || after.length > 0;

  // Structural hint: where the stored XPaths point now (if they still resolve).
  const startNode = nodeAtXPath(position.startXPath, root);
  const endNode = nodeAtXPath(position.endXPath, root);
  const xStart = startNode ? idx.nodes.indexOf(startNode as Text) : -1;
  const xEnd = endNode ? idx.nodes.indexOf(endNode as Text) : -1;

  const contextScore = (s: number, e: number) => {
    let sum = 0;
    let sides = 0;
    if (before) {
      sum += dice(page.slice(Math.max(0, s - before.length), s), before);
      sides++;
    }
    if (after) {
      sum += dice(page.slice(e, e + after.length), after);
      sides++;
    }
    return sides ? sum / sides : 0;
  };
  const xpathExact = (s: number, e: number) =>
    xStart !== -1 &&
    xEnd !== -1 &&
    idx.nodeOf[s] === xStart &&
    idx.offsetOf[s] === position.startOffset &&
    idx.nodeOf[e - 1] === xEnd &&
    idx.offsetOf[e - 1] + 1 === position.endOffset;

  const choose = (cands: [number, number][], penalty: (s: number, e: number) => number) => {
    let best: [number, number] | null = null;
    let bestScore = -Infinity;
    for (const [s, e] of cands) {
      const exact = xpathExact(s, e);
      const ctx = contextScore(s, e);
      if (hasContext && !exact && ctx < MIN_CONTEXT) continue;
      const score = ctx + (exact ? 0.5 : 0) - penalty(s, e);
      if (score > bestScore) {
        bestScore = score;
        best = [s, e];
      }
    }
    return best;
  };

  // 1. Exact (whitespace-insensitive) occurrences.
  const exact = occurrences(page, needle, MAX_CANDIDATES).map((s): [number, number] => [s, s + needle.length]);
  if (exact.length) {
    const best = choose(exact, () => 0);
    return best ? toRange(idx, best[0], best[1], doc) : null;
  }

  // 2. Fuzzy: the text was lightly edited (typo fix etc.). Locate by a prefix and/or
  //    suffix probe, then accept if the edit distance is small.
  const len = needle.length;
  if (len < 12) return null;
  const K = Math.min(24, Math.floor(len / 3));
  const prefix = needle.slice(0, K);
  const suffix = needle.slice(len - K);
  const maxDist = Math.max(1, Math.floor(len * 0.1));
  const cands: [number, number][] = [];
  for (const s of occurrences(page, prefix, 200)) {
    const suffixAt = page.indexOf(suffix, s + Math.max(K, len - K - maxDist));
    const e = suffixAt !== -1 && suffixAt + K - s <= len + maxDist ? suffixAt + K : Math.min(page.length, s + len);
    cands.push([s, e]);
  }
  for (const q of occurrences(page, suffix, 200)) {
    const s = q + K - len;
    if (s >= 0) cands.push([s, q + K]);
  }
  const dist = new Map<string, number>();
  const distOf = (s: number, e: number) => {
    const key = s + ':' + e;
    let d = dist.get(key);
    if (d === undefined) dist.set(key, (d = editDistance(page.slice(s, e), needle, maxDist)));
    return d;
  };
  const close = cands.filter(([s, e]) => distOf(s, e) <= maxDist);
  const best = choose(close, (s, e) => distOf(s, e) / len);
  return best ? toRange(idx, best[0], best[1], doc) : null;
}
