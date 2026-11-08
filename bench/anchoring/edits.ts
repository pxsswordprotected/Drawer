// Page edits applied between "save" and "reload". Each edit mutates a document that
// still contains the two <x-anchor> boundary markers, so the expected highlight
// location can be read back after the edit.
//
// apply() returns:
//   'ok'   – highlight still exists; expected location = between the markers
//   'null' – highlight text is gone; the correct answer is "not found"
//   'skip' – edit not applicable to this range

import { int, pick, Rng, SENTENCES, WORDS } from './pages';

export interface Ctx {
  doc: Document;
  body: HTMLElement;
  sm: Element; // start marker
  em: Element; // end marker
  startBlock: Element;
  endBlock: Element;
  cross: boolean;
  rng: Rng;
}

export type Outcome = 'ok' | 'null' | 'skip';

const BLOCK: Record<string, true> = { P: true, LI: true, TD: true, TH: true, BLOCKQUOTE: true, H1: true, H2: true, H3: true, PRE: true, BUTTON: true };

export function blockOf(node: Node): Element {
  let el: Node | null = node.nodeType === 1 ? node : node.parentNode;
  while (el && el.nodeType === 1 && el.nodeName !== 'BODY' && !BLOCK[(el as Element).tagName]) el = el.parentNode;
  return el && el.nodeType === 1 ? (el as Element) : (node.ownerDocument as Document).body;
}

interface Tok {
  node: Text;
  s: number;
  e: number;
}

function tokens(root: Node, doc: Document): Tok[] {
  const out: Tok[] = [];
  const w = doc.createTreeWalker(root, 4);
  for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
    for (const m of n.data.matchAll(/[A-Za-z]{3,}/g)) out.push({ node: n, s: m.index!, e: m.index! + m[0].length });
  }
  return out;
}

/** Range strictly between the two markers. */
function inner(c: Ctx): Range {
  const r = c.doc.createRange();
  r.setStartAfter(c.sm);
  r.setEndBefore(c.em);
  return r;
}

const insideRange = (c: Ctx, t: Tok) => {
  const r = inner(c);
  return r.comparePoint(t.node, t.s) === 0 && r.comparePoint(t.node, t.e) === 0;
};
const beforeStart = (c: Ctx, t: Tok) => inner(c).comparePoint(t.node, t.e) < 0;
const afterEnd = (c: Ctx, t: Tok) => inner(c).comparePoint(t.node, t.s) > 0;

function wrapTok(doc: Document, t: Tok, tag: string) {
  const mid = t.node.splitText(t.s);
  mid.splitText(t.e - t.s);
  const el = doc.createElement(tag);
  if (tag === 'a') el.setAttribute('href', 'https://example.com/y');
  mid.parentNode!.insertBefore(el, mid);
  el.appendChild(mid);
}

const replaceTok = (t: Tok, rng: Rng) => {
  const old = t.node.data.slice(t.s, t.e);
  let word = pick(rng, WORDS);
  if (word === old) word = word + 's';
  t.node.replaceData(t.s, t.e - t.s, word);
};

const newBlock = (c: Ctx, tag = 'p') => {
  const el = c.doc.createElement(tag);
  el.textContent = pick(c.rng, SENTENCES) + ' ' + pick(c.rng, SENTENCES);
  return el;
};

function prependBlock(c: Ctx): Outcome {
  const host = c.startBlock.closest('article, section, .thread, main') ?? c.body;
  host.insertBefore(newBlock(c), host.firstChild);
  return 'ok';
}

function editContextBefore(c: Ctx): Outcome {
  const toks = tokens(c.startBlock, c.doc).filter((t) => beforeStart(c, t));
  if (!toks.length) return 'skip';
  // Bias toward words close to the highlight: that's where stored context lives.
  replaceTok(toks[Math.max(0, toks.length - 1 - int(c.rng, 0, 3))], c.rng);
  return 'ok';
}

function editContextAfter(c: Ctx): Outcome {
  const toks = tokens(c.endBlock, c.doc).filter((t) => afterEnd(c, t));
  if (!toks.length) return 'skip';
  replaceTok(toks[Math.min(toks.length - 1, int(c.rng, 0, 3))], c.rng);
  return 'ok';
}

function reflowWhitespace(c: Ctx): Outcome {
  const w = c.doc.createTreeWalker(c.body, 4);
  const nodes: Text[] = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n as Text);
  for (const n of nodes) {
    if (n.parentElement?.closest('pre, code')) continue;
    n.data = n.data.replace(/ /g, () => (c.rng() < 0.4 ? '\n' + ' '.repeat(int(c.rng, 4, 12)) : ' '));
  }
  return 'ok';
}

