import React, { useEffect, useRef } from 'react';
import { DraggableLogo } from '../components/DraggableLogo';
import { HighlightsDrawer } from '../components/HighlightsDrawer';
import { HighlightTooltip } from '../components/HighlightTooltip';
import { SelectionPlusIcon } from '../components/SelectionPlusIcon';
import { useSelectionHandler } from './useSelectionHandler';
import { useDrawerStore } from '@/store/drawerStore';
import { recolorHighlightMarks, removeHighlightMarks, restoreHighlights } from './pageHighlighter';

export const ContentApp: React.FC = () => {
  const { selectionState, handleSaveHighlight, isSaving } = useSelectionHandler();

  // React layer for page marks: restore saved highlights on load, remove marks of deleted ones
  const allHighlights = useDrawerStore((s) => s.allHighlights);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const prevColorsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const currentIds = new Set(allHighlights.map((h) => h.id));
    for (const id of prevIdsRef.current) {
      if (!currentIds.has(id)) {
        removeHighlightMarks(id);
      }
    }
    prevIdsRef.current = currentIds;
    const prevColors = prevColorsRef.current;
    for (const h of allHighlights) {
      const before = prevColors.get(h.id);
      if (before !== undefined && before !== h.color) recolorHighlightMarks(h.id, h.color);
    }
    prevColorsRef.current = new Map(allHighlights.map((h) => [h.id, h.color]));
    restoreHighlights(allHighlights);
  }, [allHighlights]);

  return (
    <>
      <DraggableLogo />
      <HighlightsDrawer />
      <HighlightTooltip />
      <SelectionPlusIcon
        visible={selectionState.visible}
        x={selectionState.x}
        y={selectionState.y}
        onClick={handleSaveHighlight}
        disabled={isSaving}
      />
    </>
  );
};
