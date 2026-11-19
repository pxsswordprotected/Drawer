import React from 'react';

interface TrashIconProps {
  size?: number;
  className?: string;
  /** 'danger' (red) for destructive deletes; 'neutral' (grey) for non-destructive removals */
  tone?: 'danger' | 'neutral';
  onClick?: (e: React.MouseEvent) => void;
}

export const TrashIcon: React.FC<TrashIconProps> = ({ size = 16, className, tone = 'danger', onClick }) => {
  const color = tone === 'danger' ? 'text-error' : 'text-text-secondary';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `${color} ${className}` : color}
      onClick={onClick}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
    </svg>
  );
};
