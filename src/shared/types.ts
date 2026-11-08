// Core data models for Drawer extension

export interface Note {
  id: string; // UUID
  text: string; // Note content
  timestamp: number; // Creation timestamp
}

export interface Highlight {
  id: string; // UUID
  text: string; // Highlighted text content
  url: string; // Page URL
  pageTitle: string; // Page title
  notes: Note[]; // User notes
  color: string; // Highlight color (#hex)
  timestamp: number; // Creation timestamp
  position: HighlightPosition; // DOM position for restoration
}

export interface HighlightPosition {
  startXPath: string; // XPath to start node
  endXPath: string; // XPath to end node
  startOffset: number; // Text offset in start node
  endOffset: number; // Text offset in end node
  textContext: {
    // Fallback for DOM changes
    before: string; // 50 chars before
    after: string; // 50 chars after
  };
  // Optional (added later; older highlights lack them). Disambiguate repeated text.
  block?: {
    // Whitespace-free text of the block element containing the highlight start
    head: string; // first 32 chars
    tail: string; // last 32 chars
    len: number; // total length
  };
  at?: number; // highlight start as a fraction (0..1) of the page's whitespace-free text
  path?: string; // tag names of the start node's nearest 4 element ancestors, e.g. "DIV>BLOCKQUOTE>P"
}

export interface Settings {
  drawerPosition: { x: number; y: number };
  drawerVisible: boolean; // Last visibility state
  defaultColor: string;
  highlightShortcut: string; // User-configurable shortcut
  drawerShortcut: string; // Toggle drawer shortcut
  autoSync: boolean; // Future: sync to external API
  syncEndpoint?: string; // Future: API endpoint
}

export type ExportScope = 'current' | 'all' | 'selected';

// Message types for extension communication
export enum MessageType {
  SAVE_HIGHLIGHT = 'SAVE_HIGHLIGHT',
  DELETE_HIGHLIGHT = 'DELETE_HIGHLIGHT',
  UPDATE_HIGHLIGHT = 'UPDATE_HIGHLIGHT',
  TOGGLE_DRAWER = 'TOGGLE_DRAWER',
  GET_HIGHLIGHTS = 'GET_HIGHLIGHTS',
  UPDATE_SETTINGS = 'UPDATE_SETTINGS',
}

export interface Message {
  type: MessageType;
  payload?: any;
}

export interface HighlightMessage extends Message {
  type: MessageType.SAVE_HIGHLIGHT | MessageType.DELETE_HIGHLIGHT | MessageType.UPDATE_HIGHLIGHT;
  payload: Highlight | string; // Highlight object or ID
}
