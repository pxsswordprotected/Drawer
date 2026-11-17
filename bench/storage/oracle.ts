// Correctness oracle for the storage bench. Decides, from the planned actions, when each was
// started and acknowledged, and what storage holds at the end, which acknowledged actions
// were lost.
//
// Rules (an action is "before" another when it was acknowledged before the other started;
// otherwise the two overlap and either order is accepted):
//   - Highlight: it must exist if something created it (seed data, save, import) after every
//     delete that covers it (delete highlight, delete page, delete all) had finished. It must
//     be gone if a delete covering it started after everything that created it had finished.
//     So a delete beats a note that was being added to the same highlight.
//   - Note added: must be on its highlight, when the highlight still exists and nothing that
//     could have deleted the highlight overlaps or follows its creation.
//   - Note deleted: must be gone. Note edited: its text must be one of the edits that no later
//     edit replaced.
//   - Page title, default colour: the value must come from a write that no later write replaced.
//     Deleting a page or everything counts as writing "no title".
//   - Anything nobody touched must be unchanged.
//   - An action that was rejected or never finished counts as lost: the bench injects no
//     storage failures, so nothing justifies refusing a write.
import type { Highlight, PageTitles } from '../../src/shared/types';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';
import { visible } from './types';
import type { Planned, RoundPlan, RoundResult, Snapshot } from './types';
import type { SeedBackup } from './workload';

/** Anything that writes: an action, or the seed data (which precedes everything) */
interface Writer {
  key: string;
  ok: boolean;
  start: number;
  ack: number;
}
interface Action extends Writer {
  planned: Planned;
}

export interface Verdict {
  /** Lost item -> why. Keys: `op:<id>` for an action, anything else for untouched data */
  lost: Map<string, string>;
  failedOps: number;
  collateral: number;
  staleViews: number;
  staleSettings: number;
  /** ms for an acknowledged change to reach each other tab; `timeoutMs` when it never did */
  syncMs: number[];
  opMs: number[];
  opsRun: number;
  lostByKind: Record<string, number>;
}

const before = (a: Writer, b: Writer) => a.ack < b.start;
const latest = <T extends Writer>(writers: T[]): T => writers.reduce((a, b) => (b.start > a.start ? b : a));
const seedWriter = (key: string): Writer => ({
  key,
  ok: true,
  start: Number.NEGATIVE_INFINITY,
  ack: Number.NEGATIVE_INFINITY,
});

/** JSON with object keys in a fixed order, so equal data always gives equal text */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v
  );

function canonical(view: Snapshot): string {
  const byId = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return stable({
    highlights: byId(view.highlights).map((h) => ({ ...h, notes: byId(h.notes) })),
    pageTitles: Object.entries(view.pageTitles).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  });
}

