import { create } from 'zustand';
import { Highlight } from '@/shared/types';
import { storageService } from '@/shared/storage';

interface DrawerState {
  isOpen: boolean;
  currentPageHighlights: Highlight[];
  isLoading: boolean;
  logoPosition: { x: number; y: number } | null;

  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  setLogoPosition: (position: { x: number; y: number }) => void;
  loadHighlights: (url: string) => Promise<void>;
}

export const useDrawerStore = create<DrawerState>((set) => ({
  isOpen: false,
  currentPageHighlights: [],
  isLoading: false,
  logoPosition: null,

  openDrawer: () => set({ isOpen: true }),
  closeDrawer: () => set({ isOpen: false }),
  toggleDrawer: () => set((state) => ({ isOpen: !state.isOpen })),
  setLogoPosition: (position) => set({ logoPosition: position }),

  loadHighlights: async (url: string) => {
    set({ isLoading: true });

    try {
      const highlights = await storageService.getHighlights(url);
      set({ currentPageHighlights: highlights, isLoading: false });
    } catch (error) {
      console.error('Failed to load highlights:', error);
      set({ currentPageHighlights: [], isLoading: false });
    }
  },
}));
