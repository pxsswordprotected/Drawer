import { create } from 'zustand';
import { Highlight, Note } from '@/shared/types';
import { storageService } from '@/shared/storage';

export type DrawerTrigger = 'logo' | 'mark' | 'keyboard' | null;
export type DragItemType = 'highlight' | 'note' | 'page';
export type DropPhase = 'dragging' | 'deleting' | 'cancelling' | null;

export interface DraggedItem {
  id: string;
  type: DragItemType;
  rect: DOMRect;
  parentHighlightId?: string; // for notes: the highlight that owns this note
}

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
  draggedItem: DraggedItem | null;
  isTrashActive: boolean;
  dropPhase: DropPhase;

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
  addNote: (highlightId: string, text: string) => Promise<void>;
  updateNote: (highlightId: string, noteId: string, text: string) => Promise<void>;
  deleteNote: (highlightId: string, noteId: string) => Promise<void>;
  setDraggedItem: (item: DraggedItem) => void;
  setTrashActive: (active: boolean) => void;
  setDropPhase: (phase: DropPhase) => void;
  clearDrag: () => void;
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
  draggedItem: null,
  isTrashActive: false,
  dropPhase: null,

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

  setDraggedItem: (item: DraggedItem) => set({ draggedItem: item, dropPhase: 'dragging' }),
  setTrashActive: (active: boolean) => set({ isTrashActive: active }),
  setDropPhase: (phase: DropPhase) => set({ dropPhase: phase }),
  clearDrag: () => set({ draggedItem: null, isTrashActive: false, dropPhase: null }),

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
