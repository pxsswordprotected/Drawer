import React from 'react';

interface ChevronDownIconProps {
  size?: number;
  className?: string;
}

export const ChevronDownIcon: React.FC<ChevronDownIconProps> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M6 9L12 15L18 9"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
