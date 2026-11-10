import { useState, useEffect, useCallback, useRef } from 'react';
import { Highlight } from '@/shared/types';
import { storageService } from '@/shared/storage';
import { debugLog, describeRangeEnds, errorInfo, excerpt, snippetOf } from '@/shared/debugLog';
import { useDrawerStore } from '@/store/drawerStore';
import { applyHighlightToRange, trackHighlight } from './pageHighlighter';
import { describeRange, trimRangeToText } from './anchoring';

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
  // Click count (1 drag/click, 2 double, 3 triple) of the press that made the selection
  const clickCountRef = useRef(0);

  // Handle mouse up - fires once when selection is done
  const handleMouseUp = useCallback((event: MouseEvent) => {
    // Ignore if clicking on the plus icon itself (prevents re-showing after save)
    const target = event.target as HTMLElement;
    if (target.closest('[data-selection-plus-icon]')) {
      return;
    }
    clickCountRef.current = event.detail;

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
      // cover contiguous text, so matching start and end means nothing new is selected).
      // The range is trimmed to its visible text first, so a triple-click's overshoot into
      // the next block can't misplace the plus icon or defeat this check.
      const rawRange = selection.getRangeAt(0);
      const selRange = trimRangeToText(rawRange) ?? rawRange;
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
      const rect = selRange.getBoundingClientRect();

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

    // Capture the live range before marks split its text nodes or the selection clears.
    // Trim it to the visible text: triple-click ranges end at the start of the next block.
    const selection = window.getSelection();
    const rawRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const range = rawRange ? trimRangeToText(rawRange) : null;
    const rawEnds = __DRAWER_DEBUG__ && rawRange ? describeRangeEnds(rawRange) : null;
    // Read before marks are inserted, which split the nodes the range points at
    const wasTrimmed =
      __DRAWER_DEBUG__ &&
      !!rawRange &&
      !!range &&
      (rawRange.startContainer !== range.startContainer ||
        rawRange.startOffset !== range.startOffset ||
        rawRange.endContainer !== range.endContainer ||
        rawRange.endOffset !== range.endOffset);

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

    // The common ancestor survives mark insertion; used for the debug snippet on failure
    const ancestor = range?.commonAncestorContainer ?? null;

    try {
      // Wrap selected text in <mark> elements on the page
      let skippedWhitespaceNodes = 0;
      if (range) {
        skippedWhitespaceNodes = applyHighlightToRange(range, highlight.id, highlight.color);
      }

      await storageService.saveHighlight(highlight);
      // Keep it marked if the host page rebuilds its DOM (see restoreHighlights)
      trackHighlight(highlight);

      if (__DRAWER_DEBUG__) {
        const markCount = document.querySelectorAll(`mark[data-highlight-id="${highlight.id}"]`).length;
        debugLog('highlight.save', {
          id: highlight.id,
          text: excerpt(highlight.text),
          length: highlight.text.length,
          hadRange: !!range,
          markCount,
          skippedWhitespaceNodes,
          clickCount: clickCountRef.current,
          trimmed: wasTrimmed,
          rawRange: rawEnds,
          position: {
            hasXPath: !!highlight.position.startXPath,
            hasBlock: !!highlight.position.block,
            at: highlight.position.at,
            path: highlight.position.path,
            twins: highlight.position.twins,
          },
          ...(markCount === 0 ? { snippet: snippetOf(ancestor) } : {}),
        });
      }

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
      if (__DRAWER_DEBUG__) {
        debugLog('highlight.saveError', { ...errorInfo(error), snippet: snippetOf(ancestor) });
      }
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
