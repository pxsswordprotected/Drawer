import React from 'react';

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
      className="fixed z-[999] rounded-full p-1.5 shadow-lg cursor-pointer border border-white/20 disabled:cursor-default"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        backgroundColor: '#1A1A1A',
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        className="text-text-main"
      >
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        >
          <polyline points="3,8 13,8" />
          <polyline points="8,3 8,13" />
        </g>
      </svg>
    </button>
  );
};
