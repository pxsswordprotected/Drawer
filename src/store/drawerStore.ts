import { create } from 'zustand';
import { Highlight } from '@/shared/types';

// Mock data for development
const MOCK_HIGHLIGHTS: Highlight[] = [
  {
    id: '1',
    text: 'Being open to your own body, being embodied, is a precondition for vibing. Which is why nerds can\'t vibe.',
    url: typeof window !== 'undefined' ? window.location.href : '',
    pageTitle: 'Test Page',
    color: '#FFEB3B',
    timestamp: Date.now(),
    position: {
      startXPath: '',
      endXPath: '',
      startOffset: 0,
      endOffset: 0,
      textContext: { before: '', after: '' },
    },
  },
  {
    id: '2',
    text: 'Another highlight with some sample text that demonstrates the three-line truncation behavior with enough content to actually show the ellipsis.',
    url: typeof window !== 'undefined' ? window.location.href : '',
    pageTitle: 'Test Page',
    color: '#4CAF50',
    timestamp: Date.now() - 1000,
    position: {
      startXPath: '',
      endXPath: '',
      startOffset: 0,
      endOffset: 0,
      textContext: { before: '', after: '' },
    },
  },
  {
    id: '3',
    text: 'Short highlight text.',
    url: typeof window !== 'undefined' ? window.location.href : '',
    pageTitle: 'Test Page',
    color: '#2196F3',
    timestamp: Date.now() - 2000,
    position: {
      startXPath: '',
      endXPath: '',
      startOffset: 0,
      endOffset: 0,
      textContext: { before: '', after: '' },
    },
  },
  {
    id: '4',
    text: 'This is another highlight that will help us test the scroll behavior and the blur effect when items move out of view.',
    url: typeof window !== 'undefined' ? window.location.href : '',
    pageTitle: 'Test Page',
    color: '#E91E63',
    timestamp: Date.now() - 3000,
    position: {
      startXPath: '',
      endXPath: '',
      startOffset: 0,
      endOffset: 0,
      textContext: { before: '', after: '' },
    },
  },
  {
    id: '5',
    text: 'The fifth highlight to ensure we have enough content to scroll and see the blur effect in action.',
    url: typeof window !== 'undefined' ? window.location.href : '',
    pageTitle: 'Test Page',
    color: '#9C27B0',
    timestamp: Date.now() - 4000,
    position: {
      startXPath: '',
      endXPath: '',
      startOffset: 0,
      endOffset: 0,
      textContext: { before: '', after: '' },
    },
  },
  {
    id: '6',
    text: 'And one more highlight for good measure to really test the scrolling capabilities.',
    url: typeof window !== 'undefined' ? window.location.href : '',
    pageTitle: 'Test Page',
    color: '#FFEB3B',
    timestamp: Date.now() - 5000,
    position: {
      startXPath: '',
      endXPath: '',
      startOffset: 0,
      endOffset: 0,
      textContext: { before: '', after: '' },
    },
  },
];

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

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Use mock data for now - filter by current URL
    const highlights = MOCK_HIGHLIGHTS.filter((h) => h.url === url);

    set({ currentPageHighlights: highlights, isLoading: false });

    // TODO: Replace with real storage service later
    // const highlights = await storageService.getHighlights(url);
    // set({ currentPageHighlights: highlights, isLoading: false });
  },
}));
