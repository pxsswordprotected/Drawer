import React, { useCallback, useMemo } from 'react';
import { Highlight } from '@/shared/types';
import { useDrawerStore } from '@/store/drawerStore';
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
  const isExpanded = selectedHighlightId === highlight.id;

  const sortedNotes = useMemo(
    () => [...highlight.notes].sort((a, b) => b.timestamp - a.timestamp),
    [highlight.notes]
  );

  const handleClick = useCallback(() => {
    if (isExpanded) {
      clearSelectedHighlight();
      requestAnimationFrame(() => onScrollToItem(index));
    } else {
      selectHighlight(highlight.id);
      requestAnimationFrame(() => onScrollToItem(index));
    }
  }, [isExpanded, clearSelectedHighlight, selectHighlight, highlight.id, onScrollToItem, index]);

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

  const staggerDelay = 20 + index * 35;

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
      </div>

      <div
        className={isExpanded ? styles.notesOuterExpanded : styles.notesOuter}
        aria-hidden={!isExpanded}
      >
        <div className={styles.notesInner} onClick={handleNotesClick}>
          <div className={isExpanded ? styles.notesFadeInActive : styles.notesFadeIn}>
            <p className="text-text-secondary text-xs mb-1" style={{ marginTop: '12px' }}>
              Notes
            </p>

            <div className="space-y-0 [&>:last-child]:pb-0">
              <div className="py-3">
                <NoteInput
                  highlightId={highlight.id}
                  hasNotes={sortedNotes.length > 0}
                  onNoteAdded={() => {}}
                />
              </div>

              {sortedNotes.length > 0 && <div className="border-t border-divider" />}

              {sortedNotes.map((note, i) => (
                <React.Fragment key={note.id}>
                  <div className="py-3">
                    <NoteItem noteId={note.id} highlightId={highlight.id} text={note.text} />
                  </div>
                  {i < sortedNotes.length - 1 && <div className="border-t border-divider" />}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
