// Storage abstraction layer for browser.storage operations
// This enables seamless migration to database backend in the future

import browser from 'webextension-polyfill';
import { Highlight, Settings } from './types';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants';

export class StorageService {
  /**
   * Save a new highlight to storage
   */
  async saveHighlight(highlight: Highlight): Promise<void> {
    const highlights = await this.getHighlights();
    highlights.push(highlight);
    await browser.storage.local.set({ [STORAGE_KEYS.HIGHLIGHTS]: highlights });
  }

  /**
   * Get all highlights, optionally filtered by URL
   */
  async getHighlights(url?: string): Promise<Highlight[]> {
    const result = await browser.storage.local.get(STORAGE_KEYS.HIGHLIGHTS);
    const highlights: Highlight[] = result[STORAGE_KEYS.HIGHLIGHTS] || [];

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
      await browser.storage.local.set({ [STORAGE_KEYS.HIGHLIGHTS]: highlights });
    }
  }

  /**
   * Delete a highlight by ID
   */
  async deleteHighlight(id: string): Promise<void> {
    const highlights = await this.getHighlights();
    const filtered = highlights.filter((h) => h.id !== id);
    await browser.storage.local.set({ [STORAGE_KEYS.HIGHLIGHTS]: filtered });
  }

  /**
   * Delete all highlights for a specific URL
   */
  async deleteHighlightsByUrl(url: string): Promise<void> {
    const highlights = await this.getHighlights();
    const filtered = highlights.filter((h) => h.url !== url);
    await browser.storage.local.set({ [STORAGE_KEYS.HIGHLIGHTS]: filtered });
  }

  /**
   * Get user settings (uses browser.storage.sync for cross-device sync)
   */
  async getSettings(): Promise<Settings> {
    const result = await browser.storage.sync.get(STORAGE_KEYS.SETTINGS);
    const savedSettings = result[STORAGE_KEYS.SETTINGS] || {};
    return { ...DEFAULT_SETTINGS, ...savedSettings };
  }

  /**
   * Update user settings
   */
  async updateSettings(updates: Partial<Settings>): Promise<void> {
    const currentSettings = await this.getSettings();
    const newSettings = { ...currentSettings, ...updates };
    await browser.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: newSettings });
  }

  /**
   * Listen for changes to highlights
   */
  onHighlightsChanged(callback: (highlights: Highlight[]) => void): void {
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes[STORAGE_KEYS.HIGHLIGHTS]) {
        const newValue = changes[STORAGE_KEYS.HIGHLIGHTS].newValue || [];
        callback(newValue);
      }
    });
  }

  /**
   * Listen for changes to settings
   */
  onSettingsChanged(callback: (settings: Settings) => void): void {
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes[STORAGE_KEYS.SETTINGS]) {
        const newValue = changes[STORAGE_KEYS.SETTINGS].newValue || DEFAULT_SETTINGS;
        callback(newValue);
      }
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
        await browser.storage.local.set({ [STORAGE_KEYS.HIGHLIGHTS]: unique });
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
    await browser.storage.local.set({ [STORAGE_KEYS.HIGHLIGHTS]: [] });
  }
}

// Export singleton instance
export const storageService = new StorageService();
