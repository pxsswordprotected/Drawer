import { create } from 'zustand';
import {
  Folder,
  Highlight,
  Note,
  PageTitles,
  SiteFolders,
  StoredChange,
  StoredData,
  TooltipTarget,
} from '@/shared/types';
import { oldestFirst, storageService } from '@/shared/storage';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import { pageUrl } from '@/shared/pageUrl';

type DrawerTrigger = 'logo' | 'mark' | 'keyboard' | null;

export interface DrawerState {
  isOpen: boolean;
  // Stored data (allHighlights, pageTitles, defaultColor) mirrors storage: it only changes
  // through `applyChange`, fed by storage's change events, so every tab shows the same thing
  allHighlights: Highlight[]; // oldest first
  pageTitles: PageTitles; // Custom page titles by URL; a page without one shows its saved title
  folders: Folder[]; // By name
  siteFolders: SiteFolders; // Folder id by page URL; a page without one is in no folder
  isLoading: boolean; // True only until the first load completes; refreshes are silent
  logoPosition: { x: number; y: number } | null;
  selectedHighlightId: string | null;
  lastAddedHighlightId: string | null;
  pendingScrollHighlightId: string | null;
  expandedGroupUrl: string | null;
  drawerTrigger: DrawerTrigger;
  logoResetCount: number;
  defaultColor: string;
  tooltip: TooltipTarget | null; // Hover tooltip over a highlight; never set while the drawer is open

  showTooltip: (target: TooltipTarget) => void;
  hideTooltip: () => void;
  openDrawer: (trigger: DrawerTrigger) => void;
  closeDrawer: () => void;
  toggleDrawer: (trigger?: DrawerTrigger) => void;
  setLogoPosition: (position: { x: number; y: number }) => void;
  loadAllHighlights: () => Promise<void>;
  selectHighlight: (id: string) => void;
  clearSelectedHighlight: () => void;
  saveHighlight: (highlight: Highlight) => Promise<void>;
  clearLastAdded: () => void;
  setPendingScrollHighlight: (id: string) => void;
  clearPendingScrollHighlight: () => void;
  toggleGroupExpanded: (url: string) => void;
  setExpandedGroupUrl: (url: string | null) => void;
  deleteHighlight: (id: string) => Promise<void>;
  deletePageGroup: (url: string) => Promise<void>;
  setPageTitle: (url: string, title: string) => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  setSiteFolder: (url: string, folderId: string | null) => Promise<void>;
  addNote: (highlightId: string, text: string) => Promise<void>;
  updateNote: (highlightId: string, noteId: string, text: string) => Promise<void>;
  deleteNote: (highlightId: string, noteId: string) => Promise<void>;
  resetLogoPosition: () => void;
  setDefaultColor: (color: string) => Promise<void>;
  setHighlightColor: (highlightId: string, color: string) => Promise<void>;
  importBackup: (jsonString: string) => Promise<void>;
  deleteAllHighlights: () => Promise<void>;
}

/** Folders list by name (ties: by id) */
const byName = (a: Folder, b: Folder) =>
  a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * State after a change to stored data. Items equal to what the store already holds keep their
 * identity (and an all-equal change returns nothing), so rows that didn't change don't re-render.
 */
