import { create } from 'zustand';
import { Highlight, Note } from '@/shared/types';
import { storageService } from '@/shared/storage';
import { DEFAULT_SETTINGS } from '@/shared/constants';

export type DrawerTrigger = 'logo' | 'mark' | 'keyboard' | null;

interface DrawerState {
  isOpen: boolean;
  allHighlights: Highlight[];
  isLoading: boolean;
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
  addNote: (highlightId: string, text: string) => Promise<void>;
  updateNote: (highlightId: string, noteId: string, text: string) => Promise<void>;
  deleteNote: (highlightId: string, noteId: string) => Promise<void>;
  resetLogoPosition: () => void;
  setDefaultColor: (color: string) => void;
  loadSettings: () => Promise<void>;
  importBackup: (jsonString: string) => Promise<void>;
}

// Request deduplication map - prevents duplicate concurrent requests
const loadingPromises = new Map<string, Promise<void>>();

export const useDrawerStore = create<DrawerState>((set) => ({
  isOpen: false,
  allHighlights: [],
  isLoading: false,
  logoPosition: null,
  selectedHighlightId: null,
  lastAddedHighlightId: null,
  pendingScrollHighlightId: null,
  expandedGroupUrl: typeof window !== 'undefined' ? window.location.href : null,
  drawerTrigger: null,
  logoResetCount: 0,
  defaultColor: DEFAULT_SETTINGS.defaultColor,

  openDrawer: (trigger: DrawerTrigger) => set({ isOpen: true, drawerTrigger: trigger }),
  closeDrawer: () => set({ isOpen: false, pendingScrollHighlightId: null, selectedHighlightId: null, drawerTrigger: null }),
  toggleDrawer: (trigger: DrawerTrigger = 'logo') =>
    set((state) => ({
      isOpen: !state.isOpen,
      selectedHighlightId: !state.isOpen ? state.selectedHighlightId : null,
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
    }));
  },

  deletePageGroup: async (url: string) => {
    await storageService.deleteHighlightsByUrl(url);
    set((state) => ({
      allHighlights: state.allHighlights.filter((h) => h.url !== url),
      expandedGroupUrl: state.expandedGroupUrl === url ? null : state.expandedGroupUrl,
      selectedHighlightId:
        state.allHighlights.find((h) => h.id === state.selectedHighlightId)?.url === url
          ? null
          : state.selectedHighlightId,
    }));
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

  importBackup: async (jsonString: string) => {
    await storageService.importHighlights(jsonString);
    const highlights = await storageService.getHighlights();
    set({ allHighlights: highlights });
  },

  loadAllHighlights: async () => {
    if (loadingPromises.has('__all__')) {
      return loadingPromises.get('__all__');
    }

    const promise = (async () => {
      set({ isLoading: true });

      try {
        const highlights = await storageService.getHighlights();
        set({ allHighlights: highlights, isLoading: false });
      } catch (error) {
        console.error('Failed to load highlights:', error);
        set({ allHighlights: [], isLoading: false });
      } finally {
        loadingPromises.delete('__all__');
      }
    })();

    loadingPromises.set('__all__', promise);
    return promise;
  },
}));
