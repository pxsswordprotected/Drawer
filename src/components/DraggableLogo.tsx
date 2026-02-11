import React, { useState, useEffect } from 'react';
import Draggable from 'react-draggable';
import { GalleryVerticalEnd } from 'lucide-react';
import { useDrawerStore } from '@/store/drawerStore';

const EDGE_MARGIN = 24;
const LOGO_SIZE = 40;

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

  const handleDragStart = () => {
    setDragStart(position);
    setIsDragging(false);
  };

  const handleDrag = (_e: any, data: { x: number; y: number }) => {
    const distance = Math.sqrt(
      Math.pow(data.x - dragStart.x, 2) + Math.pow(data.y - dragStart.y, 2)
    );
    if (distance > 5) setIsDragging(true);
    setPosition({ x: data.x, y: data.y });
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
    <Draggable position={position} onStart={handleDragStart} onDrag={handleDrag} bounds={bounds}>
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
