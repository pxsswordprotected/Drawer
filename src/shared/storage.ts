// Storage abstraction layer for browser.storage operations
// This enables seamless migration to database backend in the future

import { Highlight, Note, Settings } from './types';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants';

// Detect if we're in a browser extension context
const isExtensionContext = (): boolean => {
  try {
    return typeof chrome !== 'undefined' && chrome.storage !== undefined;
  } catch {
    return false;
  }
};

export class StorageService {
  private isExtension = isExtensionContext();

  /**
   * Get data from storage (browser.storage or localStorage)
   */
  private async getFromStorage(key: string): Promise<any> {
    if (this.isExtension) {
      const browser = (await import('webextension-polyfill')).default;
      const result = await browser.storage.local.get(key);
      return result[key];
    } else {
      // Use localStorage for test environment
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : undefined;
    }
  }

  /**
   * Set data in storage (browser.storage or localStorage)
   */
  private async setInStorage(key: string, value: any): Promise<void> {
    if (this.isExtension) {
      const browser = (await import('webextension-polyfill')).default;
      await browser.storage.local.set({ [key]: value });
    } else {
      // Use localStorage for test environment
      localStorage.setItem(key, JSON.stringify(value));
    }
  }

  /**
   * Save a new highlight to storage
   */
  async saveHighlight(highlight: Highlight): Promise<void> {
    const highlights = await this.getHighlights();
    highlights.push(highlight);
    await this.setInStorage(STORAGE_KEYS.HIGHLIGHTS, highlights);
  }

  /**
   * Migrate highlights from old note?: string field to notes: Note[] array
   */
  private migrateHighlights(highlights: any[]): { migrated: Highlight[]; didMigrate: boolean } {
    let didMigrate = false;
    const migrated = highlights.map((h) => {
      if (h.notes !== undefined) return h as Highlight;
      didMigrate = true;
      const notes: Note[] = [];
      if (h.note) {
        notes.push({ id: crypto.randomUUID(), text: h.note, timestamp: h.timestamp });
      }
      const { note, ...rest } = h;
      return { ...rest, notes } as Highlight;
    });
    return { migrated, didMigrate };
  }

  /**
   * Get all highlights, optionally filtered by URL
   */
  async getHighlights(url?: string): Promise<Highlight[]> {
    const raw: any[] = (await this.getFromStorage(STORAGE_KEYS.HIGHLIGHTS)) || [];
    const { migrated: highlights, didMigrate } = this.migrateHighlights(raw);

    if (didMigrate) {
      await this.setInStorage(STORAGE_KEYS.HIGHLIGHTS, highlights);
    }

    if (url) {
      return highlights.filter((h) => h.url === url);
    }

    return highlights;
  }

  /**
   * Get a single highlight by ID
   */
  async getHighlightById(id: string): Promise<Highlight | null> {
    const highlights = await this.getHighlights();
    return highlights.find((h) => h.id === id) || null;
  }

  /**
   * Update an existing highlight
   */
  async updateHighlight(id: string, updates: Partial<Highlight>): Promise<void> {
    const highlights = await this.getHighlights();
    const index = highlights.findIndex((h) => h.id === id);

    if (index !== -1) {
      highlights[index] = { ...highlights[index], ...updates };
      await this.setInStorage(STORAGE_KEYS.HIGHLIGHTS, highlights);
    }
  }

  /**
   * Delete a highlight by ID
   */
  async deleteHighlight(id: string): Promise<void> {
    const highlights = await this.getHighlights();
    const filtered = highlights.filter((h) => h.id !== id);
    await this.setInStorage(STORAGE_KEYS.HIGHLIGHTS, filtered);
  }

  /**
   * Delete all highlights for a specific URL
   */
  async deleteHighlightsByUrl(url: string): Promise<void> {
    const highlights = await this.getHighlights();
    const filtered = highlights.filter((h) => h.url !== url);
    await this.setInStorage(STORAGE_KEYS.HIGHLIGHTS, filtered);
  }

  /**
   * Add a note to a highlight
   */
  async addNoteToHighlight(highlightId: string, note: Note): Promise<void> {
    const highlights = await this.getHighlights();
    const index = highlights.findIndex((h) => h.id === highlightId);

    if (index !== -1) {
      highlights[index].notes.push(note);
      await this.setInStorage(STORAGE_KEYS.HIGHLIGHTS, highlights);
    }
  }

