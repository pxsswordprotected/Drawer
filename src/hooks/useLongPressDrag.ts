import { useCallback, useRef } from 'react';
import { useDrawerStore, DragItemType } from '@/store/drawerStore';
import { ghostNodeRef, pointerPosRef } from '@/shared/ghostRef';

const HOLD_DURATION = 10;

interface UseLongPressDragConfig {
  id: string;
  type: DragItemType;
  parentHighlightId?: string;
}

export function useLongPressDrag(config: UseLongPressDragConfig) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const itemRef = useRef<HTMLElement | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      console.log('🛑 1. pointerdown FIRED. Timer starting.');

      const el = e.currentTarget;
      const pointerId = e.pointerId;
      const clientX = e.clientX;
      const clientY = e.clientY;

      itemRef.current = el;
      pointerIdRef.current = pointerId;
      startPosRef.current = { x: clientX, y: clientY };

      // Capture immediately — browsers require this synchronously during a pointer event
      el.setPointerCapture(pointerId);

      timerRef.current = setTimeout(() => {
        console.log('✅ 2. 300ms timer COMPLETED. Activating drag mode!');
        timerRef.current = null;

        const rect = el.getBoundingClientRect();
        const clone = el.cloneNode(true) as HTMLElement;
        ghostNodeRef.current = clone;

        pointerPosRef.current = { x: clientX, y: clientY };
        isDraggingRef.current = true;

        useDrawerStore.getState().setDraggedItem({
          id: config.id,
          type: config.type,
          rect,
          parentHighlightId: config.parentHighlightId,
        });

        // Lock touch scrolling only after drag is confirmed
        el.style.touchAction = 'none';
      }, HOLD_DURATION);
    },
    [config.id, config.type, config.parentHighlightId]
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (timerRef.current !== null) {
      const dx = Math.abs(e.clientX - startPosRef.current.x);
      const dy = Math.abs(e.clientY - startPosRef.current.y);

      console.log(`🏃 3a. pointermove (pre-drag). Moved: dx=${dx}, dy=${dy}`);

      if (dy > 15 || dx > 15) {
        console.log('❌ 3b. Timer CANCELLED. Movement exceeded 15px threshold.');
        clearTimeout(timerRef.current);
        timerRef.current = null;

        // Release capture so the browser can scroll natively
        const el = e.currentTarget;
        if (el.hasPointerCapture(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
      }
      return;
    }

    if (isDraggingRef.current) {
      console.log('🛸 3c. DRAGGING! Coords updating:', e.clientX, e.clientY);
      pointerPosRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const onPointerUp = useCallback(() => {
    console.log('👆 5. pointerup FIRED.');

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isDraggingRef.current) {
      isDraggingRef.current = false;

      if (itemRef.current && pointerIdRef.current !== null) {
        try {
          itemRef.current.releasePointerCapture(pointerIdRef.current);
        } catch {
          // Already released
        }
        itemRef.current.style.touchAction = '';
      }

      const { isTrashActive, setDropPhase } = useDrawerStore.getState();
      setDropPhase(isTrashActive ? 'deleting' : 'cancelling');
    }

    pointerIdRef.current = null;
  }, []);

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    console.log('🚨 4. pointercancel FIRED. The browser hijacked the event!');

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      useDrawerStore.getState().clearDrag();

      const el = e.currentTarget as HTMLElement;
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
      el.style.touchAction = '';
    }

    pointerIdRef.current = null;
  }, []);

  return {
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onDragStart: (e: React.DragEvent) => e.preventDefault(),
    },
  };
}
