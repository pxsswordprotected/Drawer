import React, { useCallback } from 'react';
import { Highlight } from '@/shared/types';
import { useDrawerStore } from '@/store/drawerStore';
import styles from './HighlightItem.module.css';

interface HighlightItemProps {
  highlight: Highlight;
  onClick?: () => void;
  isFocused?: boolean;
  index: number;
  currentIndex: number;
  isStaggering?: boolean;
  onStaggerEnd?: () => void;
}

export const HighlightItem: React.FC<HighlightItemProps> = ({
  highlight,
  onClick,
  isFocused = false,
  index,
  currentIndex,
  isStaggering = false,
  onStaggerEnd,
}) => {
  const selectHighlight = useDrawerStore((s) => s.selectHighlight);

  const handleClick = useCallback(() => {
    if (isFocused) {
      selectHighlight(highlight.id);
    } else if (onClick) {
      onClick();
    }
  }, [isFocused, highlight.id, selectHighlight, onClick]);

  // Calculate blur and position attributes declaratively
  const blurLevel = isFocused ? '0' : '3';
  const position = isFocused ? 'center' : index < currentIndex ? 'above' : 'below';

  const handleAnimationEnd = useCallback(
    (e: React.AnimationEvent) => {
      if (e.animationName === 'itemStaggerEnter') {
        onStaggerEnd?.();
      }
    },
    [onStaggerEnd]
  );

  const staggerDelay = 20 + index * 35;

  return (
    <div
      className={`${styles.highlightItem} ${isStaggering ? styles.staggerEntry : ''}`}
      data-focused={isFocused ? 'true' : 'false'}
      onClick={handleClick}
      onAnimationEnd={isStaggering ? handleAnimationEnd : undefined}
    >
      <div className={styles.highlightVisual} data-blur={blurLevel} data-position={position}>
        <p className={`${styles.highlightText} text-text-main`}>{highlight.text}</p>
      </div>
    </div>
  );
};
