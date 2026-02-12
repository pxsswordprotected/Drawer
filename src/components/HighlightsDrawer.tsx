import React, { useCallback, useEffect, useRef, useState, useMemo, memo } from 'react';
import { useDrawerStore } from '@/store/drawerStore';
import { HighlightItem } from './HighlightItem';
import { HighlightDetailView } from './HighlightDetailView';
import { Highlight } from '@/shared/types';
import { DRAWER_CONFIG } from '@/shared/constants';
import styles from './HighlightsDrawer.module.css';
import detailStyles from './HighlightDetailView.module.css';

const EDGE_MARGIN = DRAWER_CONFIG.EDGE_MARGIN;

// Memoized list item to prevent re-renders when other items change
interface HighlightListItemProps {
  highlight: Highlight;
  index: number;
  currentIndex: number;
  totalItems: number;
  itemRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  navigateToIndex: (index: number) => void;
}

const HighlightListItem = memo<HighlightListItemProps>(
  ({ highlight, index, currentIndex, totalItems, itemRefs, setCurrentIndex, navigateToIndex }) => {
    const isFocused = index === currentIndex;
    const isFirst = index === 0;
    const isLast = index === totalItems - 1;

    const handleClick = useCallback(() => {
      setCurrentIndex(index);
      navigateToIndex(index);
    }, [index, setCurrentIndex, navigateToIndex]);

    return (
      <React.Fragment>
        <div
          ref={(el) => (itemRefs.current[index] = el)}
          className={styles.snapItem}
          data-snap-position={isFirst ? 'start' : isLast ? 'end' : 'center'}
        >
          <HighlightItem
            highlight={highlight}
            isFocused={isFocused}
            index={index}
            currentIndex={currentIndex}
            onClick={handleClick}
          />
        </div>
        {index < totalItems - 1 && (
          <div className="border-t border-divider mx-auto" style={{ width: '300px' }} />
        )}
      </React.Fragment>
    );
  }
);

HighlightListItem.displayName = 'HighlightListItem';

