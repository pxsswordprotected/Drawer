import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { GalleryVerticalEnd } from 'lucide-react';
import { useDrawerStore } from '@/store/drawerStore';
import { DRAWER_CONFIG } from '@/shared/constants';
import styles from './DraggableLogo.module.css';

const Draggable = lazy(() => import('react-draggable'));

const EDGE_MARGIN = DRAWER_CONFIG.EDGE_MARGIN;
const LOGO_SIZE = 40;
const THROTTLE_MS = 50;

export const DraggableLogo: React.FC = () => {
  const [position, setPosition] = useState({
    x: window.innerWidth - EDGE_MARGIN - LOGO_SIZE,
    y: window.innerHeight - EDGE_MARGIN - LOGO_SIZE
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [bounds, setBounds] = useState({
    left: EDGE_MARGIN,
    top: EDGE_MARGIN,
    right: window.innerWidth - EDGE_MARGIN - LOGO_SIZE,
    bottom: window.innerHeight - EDGE_MARGIN - LOGO_SIZE,
  });
  const logoRef = React.useRef<HTMLDivElement>(null);
  const lastThrottleTime = useRef<number>(0);
  const pendingUpdate = useRef<boolean>(false);
  const wasDragged = useRef<boolean>(false); // Synchronous drag logic flag

  const toggleDrawer = useDrawerStore((state) => state.toggleDrawer);
  const setLogoPosition = useDrawerStore((state) => state.setLogoPosition);
  const isOpen = useDrawerStore((state) => state.isOpen);

  useEffect(() => {
    const updateBounds = () => {
      setBounds({
        left: EDGE_MARGIN,
        top: EDGE_MARGIN,
        right: window.innerWidth - EDGE_MARGIN - LOGO_SIZE,
        bottom: window.innerHeight - EDGE_MARGIN - LOGO_SIZE,
      });
    };

    window.addEventListener('resize', updateBounds);
    return () => window.removeEventListener('resize', updateBounds);
  }, []);

  // Set CSS variables for drawer positioning
  useEffect(() => {
    const centerX = position.x + LOGO_SIZE / 2;
    const centerY = position.y + LOGO_SIZE / 2;
    document.documentElement.style.setProperty('--logo-x', `${centerX}px`);
    document.documentElement.style.setProperty('--logo-y', `${centerY}px`);

    return () => {
      document.documentElement.style.removeProperty('--logo-x');
      document.documentElement.style.removeProperty('--logo-y');
    };
  }, [position]);

  const handleDragStart = () => {
    setDragStart(position);
    setIsDragging(false);
    wasDragged.current = false; // Reset drag flag
    lastThrottleTime.current = 0; // Reset throttle on drag start
    pendingUpdate.current = false;
  };

  const handleDragStop = (_e: any, data: { x: number; y: number }) => {
    setIsDragging(false);
    // Trailing edge: ensure final position is sent if there was a pending update
    if (pendingUpdate.current) {
      const centerX = data.x + LOGO_SIZE / 2;
      const centerY = data.y + LOGO_SIZE / 2;
      setLogoPosition({ x: centerX, y: centerY });
      pendingUpdate.current = false;
    }
  };

  const handleDrag = (_e: any, data: { x: number; y: number }) => {
    const distance = Math.sqrt(
      Math.pow(data.x - dragStart.x, 2) + Math.pow(data.y - dragStart.y, 2)
    );
    if (distance > 5) {
      wasDragged.current = true; // Logic: "This is now a drag"
      setIsDragging(true);       // Visual: "Show grabbing cursor"
    }
    setPosition({ x: data.x, y: data.y });

    // Update CSS variables immediately for smooth 60fps tracking
    const centerX = data.x + LOGO_SIZE / 2;
    const centerY = data.y + LOGO_SIZE / 2;
    document.documentElement.style.setProperty('--logo-x', `${centerX}px`);
    document.documentElement.style.setProperty('--logo-y', `${centerY}px`);

    // Throttled position update for drawer flip logic (leading edge)
    const now = Date.now();
    if (now - lastThrottleTime.current >= THROTTLE_MS) {
      lastThrottleTime.current = now;
      pendingUpdate.current = false;
      setLogoPosition({ x: centerX, y: centerY });
    } else {
      pendingUpdate.current = true;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Check the synchronous ref, not the async state
    if (!wasDragged.current && logoRef.current) {
      // Get logo's center position in viewport
      const rect = logoRef.current.getBoundingClientRect();
      setLogoPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      toggleDrawer();
    }

    // No need to reset wasDragged here, handleDragStart handles it
  };

  return (
    <Suspense
      fallback={
        <div
          ref={logoRef}
          className={`absolute cursor-pointer ${isOpen ? styles.logoDrawerOpen : ''}`}
          style={{
            width: '40px',
            height: '40px',
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
      <Draggable position={position} onStart={handleDragStart} onDrag={handleDrag} onStop={handleDragStop} bounds={bounds}>
        <div
          ref={logoRef}
          onClick={handleClick}
          data-dragging={isDragging}
          className={`absolute ${isDragging ? 'cursor-grabbing' : 'cursor-pointer'} ${isOpen ? styles.logoDrawerOpen : ''}`}
          style={{ width: '40px', height: '40px' }}
        >
          <div className={styles.logoInner}>
            <GalleryVerticalEnd size={24} strokeWidth={1.5} className="text-text-main" />
          </div>
        </div>
      </Draggable>
    </Suspense>
  );
};
