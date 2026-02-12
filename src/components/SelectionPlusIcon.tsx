import React from 'react';
import { Plus } from 'lucide-react';

interface SelectionPlusIconProps {
  visible: boolean;
  x: number;
  y: number;
  onClick: () => void;
  disabled?: boolean;
}

export const SelectionPlusIcon: React.FC<SelectionPlusIconProps> = ({
  visible,
  x,
  y,
  onClick,
  disabled = false,
}) => {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-selection-plus-icon="true"
      className="fixed z-[999] bg-bg-main rounded-full p-1.5 shadow-lg hover:scale-110 active:scale-100 transition-transform cursor-pointer border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
    >
      <Plus size={16} strokeWidth={2} className="text-text-main" />
    </button>
  );
};
