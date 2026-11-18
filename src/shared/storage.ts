// Storage layer. Data lives in extension storage (browser.storage.local), one key per item
// (see STORAGE_KEYS; the dev page keeps it in localStorage instead):
//   h:<highlight id> → Highlight (with its notes)
//   t:<page URL>     → custom page title
//   settings         → Settings
//
// Extension storage has no transactions: reading a value and writing it back are two steps,
// and another tab can write in between. So tabs never write. Every change is a WriteOp sent
// to one writer (the background script; on the dev page, the page itself), which applies
// them one at a time with `runWrite`, and each op ends in a single set or remove of the keys
// it touches. Tabs read directly and learn of changes, their own included, through
// `subscribe`.

import type { Highlight, PageTitles, Settings, StoredChange, StoredData, WriteOp } from './types';
import { STORAGE_KEYS, DEFAULT_SETTINGS, WRITE_MESSAGE } from './constants';

// Detect if we're in a browser extension context
export const isExtensionContext = (): boolean => {
  try {
    return typeof chrome !== 'undefined' && chrome.storage !== undefined;
  } catch {
    return false;
  }
};

// Dynamic import: webextension-polyfill throws when loaded outside an extension (the dev
// page), so it is only imported once extension context is confirmed
const extensionApi = async () => (await import('webextension-polyfill')).default;

type Items = Record<string, unknown>;

/**
 * A key-value store with extension storage's guarantees: each call is applied whole, and
 * nothing holds across two calls.
 */
interface Backend {
  /** `null` reads every item */
  get(keys: string[] | null): Promise<Items>;
  set(items: Items): Promise<void>;
  remove(keys: string[]): Promise<void>;
  /** Calls `listener` with the new value of each key any tab changed (undefined: removed) */
  onChange(listener: (changed: Items) => void): void;
}

const extensionBackend: Backend = {
  get: async (keys) => (await extensionApi()).storage.local.get(keys),
  set: async (items) => (await extensionApi()).storage.local.set(items),
  remove: async (keys) => (await extensionApi()).storage.local.remove(keys),
  onChange(listener) {
    void extensionApi().then((api) =>
      api.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        listener(Object.fromEntries(Object.entries(changes).map(([key, change]) => [key, change.newValue])));
      })
    );
  },
};

const isDataKey = (key: string) =>
  key.startsWith(STORAGE_KEYS.HIGHLIGHT_PREFIX) || key.startsWith(STORAGE_KEYS.PAGE_TITLE_PREFIX);
const highlightKey = (id: string) => `${STORAGE_KEYS.HIGHLIGHT_PREFIX}${id}`;
const pageTitleKey = (url: string) => `${STORAGE_KEYS.PAGE_TITLE_PREFIX}${url}`;

// Dev page (no extension): localStorage keeps the layout it has always had there, one
// `highlights` array and one `pageTitles` map, which the browser benches seed and read. This
// backend presents it as the same per-item keys. localStorage is synchronous, so each call
// is applied whole, like an extension storage call. The page is its only reader and writer,
// so it announces changes itself.
const LOCAL_HIGHLIGHTS = 'highlights';
const LOCAL_PAGE_TITLES = 'pageTitles';
const localListeners: ((changed: Items) => void)[] = [];

function readLocal(): Items {
  const parse = (key: string): unknown => JSON.parse(localStorage.getItem(key) ?? 'null');
  const items: Items = {};
  for (const highlight of (parse(LOCAL_HIGHLIGHTS) as Highlight[] | null) ?? []) {
    items[highlightKey(highlight.id)] = highlight;
  }
  for (const [url, title] of Object.entries((parse(LOCAL_PAGE_TITLES) as PageTitles | null) ?? {})) {
    items[pageTitleKey(url)] = title;
  }
  const settings = parse(STORAGE_KEYS.SETTINGS);
  if (settings !== null) items[STORAGE_KEYS.SETTINGS] = settings;
  return items;
}

/** `changed`: new value per key, undefined to remove it */
function changeLocal(changed: Items): void {
  const items = readLocal();
  for (const [key, value] of Object.entries(changed)) {
    if (value === undefined) delete items[key];
    else items[key] = value;
  }
  const { highlights, pageTitles } = toChange(items);
  localStorage.setItem(LOCAL_HIGHLIGHTS, JSON.stringify(Object.values(highlights)));
  localStorage.setItem(LOCAL_PAGE_TITLES, JSON.stringify(pageTitles));
  if (STORAGE_KEYS.SETTINGS in items) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(items[STORAGE_KEYS.SETTINGS]));
  }
  for (const listener of localListeners) listener(changed);
}

