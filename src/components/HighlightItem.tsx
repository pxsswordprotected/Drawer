import React from 'react';
import { Highlight } from '@/shared/types';
import styles from './HighlightItem.module.css';

interface HighlightItemProps {
  highlight: Highlight;
  onClick?: () => void;
  isFocused?: boolean;
  index: number;
  currentIndex: number;
}

export const HighlightItem: React.FC<HighlightItemProps> = ({
  highlight,
  onClick,
  isFocused = false,
  index,
  currentIndex,
}) => {
  // Calculate blur and position attributes declaratively
  const blurLevel = isFocused ? '0' : '3';
  const position = isFocused ? 'center' : index < currentIndex ? 'above' : 'below';

  return (
    <div
      className={styles.highlightItem}
      data-in-view="true"
      data-focused={isFocused ? 'true' : 'false'}
      data-blur={blurLevel}
      data-position={position}
      onClick={isFocused ? undefined : onClick}
    >
      <p className={`${styles.highlightText} text-text-main`}>
        {highlight.text}
      </p>
    </div>
  );
};