function applyChange(state: DrawerState, change: StoredChange): Partial<DrawerState> {
  const next: Partial<DrawerState> = {};

  const highlights = new Map(state.allHighlights.map((h) => [h.id, h]));
  let highlightsChanged = false;
  for (const [id, highlight] of Object.entries(change.highlights)) {
    if (highlight === null) {
      if (highlights.delete(id)) highlightsChanged = true;
    } else if (JSON.stringify(highlights.get(id)) !== JSON.stringify(highlight)) {
      highlights.set(id, highlight);
      highlightsChanged = true;
    }
  }
  if (highlightsChanged) {
    next.allHighlights = [...highlights.values()].sort(oldestFirst);
    // A deleted highlight (here or in another tab) can't stay selected or awaited
    if (state.selectedHighlightId && !highlights.has(state.selectedHighlightId)) {
      next.selectedHighlightId = null;
    }
    if (state.pendingScrollHighlightId && !highlights.has(state.pendingScrollHighlightId)) {
      next.pendingScrollHighlightId = null;
    }
    if (state.tooltip && !highlights.has(state.tooltip.highlightId)) {
      next.tooltip = null;
    }
  }

  const pageTitles = { ...state.pageTitles };
  let titlesChanged = false;
  for (const [url, title] of Object.entries(change.pageTitles)) {
    if ((pageTitles[url] ?? null) === title) continue;
    if (title === null) delete pageTitles[url];
    else pageTitles[url] = title;
    titlesChanged = true;
  }
  if (titlesChanged) next.pageTitles = pageTitles;

  const folders = new Map(state.folders.map((f) => [f.id, f]));
  let foldersChanged = false;
  for (const [id, folder] of Object.entries(change.folders)) {
    if (folder === null) {
      if (folders.delete(id)) foldersChanged = true;
    } else if (JSON.stringify(folders.get(id)) !== JSON.stringify(folder)) {
      folders.set(id, folder);
      foldersChanged = true;
    }
  }
  if (foldersChanged) next.folders = [...folders.values()].sort(byName);

  const siteFolders = { ...state.siteFolders };
  let siteFoldersChanged = false;
  for (const [url, id] of Object.entries(change.siteFolders)) {
    if ((siteFolders[url] ?? null) === id) continue;
    if (id === null) delete siteFolders[url];
    else siteFolders[url] = id;
    siteFoldersChanged = true;
  }
  if (siteFoldersChanged) next.siteFolders = siteFolders;

  if (change.settings && change.settings.defaultColor !== state.defaultColor) {
    next.defaultColor = change.settings.defaultColor;
  }
  return next;
}

/** The change that turns what the store holds into `data`: everything in it, minus the rest */
function changeTo(state: DrawerState, data: StoredData): StoredChange {
  const change: StoredChange = {
    highlights: {},
    pageTitles: {},
    folders: {},
    siteFolders: {},
    settings: data.settings,
  };
  for (const h of state.allHighlights) change.highlights[h.id] = null;
  for (const h of data.highlights) change.highlights[h.id] = h;
  for (const url of Object.keys(state.pageTitles)) change.pageTitles[url] = null;
  Object.assign(change.pageTitles, data.pageTitles);
  for (const f of state.folders) change.folders[f.id] = null;
  for (const f of data.folders) change.folders[f.id] = f;
  for (const url of Object.keys(state.siteFolders)) change.siteFolders[url] = null;
  Object.assign(change.siteFolders, data.siteFolders);
  return change;
}

// The load in flight, shared by concurrent callers
let loading: Promise<void> | null = null;
// Changes heard while a load is reading storage. The snapshot it returns may predate them,
// so they are applied again on top of it.
let heardWhileLoading: StoredChange[] | null = null;

