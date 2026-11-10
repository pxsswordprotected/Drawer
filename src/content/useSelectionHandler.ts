import { useState, useEffect, useCallback } from 'react';
import { Highlight } from '@/shared/types';
import { storageService } from '@/shared/storage';
import { useDrawerStore } from '@/store/drawerStore';
import { applyHighlightToRange } from './pageHighlighter';
import { describeRange } from './anchoring';

interface SelectionState {
  visible: boolean;
  x: number;
  y: number;
  selectedText: string;
}

// Single shared object: setting it while already hidden is an Object.is no-op, so
// ordinary clicks on the host page don't re-render the app tree.
const HIDDEN_SELECTION: SelectionState = Object.freeze({
  visible: false,
  x: 0,
  y: 0,
  selectedText: '',
});

export function useSelectionHandler() {
  const [selectionState, setSelectionState] = useState<SelectionState>(HIDDEN_SELECTION);
  const defaultColor = useDrawerStore((state) => state.defaultColor);
  const [isSaving, setIsSaving] = useState(false);

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
        setSelectionState(HIDDEN_SELECTION);
        return;
      }

      const selectedText = selection.toString().trim();

      // Hide icon if no text is selected
      if (!selectedText || selectedText.length === 0) {
        setSelectionState(HIDDEN_SELECTION);
        return;
      }

      // Hide icon if the selection is entirely inside one existing highlight (its marks
      // cover contiguous text, so matching start and end means nothing new is selected)
      const selRange = selection.getRangeAt(0);
      const highlightIdAt = (node: Node) =>
        (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)
          ?.closest('mark[data-highlight-id]')
          ?.getAttribute('data-highlight-id');
      const startHighlightId = highlightIdAt(selRange.startContainer);
      if (startHighlightId && startHighlightId === highlightIdAt(selRange.endContainer)) {
        setSelectionState(HIDDEN_SELECTION);
        return;
      }

      // Check if drawer is open and selection is inside the drawer
      const isOpen = useDrawerStore.getState().isOpen;
      if (isOpen) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const element =
          container.nodeType === Node.ELEMENT_NODE
            ? (container as Element)
            : container.parentElement;

        // Ignore selections inside the drawer
        if (element?.closest('[data-drawer]')) {
          setSelectionState(HIDDEN_SELECTION);
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
    if (selectionState.visible) {
      setIsSaving(false);
      setSelectionState(HIDDEN_SELECTION);
    }
  }, [selectionState.visible]);

  // Save highlight when plus icon is clicked
  const handleSaveHighlight = useCallback(async () => {
    if (!selectionState.selectedText || isSaving) return;

    // Disable button immediately to prevent rapid clicks
    setIsSaving(true);

    // Capture the live range before marks split its text nodes or the selection clears
    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    const highlight: Highlight = {
      id: crypto.randomUUID(),
      text: selectionState.selectedText,
      url: window.location.href,
      pageTitle: document.title,
      notes: [],
      color: defaultColor,
      timestamp: Date.now(),
      position: range
        ? describeRange(range, document.body)
        : {
            startXPath: '',
            endXPath: '',
            startOffset: 0,
            endOffset: 0,
            textContext: { before: '', after: '' },
          },
    };

    try {
      // Wrap selected text in <mark> elements on the page
      if (range) {
        applyHighlightToRange(range, highlight.id, highlight.color);
      }

      await storageService.saveHighlight(highlight);

      // Live-update drawer if it's open
      if (useDrawerStore.getState().isOpen) {
        useDrawerStore.getState().addHighlight(highlight);
      }

      // Clear the selection and hide the plus icon
      window.getSelection()?.removeAllRanges();
      setSelectionState(HIDDEN_SELECTION);
      setIsSaving(false);
    } catch (error) {
      console.error('Failed to save highlight:', error);
      setSelectionState(HIDDEN_SELECTION);
      setIsSaving(false);
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
  };
}
