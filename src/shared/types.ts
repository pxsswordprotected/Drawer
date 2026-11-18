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
    prev?: string; // last 24 chars of page text before the block
    next?: string; // first 24 chars of page text after the block
  };
  at?: number; // highlight start as a fraction (0..1) of the page's whitespace-free text
  path?: string; // tag names of the start node's nearest 4 container ancestors, e.g. "DIV>BLOCKQUOTE>P"
  twins?: number; // copies on the page that matched this highlight equally well when saved (≥2)
}

export interface Settings {
  defaultColor: string;
}

/** User-chosen page titles, keyed by page URL. A page with no entry shows its saved title. */
export type PageTitles = Record<string, string>;

/** Everything the extension keeps in storage */
export interface StoredData {
  highlights: Highlight[];
  pageTitles: PageTitles;
  settings: Settings;
}

/** One change to stored data. Tabs never write storage themselves: see shared/storage.ts. */
export type WriteOp =
  | { type: 'saveHighlight'; highlight: Highlight }
  | { type: 'deleteHighlight'; id: string }
  | { type: 'deletePage'; url: string } // every highlight of the page, and its custom title
  | { type: 'addNote'; highlightId: string; note: Note }
  | { type: 'updateNote'; highlightId: string; noteId: string; text: string }
  | { type: 'deleteNote'; highlightId: string; noteId: string }
  | { type: 'setHighlightColor'; highlightId: string; color: string }
  | { type: 'setPageTitle'; url: string; title: string } // empty title: back to the saved one
  | { type: 'importBackup'; highlights: Highlight[]; pageTitles: PageTitles } // stored items win
  | { type: 'deleteAll' } // highlights and page titles; settings stay
  | { type: 'updateSettings'; updates: Partial<Settings> };

/** What a write changed in storage, as every tab hears it. `null` means deleted. */
export interface StoredChange {
  highlights: Record<string, Highlight | null>; // by highlight id
  pageTitles: Record<string, string | null>; // by page URL
  settings?: Settings;
}

/** Where a highlight's hover tooltip is anchored, in viewport pixels */
export interface TooltipTarget {
  highlightId: string;
  pointerX: number; // cursor x when the tooltip opened
  line: { left: number; right: number; top: number; bottom: number }; // the highlight's line box under the cursor
}

export type ExportScope = 'current' | 'all' | 'selected';
