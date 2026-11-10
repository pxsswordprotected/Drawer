// Default values and configuration constants

import { Settings } from './types';

export const STORAGE_KEYS = {
  HIGHLIGHTS: 'highlights',
  SETTINGS: 'settings',
} as const;

export const DEFAULT_SETTINGS: Settings = {
  defaultColor: '#ffff02', // Yellow highlight
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
  SHADOW_DOM_ID: 'drawer-extension-root',
  Z_INDEX: 2147483647, // Max z-index to ensure drawer is always on top
  EDGE_MARGIN: 24, // Margin from viewport edges for logo and drawer
} as const;

export const XPATH_CONFIG = {
  TEXT_CONTEXT_LENGTH: 50, // Characters before/after for fallback matching
} as const;
