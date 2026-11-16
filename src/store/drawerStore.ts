import { create } from 'zustand';
import { Highlight, Note, PageTitles } from '@/shared/types';
import { storageService } from '@/shared/storage';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import { pageUrl } from '@/shared/pageUrl';

type DrawerTrigger = 'logo' | 'mark' | 'keyboard' | null;

export interface DrawerState {
  isOpen: boolean;
  allHighlights: Highlight[];
  pageTitles: PageTitles; // Custom page titles by URL; a page without one shows its saved title
  isLoading: boolean; // True only until the first load completes; refreshes are silent
  logoPosition: { x: number; y: number } | null;
  selectedHighlightId: string | null;
  lastAddedHighlightId: string | null;
  pendingScrollHighlightId: string | null;
  expandedGroupUrl: string | null;
  drawerTrigger: DrawerTrigger;
  logoResetCount: number;
  defaultColor: string;

  openDrawer: (trigger: DrawerTrigger) => void;
  closeDrawer: () => void;
  toggleDrawer: (trigger?: DrawerTrigger) => void;
  setLogoPosition: (position: { x: number; y: number }) => void;
  loadAllHighlights: () => Promise<void>;
  selectHighlight: (id: string) => void;
  clearSelectedHighlight: () => void;
  addHighlight: (highlight: Highlight) => void;
  clearLastAdded: () => void;
  setPendingScrollHighlight: (id: string) => void;
  clearPendingScrollHighlight: () => void;
  toggleGroupExpanded: (url: string) => void;
  setExpandedGroupUrl: (url: string | null) => void;
  deleteHighlight: (id: string) => Promise<void>;
  deletePageGroup: (url: string) => Promise<void>;
  setPageTitle: (url: string, title: string) => Promise<void>;
  addNote: (highlightId: string, text: string) => Promise<void>;
  updateNote: (highlightId: string, noteId: string, text: string) => Promise<void>;
  deleteNote: (highlightId: string, noteId: string) => Promise<void>;
  resetLogoPosition: () => void;
  setDefaultColor: (color: string) => void;
  loadSettings: () => Promise<void>;
  importBackup: (jsonString: string) => Promise<void>;
  deleteAllHighlights: () => Promise<void>;
}

// Request deduplication map - prevents duplicate concurrent requests
const loadingPromises = new Map<string, Promise<void>>();

