// Default values and configuration constants

import { Settings } from './types';

export const STORAGE_KEYS = {
  HIGHLIGHTS: 'highlights',
  SETTINGS: 'settings',
} as const;

export const DEFAULT_SETTINGS: Settings = {
  drawerPosition: { x: window.innerWidth - 420, y: window.innerHeight - 600 },
  drawerVisible: true,
  defaultColor: '#FFEB3B', // Yellow highlight
  highlightShortcut: 'Ctrl+Shift+H',
  drawerShortcut: 'Ctrl+Shift+D',
  autoSync: false,
  syncEndpoint: undefined,
};

export const HIGHLIGHT_COLORS = {
  yellow: '#FFEB3B',
  green: '#4CAF50',
  blue: '#2196F3',
  pink: '#E91E63',
  purple: '#9C27B0',
} as const;

export const DRAWER_CONFIG = {
  DEFAULT_WIDTH: 400,
  DEFAULT_HEIGHT: 600,
  MIN_WIDTH: 300,
  MIN_HEIGHT: 400,
  SHADOW_DOM_ID: 'drawer-extension-root',
  Z_INDEX: 2147483647, // Max z-index to ensure drawer is always on top
} as const;

export const TOAST_CONFIG = {
  DURATION: 4000, // 4 seconds
  POSITION: 'top-right',
} as const;

export const XPATH_CONFIG = {
  TEXT_CONTEXT_LENGTH: 50, // Characters before/after for fallback matching
} as const;
