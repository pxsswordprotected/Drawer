import React from 'react';

interface TrashIconProps {
  size?: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const TrashIcon: React.FC<TrashIconProps> = ({ size = 16, className, onClick }) => (
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
    onClick={onClick}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M8 12h8" />
  </svg>
);
