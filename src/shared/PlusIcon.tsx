import React from 'react';

interface PlusIconProps {
  size?: number;
  className?: string;
}

/** Same drawing as TrashIcon (circle, 1px stroke) with a cross instead of a bar */
export const PlusIcon: React.FC<PlusIconProps> = ({ size = 16, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M8 12h8" />
    <path d="M12 8v8" />
  </svg>
);
