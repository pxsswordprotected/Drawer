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
