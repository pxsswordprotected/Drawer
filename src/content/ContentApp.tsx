import React from 'react';
import { DraggableLogo } from '../components/DraggableLogo';
import { HighlightsDrawer } from '../components/HighlightsDrawer';
import { SelectionPlusIcon } from '../components/SelectionPlusIcon';
import { useSelectionHandler } from './useSelectionHandler';

export const ContentApp: React.FC = () => {
  const { selectionState, handleSaveHighlight, isSaving, isSaved, isDismissing } = useSelectionHandler();

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
