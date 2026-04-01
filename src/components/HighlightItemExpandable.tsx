import React, { useCallback, useMemo } from 'react';
import { Highlight } from '@/shared/types';
import { useDrawerStore } from '@/store/drawerStore';
import { TrashIcon } from '@/shared/TrashIcon';
import { NoteInput, NoteItem } from './HighlightDetailView';
import styles from './HighlightItemExpandable.module.css';

interface HighlightItemExpandableProps {
  highlight: Highlight;
  index: number;
  isStaggering?: boolean;
  onStaggerEnd?: () => void;
  onScrollToItem: (index: number) => void;
}

export const HighlightItemExpandable: React.FC<HighlightItemExpandableProps> = ({
  highlight,
  index,
  isStaggering = false,
  onStaggerEnd,
  onScrollToItem,
}) => {
  const selectedHighlightId = useDrawerStore((s) => s.selectedHighlightId);
  const selectHighlight = useDrawerStore((s) => s.selectHighlight);
  const clearSelectedHighlight = useDrawerStore((s) => s.clearSelectedHighlight);
  const deleteHighlight = useDrawerStore((s) => s.deleteHighlight);
  const isExpanded = selectedHighlightId === highlight.id;

  const sortedNotes = useMemo(
    () => [...highlight.notes].sort((a, b) => b.timestamp - a.timestamp),
    [highlight.notes]
  );

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

  const handleAnimationEnd = useCallback(
    (e: React.AnimationEvent) => {
      if (e.animationName === 'itemStaggerEnter') {
        onStaggerEnd?.();
      }
    },
    [onStaggerEnd]
  );

  const staggerDelay = 20 + index * 35; // matches STAGGER_BASE + index * STAGGER_PER_ITEM

  return (
    <div
      className={`${styles.expandableItem} ${isStaggering ? styles.staggerEntry : ''}`}
      data-expanded={isExpanded ? 'true' : 'false'}
      onClick={handleClick}
      onAnimationEnd={isStaggering ? handleAnimationEnd : undefined}
      style={isStaggering ? { animationDelay: `${staggerDelay}ms` } : undefined}
    >
      <div className={styles.highlightVisual}>
        <p
          className={`${isExpanded ? styles.highlightTextExpanded : styles.highlightText} text-text-main`}
        >
          {highlight.text}
        </p>
        <div className={styles.trashIcon}>
          <TrashIcon size={14} className="text-text-secondary" onClick={handleDelete} />
        </div>
      </div>

      <div
        className={isExpanded ? styles.notesOuterExpanded : styles.notesOuter}
        aria-hidden={!isExpanded}
      >
        <div className={styles.notesInner} onClick={handleNotesClick}>
          <div className={`${isExpanded ? styles.notesFadeInActive : styles.notesFadeIn}`}>
            <p className="text-text-secondary text-xs mb-1" style={{ marginTop: '12px' }}>
              Notes
            </p>

            <div className="space-y-0">
              <div className="py-3 flex items-center">
                <NoteInput
                  highlightId={highlight.id}
                  hasNotes={sortedNotes.length > 0}
                  onNoteAdded={() => {}}
                />
              </div>

              {sortedNotes.length > 0 && <div className="border-t border-divider" />}

              {sortedNotes.map((note, i) => (
                <div key={note.id} className={`py-3 flex items-center ${i < sortedNotes.length - 1 ? 'border-b border-divider' : ''}`}>
                  <NoteItem noteId={note.id} highlightId={highlight.id} text={note.text} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