export const useDrawerStore = create<DrawerState>((set, get) => ({
  isOpen: false,
  allHighlights: [],
  pageTitles: {},
  folders: [],
  siteFolders: {},
  isLoading: true,
  logoPosition: null,
  selectedHighlightId: null,
  lastAddedHighlightId: null,
  pendingScrollHighlightId: null,
  expandedGroupUrl: typeof window !== 'undefined' ? pageUrl() : null,
  drawerTrigger: null,
  logoResetCount: 0,
  defaultColor: DEFAULT_SETTINGS.defaultColor,
  tooltip: null,

  openDrawer: (trigger: DrawerTrigger) => set({ isOpen: true, drawerTrigger: trigger, tooltip: null }),
  // Closing keeps selectedHighlightId so the drawer's contents stay still during the exit
  // animation; HighlightsDrawer clears it once the drawer is hidden.
  closeDrawer: () =>
    set({
      isOpen: false,
      pendingScrollHighlightId: null,
      drawerTrigger: null,
    }),
  toggleDrawer: (trigger: DrawerTrigger = 'logo') =>
    set((state) => ({
      isOpen: !state.isOpen,
      drawerTrigger: !state.isOpen ? trigger : null,
      ...(!state.isOpen && { tooltip: null }),
    })),
  // The open drawer always wins: a tooltip never coexists with it
  showTooltip: (target) => {
    if (!get().isOpen) set({ tooltip: target });
  },
  hideTooltip: () => {
    if (get().tooltip) set({ tooltip: null });
  },
  setLogoPosition: (position) => set({ logoPosition: position }),

  selectHighlight: (id: string) => set({ selectedHighlightId: id }),
  clearSelectedHighlight: () => set({ selectedHighlightId: null }),

  saveHighlight: async (highlight: Highlight) => {
    await storageService.write({ type: 'saveHighlight', highlight });
    // An open drawer selects the new highlight and scrolls to it
    if (get().isOpen) set({ lastAddedHighlightId: highlight.id });
  },
  clearLastAdded: () => set({ lastAddedHighlightId: null }),
  setPendingScrollHighlight: (id: string) => set({ pendingScrollHighlightId: id }),
  clearPendingScrollHighlight: () => set({ pendingScrollHighlightId: null }),

  toggleGroupExpanded: (url: string) =>
    set((state) => ({
      expandedGroupUrl: state.expandedGroupUrl === url ? null : url,
    })),
  setExpandedGroupUrl: (url: string | null) => set({ expandedGroupUrl: url }),

  deleteHighlight: (id: string) => storageService.write({ type: 'deleteHighlight', id }),

  deletePageGroup: async (url: string) => {
    await storageService.write({ type: 'deletePage', url });
    set((state) => ({
      expandedGroupUrl: state.expandedGroupUrl === url ? null : state.expandedGroupUrl,
    }));
  },

  setPageTitle: (url: string, title: string) =>
    storageService.write({ type: 'setPageTitle', url, title }),

  createFolder: async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await storageService.write({
      type: 'createFolder',
      folder: { id: crypto.randomUUID(), name: trimmed, timestamp: Date.now() },
    });
  },
  deleteFolder: (id: string) => storageService.write({ type: 'deleteFolder', id }),
  setSiteFolder: (url: string, folderId: string | null) =>
    storageService.write({ type: 'setSiteFolder', url, folderId }),

  addNote: (highlightId: string, text: string) => {
    const note: Note = {
      id: crypto.randomUUID(),
      text,
      timestamp: Date.now(),
    };
    return storageService.write({ type: 'addNote', highlightId, note });
  },

  updateNote: (highlightId: string, noteId: string, text: string) =>
    storageService.write({ type: 'updateNote', highlightId, noteId, text }),

  deleteNote: (highlightId: string, noteId: string) =>
    storageService.write({ type: 'deleteNote', highlightId, noteId }),

  setHighlightColor: (highlightId: string, color: string) =>
    storageService.write({ type: 'setHighlightColor', highlightId, color }),

  resetLogoPosition: () => set((state) => ({ logoResetCount: state.logoResetCount + 1 })),

  setDefaultColor: (color: string) => {
    set({ defaultColor: color }); // shown at once; the stored value follows
    return storageService.write({ type: 'updateSettings', updates: { defaultColor: color } });
  },

  deleteAllHighlights: async () => {
    await storageService.write({ type: 'deleteAll' });
    set({ expandedGroupUrl: null });
  },

  importBackup: (jsonString: string) => storageService.importHighlights(jsonString),

  // Reads everything from storage (highlights, page titles, settings). Changes arrive on
  // their own afterwards; the drawer still reloads on open in case this tab missed any.
  loadAllHighlights: () => {
    if (loading) return loading;

    loading = (async () => {
      heardWhileLoading = [];
      // No isLoading toggle here: swapping the list for the skeleton on every
      // refresh resets scroll position and detaches the current-page section.
      try {
        const data = await storageService.load();
        const heard = heardWhileLoading ?? [];
        set((state) => {
          const change = changeTo(state, data);
          for (const later of heard) {
            Object.assign(change.highlights, later.highlights);
            Object.assign(change.pageTitles, later.pageTitles);
            Object.assign(change.folders, later.folders);
            Object.assign(change.siteFolders, later.siteFolders);
            change.settings = later.settings ?? change.settings;
          }
          return { ...applyChange(state, change), isLoading: false };
        });
      } catch (error) {
        console.error('Failed to load highlights:', error);
        set({ allHighlights: [], pageTitles: {}, folders: [], siteFolders: {}, isLoading: false });
      } finally {
        heardWhileLoading = null;
        loading = null;
      }
    })();

    return loading;
  },
}));

storageService.subscribe((change) => {
  heardWhileLoading?.push(change);
  useDrawerStore.setState((state) => applyChange(state, change));
});
