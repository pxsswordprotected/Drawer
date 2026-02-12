import React, { useState, useEffect, useRef } from 'react';
import Draggable from 'react-draggable';
import { GalleryVerticalEnd } from 'lucide-react';
import { useDrawerStore } from '@/store/drawerStore';
import { DRAWER_CONFIG } from '@/shared/constants';

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

  const toggleDrawer = useDrawerStore((state) => state.toggleDrawer);
  const setLogoPosition = useDrawerStore((state) => state.setLogoPosition);

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
    lastThrottleTime.current = 0; // Reset throttle on drag start
    pendingUpdate.current = false;
  };

  const handleDragStop = (_e: any, data: { x: number; y: number }) => {
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
    if (distance > 5) setIsDragging(true);
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
    if (!isDragging && logoRef.current) {
      // Get logo's center position in viewport
      const rect = logoRef.current.getBoundingClientRect();
      setLogoPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      toggleDrawer();
    }
    setIsDragging(false);
  };

  return (
    <Draggable position={position} onStart={handleDragStart} onDrag={handleDrag} onStop={handleDragStop} bounds={bounds}>
      <div
        ref={logoRef}
        onClick={handleClick}
        className={`absolute ${isDragging ? 'cursor-grabbing' : 'cursor-pointer'} bg-bg-main rounded-lg flex items-center justify-center`}
        style={{
          width: '40px',
          height: '40px',
          boxShadow: `
            inset 1px 1px 2.8px -1px rgba(255, 255, 255, 0.65),
            0 2px 5px -1px rgba(0, 0, 0, 0.35)
          `,
        }}
      >
        <GalleryVerticalEnd size={24} strokeWidth={1.5} className="text-text-main" />
      </div>
    </Draggable>
  );
};