const localBackend: Backend = {
  async get(keys) {
    const items = readLocal();
    return keys ? Object.fromEntries(keys.filter((key) => key in items).map((key) => [key, items[key]])) : items;
  },
  async set(items) {
    changeLocal(items);
  },
  async remove(keys) {
    changeLocal(Object.fromEntries(keys.map((key) => [key, undefined])));
  },
  onChange(listener) {
    localListeners.push(listener);
  },
};

const backend = isExtensionContext() ? extensionBackend : localBackend;

/** Sorts raw storage items into highlights, page titles and settings; other keys are ignored */
function toChange(items: Items): StoredChange {
  const change: StoredChange = { highlights: {}, pageTitles: {} };
  for (const [key, value] of Object.entries(items)) {
    if (key.startsWith(STORAGE_KEYS.HIGHLIGHT_PREFIX)) {
      const id = key.slice(STORAGE_KEYS.HIGHLIGHT_PREFIX.length);
      change.highlights[id] = (value as Highlight | undefined) ?? null;
    } else if (key.startsWith(STORAGE_KEYS.PAGE_TITLE_PREFIX)) {
      const url = key.slice(STORAGE_KEYS.PAGE_TITLE_PREFIX.length);
      change.pageTitles[url] = (value as string | undefined) ?? null;
    } else if (key === STORAGE_KEYS.SETTINGS) {
      change.settings = { ...DEFAULT_SETTINGS, ...(value as Partial<Settings> | undefined) };
    }
  }
  return change;
}

/** Storage keeps no order; everything that lists highlights uses this one (ties: by id) */
export const oldestFirst = (a: Highlight, b: Highlight) =>
  a.timestamp - b.timestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// ─── Backups ───

/** A highlight as early builds saved it: one optional `note` string instead of `notes` */
type SavedHighlight = Highlight | (Omit<Highlight, 'notes'> & { note?: string });

function withNotes(saved: SavedHighlight): Highlight {
  if ('notes' in saved) return saved;
  const { note, ...rest } = saved;
  return {
    ...rest,
    notes: note ? [{ id: crypto.randomUUID(), text: note, timestamp: saved.timestamp }] : [],
  };
}

/** What a backup holds */
type Backup = Pick<StoredData, 'highlights' | 'pageTitles'>;

/**
 * Reads backup data: a `highlights` array, plus `pageTitles` (missing in older backups;
 * entries that aren't non-blank text are skipped).
 */
function readBackup(data: unknown): Backup {
  if (!data || typeof data !== 'object' || !('highlights' in data) || !Array.isArray(data.highlights)) {
    throw new Error('Invalid backup format: missing highlights array');
  }
  const saved: SavedHighlight[] = data.highlights;
  const pageTitles: PageTitles = {};
  const titles = 'pageTitles' in data ? data.pageTitles : null;
  if (titles && typeof titles === 'object' && !Array.isArray(titles)) {
    for (const [url, title] of Object.entries(titles)) {
      if (typeof title === 'string' && title.trim()) pageTitles[url] = title.trim();
    }
  }
  return { highlights: saved.map(withNotes), pageTitles };
}

// ─── Writing ───

/** Rewrites one stored highlight; does nothing when it no longer exists */
async function updateHighlight(id: string, change: (highlight: Highlight) => Highlight): Promise<void> {
  const key = highlightKey(id);
  const highlight = (await backend.get([key]))[key] as Highlight | undefined;
  if (!highlight) return;
  const next = change(highlight);
  if (next !== highlight) await backend.set({ [key]: next });
}