export const HighlightsDrawer: React.FC = () => {
  const {
    isOpen,
    currentPageHighlights,
    isLoading,
    logoPosition,
    closeDrawer,
    loadHighlights,
    selectedHighlightId,
  } = useDrawerStore();

  const selectedHighlight = useMemo(
    () =>
      selectedHighlightId
        ? (currentPageHighlights.find((h) => h.id === selectedHighlightId) ?? null)
        : null,
    [selectedHighlightId, currentPageHighlights]
  );
  const drawerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [drawerStyle, setDrawerStyle] = useState<React.CSSProperties>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [drawerSide, setDrawerSide] = useState<'left' | 'right'>('right');

  // Calculate drawer position based on logo position
  useEffect(() => {
    if (!logoPosition) return;

    const drawerWidth = 376;
    const drawerHeight = 270;
    const LOGO_SIZE = 40; // Logo width/height (should match DraggableLogo.tsx)
    const LOGO_RADIUS = LOGO_SIZE / 2; // Half the logo size (20px)
    const DESIRED_GAP = 10; // Actual spacing between logo and drawer
    const gap = LOGO_RADIUS + DESIRED_GAP; // 30px total - clears logo + adds spacing
    const hysteresisBuffer = 30; // Buffer zone to prevent rapid flipping

    // Calculate distance from edges
    const distanceFromRightEdge = window.innerWidth - logoPosition.x;
    const distanceFromLeftEdge = logoPosition.x;
    const flipThreshold = EDGE_MARGIN + drawerWidth + gap;

    // Side-aware hysteresis: only check flip condition for transitioning to other side
    if (drawerSide === 'right' && distanceFromRightEdge < flipThreshold && distanceFromRightEdge < distanceFromLeftEdge) {
      setDrawerSide('left');
    } else if (drawerSide === 'left' && distanceFromLeftEdge < flipThreshold && distanceFromLeftEdge < distanceFromRightEdge) {
      setDrawerSide('right');
    }

    // Calculate offset based on which side drawer is on
    const offset = drawerSide === 'right' ? gap : -drawerWidth - gap;

    // Use CSS variables with transform for GPU-accelerated smooth movement
    setDrawerStyle({
      transform: `translate3d(
        clamp(${EDGE_MARGIN}px, calc(var(--logo-x, 50vw) + ${offset}px), ${window.innerWidth - drawerWidth - EDGE_MARGIN}px),
        clamp(${EDGE_MARGIN}px, calc(var(--logo-y, 50vh) - ${drawerHeight / 2}px), ${window.innerHeight - drawerHeight - EDGE_MARGIN}px),
        0
      )`,
      willChange: 'transform',
      transformOrigin: drawerSide === 'right'
        ? `${-gap}px ${drawerHeight / 2}px`
        : `${drawerWidth + gap}px ${drawerHeight / 2}px`,
    });
  }, [logoPosition, drawerSide]);

  // Load highlights when drawer opens
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      loadHighlights(window.location.href);
    }
  }, [isOpen, loadHighlights]);

  // Click outside handler (temporarily disabled)
  // useEffect(() => {
  //   if (!isOpen) return;
  //
  //   const handleClickOutside = (e: MouseEvent) => {
  //     if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
  //       closeDrawer();
  //     }
  //   };
  //
  //   const root = (drawerRef.current?.getRootNode() as ShadowRoot) || document;
  //   root.addEventListener('mousedown', handleClickOutside);
  //   return () => root.removeEventListener('mousedown', handleClickOutside);
  // }, [isOpen, closeDrawer]);

  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };

    const root = (drawerRef.current?.getRootNode() as ShadowRoot) || document;
    root.addEventListener('keydown', handleEscape);
    return () => root.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeDrawer]);

  // Initialize current index when drawer opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
    }
  }, [isOpen]);

  // Auto-focus scroll container for keyboard navigation
  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      scrollContainerRef.current.focus();
    }
  }, [isOpen]);

  // Helper to determine correct scroll alignment based on position
  const getScrollIntoViewOptions = useCallback(
    (index: number, totalItems: number): ScrollIntoViewOptions => {
      const isFirst = index === 0;
      const isLast = index === totalItems - 1;

      return {
        behavior: 'smooth',
        block: isFirst ? 'start' : isLast ? 'end' : 'center',
      };
    },
    []
  );

  // Centralized navigation handler
  const navigateToIndex = useCallback(
    (newIndex: number) => {
      const target = itemRefs.current[newIndex];
      if (target) {
        const options = getScrollIntoViewOptions(newIndex, currentPageHighlights.length);
        target.scrollIntoView(options);
      }
    },
    [currentPageHighlights.length, getScrollIntoViewOptions]
  );

  // Custom scroll - one highlight at a time, no skipping
  useEffect(() => {
    if (!isOpen || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const direction = e.deltaY > 0 ? 1 : -1;
      setCurrentIndex((prev) => {
        const newIndex = Math.max(0, Math.min(itemRefs.current.length - 1, prev + direction));

        navigateToIndex(newIndex);

        return newIndex;
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [isOpen, currentPageHighlights, navigateToIndex]);

  // Arrow key navigation - one highlight at a time
  useEffect(() => {
    if (!isOpen || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

      e.preventDefault(); // Prevent default browser scroll

      const direction = e.key === 'ArrowDown' ? 1 : -1;
      setCurrentIndex((prev) => {
        const newIndex = Math.max(0, Math.min(itemRefs.current.length - 1, prev + direction));

        navigateToIndex(newIndex);

        return newIndex;
      });
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentPageHighlights, navigateToIndex]);

  if (!isOpen) return null;

  return (
    <div
      ref={drawerRef}
      data-drawer
      className="fixed bg-bg-elevated rounded-lg overflow-hidden"
      style={{
        width: '376px',
        height: '270px',
        zIndex: 1000,
        ...drawerStyle,
        animation: 'drawerEnter 200ms cubic-bezier(0.23, 1, 0.32, 1)',
        boxShadow: `
          inset 1px 1px 2.8px -1px rgba(255, 255, 255, 0.65),
          0 2px 5px -1px rgba(0, 0, 0, 0.35)
        `,
      }}
    >
      <div
        className={detailStyles.slideContainer}
        data-detail-active={selectedHighlight ? 'true' : 'false'}
      >
        {/* List pane */}
        <div className={detailStyles.listPane}>
          <div ref={scrollContainerRef} className={`${styles.scrollContainer} h-full`} tabIndex={0}>
            <div
              className="px-[38px] space-y-4"
              style={{ paddingTop: '20px', paddingBottom: '20px' }}
            >
              {isLoading ? (
                <>
                  <div
                    className="bg-[#373737] rounded-md animate-pulse"
                    style={{ height: '64px' }}
                  />
                  <div className="border-t border-divider mx-auto" style={{ width: '300px' }} />
                  <div
                    className="bg-[#373737] rounded-md animate-pulse"
                    style={{ height: '48px' }}
                  />
                  <div className="border-t border-divider mx-auto" style={{ width: '300px' }} />
                  <div
                    className="bg-[#373737] rounded-md animate-pulse"
                    style={{ height: '56px' }}
                  />
                </>
              ) : currentPageHighlights.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-text-secondary text-center">No highlights on this page</p>
                </div>
              ) : (
                currentPageHighlights.map((highlight, index) => (
                  <HighlightListItem
                    key={highlight.id}
                    highlight={highlight}
                    index={index}
                    currentIndex={currentIndex}
                    totalItems={currentPageHighlights.length}
                    itemRefs={itemRefs}
                    setCurrentIndex={setCurrentIndex}
                    navigateToIndex={navigateToIndex}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Detail pane */}
        <div className={detailStyles.detailPane}>
          {selectedHighlight && <HighlightDetailView highlight={selectedHighlight} />}
        </div>
      </div>
    </div>
  );
};
