// Seeded workload for the storage bench: a scripted mix of every write action, issued from
// several tabs at overlapping times and aimed at the same few pages so they collide.
import type { Highlight, Note, PageTitles } from '../../src/shared/types';
import { HIGHLIGHT_COLORS } from '../../src/shared/constants';
import type { Op, Planned, Profile, RoundPlan } from './types';

export interface SeedBackup {
  highlights: Highlight[];
  pageTitles: PageTitles;
}

export interface RoundSpec {
  seed: number;
  profile: Profile;
  /** Includes one "delete all" part-way through */
  deleteAll: boolean;
}

const OPS_PER_ROUND = 90;
const TABS = 4;
const CONFLICT_WINDOW_MS = 12; // an op may still target something whose delete started this recently
const GRACE_MS = 3000;
const COLORS = Object.values(HIGHLIGHT_COLORS);
const BASE_TIMESTAMP = Date.UTC(2026, 4, 2);
const EMPTY_POSITION = {
  startXPath: '',
  endXPath: '',
  startOffset: 0,
  endOffset: 0,
  textContext: { before: '', after: '' },
};

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface NoteTarget {
  id: string;
  dyingAt?: number;
}
interface Target {
  id: string;
  url: string;
  /** The op that creates it (absent for seed highlights) */
  createdBy?: number;
  dyingAt?: number;
  notes: NoteTarget[];
}
type Kind = Op['kind'];
const WEIGHTS: [Kind, number][] = [
  ['save', 20],
  ['addNote', 22],
  ['updateNote', 12],
  ['deleteNote', 8],
  ['deleteHighlight', 12],
  ['setPageTitle', 12],
  ['deletePageGroup', 3],
  ['setDefaultColor', 6],
  ['importBackup', 4],
];