/** Applies one write. Each case ends in a single set or remove, so it lands whole or not at all. */
async function applyWrite(op: WriteOp): Promise<void> {
  switch (op.type) {
    case 'saveHighlight':
      return backend.set({ [highlightKey(op.highlight.id)]: op.highlight });
    case 'deleteHighlight':
      return backend.remove([highlightKey(op.id)]);
    case 'deletePage': {
      const { highlights } = toChange(await backend.get(null));
      const ids = Object.keys(highlights).filter((id) => highlights[id]?.url === op.url);
      return backend.remove([...ids.map(highlightKey), pageTitleKey(op.url)]);
    }
    case 'addNote':
      return updateHighlight(op.highlightId, (h) => ({ ...h, notes: [...h.notes, op.note] }));
    case 'updateNote':
      return updateHighlight(op.highlightId, (h) =>
        h.notes.some((n) => n.id === op.noteId)
          ? { ...h, notes: h.notes.map((n) => (n.id === op.noteId ? { ...n, text: op.text } : n)) }
          : h
      );
    case 'deleteNote':
      return updateHighlight(op.highlightId, (h) =>
        h.notes.some((n) => n.id === op.noteId)
          ? { ...h, notes: h.notes.filter((n) => n.id !== op.noteId) }
          : h
      );
    case 'setHighlightColor':
      return updateHighlight(op.highlightId, (h) => (h.color === op.color ? h : { ...h, color: op.color }));
    case 'setPageTitle': {
      // Touches the title's own key only, never highlight data
      const title = op.title.trim();
      return title
        ? backend.set({ [pageTitleKey(op.url)]: title })
        : backend.remove([pageTitleKey(op.url)]);
    }
    case 'importBackup': {
      const stored = await backend.get(null);
      const items: Items = {};
      const addMissing = (key: string, value: unknown) => {
        if (!(key in stored) && !(key in items)) items[key] = value;
      };
      for (const highlight of op.highlights) addMissing(highlightKey(highlight.id), highlight);
      for (const [url, title] of Object.entries(op.pageTitles)) addMissing(pageTitleKey(url), title);
      if (Object.keys(items).length > 0) await backend.set(items);
      return;
    }
    case 'deleteAll':
      return backend.remove(Object.keys(await backend.get(null)).filter(isDataKey));
    case 'updateSettings': {
      const { settings = DEFAULT_SETTINGS } = toChange(await backend.get([STORAGE_KEYS.SETTINGS]));
      return backend.set({ [STORAGE_KEYS.SETTINGS]: { ...settings, ...op.updates } });
    }
  }
}

// The writer's queue: one write at a time, in arrival order
let lastWrite: Promise<unknown> = Promise.resolve();

/** Applies `op` after every write already queued. Only the writer calls this. */
export function runWrite(op: WriteOp): Promise<void> {
  const result = lastWrite.then(() => applyWrite(op));
  lastWrite = result.catch(() => undefined); // a failed write must not block the next one
  return result;
}

// ─── What tabs use ───

export const storageService = {
  async load(): Promise<StoredData> {
    const stored = toChange(await backend.get(null));
    const pageTitles: PageTitles = {};
    for (const [url, title] of Object.entries(stored.pageTitles)) if (title !== null) pageTitles[url] = title;
    return {
      highlights: Object.values(stored.highlights)
        .filter((h) => h !== null)
        .sort(oldestFirst),
      pageTitles,
      settings: stored.settings ?? DEFAULT_SETTINGS,
    };
  },

  /** Resolves once the change is in storage; rejects when it could not be written */
  async write(op: WriteOp): Promise<void> {
    if (!isExtensionContext()) return runWrite(op);
    const api = await extensionApi();
    const reply: unknown = await api.runtime.sendMessage({ type: WRITE_MESSAGE, op });
    if (reply && typeof reply === 'object' && 'error' in reply) throw new Error(String(reply.error));
  },

  /** `listener` hears every change to stored data, from this tab or any other */
  subscribe(listener: (change: StoredChange) => void): void {
    backend.onChange((changed) => listener(toChange(changed)));
  },

  /** Export all highlights and custom page titles as JSON */
  async exportHighlights(): Promise<string> {
    const { highlights, pageTitles } = await this.load();
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      highlights,
      pageTitles,
      metadata: {
        totalCount: highlights.length,
        pageCount: new Set(highlights.map((h) => h.url)).size,
      },
    };
    return JSON.stringify(exportData, null, 2);
  },

  /** Merge a backup into storage. Stored highlights and titles win over the backup's. */
  async importHighlights(jsonString: string): Promise<void> {
    let backup: Backup;
    try {
      backup = readBackup(JSON.parse(jsonString));
    } catch (error) {
      console.error('Failed to import highlights:', error);
      throw new Error('Invalid JSON format');
    }
    await this.write({ type: 'importBackup', ...backup });
  },
};