export function judge(seed: SeedBackup, plan: RoundPlan, result: RoundResult, timeoutMs: number): Verdict {
  const lost = new Map<string, string>();
  const lose = (key: string, why: string) => void (lost.has(key) || lost.set(key, why));

  const planned = new Map(plan.ops.map((p) => [p.id, p]));
  const actions: Action[] = [];
  let failedOps = 0;
  for (const r of result.ops) {
    if (r.status === 'skipped') continue;
    const ok = r.status === 'ok';
    const action: Action = {
      key: `op:${r.id}`,
      ok,
      start: r.startTick!,
      ack: ok ? r.ackTick! : Number.POSITIVE_INFINITY,
      planned: planned.get(r.id)!,
    };
    actions.push(action);
    if (!ok) {
      failedOps++;
      lose(action.key, r.status === 'rejected' ? `rejected: ${r.error}` : 'never acknowledged');
    }
  }
  const of = <K extends Planned['op']['kind']>(kind: K) =>
    actions.flatMap((a) => (a.planned.op.kind === kind ? [{ ...a, op: a.planned.op as Extract<Planned['op'], { kind: K }> }] : []));

  // ── Highlights ──
  const creators = new Map<string, { writer: Writer; payload: Highlight }[]>();
  const addCreator = (writer: Writer, payload: Highlight) =>
    creators.set(payload.id, [...(creators.get(payload.id) ?? []), { writer, payload }]);
  for (const h of seed.highlights) addCreator(seedWriter(`seed:${h.id}`), h);
  for (const a of of('save')) addCreator(a, a.op.highlight);
  const imports = of('importBackup').map((a) => ({
    ...a,
    backup: JSON.parse(a.op.json) as { highlights: Highlight[]; pageTitles?: PageTitles },
  }));
  for (const a of imports) for (const h of a.backup.highlights) addCreator(a, h);

  const deleteAlls = of('deleteAll');
  const finalById = new Map<string, Highlight>();
  for (const h of result.final.highlights) {
    if (finalById.has(h.id)) lose(`duplicate:${h.id}`, 'highlight stored twice');
    finalById.set(h.id, h);
    if (!creators.has(h.id)) lose(`unknown:${h.id}`, 'highlight nobody created');
  }

  for (const [id, created] of creators) {
    const url = created[0].payload.url;
    const deleters: Writer[] = [
      ...of('deleteHighlight').filter((a) => a.op.id === id),
      ...of('deletePageGroup').filter((a) => a.op.url === url),
      ...deleteAlls,
    ];
    const keepers = created.filter((c) => c.writer.ok && deleters.every((d) => before(d, c.writer))).map((c) => c.writer);
    const removers = deleters.filter((d) => d.ok && created.every((c) => before(c.writer, d)));
    const stored = finalById.get(id);
    if (keepers.length > 0 && !stored) lose(latest(keepers).key, `highlight ${id} missing`);
    if (removers.length > 0 && stored) lose(latest(removers).key, `highlight ${id} came back after its delete`);
    if (!stored) continue;

    const payload = created[0].payload;
    const { notes: storedNotes, ...storedFields } = stored;
    const { notes: baseNotes, ...payloadFields } = payload;
    if (stable(storedFields) !== stable(payloadFields)) lose(`changed:${id}`, 'highlight fields changed');

    // Notes are only judged when no delete could have removed or re-created the highlight
    // after it was made (deletes that finished before every creator don't count)
    if (deleters.some((d) => !created.every((c) => before(d, c.writer)))) continue;
    const expectedTexts = new Set<string>();
    for (const a of of('addNote').filter((n) => n.op.highlightId === id)) {
      expectedTexts.add(a.op.text);
      const copies = storedNotes.filter((n) => n.text === a.op.text).length;
      if (a.ok && copies === 0) lose(a.key, `note missing on ${id}`);
      if (copies > 1) lose(`duplicate-note:${a.key}`, 'note stored twice');
    }
    for (const base of baseNotes) {
      const now = storedNotes.find((n) => n.id === base.id);
      const deletes = of('deleteNote').filter((a) => a.op.noteId === base.id);
      const edits = of('updateNote').filter((a) => a.op.noteId === base.id);
      if (deletes.some((d) => d.ok)) {
        if (now) lose(latest(deletes.filter((d) => d.ok)).key, `note ${base.id} came back after its delete`);
      } else if (deletes.length > 0) {
        continue; // a failed delete may or may not have applied
      } else if (!now) {
        lose(`note-gone:${base.id}`, 'note vanished');
      } else if (edits.length > 0) {
        const standing = edits.filter((e) => !edits.some((o) => o.ok && before(e, o)));
        const okStanding = standing.filter((e) => e.ok);
        const accepted = standing.map((e) => e.op.text);
        if (okStanding.length === 0) accepted.push(base.text);
        if (!accepted.includes(now.text)) {
          lose(okStanding.length > 0 ? latest(okStanding).key : `note-changed:${base.id}`, `note ${base.id} edit lost`);
        }
      } else if (now.text !== base.text) {
        lose(`note-changed:${base.id}`, 'untouched note changed');
      }
    }
    for (const n of storedNotes) {
      if (!baseNotes.some((b) => b.id === n.id) && !expectedTexts.has(n.text)) lose(`unknown-note:${n.id}`, 'note nobody added');
    }
  }

  // ── Registers: page titles and the default colour ──
  const checkRegister = (name: string, writers: (Writer & { value: string })[], value: string) => {
    const standing = writers.filter((w) => !writers.some((o) => o.ok && o !== w && before(w, o)));
    if (standing.some((w) => w.value === value)) return;
    const okStanding = standing.filter((w) => w.ok);
    lose(okStanding.length > 0 ? latest(okStanding).key : `changed:${name}`, `${name} is ${JSON.stringify(value)}`);
  };
  const renames = of('setPageTitle');
  const groupDeletes = of('deletePageGroup');
  const urls = new Set([
    ...Object.keys(seed.pageTitles),
    ...Object.keys(result.final.pageTitles),
    ...renames.map((a) => a.op.url),
    ...imports.flatMap((a) => Object.keys(a.backup.pageTitles ?? {})),
  ]);
  for (const url of urls) {
    checkRegister(
      `title of ${url}`,
      [
        { ...seedWriter(`seed-title:${url}`), value: seed.pageTitles[url] ?? '' },
        ...renames.filter((a) => a.op.url === url).map((a) => ({ ...a, value: a.op.title.trim() })),
        ...groupDeletes.filter((a) => a.op.url === url).map((a) => ({ ...a, value: '' })),
        ...deleteAlls.map((a) => ({ ...a, value: '' })),
        ...imports.flatMap((a) => (a.backup.pageTitles?.[url] === undefined ? [] : [{ ...a, value: a.backup.pageTitles[url] }])),
      ],
      result.final.pageTitles[url] ?? ''
    );
  }
  checkRegister(
    'default colour',
    [
      { ...seedWriter('seed-colour'), value: DEFAULT_SETTINGS.defaultColor },
      ...of('setDefaultColor').map((a) => ({ ...a, value: a.op.color })),
    ],
    result.final.defaultColor
  );

  // ── Views and timing ──
  const stored = canonical(result.final);
  const staleViews = result.tabs.filter((view) => canonical(view) !== stored).length;
  const staleSettings = result.tabs.filter((view) => view.defaultColor !== result.final.defaultColor).length;
  const okById = new Map(actions.filter((a) => a.ok).map((a) => [a.planned.id, a]));
  const syncMs = result.sync.flatMap((sample) => {
    const action = okById.get(sample.op);
    // Only changes that are still in storage at the end can be expected to show elsewhere
    return action && visible(action.planned.op, result.final) ? [sample.ms ?? timeoutMs] : [];
  });
  const opMs = result.ops.flatMap((r) => (r.status === 'ok' ? [r.ack! - r.start!] : []));

  const lostByKind: Record<string, number> = {};
  for (const key of lost.keys()) {
    const kind = key.startsWith('op:') ? planned.get(Number(key.slice(3)))!.op.kind : 'untouched-data';
    lostByKind[kind] = (lostByKind[kind] ?? 0) + 1;
  }
  return {
    lost,
    failedOps,
    collateral: [...lost.keys()].filter((key) => !key.startsWith('op:')).length,
    staleViews,
    staleSettings,
    syncMs,
    opMs,
    opsRun: actions.length,
    lostByKind,
  };
}
