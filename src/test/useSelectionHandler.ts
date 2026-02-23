import { useEffect, useRef } from 'react';
import { Highlight, Note } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import { storageService } from '@/shared/storage';
import { useSelectionHandler as useSelectionHandlerCore } from '@/content/useSelectionHandler';

export function useSelectionHandler() {
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

  return useSelectionHandlerCore();
}
