// Default values and configuration constants

import { Settings } from './types';

// Extension storage: one key per item, so a write touches only what it changes
export const STORAGE_KEYS = {
  HIGHLIGHT_PREFIX: 'h:', // + highlight id → Highlight (with its notes)
  PAGE_TITLE_PREFIX: 't:', // + page URL → custom page title
  SETTINGS: 'settings',
} as const;

// Message a tab sends the background script to change stored data: { type, op: WriteOp }
export const WRITE_MESSAGE = 'STORAGE_WRITE';

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
  WIDTH: 376,
  HEIGHT: 270, // also the hover tooltip's max height
} as const;

/** Visual shell shared by the drawer and the hover tooltip */
export const PANEL_SURFACE_CLASS =
  'relative bg-bg-elevated rounded-lg overflow-hidden shadow-[0_2px_5px_-1px_rgba(0,0,0,0.35)] ring-1 ring-edge';

export const XPATH_CONFIG = {
  TEXT_CONTEXT_LENGTH: 50, // Characters before/after for fallback matching
} as const;