export const EDITS: Record<string, (c: Ctx) => Outcome> = {
  // Reload with no change at all.
  none: () => 'ok',

  // New content at the top shifts every structural index below it.
  prepend_block: prependBlock,

  // Site redesign: content gets wrapped in extra layout containers.
  wrap_layout: (c) => {
    const outer = c.doc.createElement('div');
    outer.className = 'app';
    const innerDiv = c.doc.createElement('div');
    innerDiv.className = 'layout';
    outer.appendChild(innerDiv);
    while (c.body.firstChild) innerDiv.appendChild(c.body.firstChild);
    c.body.appendChild(outer);
    return 'ok';
  },

  // A new sibling block right before the highlighted one.
  insert_before_block: (c) => {
    const tag = c.startBlock.tagName === 'LI' ? 'li' : c.startBlock.tagName === 'TD' ? 'td' : 'p';
    c.startBlock.parentNode!.insertBefore(newBlock(c, tag), c.startBlock);
    return 'ok';
  },

  // A word near the highlight was edited (stored context goes stale).
  edit_context_before: editContextBefore,
  edit_context_both: (c) => (editContextBefore(c) === 'skip' || editContextAfter(c) === 'skip' ? 'skip' : 'ok'),

  // Formatting added inside the highlight: its text is now split across nodes.
  format_inside: (c) => {
    const toks = tokens(c.startBlock, c.doc).filter((t) => insideRange(c, t));
    if (toks.length < 3) return 'skip';
    wrapTok(c.doc, toks[int(c.rng, 1, toks.length - 2)], pick(c.rng, ['em', 'strong', 'a']));
    return 'ok';
  },

  // Formatting added just before the highlight.
  format_near: (c) => {
    const toks = tokens(c.startBlock, c.doc).filter((t) => beforeStart(c, t));
    if (!toks.length) return 'skip';
    wrapTok(c.doc, toks[toks.length - 1], 'a');
    return 'ok';
  },

  // Text nodes split without any visible change (frameworks / other extensions do this).
  fragment_text: (c) => {
    const w = c.doc.createTreeWalker(c.body, 4);
    const nodes: Text[] = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n as Text);
    for (const n of nodes) if (n.length > 4 && c.rng() < 0.35) n.splitText(int(c.rng, 1, n.length - 1));
    return 'ok';
  },

  // Server re-templated the HTML: same rendered text, different source whitespace.
  reflow_whitespace: reflowWhitespace,

  // The highlighted words now also appear elsewhere (a pull quote above, a citation below).
  quote_elsewhere: (c) => {
    const text = inner(c).toString().replace(/\s+/g, ' ').trim();
    const top = c.doc.createElement('blockquote');
    top.textContent = `Pull quote: ${text}`;
    const bottom = c.doc.createElement('p');
    bottom.textContent = `As one reader noted, "${text}" — and others agreed.`;
    c.body.insertBefore(top, c.body.firstChild);
    c.body.appendChild(bottom);
    return 'ok';
  },

  // A typo fixed inside the highlighted text.
  typo_inside: (c) => {
    const r = inner(c);
    if (r.toString().length < 10) return 'skip';
    const toks = tokens(c.startBlock, c.doc).filter((t) => insideRange(c, t) && t.e - t.s >= 4);
    if (toks.length < 2) return 'skip';
    const t = toks[int(c.rng, 1, toks.length - 1)];
    const at = t.s + int(c.rng, 1, t.e - t.s - 2);
    const ch = t.node.data[at];
    t.node.replaceData(at, 1, ch === 'e' ? 'a' : 'e');
    return 'ok';
  },

  // Whole block removed: highlight no longer exists.
  delete_block: (c) => {
    c.startBlock.remove();
    if (c.cross) c.endBlock.remove();
    return 'null';
  },

  // Highlighted text rewritten to something unrelated: highlight no longer exists.
  replace_text: (c) => {
    const r = inner(c);
    r.deleteContents();
    r.insertNode(c.doc.createTextNode(pick(c.rng, WORDS) + ' ' + pick(c.rng, WORDS) + ' replaced wording'));
    return 'null';
  },

  // Highlighted block moved to a different position among its siblings.
  move_block: (c) => {
    if (c.cross) return 'skip';
    const parent = c.startBlock.parentNode!;
    if (parent.childNodes.length < 3) return 'skip';
    if (parent.lastChild === c.startBlock) parent.insertBefore(c.startBlock, parent.firstChild);
    else parent.appendChild(c.startBlock);
    return 'ok';
  },

  // Several edits at once.
  heavy: (c) => {
    prependBlock(c);
    editContextBefore(c);
    reflowWhitespace(c);
    return 'ok';
  },
};
