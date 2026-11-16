import React from 'react';

interface EditIconProps {
  size?: number;
  className?: string;
}

export const EditIcon: React.FC<EditIconProps> = ({ size = 16, className }) => (
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
    <path d="M8 16l.8-3L14.5 7.3a1.4 1.4 0 0 1 2 0l.2.2a1.4 1.4 0 0 1 0 2L11 15.2 8 16z" />
    <path d="M13.5 8.3l2.2 2.2" />
  </svg>
);
