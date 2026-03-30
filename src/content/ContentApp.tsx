import React, { useEffect, useRef } from 'react';
import { DraggableLogo } from '../components/DraggableLogo';
import { HighlightsDrawer } from '../components/HighlightsDrawer';
import { SelectionPlusIcon } from '../components/SelectionPlusIcon';
import { useSelectionHandler } from './useSelectionHandler';
import { useDrawerStore } from '@/store/drawerStore';
import { removeHighlightMarks } from './pageHighlighter';

export const ContentApp: React.FC = () => {
  const { selectionState, handleSaveHighlight, isSaving, isSaved, isDismissing } =
    useSelectionHandler();

  // React layer for mark cleanup: detect deleted highlights and remove their marks
  const allHighlights = useDrawerStore((s) => s.allHighlights);
  const prevIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(allHighlights.map((h) => h.id));
    for (const id of prevIdsRef.current) {
      if (!currentIds.has(id)) {
        removeHighlightMarks(id);
      }
    }
    prevIdsRef.current = currentIds;
  }, [allHighlights]);

  return (
    <>
      <DraggableLogo />
      <HighlightsDrawer />
      <SelectionPlusIcon
        visible={selectionState.visible}
        x={selectionState.x}
        y={selectionState.y}
        onClick={handleSaveHighlight}
        disabled={isSaving}
        isSuccess={isSaved}
        isDismissing={isDismissing}
      />
    </>
  );
};
