// Shared between the bun-side runner/oracle and the in-page simulator.
import type { Highlight, PageTitles } from '../../src/shared/types';

/** Which browser's extension API behaviour the fake models for a round */
export type Profile = 'chromium' | 'firefox';

/** One user-level write action, as the app performs it */
export type Op =
  | { kind: 'save'; highlight: Highlight }
  | { kind: 'deleteHighlight'; id: string }
  | { kind: 'deletePageGroup'; url: string }
  | { kind: 'addNote'; highlightId: string; text: string }
  | { kind: 'updateNote'; highlightId: string; noteId: string; text: string }
  | { kind: 'deleteNote'; highlightId: string; noteId: string }
  | { kind: 'setPageTitle'; url: string; title: string }
  | { kind: 'importBackup'; json: string }
  | { kind: 'deleteAll' }
  | { kind: 'setDefaultColor'; color: string };

export interface Planned {
  id: number;
  at: number; // virtual ms after the workload starts
  tab: number;
  op: Op;
  /** Starts only once this op has been acknowledged (its target is created by that op) */
  dependsOn?: number;
}

export interface RoundPlan {
  seed: number;
  profile: Profile;
  /** Tabs present from the start. Tab 0 keeps its drawer closed; the others have it open. */
  tabs: number;
  /** A tab that opens part-way through (index = `tabs`) */
  lateTabAt: number;
  seedBackup: string;
  ops: Planned[];
  graceMs: number;
}

export interface OpResult {
  id: number;
  status: 'ok' | 'rejected' | 'pending' | 'skipped';
  start: number | null; // virtual ms
  ack: number | null;
  /** Logical clock: strictly increasing over every start and acknowledgement in the round */
  startTick: number | null;
  ackTick: number | null;
  error?: string;
}

/** The app's data as one context sees it */
export interface Snapshot {
  highlights: Highlight[];
  pageTitles: PageTitles;
  defaultColor: string;
}

export interface SyncSample {
  op: number;
  tab: number;
  ms: number | null; // null: never appeared in that tab's store
}

export interface RoundResult {
  ops: OpResult[];
  final: Snapshot; // read through the app's own storage layer in a fresh context
  tabs: Snapshot[]; // each tab's store after the workload settles
  sync: SyncSample[];
  writes: number;
  reads: number;
  bytesWritten: number;
  messages: number;
  backgroundWakes: number;
  events: number;
  errors: string[];
}

/** True when `op`'s effect shows in `view` */
export function visible(op: Op, view: Snapshot): boolean {
  const highlight = (id: string) => view.highlights.find((h) => h.id === id);
  switch (op.kind) {
    case 'save':
      return !!highlight(op.highlight.id);
    case 'deleteHighlight':
      return !highlight(op.id);
    case 'deletePageGroup':
      return !view.highlights.some((h) => h.url === op.url);
    case 'addNote':
      return !!highlight(op.highlightId)?.notes.some((n) => n.text === op.text);
    case 'updateNote':
      return highlight(op.highlightId)?.notes.find((n) => n.id === op.noteId)?.text === op.text;
    case 'deleteNote': {
      const h = highlight(op.highlightId);
      return !!h && !h.notes.some((n) => n.id === op.noteId);
    }
    case 'setPageTitle':
      return (view.pageTitles[op.url] ?? '') === op.title.trim();
    case 'importBackup': {
      const backup = JSON.parse(op.json) as { highlights: Highlight[] };
      return backup.highlights.every((h) => !!highlight(h.id));
    }
    case 'deleteAll':
      return view.highlights.length === 0;
    case 'setDefaultColor':
      return view.defaultColor === op.color;
  }
}
