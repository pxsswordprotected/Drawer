import { create } from 'zustand';
import { Highlight, Note } from '@/shared/types';
import { storageService } from '@/shared/storage';

interface DrawerState {
  isOpen: boolean;
  allHighlights: Highlight[];
  isLoading: boolean;
  logoPosition: { x: number; y: number } | null;
  selectedHighlightId: string | null;
  lastAddedHighlightId: string | null;
  expandedGroupUrl: string | null;

  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  setLogoPosition: (position: { x: number; y: number }) => void;
  loadAllHighlights: () => Promise<void>;
  selectHighlight: (id: string) => void;
  clearSelectedHighlight: () => void;
  addHighlight: (highlight: Highlight) => void;
  clearLastAdded: () => void;
  toggleGroupExpanded: (url: string) => void;
  setExpandedGroupUrl: (url: string | null) => void;
  addNote: (highlightId: string, text: string) => Promise<void>;
  updateNote: (highlightId: string, noteId: string, text: string) => Promise<void>;
  deleteNote: (highlightId: string, noteId: string) => Promise<void>;
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
  expandedGroupUrl: typeof window !== 'undefined' ? window.location.href : null,

  openDrawer: () => set({ isOpen: true }),
  closeDrawer: () => set({ isOpen: false }),
  toggleDrawer: () =>
    set((state) => ({
      isOpen: !state.isOpen,
      selectedHighlightId: !state.isOpen ? state.selectedHighlightId : null,
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

  toggleGroupExpanded: (url: string) =>
    set((state) => ({
      expandedGroupUrl: state.expandedGroupUrl === url ? null : url,
    })),
  setExpandedGroupUrl: (url: string | null) => set({ expandedGroupUrl: url }),

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
