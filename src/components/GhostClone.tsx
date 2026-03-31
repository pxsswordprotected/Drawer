import React, { useEffect, useRef, useCallback } from 'react';
import { useDrawerStore } from '@/store/drawerStore';
import { ghostNodeRef, pointerPosRef } from '@/shared/ghostRef';
import styles from './GhostClone.module.css';

const LOGO_DROP_ZONE_PADDING = 60;

export const GhostClone: React.FC = () => {
  const draggedItem = useDrawerStore((s) => s.draggedItem);
  const dropPhase = useDrawerStore((s) => s.dropPhase);

  console.log('👻 GhostClone Render Pass. DraggedItem:', draggedItem?.id, '| Phase:', dropPhase);

  if (!draggedItem) return null;

  return <GhostCloneInner key={draggedItem.id} />;
};

const GhostCloneInner: React.FC = () => {
  const draggedItem = useDrawerStore((s) => s.draggedItem)!;
  const dropPhase = useDrawerStore((s) => s.dropPhase);
  const setTrashActive = useDrawerStore((s) => s.setTrashActive);
  const clearDrag = useDrawerStore((s) => s.clearDrag);
  const deleteHighlight = useDrawerStore((s) => s.deleteHighlight);
  const deleteNote = useDrawerStore((s) => s.deleteNote);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const wasTrashActiveRef = useRef(false);

  // Grab offset: pointer position relative to element's top-left at activation
  const grabOffsetRef = useRef({ x: 0, y: 0 });

  // Mount: append cloned node, compute grab offset, start rAF loop
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const clone = ghostNodeRef.current;
    if (!wrapper || !clone) return;

    wrapper.appendChild(clone);

    // Grab offset = initial pointer pos - element origin
    grabOffsetRef.current = {
      x: pointerPosRef.current.x - draggedItem.rect.left,
      y: pointerPosRef.current.y - draggedItem.rect.top,
    };

    const loop = () => {
      const px = pointerPosRef.current.x;
      const py = pointerPosRef.current.y;
      console.log('🔄 rAF LOOP TICK. Pointer:', px, py);
      const dx = px - draggedItem.rect.left - grabOffsetRef.current.x;
      const dy = py - draggedItem.rect.top - grabOffsetRef.current.y;

      wrapper.style.transform = `translate(${dx}px, ${dy}px)`;

      // Intersection check against logo drop zone
      const logoPosition = useDrawerStore.getState().logoPosition;
      if (logoPosition) {
        const halfSize = 22; // LOGO_SIZE / 2
        const pad = LOGO_DROP_ZONE_PADDING;
        const inZone =
          px >= logoPosition.x - halfSize - pad &&
          px <= logoPosition.x + halfSize + pad &&
          py >= logoPosition.y - halfSize - pad &&
          py <= logoPosition.y + halfSize + pad;

        if (inZone !== wasTrashActiveRef.current) {
          wasTrashActiveRef.current = inZone;
          setTrashActive(inZone);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (clone && clone.parentNode) {
        clone.parentNode.removeChild(clone);
      }

      // Only wipe the memory if the drag is actually over.
      // Strict Mode's fake unmount will skip this. A real unmount will execute it.
      if (!useDrawerStore.getState().draggedItem) {
        ghostNodeRef.current = null;
      }
    };
  }, []); // Only on mount

  // React to dropPhase changes
  const handleTransitionEnd = useCallback(() => {
    const { draggedItem: item, dropPhase: phase } = useDrawerStore.getState();
    if (!item) return;

    if (phase === 'deleting') {
      if (item.type === 'highlight') {
        deleteHighlight(item.id);
      } else if (item.type === 'note' && item.parentHighlightId) {
        deleteNote(item.parentHighlightId, item.id);
      }
      // TODO: page group delete
    }

    clearDrag();
  }, [deleteHighlight, deleteNote, clearDrag]);

  useEffect(() => {
    if (dropPhase !== 'deleting' && dropPhase !== 'cancelling') return;

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Stop the rAF loop
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // Use rAF to ensure the browser has painted the current transform
    // before we add the transition class + new transform target.
    // Without this, the browser may batch them into one frame and skip the animation.
    requestAnimationFrame(() => {
      wrapper.classList.add(styles.ghostTransition);

      if (dropPhase === 'deleting') {
        // Animate toward logo center
        const logoPosition = useDrawerStore.getState().logoPosition;
        if (logoPosition) {
          const targetX = logoPosition.x - draggedItem.rect.width / 2 - draggedItem.rect.left;
          const targetY = logoPosition.y - draggedItem.rect.height / 2 - draggedItem.rect.top;
          wrapper.style.transform = `translate(${targetX}px, ${targetY}px) scale(0.3)`;
        } else {
          wrapper.style.transform = `scale(0)`;
        }
        wrapper.classList.add(styles.ghostDeleting);
      } else {
        // Snap back to origin
        wrapper.style.transform = 'translate(0px, 0px)';
        wrapper.classList.add(styles.ghostCancelling);
      }

      wrapper.addEventListener('transitionend', handleTransitionEnd, { once: true });
    });

    // Safety fallback — if transitionend doesn't fire (e.g. reduced motion)
    const fallbackTimer = setTimeout(handleTransitionEnd, 400);

    return () => {
      clearTimeout(fallbackTimer);
      wrapper.removeEventListener('transitionend', handleTransitionEnd);
    };
  }, [dropPhase, draggedItem.rect, handleTransitionEnd]);

  return (
    <div
      ref={wrapperRef}
      className={styles.ghostWrapper}
      style={{
        top: draggedItem.rect.top,
        left: draggedItem.rect.left,
        width: draggedItem.rect.width,
      }}
    />
  );
};
