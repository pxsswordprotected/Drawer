// Anchoring benchmark: % of saved highlights re-located exactly after a reload or edit.
//
// For every (page, highlight, edit):
//   1. build the page, pick a highlight range, store describeRange() (JSON round-trip,
//      like browser storage) plus the text a real browser selection would yield
//   2. mark the range with two <x-anchor> elements, apply the edit, read the expected
//      character offsets from the markers, remove the markers
//   3. call resolveHighlight() on the edited page and compare offsets exactly
// Edits that delete the highlighted text expect `null` (no false re-attachment).
//
// Prints `METRIC name=value` lines. Exits non-zero on harness bugs or guard violations
// (resolver mutating the DOM, oversized anchors, pathological slowness).

import { JSDOM } from 'jsdom';
import { describeRange, resolveHighlight } from '../../src/content/anchoring';
import type { HighlightPosition } from '../../src/shared/types';
import { TEMPLATES, TemplateName, mulberry32, int, Rng } from './pages';
import { EDITS, blockOf, Ctx } from './edits';

const PAGES: [TemplateName, number, number][] = [
  // template, page count, highlights per page
  ['article', 4, 6],
  ['docs', 4, 6],
  ['forum', 4, 6],
  ['table', 3, 6],
  ['formatted', 4, 6],
  ['big', 1, 4],
];
const LEGACY_EDITS = ['none', 'prepend_block', 'wrap_layout', 'reflow_whitespace'];
const MAX_ANCHOR_BYTES = 4096;
const MAX_RESOLVE_MS = 2000;

const { window } = new JSDOM('<!doctype html><html><head></head><body></body></html>');
const doc = window.document;
const body = doc.body;

function fail(msg: string): never {
  console.error('GUARD/HARNESS FAILURE:', msg);
  process.exit(1);
}

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);

/** Character offset of a boundary point, counted over Text nodes from the start of body. */
function offsetOf(node: Node, offset: number): number {
  const r = doc.createRange();
  r.setStart(body, 0);
  r.setEnd(node, offset);
  return r.toString().length;
}
function offsetBefore(marker: Node): number {
  const r = doc.createRange();
  r.setStart(body, 0);
  r.setEndBefore(marker);
  return r.toString().length;
}

function textNodesIn(root: Node): Text[] {
  const w = doc.createTreeWalker(root, 4);
  const out: Text[] = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n as Text);
  return out;
}

interface Tok {
  node: Text;
  s: number;
  e: number;
}
function wordTokens(root: Node): Tok[] {
  const out: Tok[] = [];
  for (const n of textNodesIn(root)) for (const m of n.data.matchAll(/\S+/g)) out.push({ node: n, s: m.index!, e: m.index! + m[0].length });
  return out;
}

