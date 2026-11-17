// Bench-only entry: runs inside each simulated tab. Loads the app's real storage layer and
// store and exposes them to the simulator (bench/storage/host.ts). Built by
// bench/storage/vite.config.ts; never part of `build:extension`.
import { storageService } from '@/shared/storage';
import { useDrawerStore } from '@/store/drawerStore';
import type { Op, Snapshot } from './types';

const store = useDrawerStore;

/** Performs one user action the way the app does; resolves when the app considers it done */
async function run(op: Op): Promise<void> {
  const actions = store.getState();
  switch (op.kind) {
    case 'save':
      // What handleSaveHighlight in src/content/useSelectionHandler.ts does with storage
      return actions.saveHighlight(op.highlight);
    case 'deleteHighlight':
      return actions.deleteHighlight(op.id);
    case 'deletePageGroup':
      return actions.deletePageGroup(op.url);
    case 'addNote':
      return actions.addNote(op.highlightId, op.text);
    case 'updateNote':
      return actions.updateNote(op.highlightId, op.noteId, op.text);
    case 'deleteNote':
      return actions.deleteNote(op.highlightId, op.noteId);
    case 'setPageTitle':
      return actions.setPageTitle(op.url, op.title);
    case 'importBackup':
      return actions.importBackup(op.json);
    case 'deleteAll':
      return actions.deleteAllHighlights();
    case 'setDefaultColor':
      return actions.setDefaultColor(op.color);
  }
}

const bench = {
  run,
  /** What HighlightsDrawer does when it mounts (drawer still closed) */
  mount(): Promise<void> {
    return store.getState().loadAllHighlights();
  },
  /** What opening the drawer does */
  async open(): Promise<void> {
    store.getState().openDrawer('logo');
    await store.getState().loadAllHighlights();
  },
  /** The tab's in-memory view */
  view(): Snapshot {
    const s = store.getState();
    return { highlights: s.allHighlights, pageTitles: s.pageTitles, defaultColor: s.defaultColor };
  },
  /** What storage holds, read through the app's own read path */
  async read(): Promise<Snapshot> {
    const { highlights, pageTitles, settings } = await storageService.load();
    return { highlights, pageTitles, defaultColor: settings.defaultColor };
  },
  /** Fills storage through the app's backup import, so the bench never assumes a key layout */
  seed(json: string): Promise<void> {
    return storageService.importHighlights(json);
  },
  subscribe(listener: () => void): () => void {
    return store.subscribe(listener);
  },
};

export type TabBench = typeof bench;
Object.assign(window, { __bench: bench });
