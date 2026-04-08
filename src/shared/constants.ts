// Default values and configuration constants

import { Settings } from './types';

export const STORAGE_KEYS = {
  HIGHLIGHTS: 'highlights',
  SETTINGS: 'settings',
} as const;

export const DEFAULT_SETTINGS: Settings = {
  drawerPosition: {
    x: typeof window !== 'undefined' ? window.innerWidth - 420 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight - 600 : 0,
  },
  drawerVisible: true,
  defaultColor: '#ffff02', // Yellow highlight
  highlightShortcut: 'Ctrl+Shift+H',
  drawerShortcut: 'Ctrl+Shift+D',
  autoSync: false,
  syncEndpoint: undefined,
};

export const HIGHLIGHT_COLORS = {
  yellow: '#ffff02',
  green: '#4CAF50',
  orange: '#FF9800',
  blue: '#1780fd',
  pink: '#E91E63',
  purple: '#7c4bf5',
} as const;

export const DRAWER_CONFIG = {
  DEFAULT_WIDTH: 400,
  DEFAULT_HEIGHT: 600,
  MIN_WIDTH: 300,
  MIN_HEIGHT: 400,
  SHADOW_DOM_ID: 'drawer-extension-root',
  Z_INDEX: 2147483647, // Max z-index to ensure drawer is always on top
  EDGE_MARGIN: 24, // Margin from viewport edges for logo and drawer
} as const;

export const TOAST_CONFIG = {
  DURATION: 4000, // 4 seconds
  POSITION: 'top-right',
} as const;

export const XPATH_CONFIG = {
  TEXT_CONTEXT_LENGTH: 50, // Characters before/after for fallback matching
} as const;