/** What Chrome's Selection#toString() would return: rendered (collapsed) text, blocks joined by blank lines. */
function selectionText(range: Range): string {
  const parts: { block: Element; text: string }[] = [];
  const root = range.commonAncestorContainer;
  for (const n of root.nodeType === 3 ? [root as Text] : textNodesIn(root)) {
    if (!range.intersectsNode(n)) continue;
    const s = n === range.startContainer ? range.startOffset : 0;
    const e = n === range.endContainer ? range.endOffset : n.length;
    if (e <= s) continue;
    const block = blockOf(n);
    const last = parts[parts.length - 1];
    if (last && last.block === block) last.text += n.data.slice(s, e);
    else parts.push({ block, text: n.data.slice(s, e) });
  }
  return parts
    .map((p) => (p.block.closest('pre') ? p.text : p.text.replace(/\s+/g, ' ')).trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function pickRange(rng: Rng): { range: Range; cross: boolean } | null {
  const blocks = [...body.querySelectorAll('p, li, td, blockquote, h1, h2, h3')].filter(
    (b) => !b.querySelector('p, li, td, blockquote') && wordTokens(b).length >= 6
  );
  if (blocks.length < 2) return null;
  const roll = rng();
  const range = doc.createRange();
  if (roll < 0.75) {
    const toks = wordTokens(blocks[int(rng, 0, blocks.length - 1)]);
    const k = Math.min(toks.length, roll < 0.6 ? int(rng, 2, 14) : int(rng, 1, 2));
    const i = int(rng, 0, toks.length - k);
    range.setStart(toks[i].node, toks[i].s);
    range.setEnd(toks[i + k - 1].node, toks[i + k - 1].e);
    return { range, cross: false };
  }
  const bi = int(rng, 0, blocks.length - 2);
  const a = wordTokens(blocks[bi]);
  const b = wordTokens(blocks[bi + 1]);
  const s = a[a.length - int(rng, 1, Math.min(5, a.length))];
  const e = b[int(rng, 0, Math.min(4, b.length - 1))];
  range.setStart(s.node, s.s);
  range.setEnd(e.node, e.e);
  return { range, cross: true };
}

function insertMarker(node: Node, offset: number, name: string) {
  const m = doc.createElement('x-anchor');
  m.setAttribute('data-a', name);
  if (node.nodeType !== 3) {
    node.insertBefore(m, node.childNodes[offset] ?? null);
  } else if (offset === 0) {
    node.parentNode!.insertBefore(m, node);
  } else if (offset >= (node as Text).length) {
    node.parentNode!.insertBefore(m, node.nextSibling);
  } else {
    const rest = (node as Text).splitText(offset);
    rest.parentNode!.insertBefore(m, rest);
  }
}

/** Remove a marker and re-join the text node it split, restoring the original structure. */
function removeMarker(m: Element) {
  const prev = m.previousSibling;
  const next = m.nextSibling;
  m.remove();
  if (prev && next && prev.nodeType === 3 && next.nodeType === 3) {
    (prev as Text).appendData((next as Text).data);
    next.remove();
  }
}

interface Saved {
  tpl: TemplateName;
  pageSeed: number;
  html: string; // page HTML with markers
  cross: boolean;
  text: string;
  position: HighlightPosition;
  expected0: [number, number];
  unique: boolean;
}

// ── Save phase ──
const saved: Saved[] = [];
for (const [tpl, pages, perPage] of PAGES) {
  for (let p = 0; p < pages; p++) {
    const pageSeed = hash(tpl) + p * 7919;
    const pageHtml = TEMPLATES[tpl](mulberry32(pageSeed));
    const rng = mulberry32(pageSeed ^ 0x5bd1e995);
    for (let h = 0; h < perPage; h++) {
      body.innerHTML = pageHtml;
      const picked = pickRange(rng);
      if (!picked) fail(`no range on ${tpl}#${p}`);
      const { range, cross } = picked;
      const text = selectionText(range);
      const expected0: [number, number] = [offsetOf(range.startContainer, range.startOffset), offsetOf(range.endContainer, range.endOffset)];
      const beforeDescribe = body.innerHTML;
      const position = JSON.parse(JSON.stringify(describeRange(range, body)));
      if (body.innerHTML !== beforeDescribe) fail('describeRange mutated the DOM');
      const bytes = JSON.stringify(position).length;
      if (bytes > MAX_ANCHOR_BYTES) fail(`anchor too large: ${bytes} bytes`);
      const flat = (body.textContent ?? '').replace(/\s+/g, ' ');
      const needle = text.replace(/\s+/g, ' ');
      const unique = flat.indexOf(needle) !== -1 && flat.indexOf(needle) === flat.lastIndexOf(needle);
      insertMarker(range.endContainer, range.endOffset, 'e');
      insertMarker(range.startContainer, range.startOffset, 's');
      saved.push({ tpl, pageSeed, html: body.innerHTML, cross, text, position, expected0, unique });
    }
  }
}

// ── Reload/edit phase ──
const EMPTY_POSITION: HighlightPosition = { startXPath: '', endXPath: '', startOffset: 0, endOffset: 0, textContext: { before: '', after: '' } };
type Stat = { n: number; ok: number };
const byGroup = new Map<string, Stat>();
const byTpl = new Map<string, Stat>();
const bump = (m: Map<string, Stat>, k: string, ok: boolean) => {
  const s = m.get(k) ?? { n: 0, ok: 0 };
  s.n++;
  if (ok) s.ok++;
  m.set(k, s);
};
let total = 0, correct = 0, expectFound = 0, found = 0, wrongLoc = 0, expectNull = 0, falsePos = 0, errors = 0;
let resolveMs = 0, resolveMax = 0, anchorBytes = 0;

function runCase(sv: Saved, idx: number, edit: string, legacy: boolean) {
  body.innerHTML = sv.html;
  const sm = body.querySelector('x-anchor[data-a="s"]')!;
  const em = body.querySelector('x-anchor[data-a="e"]')!;
  const ctx: Ctx = { doc, body, sm, em, startBlock: blockOf(sm), endBlock: blockOf(em), cross: sv.cross, rng: mulberry32(sv.pageSeed + idx * 131 + hash(edit)) };
  const outcome = EDITS[edit](ctx);
  if (outcome === 'skip') return;

  let expected: [number, number] | null = null;
  if (outcome === 'ok') {
    if (!sm.isConnected || !em.isConnected) fail(`edit ${edit} removed markers but returned ok`);
    expected = [offsetBefore(sm), offsetBefore(em)];
  }
  if (sm.isConnected) removeMarker(sm);
  if (em.isConnected) removeMarker(em);
  if (edit === 'none' && expected && (expected[0] !== sv.expected0[0] || expected[1] !== sv.expected0[1])) fail('identity edit changed expected offsets (marker round-trip bug)');

  const snapshot = body.innerHTML;
  let result: Range | null = null;
  const t0 = performance.now();
  try {
    result = resolveHighlight(sv.text, legacy ? EMPTY_POSITION : sv.position, body);
  } catch {
    errors++;
  }
  const dt = performance.now() - t0;
  if (body.innerHTML !== snapshot) fail(`resolveHighlight mutated the DOM (${edit})`);
  if (dt > MAX_RESOLVE_MS) fail(`resolveHighlight took ${dt.toFixed(0)}ms (${sv.tpl}, ${edit})`);
  resolveMs += dt;
  resolveMax = Math.max(resolveMax, dt);

  let ok: boolean;
  if (expected === null) {
    expectNull++;
    ok = result === null;
    if (!ok) falsePos++;
  } else {
    expectFound++;
    if (result && (!body.contains(result.startContainer) || !body.contains(result.endContainer))) fail('resolved range outside root');
    ok = !!result && offsetOf(result.startContainer, result.startOffset) === expected[0] && offsetOf(result.endContainer, result.endOffset) === expected[1];
    if (ok) found++;
    else if (result) wrongLoc++;
  }
  total++;
  if (ok) correct++;
  bump(byGroup, legacy ? `legacy_${edit}` : edit, ok);
  bump(byTpl, sv.tpl, ok);
}

saved.forEach((sv, i) => {
  anchorBytes += JSON.stringify(sv.position).length;
  for (const edit of Object.keys(EDITS)) runCase(sv, i, edit, false);
  if (sv.unique) for (const edit of LEGACY_EDITS) runCase(sv, i, edit, true);
});

const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(2) : '0');
console.log(`METRIC anchor_accuracy=${pct(correct, total)}`);
console.log(`METRIC found_rate=${pct(found, expectFound)}`);
console.log(`METRIC wrong_location_rate=${pct(wrongLoc, expectFound)}`);
console.log(`METRIC false_positive_rate=${pct(falsePos, expectNull)}`);
console.log(`METRIC resolve_errors=${errors}`);
console.log(`METRIC resolve_ms_total=${resolveMs.toFixed(1)}`);
console.log(`METRIC resolve_ms_max=${resolveMax.toFixed(1)}`);
console.log(`METRIC anchor_bytes_avg=${(anchorBytes / saved.length).toFixed(0)}`);
console.log(`METRIC cases=${total}`);
for (const [k, s] of byGroup) console.log(`METRIC acc_${k}=${pct(s.ok, s.n)}`);
for (const [k, s] of byTpl) console.log(`METRIC acc_tpl_${k}=${pct(s.ok, s.n)}`);
