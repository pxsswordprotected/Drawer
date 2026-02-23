import { useState, useEffect, useCallback, useRef } from 'react';
import { Highlight } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import { storageService } from '@/shared/storage';
import { useDrawerStore } from '@/store/drawerStore';

interface SelectionState {
  visible: boolean;
  x: number;
  y: number;
  selectedText: string;
}

export function useSelectionHandler() {
  const [selectionState, setSelectionState] = useState<SelectionState>({
    visible: false,
    x: 0,
    y: 0,
    selectedText: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle mouse up - fires once when selection is done
  const handleMouseUp = useCallback((event: MouseEvent) => {
    // Ignore if clicking on the plus icon itself (prevents re-showing after save)
    const target = event.target as HTMLElement;
    if (target.closest('[data-selection-plus-icon]')) {
      return;
    }

    // Small delay to let selection settle
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setSelectionState({ visible: false, x: 0, y: 0, selectedText: '' });
        return;
      }

      const selectedText = selection.toString().trim();

      // Hide icon if no text is selected
      if (!selectedText || selectedText.length === 0) {
        setSelectionState({ visible: false, x: 0, y: 0, selectedText: '' });
        return;
      }

      // Check if drawer is open and selection is inside the drawer
      const isOpen = useDrawerStore.getState().isOpen;
      if (isOpen) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;

        // Check if selection is inside drawer (look for parent with data-drawer attribute or specific class)
        if (element?.closest('[data-drawer]') || element?.closest('.fixed.bg-bg-main')) {
          setSelectionState({ visible: false, x: 0, y: 0, selectedText: '' });
          return;
        }
      }

      // Get the bounding rect of the selection
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Position the plus icon at the end of the selection (bottom-right)
      // Add screen edge check to prevent off-screen positioning
      const rawX = rect.right + 8; // 8px offset to the right
      const x = Math.min(rawX, window.innerWidth - 40); // Keep 40px from edge
      const y = rect.bottom - 12; // Slightly above bottom

      setSelectionState({
        visible: true,
        x,
        y,
        selectedText,
      });
    }, 10); // 10ms delay to let selection stabilize
  }, []);

  // Hide icon on scroll (prevents "ghost" icon floating in wrong position)
  const handleScroll = useCallback(() => {
    if (isSaved) return; // Don't dismiss checkmark animation on scroll
    if (selectionState.visible) {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      setIsSaving(false);
      setIsSaved(false);
      setIsDismissing(false);
      setSelectionState({ visible: false, x: 0, y: 0, selectedText: '' });
    }
  }, [selectionState.visible, isSaved]);

  // Save highlight when plus icon is clicked
  const handleSaveHighlight = useCallback(async () => {
    if (!selectionState.selectedText || isSaving) return;

    // Disable button immediately to prevent rapid clicks
    setIsSaving(true);

    const highlight: Highlight = {
      id: crypto.randomUUID(),
      text: selectionState.selectedText,
      url: window.location.href,
      pageTitle: document.title,
      notes: [],
      color: DEFAULT_SETTINGS.defaultColor,
      timestamp: Date.now(),
      position: {
        // Skip XPath tracking for v1 - just use empty values
        startXPath: '',
        endXPath: '',
        startOffset: 0,
        endOffset: 0,
        textContext: { before: '', after: '' },
      },
    };

    try {
      await storageService.saveHighlight(highlight);
      console.log('Highlight saved:', selectionState.selectedText.substring(0, 50) + '...');

      // Live-update drawer if it's open
      if (useDrawerStore.getState().isOpen) {
        useDrawerStore.getState().addHighlight(highlight);
      }

      // Clear the selection, trigger morph animation, then hide after 500ms
      window.getSelection()?.removeAllRanges();
      setIsSaved(true);

      hideTimeoutRef.current = setTimeout(() => {
        setIsDismissing(true);
        setTimeout(() => {
          setSelectionState({ visible: false, x: 0, y: 0, selectedText: '' });
          setIsSaving(false);
          setIsSaved(false);
          setIsDismissing(false);
          hideTimeoutRef.current = null;
        }, 150);
      }, 500);
    } catch (error) {
      console.error('Failed to save highlight:', error);
      setSelectionState({ visible: false, x: 0, y: 0, selectedText: '' });
      setIsSaving(false);
      setIsSaved(false);
    }
  }, [selectionState.selectedText, isSaving]);

  // Set up mouseup listener (fires once when selection is done)
  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseUp]);

  // Set up scroll listener to hide icon when user scrolls
  useEffect(() => {
    window.addEventListener('scroll', handleScroll, true); // Use capture to catch all scroll events

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [handleScroll]);

  return {
    selectionState,
    handleSaveHighlight,
    isSaving,
    isSaved,
    isDismissing,
  };
}
