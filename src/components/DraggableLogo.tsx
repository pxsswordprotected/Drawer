import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import type { DraggableData, DraggableEvent } from 'react-draggable';
import { GalleryVerticalEnd } from 'lucide-react';
import { useDrawerStore } from '@/store/drawerStore';
import { DRAWER_CONFIG } from '@/shared/constants';
import { getDrawerElement, getDrawerLayout } from '@/shared/drawerDom';
import styles from './DraggableLogo.module.css';

const Draggable = lazy(() => import('react-draggable'));

const EDGE_MARGIN = DRAWER_CONFIG.EDGE_MARGIN;
const LOGO_SIZE = 44;

type Pos = { x: number; y: number };
type Bounds = { left: number; top: number; right: number; bottom: number };

const getBounds = (): Bounds => ({
  left: EDGE_MARGIN,
  top: EDGE_MARGIN,
  right: window.innerWidth - EDGE_MARGIN - LOGO_SIZE,
  bottom: window.innerHeight - EDGE_MARGIN - LOGO_SIZE,
});

const clampPos = (pos: Pos, b: Bounds): Pos => ({
  x: Math.max(b.left, Math.min(pos.x, b.right)),
  y: Math.max(b.top, Math.min(pos.y, b.bottom)),
});

const getInitialPosition = (): Pos => ({
  x: window.innerWidth - EDGE_MARGIN - LOGO_SIZE,
  y: window.innerHeight - EDGE_MARGIN - LOGO_SIZE,
});

export const DraggableLogo: React.FC = () => {
  const [position, setPosition] = useState<Pos>(getInitialPosition);
  const [bounds, setBounds] = useState<Bounds>(getBounds);

  const logoRef = useRef<HTMLDivElement>(null);
  const wasDragged = useRef(false);
  const latestCenterRef = useRef<Pos>({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  const toggleDrawer = useDrawerStore((state) => state.toggleDrawer);
  const closeDrawer = useDrawerStore((state) => state.closeDrawer);
  const setLogoPosition = useDrawerStore((state) => state.setLogoPosition);
  const isOpen = useDrawerStore((state) => state.isOpen);

  useEffect(() => {
    const onResize = () => {
      const nextBounds = getBounds();
      setBounds(nextBounds);
      setPosition((prev) => clampPos(prev, nextBounds));
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const scheduleDrawerWrite = () => {
    if (rafRef.current != null) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;

      const drawer = getDrawerElement();
      const layout = getDrawerLayout();
      if (!drawer || !layout) return;

      const { x: cx, y: cy } = latestCenterRef.current;
      const { width, height, offset } = layout;

      const x = Math.max(
        EDGE_MARGIN,
        Math.min(cx + offset, window.innerWidth - width - EDGE_MARGIN)
      );
      const y = Math.max(
        EDGE_MARGIN,
        Math.min(cy - height / 2, window.innerHeight - height - EDGE_MARGIN)
      );

      drawer.style.translate = `${x}px ${y}px`;
    });
  };

  const handleDragStart = () => {
    wasDragged.current = false;
  };

  const handleDrag = (_e: DraggableEvent, data: DraggableData) => {
    if (!wasDragged.current) {
      wasDragged.current = true;
      if (isOpen) closeDrawer();
    }

    const nextPos = { x: data.x, y: data.y };
    setPosition(nextPos);

    latestCenterRef.current = {
      x: data.x + LOGO_SIZE / 2,
      y: data.y + LOGO_SIZE / 2,
    };
    scheduleDrawerWrite();
  };

  const handleDragStop = (_e: DraggableEvent, data: DraggableData) => {
    setTimeout(() => {
      wasDragged.current = false;
    }, 0);

    const center = {
      x: data.x + LOGO_SIZE / 2,
      y: data.y + LOGO_SIZE / 2,
    };

    latestCenterRef.current = center;
    scheduleDrawerWrite();
    setLogoPosition(center);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (wasDragged.current) return;

    if (logoRef.current) {
      const rect = logoRef.current.getBoundingClientRect();
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

      latestCenterRef.current = center;
      scheduleDrawerWrite();
      setLogoPosition(center);
    }

    toggleDrawer();
  };

  return (
    <Suspense
      fallback={
        <div
          ref={logoRef}
          className={`absolute cursor-pointer ${isOpen ? styles.logoDrawerOpen : ''}`}
          style={{
            width: `${LOGO_SIZE}px`,
            height: `${LOGO_SIZE}px`,
            left: `${position.x}px`,
            top: `${position.y}px`,
          }}
        >
          <div className={styles.logoInner}>
            <GalleryVerticalEnd size={24} strokeWidth={1.5} className="text-text-main" />
          </div>
        </div>
      }
    >
      <Draggable
        nodeRef={logoRef}
        position={position}
        onStart={handleDragStart}
        onDrag={handleDrag}
        onStop={handleDragStop}
        bounds={bounds}
      >
        <div
          ref={logoRef}
          onClick={handleClick}
          className={`absolute cursor-pointer ${isOpen ? styles.logoDrawerOpen : ''}`}
          style={{ width: `${LOGO_SIZE}px`, height: `${LOGO_SIZE}px` }}
        >
          <div className={styles.logoInner}>
            <GalleryVerticalEnd size={24} strokeWidth={1.5} className="text-text-main" />
          </div>
        </div>
      </Draggable>
    </Suspense>
  );
};
