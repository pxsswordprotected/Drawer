import React, { useCallback, useEffect, useRef } from 'react';
import { Highlight } from '@/shared/types';
import { useDrawerStore } from '@/store/drawerStore';
import { TrashIcon } from '@/shared/TrashIcon';
import { NotesSection } from './Notes';
import styles from './HighlightItemExpandable.module.css';

interface HighlightItemExpandableProps {
  highlight: Highlight;
  index: number;
  isStaggering?: boolean;
  onScrollToItem: (index: number) => void;
  hideActions?: boolean;
  expandInstantly?: boolean;
  checkboxSlot?: React.ReactNode;
}

// memo + boolean selector: selecting a highlight re-renders only the rows whose
// expanded state changed, not every row in the list
export const HighlightItemExpandable = React.memo(function HighlightItemExpandable({
  highlight,
  index,
  isStaggering = false,
  onScrollToItem,
  hideActions = false,
  expandInstantly = false,
  checkboxSlot,
}: HighlightItemExpandableProps) {
  const isExpanded = useDrawerStore((s) => s.selectedHighlightId === highlight.id);
  const selectHighlight = useDrawerStore((s) => s.selectHighlight);
  const clearSelectedHighlight = useDrawerStore((s) => s.clearSelectedHighlight);
  const deleteHighlight = useDrawerStore((s) => s.deleteHighlight);

  // Track previous expanded state to detect switch-collapse (another highlight selected)
  const prevExpandedRef = useRef(isExpanded);
  useEffect(() => {
    prevExpandedRef.current = isExpanded;
  });
  // Only evaluated in the render where this row just collapsed. Reading the store here
  // (instead of subscribing) keeps other rows from re-rendering when selection
  // toggles between none and some. Collapses while the drawer is closed (deselect after
  // the exit animation) are instant too, so nothing animates on the next open.
  const isSwitchCollapse =
    prevExpandedRef.current &&
    !isExpanded &&
    (useDrawerStore.getState().selectedHighlightId != null || !useDrawerStore.getState().isOpen);

  const handleClick = useCallback(() => {
    if (isExpanded) {
      clearSelectedHighlight();
    } else {
      selectHighlight(highlight.id);
    }
    // Top edge stays in place for both expand and collapse — scroll immediately
    requestAnimationFrame(() => onScrollToItem(index));
  }, [isExpanded, clearSelectedHighlight, selectHighlight, highlight.id, onScrollToItem, index]);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      deleteHighlight(highlight.id);
    },
    [deleteHighlight, highlight.id]
  );

  const handleNotesClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const staggerDelay = 20 + index * 35; // matches STAGGER_BASE + index * STAGGER_PER_ITEM

  return (
    <div
      className={`${styles.expandableItem} ${isStaggering ? styles.staggerEntry : ''}`}
      data-expanded={isExpanded ? 'true' : 'false'}
      onClick={handleClick}
      style={isStaggering ? { animationDelay: `${staggerDelay}ms` } : undefined}
    >
      <div className={styles.highlightVisual} style={{ position: 'relative' }}>
        {checkboxSlot}
        <p
          className={`${isExpanded ? styles.highlightTextExpanded : styles.highlightText} text-text-main`}
        >
          {highlight.text}
        </p>
        {!hideActions && (
          <div className={styles.trashIcon}>
            <TrashIcon size={14} onClick={handleDelete} />
          </div>
        )}
      </div>

      <div
        className={
          isExpanded
            ? expandInstantly
              ? styles.notesOuterExpandedInstant
              : styles.notesOuterExpanded
            : isSwitchCollapse
              ? styles.notesOuterInstant
              : styles.notesOuter
        }
        aria-hidden={!isExpanded}
      >
        <div className={styles.notesInner} onClick={handleNotesClick}>
          <div className={`${isExpanded ? styles.notesFadeInActive : styles.notesFadeIn}`}>
            <NotesSection highlightId={highlight.id} notes={highlight.notes} />
          </div>
        </div>
      </div>
    </div>
  );
});
