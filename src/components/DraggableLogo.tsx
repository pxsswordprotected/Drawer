import React, { useState } from 'react';
import Draggable from 'react-draggable';
import { GalleryVerticalEnd } from 'lucide-react';
import { useDrawerStore } from '@/store/drawerStore';

export const DraggableLogo: React.FC = () => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const logoRef = React.useRef<HTMLDivElement>(null);

  const toggleDrawer = useDrawerStore((state) => state.toggleDrawer);
  const setLogoPosition = useDrawerStore((state) => state.setLogoPosition);

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

  const handleClick = () => {
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
    <Draggable
      position={position}
      onStart={handleDragStart}
      onDrag={handleDrag}
      bounds="parent"
    >
      <div
        ref={logoRef}
        onClick={handleClick}
        className="absolute cursor-pointer bg-bg-main rounded-lg flex items-center justify-center"
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