export const useDrawerStore = create<DrawerState>((set, get) => ({
  isOpen: false,
  allHighlights: [],
  pageTitles: {},
  isLoading: true,
  logoPosition: null,
  selectedHighlightId: null,
  lastAddedHighlightId: null,
  pendingScrollHighlightId: null,
  expandedGroupUrl: typeof window !== 'undefined' ? pageUrl() : null,
  drawerTrigger: null,
  logoResetCount: 0,
  defaultColor: DEFAULT_SETTINGS.defaultColor,

  openDrawer: (trigger: DrawerTrigger) => set({ isOpen: true, drawerTrigger: trigger }),
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
    })),
  setLogoPosition: (position) => set({ logoPosition: position }),

  selectHighlight: (id: string) => set({ selectedHighlightId: id }),
  clearSelectedHighlight: () => set({ selectedHighlightId: null }),

  addHighlight: (highlight: Highlight) =>
    set((state) => ({
      allHighlights: [...state.allHighlights, highlight],
      lastAddedHighlightId: highlight.id,
    })),
  clearLastAdded: () => set({ lastAddedHighlightId: null }),
  setPendingScrollHighlight: (id: string) => set({ pendingScrollHighlightId: id }),
  clearPendingScrollHighlight: () => set({ pendingScrollHighlightId: null }),

  toggleGroupExpanded: (url: string) =>
    set((state) => ({
      expandedGroupUrl: state.expandedGroupUrl === url ? null : url,
    })),
  setExpandedGroupUrl: (url: string | null) => set({ expandedGroupUrl: url }),

  deleteHighlight: async (id: string) => {
    await storageService.deleteHighlight(id);
    set((state) => ({
      allHighlights: state.allHighlights.filter((h) => h.id !== id),
      selectedHighlightId: state.selectedHighlightId === id ? null : state.selectedHighlightId,
      pendingScrollHighlightId:
        state.pendingScrollHighlightId === id ? null : state.pendingScrollHighlightId,
    }));
  },

  deletePageGroup: async (url: string) => {
    await storageService.deleteHighlightsByUrl(url);
    set((state) => {
      const { [url]: _removed, ...pageTitles } = state.pageTitles;
      return {
        allHighlights: state.allHighlights.filter((h) => h.url !== url),
        pageTitles,
        expandedGroupUrl: state.expandedGroupUrl === url ? null : state.expandedGroupUrl,
        selectedHighlightId:
          state.allHighlights.find((h) => h.id === state.selectedHighlightId)?.url === url
            ? null
            : state.selectedHighlightId,
      };
    });
  },

  setPageTitle: async (url: string, title: string) => {
    await storageService.setPageTitle(url, title);
    const trimmed = title.trim();
    set((state) => {
      const { [url]: _previous, ...rest } = state.pageTitles;
      return { pageTitles: trimmed ? { ...rest, [url]: trimmed } : rest };
    });
  },

  addNote: async (highlightId: string, text: string) => {
    const note: Note = {
      id: crypto.randomUUID(),
      text,
      timestamp: Date.now(),
    };

    await storageService.addNoteToHighlight(highlightId, note);

    set((state) => ({
      allHighlights: state.allHighlights.map((h) =>
        h.id === highlightId ? { ...h, notes: [...h.notes, note] } : h
      ),
    }));
  },

  updateNote: async (highlightId: string, noteId: string, text: string) => {
    await storageService.updateNoteInHighlight(highlightId, noteId, text);

    set((state) => ({
      allHighlights: state.allHighlights.map((h) =>
        h.id === highlightId
          ? {
              ...h,
              notes: h.notes.map((n) => (n.id === noteId ? { ...n, text } : n)),
            }
          : h
      ),
    }));
  },

  deleteNote: async (highlightId: string, noteId: string) => {
    await storageService.deleteNoteFromHighlight(highlightId, noteId);

    set((state) => ({
      allHighlights: state.allHighlights.map((h) =>
        h.id === highlightId
          ? {
              ...h,
              notes: h.notes.filter((n) => n.id !== noteId),
            }
          : h
      ),
    }));
  },

  resetLogoPosition: () => set((state) => ({ logoResetCount: state.logoResetCount + 1 })),

  setDefaultColor: (color: string) => {
    set({ defaultColor: color });
    storageService.updateSettings({ defaultColor: color });
  },

  loadSettings: async () => {
    const settings = await storageService.getSettings();
    set({ defaultColor: settings.defaultColor });
  },

  deleteAllHighlights: async () => {
    await storageService.clearAllHighlights();
    set({ allHighlights: [], pageTitles: {}, selectedHighlightId: null, expandedGroupUrl: null });
  },

  importBackup: async (jsonString: string) => {
    await storageService.importHighlights(jsonString);
    const [highlights, pageTitles] = await Promise.all([
      storageService.getHighlights(),
      storageService.getPageTitles(),
    ]);
    set({ allHighlights: highlights, pageTitles });
  },

  loadAllHighlights: async () => {
    if (loadingPromises.has('__all__')) {
      return loadingPromises.get('__all__');
    }

    const promise = (async () => {
      // No isLoading toggle here: swapping the list for the skeleton on every
      // refresh resets scroll position and detaches the current-page section.
      try {
        const [highlights, pageTitles] = await Promise.all([
          storageService.getHighlights(),
          storageService.getPageTitles(),
        ]);
        // Storage returns fresh copies every read. Keep the current values when the
        // content is identical so a drawer open doesn't re-render every row.
        const state = get();
        set({
          isLoading: false,
          ...(JSON.stringify(highlights) === JSON.stringify(state.allHighlights)
            ? {}
            : { allHighlights: highlights }),
          ...(JSON.stringify(pageTitles) === JSON.stringify(state.pageTitles) ? {} : { pageTitles }),
        });
      } catch (error) {
        console.error('Failed to load highlights:', error);
        set({ allHighlights: [], pageTitles: {}, isLoading: false });
      } finally {
        loadingPromises.delete('__all__');
      }
    })();

    loadingPromises.set('__all__', promise);
    return promise;
  },
}));