export function planRound(seed: SeedBackup, spec: RoundSpec): RoundPlan {
  const rand = mulberry32(spec.seed * 7919 + 13);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
  const tag = `r${spec.seed}`;

  const seedById = new Map(seed.highlights.map((h) => [h.id, h]));
  const titleByUrl = new Map(seed.highlights.map((h) => [h.url, h.pageTitle]));
  const targets = new Map<string, Target>(
    seed.highlights.map((h) => [h.id, { id: h.id, url: h.url, notes: h.notes.map((n: Note) => ({ id: n.id })) }])
  );
  const seedUrls = [...titleByUrl.keys()];
  const hotUrls = new Set(Array.from({ length: 6 }, () => pick(seedUrls)));

  const ops: Planned[] = [];
  const recent: { at: number; highlightId?: string; noteId?: string; url?: string }[] = [];
  let t = 0;
  let previousTab: number | null = null;
  let lateTabAt = Number.POSITIVE_INFINITY;
  let groupDeletes = 0;
  let imports = 0;
  const lateTabIndex = Math.floor(OPS_PER_ROUND * 0.45);
  const deleteAllIndex = spec.deleteAll ? Math.floor(OPS_PER_ROUND * 0.6) : -1;

  const live = (x: { dyingAt?: number }) => x.dyingAt === undefined || t < x.dyingAt + CONFLICT_WINDOW_MS;
  const recentWithin = () => recent.filter((r) => t - r.at < 10);

  const pickHighlight = (): Target | null => {
    if (rand() < 0.4) {
      const colliding = recentWithin()
        .map((r) => (r.highlightId ? targets.get(r.highlightId) : undefined))
        .filter((h): h is Target => !!h && live(h));
      if (colliding.length > 0) return pick(colliding);
    }
    const pool = [...targets.values()].filter(live);
    const hot = pool.filter((h) => hotUrls.has(h.url));
    const from = hot.length > 0 && rand() < 0.6 ? hot : pool;
    return from.length > 0 ? pick(from) : null;
  };
  const pickNote = (): { highlight: Target; note: NoteTarget } | null => {
    const withNotes = [...targets.values()].filter((h) => live(h) && h.notes.some(live));
    if (rand() < 0.4) {
      const recentNotes = new Set(recentWithin().map((r) => r.noteId));
      for (const highlight of withNotes) {
        const note = highlight.notes.find((n) => recentNotes.has(n.id) && live(n));
        if (note) return { highlight, note };
      }
    }
    const hot = withNotes.filter((h) => hotUrls.has(h.url));
    const from = hot.length > 0 && rand() < 0.6 ? hot : withNotes;
    if (from.length === 0) return null;
    const highlight = pick(from);
    return { highlight, note: pick(highlight.notes.filter(live)) };
  };
  const pickUrl = (): string => {
    if (rand() < 0.4) {
      const colliding = recentWithin().flatMap((r) => (r.url && titleByUrl.has(r.url) ? [r.url] : []));
      if (colliding.length > 0) return pick(colliding);
    }
    return rand() < 0.7 ? pick([...hotUrls]) : pick(seedUrls);
  };
  const newHighlight = (id: string, url: string, index: number): Highlight => ({
    id,
    url,
    pageTitle: titleByUrl.get(url) ?? `Bench page ${tag}`,
    text: `Bench passage ${id}: the quick brown fox jumps over a lazy dog while seven wizards box nimbly.`,
    notes: [],
    color: pick(COLORS),
    timestamp: BASE_TIMESTAMP + index * 1000,
    position: EMPTY_POSITION,
  });

  for (let i = 0; i < OPS_PER_ROUND; i++) {
    // Bursts of near-simultaneous actions, separated by quiet gaps
    t = Math.round((t + (rand() < 0.65 ? rand() * 5 : 30 + rand() * 120)) * 100) / 100;
    if (i === lateTabIndex) lateTabAt = t;

    const available = Array.from({ length: TABS }, (_, n) => n);
    if (t > lateTabAt + 80) available.push(TABS);
    let tab: number = previousTab !== null && rand() < 0.3 ? previousTab : pick(available);

    let kind: Kind = 'save';
    let roll = rand() * WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [candidate, weight] of WEIGHTS) {
      roll -= weight;
      if (roll < 0) {
        kind = candidate;
        break;
      }
    }
    if (i === deleteAllIndex) {
      kind = 'deleteAll';
      if (tab === 0) tab = 1;
    }
    // Tab 0's drawer is closed: saving from the page is the only write it can make
    if (tab === 0) kind = 'save';
    if (kind === 'deletePageGroup' && groupDeletes >= 3) kind = 'addNote';
    if (kind === 'importBackup' && imports >= 3) kind = 'addNote';
    previousTab = tab;

    let op: Op | null = null;
    let dependsOn: number | undefined;
    const mark: (typeof recent)[number] = { at: t };

    if (kind === 'addNote' || kind === 'deleteHighlight') {
      const highlight = pickHighlight();
      if (highlight) {
        dependsOn = highlight.createdBy;
        mark.highlightId = highlight.id;
        if (kind === 'addNote') {
          op = { kind, highlightId: highlight.id, text: `Bench note ${tag}-${i}` };
        } else {
          op = { kind, id: highlight.id };
          highlight.dyingAt ??= t;
        }
      }
    } else if (kind === 'updateNote' || kind === 'deleteNote') {
      const found = pickNote();
      if (found) {
        mark.highlightId = found.highlight.id;
        mark.noteId = found.note.id;
        if (kind === 'updateNote') {
          op = { kind, highlightId: found.highlight.id, noteId: found.note.id, text: `Edited ${tag}-${i}` };
        } else {
          op = { kind, highlightId: found.highlight.id, noteId: found.note.id };
          found.note.dyingAt ??= t;
        }
      }
    } else if (kind === 'setPageTitle') {
      const url = pickUrl();
      mark.url = url;
      op = { kind, url, title: rand() < 0.15 ? '' : `Renamed ${tag}-${i}` };
    } else if (kind === 'deletePageGroup') {
      const url = pickUrl();
      groupDeletes++;
      mark.url = url;
      for (const highlight of targets.values()) if (highlight.url === url) highlight.dyingAt ??= t;
      op = { kind, url };
    } else if (kind === 'setDefaultColor') {
      op = { kind, color: pick(COLORS) };
    } else if (kind === 'importBackup') {
      imports++;
      const url = `https://import.example/${tag}/${i}`;
      const fresh = [0, 1, 2].map((k) => newHighlight(`${tag}-i${i}-${k}`, url, i));
      // Old copies of highlights that are already stored: the stored ones must win
      const stored = [...targets.values()].filter((h) => h.dyingAt === undefined && seedById.has(h.id));
      const existing = stored.length > 0 ? [pick(stored), pick(stored)].map((h) => seedById.get(h.id)!) : [];
      const legacy = imports === 2; // a backup from before page titles existed
      op = {
        kind,
        json: JSON.stringify({
          version: '1.0',
          exportDate: new Date(BASE_TIMESTAMP).toISOString(),
          highlights: [...existing, ...fresh],
          ...(legacy ? {} : { pageTitles: { [url]: `Imported ${tag}-${i}` } }),
        }),
      };
      for (const h of fresh) targets.set(h.id, { id: h.id, url, createdBy: i, notes: [] });
    } else if (kind === 'deleteAll') {
      for (const highlight of targets.values()) {
        highlight.dyingAt ??= t;
        for (const note of highlight.notes) note.dyingAt ??= t;
      }
      op = { kind };
    }

    if (!op) {
      // 'save', or nothing left for the chosen action to target
      const url = rand() < 0.7 ? pickUrl() : `https://new.example/${tag}/${i}`;
      const highlight = newHighlight(`${tag}-s${i}`, url, i);
      mark.highlightId = highlight.id;
      mark.url = url;
      dependsOn = undefined;
      op = { kind: 'save', highlight };
      targets.set(highlight.id, { id: highlight.id, url, createdBy: i, notes: [] });
    }

    recent.push(mark);
    ops.push({ id: i, at: t, tab, op, ...(dependsOn === undefined ? {} : { dependsOn }) });
  }

  return {
    seed: spec.seed,
    profile: spec.profile,
    tabs: TABS,
    lateTabAt,
    seedBackup: JSON.stringify({ version: '1.0', highlights: seed.highlights, pageTitles: seed.pageTitles }),
    ops,
    graceMs: GRACE_MS,
  };
}
