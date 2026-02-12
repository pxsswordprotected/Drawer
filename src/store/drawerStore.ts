import { create } from 'zustand';
import { Highlight, Note } from '@/shared/types';
import { storageService } from '@/shared/storage';

interface DrawerState {
  isOpen: boolean;
  currentPageHighlights: Highlight[];
  isLoading: boolean;
  logoPosition: { x: number; y: number } | null;
  selectedHighlightId: string | null;

  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  setLogoPosition: (position: { x: number; y: number }) => void;
  loadHighlights: (url: string) => Promise<void>;
  selectHighlight: (id: string) => void;
  clearSelectedHighlight: () => void;
  addNote: (highlightId: string, text: string) => Promise<void>;
  updateNote: (highlightId: string, noteId: string, text: string) => Promise<void>;
  deleteNote: (highlightId: string, noteId: string) => Promise<void>;
}

// Request deduplication map - prevents duplicate concurrent requests for the same URL
const loadingPromises = new Map<string, Promise<void>>();

export const useDrawerStore = create<DrawerState>((set) => ({
  isOpen: false,
  currentPageHighlights: [],
  isLoading: false,
  logoPosition: null,
  selectedHighlightId: null,

  openDrawer: () => set({ isOpen: true }),
  closeDrawer: () => set({ isOpen: false, selectedHighlightId: null }),
  toggleDrawer: () =>
    set((state) => ({
      isOpen: !state.isOpen,
      selectedHighlightId: !state.isOpen ? state.selectedHighlightId : null,
    })),
  setLogoPosition: (position) => set({ logoPosition: position }),

  selectHighlight: (id: string) => set({ selectedHighlightId: id }),
  clearSelectedHighlight: () => set({ selectedHighlightId: null }),

  addNote: async (highlightId: string, text: string) => {
    const note: Note = {
      id: crypto.randomUUID(),
      text,
      timestamp: Date.now(),
    };

    await storageService.addNoteToHighlight(highlightId, note);

    // Update local state in place
    set((state) => ({
      currentPageHighlights: state.currentPageHighlights.map((h) =>
        h.id === highlightId ? { ...h, notes: [...h.notes, note] } : h
      ),
    }));
  },

  updateNote: async (highlightId: string, noteId: string, text: string) => {
    await storageService.updateNoteInHighlight(highlightId, noteId, text);

    // Update local state in place
    set((state) => ({
      currentPageHighlights: state.currentPageHighlights.map((h) =>
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

    // Update local state in place
    set((state) => ({
      currentPageHighlights: state.currentPageHighlights.map((h) =>
        h.id === highlightId
          ? {
              ...h,
              notes: h.notes.filter((n) => n.id !== noteId),
            }
          : h
      ),
    }));
  },

  loadHighlights: async (url: string) => {
    // Request deduplication: if already loading this URL, return existing promise
    if (loadingPromises.has(url)) {
      return loadingPromises.get(url);
    }

    const promise = (async () => {
      set({ isLoading: true });

      try {
        const highlights = await storageService.getHighlights(url);
        set({ currentPageHighlights: highlights, isLoading: false });
      } catch (error) {
        console.error('Failed to load highlights:', error);
        set({ currentPageHighlights: [], isLoading: false });
      } finally {
        // Clean up promise from map after completion
        loadingPromises.delete(url);
      }
    })();

    loadingPromises.set(url, promise);
    return promise;
  },
}));
