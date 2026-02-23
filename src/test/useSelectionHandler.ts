import { useState, useEffect, useCallback, useRef } from 'react';
import { Highlight, Note } from '@/shared/types';
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
  const hasSeeded = useRef(false);

  // Seed a test highlight with 3 notes on first load
  useEffect(() => {
    if (hasSeeded.current) return;
    hasSeeded.current = true;

    const seedTestData = async () => {
      const existing = await storageService.getHighlights(window.location.href);
      if (existing.length > 0) return; // Don't seed if highlights already exist

      const emptyPos = {
        startXPath: '',
        endXPath: '',
        startOffset: 0,
        endOffset: 0,
        textContext: { before: '', after: '' },
      };

      const testNotes: Note[] = [
        {
          id: crypto.randomUUID(),
          text: 'How do I become more embodied as a nerd?',
          timestamp: Date.now() - 60000,
        },
        {
          id: crypto.randomUUID(),
          text: 'The deepest limitation though: all of these are still me generating the "other perspective" from my own weights. It\'s like asking one person to play both...',
          timestamp: Date.now() - 30000,
        },
        {
          id: crypto.randomUUID(),
          text: 'What does embodied entail in this context? I think there\'s something about physical awareness, proprioception, and the felt sense of being in a body that goes beyond intellectual understanding. The author seems to suggest that nerds tend to live primarily in their heads, disconnected from somatic experience, and that this disconnection prevents the kind of open, responsive engagement that vibing requires. This connects to Alexander\'s concept of unfolding — you can\'t unfold if you\'re not in touch with what your body is telling you about the current moment.',
          timestamp: Date.now(),
        },
      ];

      // Current page highlight
      const testHighlight: Highlight = {
        id: crypto.randomUUID(),
        text: 'Being open to your own body, being embodied, is a precondition for vibing. Which is why nerds can\'t vibe.',
        url: window.location.href,
        pageTitle: document.title,
        notes: testNotes,
        color: DEFAULT_SETTINGS.defaultColor,
        timestamp: new Date(2026, 1, 2, 13, 34).getTime(),
        position: emptyPos,
      };

      // Other page highlights
      const otherPageHighlights: Highlight[] = [
        {
          id: crypto.randomUUID(),
          text: 'The best interface is one that disappears entirely, letting the user interact directly with the content they care about.',
          url: 'https://rauno.me/craft/interaction-design',
          pageTitle: 'Interaction Design — Rauno Freiberg',
          notes: [{
            id: crypto.randomUUID(),
            text: 'This is the invisible design principle — when done well, nobody notices.',
            timestamp: Date.now() - 200000,
          }],
          color: DEFAULT_SETTINGS.defaultColor,
          timestamp: new Date(2026, 1, 18, 10, 15).getTime(),
          position: emptyPos,
        },
        {
          id: crypto.randomUUID(),
          text: 'Spring animations are the only physically accurate model for interactive motion. They respond to velocity, they never feel wrong.',
          url: 'https://rauno.me/craft/interaction-design',
          pageTitle: 'Interaction Design — Rauno Freiberg',
          notes: [],
          color: '#4CAF50',
          timestamp: new Date(2026, 1, 18, 10, 22).getTime(),
          position: emptyPos,
        },
        {
          id: crypto.randomUUID(),
          text: 'You can\'t think your way to good writing. You can only write your way to good thinking.',
          url: 'https://paulgraham.com/words.html',
          pageTitle: 'Putting Ideas Into Words — Paul Graham',
          notes: [{
            id: crypto.randomUUID(),
            text: 'Writing as a forcing function for clarity. Same applies to code.',
            timestamp: Date.now() - 500000,
          }, {
            id: crypto.randomUUID(),
            text: 'This is why journaling works even when nobody reads it.',
            timestamp: Date.now() - 490000,
          }],
          color: DEFAULT_SETTINGS.defaultColor,
          timestamp: new Date(2026, 1, 15, 22, 8).getTime(),
          position: emptyPos,
        },
        {
          id: crypto.randomUUID(),
          text: 'The most dangerous kind of waste is the waste we don\'t recognize.',
          url: 'https://paulgraham.com/words.html',
          pageTitle: 'Putting Ideas Into Words — Paul Graham',
          notes: [],
          color: '#E91E63',
          timestamp: new Date(2026, 1, 15, 22, 14).getTime(),
          position: emptyPos,
        },
        {
          id: crypto.randomUUID(),
          text: 'Attention is not a resource to be spent but a way of relating to the world. When we treat it as currency, we lose the ability to be genuinely present.',
          url: 'https://www.robinsloan.com/lab/attention/',
          pageTitle: 'Attention is not a resource — Robin Sloan',
          notes: [{
            id: crypto.randomUUID(),
            text: 'Reframing attention from economic metaphor to phenomenological stance.',
            timestamp: Date.now() - 300000,
          }],
          color: '#9C27B0',
          timestamp: new Date(2026, 1, 10, 16, 45).getTime(),
          position: emptyPos,
        },
        {
          id: crypto.randomUUID(),
          text: 'Software should be warm to the touch. It should feel like it was made by a person who cared, not a committee that compromised.',
          url: 'https://medium.com/example/warm-software',
          pageTitle: 'On Warm Software — Andy Matuschak',
          notes: [],
          color: DEFAULT_SETTINGS.defaultColor,
          timestamp: new Date(2026, 1, 5, 9, 30).getTime(),
          position: emptyPos,
        },
      ];

      await storageService.saveHighlight(testHighlight);
      for (const h of otherPageHighlights) {
        await storageService.saveHighlight(h);
      }
    };

    seedTestData();
  }, []);

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