  /**
   * Update a note's text in a highlight
   */
  async updateNoteInHighlight(highlightId: string, noteId: string, text: string): Promise<void> {
    const highlights = await this.getHighlights();
    const index = highlights.findIndex((h) => h.id === highlightId);

    if (index !== -1) {
      const noteIndex = highlights[index].notes.findIndex((n) => n.id === noteId);
      if (noteIndex !== -1) {
        highlights[index].notes[noteIndex].text = text;
        await this.setInStorage(STORAGE_KEYS.HIGHLIGHTS, highlights);
      }
    }
  }

  /**
   * Delete a note from a highlight
   */
  async deleteNoteFromHighlight(highlightId: string, noteId: string): Promise<void> {
    const highlights = await this.getHighlights();
    const index = highlights.findIndex((h) => h.id === highlightId);

    if (index !== -1) {
      highlights[index].notes = highlights[index].notes.filter((n) => n.id !== noteId);
      await this.setInStorage(STORAGE_KEYS.HIGHLIGHTS, highlights);
    }
  }

  /**
   * Get user settings (uses browser.storage.sync for cross-device sync)
   */
  async getSettings(): Promise<Settings> {
    const savedSettings = (await this.getFromStorage(STORAGE_KEYS.SETTINGS)) || {};
    return { ...DEFAULT_SETTINGS, ...savedSettings };
  }

  /**
   * Update user settings
   */
  async updateSettings(updates: Partial<Settings>): Promise<void> {
    const currentSettings = await this.getSettings();
    const newSettings = { ...currentSettings, ...updates };
    await this.setInStorage(STORAGE_KEYS.SETTINGS, newSettings);
  }

  /**
   * Listen for changes to highlights
   */
  onHighlightsChanged(callback: (highlights: Highlight[]) => void): void {
    if (!this.isExtension) {
      console.warn('Storage change listeners are only available in extension context');
      return;
    }

    // Only available in extension context
    import('webextension-polyfill').then(({ default: browser }) => {
      browser.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes[STORAGE_KEYS.HIGHLIGHTS]) {
          const newValue = changes[STORAGE_KEYS.HIGHLIGHTS].newValue || [];
          callback(newValue);
        }
      });
    });
  }

  /**
   * Listen for changes to settings
   */
  onSettingsChanged(callback: (settings: Settings) => void): void {
    if (!this.isExtension) {
      console.warn('Storage change listeners are only available in extension context');
      return;
    }

    // Only available in extension context
    import('webextension-polyfill').then(({ default: browser }) => {
      browser.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync' && changes[STORAGE_KEYS.SETTINGS]) {
          const newValue = changes[STORAGE_KEYS.SETTINGS].newValue || DEFAULT_SETTINGS;
          callback(newValue);
        }
      });
    });
  }

  /**
   * Export all highlights as JSON
   */
  async exportHighlights(): Promise<string> {
    const highlights = await this.getHighlights();
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      highlights,
      metadata: {
        totalCount: highlights.length,
        pageCount: new Set(highlights.map((h) => h.url)).size,
      },
    };
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import highlights from JSON
   */
  async importHighlights(jsonString: string): Promise<void> {
    try {
      const data = JSON.parse(jsonString);
      if (data.highlights && Array.isArray(data.highlights)) {
        const existingHighlights = await this.getHighlights();
        const merged = [...existingHighlights, ...data.highlights];
        // Remove duplicates by ID
        const unique = merged.filter(
          (highlight, index, self) => index === self.findIndex((h) => h.id === highlight.id)
        );
        await this.setInStorage(STORAGE_KEYS.HIGHLIGHTS, unique);
      }
    } catch (error) {
      console.error('Failed to import highlights:', error);
      throw new Error('Invalid JSON format');
    }
  }

  /**
   * Clear all highlights (use with caution)
   */
  async clearAllHighlights(): Promise<void> {
    await this.setInStorage(STORAGE_KEYS.HIGHLIGHTS, []);
  }
}

// Export singleton instance
export const storageService = new StorageService();
