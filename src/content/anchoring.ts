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

const BLOCK_TAGS: Record<string, true> = {
  P: true, LI: true, TD: true, TH: true, DT: true, DD: true, BLOCKQUOTE: true, PRE: true,
  H1: true, H2: true, H3: true, H4: true, H5: true, H6: true, FIGCAPTION: true, CAPTION: true,
  SUMMARY: true, DIV: true, SECTION: true, ARTICLE: true, ASIDE: true, MAIN: true,
  HEADER: true, FOOTER: true, NAV: true,
};

/** Nearest block-level ancestor of `node` below `root`, or null. */
function blockElement(node: Node, root: Node): Element | null {
  for (let el: Node | null = node.nodeType === 1 ? node : node.parentNode; el && el !== root; el = el.parentNode) {
    if (el.nodeType === 1 && BLOCK_TAGS[(el as Element).tagName]) return el as Element;
  }
  return null;
}

function blockPrint(el: Element): NonNullable<HighlightPosition['block']> {
  const t = squeeze(el.textContent ?? '');
  return { head: t.slice(0, 32), tail: t.slice(-32), len: t.length };
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
  const afterText = after.toString();
  const block = blockElement(range.startContainer, root);
  const lead = squeeze(beforeText).length;
  const total = lead + squeeze(range.toString()).length + squeeze(afterText).length;
  return {
    startXPath: xpathFor(range.startContainer, root),
    endXPath: xpathFor(range.endContainer, root),
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    textContext: {
      before: beforeText.slice(-CONTEXT),
      after: afterText.slice(0, CONTEXT),
    },
    ...(block ? { block: blockPrint(block) } : {}),
    at: total ? lead / total : 0,
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

// Candidate scoring. `textual` blends surrounding-text similarity with similarity of
// the enclosing block; below MIN_SCORE (or a clearly different block) a candidate is
// treated as a different passage that merely repeats the words. Page position only
// breaks ties between otherwise equal copies.
const MIN_SCORE = 0.45;
const MIN_BLOCK = 0.3;
const BLOCK_WEIGHT = 0.4;
const POSITION_WEIGHT = 0.15;
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

  const blockCache = new Map<Element | null, number>();
  const blockSim = (s: number) => {
    const fp = position.block;
    if (!fp) return null;
    const el = blockElement(idx.nodes[idx.nodeOf[s]], root);
    let sim = blockCache.get(el);
    if (sim === undefined) {
      const cur = el ? blockPrint(el) : { head: '', tail: '', len: 0 };
      sim = (dice(cur.head, fp.head) + dice(cur.tail, fp.tail)) / 2;
      blockCache.set(el, sim);
    }
    return sim;
  };

  type Cand = { s: number; e: number; dist: number };
  const score = (c: Cand) => {
    const exact = xpathExact(c.s, c.e);
    const ctx = contextScore(c.s, c.e);
    const bs = blockSim(c.s);
    const textual = bs === null ? ctx : (1 - BLOCK_WEIGHT) * ctx + BLOCK_WEIGHT * bs;
    if (hasContext && !exact && (textual < MIN_SCORE || (bs !== null && bs < MIN_BLOCK))) return -Infinity;
    const pos = position.at === undefined || !page.length ? 0 : POSITION_WEIGHT * Math.abs(c.s / page.length - position.at);
    return textual + (exact ? 0.5 : 0) - c.dist / needle.length - pos;
  };
  const choose = (cands: Cand[]) => {
    let best: Cand | null = null;
    let bestScore = -Infinity;
    for (const c of cands) {
      const sc = score(c);
      if (sc > bestScore) {
        bestScore = sc;
        best = c;
      }
    }
    return { best, bestScore };
  };

  // 1. Exact (whitespace-insensitive) occurrences. A confident hit ends the search.
  const exact = occurrences(page, needle, MAX_CANDIDATES).map((s): Cand => ({ s, e: s + needle.length, dist: 0 }));
  const exactPick = choose(exact);
  if (exactPick.best && (!hasContext || exactPick.bestScore >= 0.9)) {
    return toRange(idx, exactPick.best.s, exactPick.best.e, doc);
  }

  // 2. Fuzzy: the highlighted text itself may have been lightly edited (typo fix),
  //    in which case any exact hit is a different passage repeating the old words.
  //    Locate by prefix/suffix probes; keep spans within a small edit distance.
  const len = needle.length;
  const fuzzy: Cand[] = [];
  if (len >= 8) {
    const K = Math.min(24, Math.floor(len / 3));
    const prefix = needle.slice(0, K);
    const suffix = needle.slice(len - K);
    const maxDist = Math.max(1, Math.floor(len * 0.1));
    const spans: [number, number][] = [];
    for (const s of occurrences(page, prefix, 200)) {
      const suffixAt = page.indexOf(suffix, s + Math.max(K, len - K - maxDist));
      const e = suffixAt !== -1 && suffixAt + K - s <= len + maxDist ? suffixAt + K : Math.min(page.length, s + len);
      spans.push([s, e]);
    }
    for (const q of occurrences(page, suffix, 200)) {
      const s = q + K - len;
      if (s >= 0) spans.push([s, q + K]);
    }
    const seen = new Set<string>();
    for (const [s, e] of spans) {
      const key = s + ':' + e;
      if (seen.has(key)) continue;
      seen.add(key);
      const dist = editDistance(page.slice(s, e), needle, maxDist);
      if (dist > 0 && dist <= maxDist) fuzzy.push({ s, e, dist });
    }
  }
  const { best } = choose([...exact, ...fuzzy]);
  return best ? toRange(idx, best.s, best.e, doc) : null;
}
