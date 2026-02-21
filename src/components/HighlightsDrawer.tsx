import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
  memo,
} from 'react';
import { useDrawerStore } from '@/store/drawerStore';
import { HighlightItem } from './HighlightItem';
import { HighlightDetailView } from './HighlightDetailView';
import { Highlight } from '@/shared/types';
import { DRAWER_CONFIG } from '@/shared/constants';
import styles from './HighlightsDrawer.module.css';
import detailStyles from './HighlightDetailView.module.css';
import { setDrawerElement, setDrawerLayout } from '@/shared/drawerDom';
import { HighlightItemExpandable } from './HighlightItemExpandable';

const USE_INLINE_EXPAND = true;

const EDGE_MARGIN = DRAWER_CONFIG.EDGE_MARGIN;

// Memoized list item to prevent re-renders when other items change
interface HighlightListItemProps {
  highlight: Highlight;
  index: number;
  currentIndex: number;
  totalItems: number;
  itemRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  onClick: (index: number) => void;
  isStaggering: boolean;
  onStaggerEnd?: () => void;
}

const HighlightListItem = memo<HighlightListItemProps>(
  ({
    highlight,
    index,
    currentIndex,
    totalItems,
    itemRefs,
    onClick,
    isStaggering,
    onStaggerEnd,
  }) => {
    const isFocused = index === currentIndex;
    const isLast = index === totalItems - 1;

    const handleClick = useCallback(() => {
      onClick(index);
    }, [index, onClick]);

    return (
      <React.Fragment>
        <div ref={(el) => (itemRefs.current[index] = el)}>
          <HighlightItem
            highlight={highlight}
            isFocused={isFocused}
            index={index}
            currentIndex={currentIndex}
            onClick={handleClick}
            isStaggering={isStaggering}
            onStaggerEnd={isLast ? onStaggerEnd : undefined}
          />
        </div>
        {index < totalItems - 1 && (
          <div
            className={`border-t border-divider mx-auto ${isStaggering ? styles.staggerDivider : ''}`}
            style={{
              width: '300px',
              ...(isStaggering ? { animationDelay: `${20 + index * 35 + 17}ms` } : {}),
            }}
          />
        )}
      </React.Fragment>
    );
  }
);

HighlightListItem.displayName = 'HighlightListItem';

// ─── Expandable list item (only active when USE_INLINE_EXPAND = true) ───
interface HighlightExpandableListItemProps {
  highlight: Highlight;
  index: number;
  totalItems: number;
  itemRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  onExpand: (index: number) => void;
  onCollapse: (index: number) => void;
  isStaggering: boolean;
  onStaggerEnd?: () => void;
}

const HighlightExpandableListItem = memo<HighlightExpandableListItemProps>(
  ({ highlight, index, totalItems, itemRefs, onExpand, onCollapse, isStaggering, onStaggerEnd }) => {
    const isLast = index === totalItems - 1;

    return (
      <React.Fragment>
        <div ref={(el) => (itemRefs.current[index] = el)}>
          <HighlightItemExpandable
            highlight={highlight}
            index={index}
            onExpand={onExpand}
            onCollapse={onCollapse}
            isStaggering={isStaggering}
            onStaggerEnd={isLast ? onStaggerEnd : undefined}
          />
        </div>
        {index < totalItems - 1 && (
          <div
            className={`border-t border-divider mx-auto ${isStaggering ? styles.staggerDivider : ''}`}
            style={{
              width: '300px',
              ...(isStaggering ? { animationDelay: `${20 + index * 35 + 17}ms` } : {}),
            }}
          />
        )}
      </React.Fragment>
    );
  }
);

HighlightExpandableListItem.displayName = 'HighlightExpandableListItem';

export const HighlightsDrawer: React.FC = () => {
  const {
    isOpen,
    currentPageHighlights,
    isLoading,
    logoPosition,
    closeDrawer,
    loadHighlights,
    selectedHighlightId,
    lastAddedHighlightId,
    clearLastAdded,
  } = useDrawerStore();

  const selectedHighlight = useMemo(
    () =>
      selectedHighlightId
        ? (currentPageHighlights.find((h) => h.id === selectedHighlightId) ?? null)
        : null,
    [selectedHighlightId, currentPageHighlights]
  );
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [drawerStyle, setDrawerStyle] = useState<React.CSSProperties>({});
  const [innerStyle, setInnerStyle] = useState<React.CSSProperties>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isStaggering, setIsStaggering] = useState(false);

  // ─── Scroll-center focus system (only active when USE_INLINE_EXPAND = false) ───
  // Scroll intent tracking refs
  const scrollIntentRef = useRef<'programmatic' | 'user' | null>(null);
  const scrollRaf = useRef(0);
  const intentFailsafe = useRef(0);
  const itemCentersRef = useRef<number[]>([]);
  const lastScrollIndex = useRef(0);

  // Sync visibility with isOpen for exit animation support
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsClosing(false);
      setIsStaggering(true);
    } else if (isVisible) {
      setIsClosing(true);
    }
  }, [isOpen, isVisible]);

  const handleDrawerAnimationEnd = useCallback(
    (e: React.AnimationEvent) => {
      if (e.target === e.currentTarget && isClosing) {
        setIsVisible(false);
        setIsClosing(false);
      }
    },
    [isClosing]
  );

  const handleStaggerEnd = useCallback(() => {
    setIsStaggering(false);
  }, []);

  // ─── Inline expand/collapse scroll helpers (only active when USE_INLINE_EXPAND = true) ───
  const scrollToItemTop = useCallback((index: number) => {
    const container = scrollContainerRef.current;
    const el = itemRefs.current[index];
    if (!container || !el) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const elTopInScroll = elRect.top - containerRect.top + container.scrollTop;
    container.scrollTo({ top: Math.max(0, elTopInScroll - 16), behavior: 'smooth' });
  }, []);

  const expandItem = useCallback((index: number) => {
    scrollIntentRef.current = 'programmatic';
    lastScrollIndex.current = index;
    requestAnimationFrame(() => {
      scrollToItemTop(index);
    });
  }, [scrollToItemTop]);

  const collapseItem = useCallback((index: number) => {
    scrollToItemTop(index);
  }, [scrollToItemTop]);

  // Calculate drawer position based on logo position
  useEffect(() => {
    if (!logoPosition) return;

    const drawerWidth = 376;
    const drawerHeight = 270;
    const LOGO_SIZE = 40; // Logo width/height (should match DraggableLogo.tsx)
    const LOGO_RADIUS = LOGO_SIZE / 2; // Half the logo size (20px)
    const DESIRED_GAP = 10; // Actual spacing between logo and drawer
    const gap = LOGO_RADIUS + DESIRED_GAP; // 30px total - clears logo + adds spacing
    // Determine which side of the FAB the drawer opens on
    const spaceOnRight = window.innerWidth - logoPosition.x;
    const minSpaceNeeded = EDGE_MARGIN + drawerWidth + gap;
    const drawerSide = spaceOnRight >= minSpaceNeeded ? 'right' : 'left';

    // Calculate offset based on which side drawer is on
    const offset = drawerSide === 'right' ? gap : -drawerWidth - gap;

    // Store layout for DraggableLogo rAF writes
    setDrawerLayout({ width: drawerWidth, height: drawerHeight, side: drawerSide, offset });

    // Compute numeric x/y clamped to viewport
    const x = Math.max(
      EDGE_MARGIN,
      Math.min(logoPosition.x + offset, window.innerWidth - drawerWidth - EDGE_MARGIN)
    );
    const y = Math.max(
      EDGE_MARGIN,
      Math.min(logoPosition.y - drawerHeight / 2, window.innerHeight - drawerHeight - EDGE_MARGIN)
    );
    const originY = logoPosition.y - y; // FAB's Y offset within drawer's local space

    // Outer div: translate only (positioning)
    setDrawerStyle({
      translate: `${x}px ${y}px`,
      willChange: 'translate',
    });

    // Inner div: transformOrigin for scale animation pivot
    setInnerStyle({
      transformOrigin:
        drawerSide === 'right' ? `${-gap}px ${originY}px` : `${drawerWidth + gap}px ${originY}px`,
    });
  }, [logoPosition]);

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

  // Initialize current index and reset scroll intent when drawer opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      lastScrollIndex.current = 0;
      scrollIntentRef.current = null;
      clearTimeout(intentFailsafe.current);
    }
  }, [isOpen]);

  // Focus inner div on open for keyboard navigation
  useEffect(() => {
    if (isOpen && isVisible && innerRef.current) {
      innerRef.current.focus();
    }
  }, [isOpen, isVisible]);

  // Clamp stale itemRefs when highlights change pages
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, currentPageHighlights.length);
  }, [currentPageHighlights.length]);

  // Precompute item centers for scroll tracking
  const highlightIds = useMemo(
    () => currentPageHighlights.map((h) => h.id).join(','),
    [currentPageHighlights]
  );

  const recomputeCenters = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const centers: number[] = [];
    itemRefs.current.forEach((el, i) => {
      if (!el) return;
      const elRect = el.getBoundingClientRect();
      // Convert viewport-relative rect to container-scroll-relative coordinate
      const topInContainer = elRect.top - containerRect.top + container.scrollTop;
      centers[i] = topInContainer + elRect.height / 2;
    });
    itemCentersRef.current = centers;
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || !isVisible || isLoading) return;

    recomputeCenters();
    requestAnimationFrame(recomputeCenters);
  }, [isOpen, isVisible, isLoading, highlightIds, recomputeCenters]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!isOpen || !isVisible || isLoading || !container) return;

    const ro = new ResizeObserver(() => recomputeCenters());
    ro.observe(container);
    return () => ro.disconnect();
  }, [isOpen, isVisible, isLoading, recomputeCenters]);

  // Click handler: set index directly with programmatic intent
  const selectIndex = useCallback((i: number) => {
    scrollIntentRef.current = 'programmatic';
    lastScrollIndex.current = i;
    setCurrentIndex(i);
  }, []);

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();

      scrollIntentRef.current = 'programmatic';

      setCurrentIndex((prev) => {
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const next = Math.max(0, Math.min(currentPageHighlights.length - 1, prev + dir));
        lastScrollIndex.current = next;
        return next;
      });
    },
    [currentPageHighlights.length]
  );

  // Programmatic scroll effect + failsafe
  useEffect(() => {
    if (scrollIntentRef.current !== 'programmatic') return;

    const el = itemRefs.current[currentIndex];
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    clearTimeout(intentFailsafe.current);
    intentFailsafe.current = window.setTimeout(() => {
      scrollIntentRef.current = null;
    }, 800);
  }, [currentIndex]);

  // Wheel + pointerdown: immediately override programmatic intent
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!isOpen || !container) return;

    const clearProgrammatic = () => {
      if (scrollIntentRef.current === 'programmatic') {
        scrollIntentRef.current = null;
        clearTimeout(intentFailsafe.current);
      }
    };

    container.addEventListener('wheel', clearProgrammatic, { passive: true });
    container.addEventListener('pointerdown', clearProgrammatic);
    return () => {
      container.removeEventListener('wheel', clearProgrammatic);
      container.removeEventListener('pointerdown', clearProgrammatic);
    };
  }, [isOpen]);

  // Scroll handler: detect user scroll vs programmatic scroll
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Programmatic smooth scroll in progress: clear intent when centered enough
    if (scrollIntentRef.current === 'programmatic') {
      const centers = itemCentersRef.current;
      const i = lastScrollIndex.current;
      const itemCenter = centers[i];

      if (itemCenter !== undefined) {
        const containerCenter = container.scrollTop + container.clientHeight / 2;
        const epsilon = 10;
        const delta = Math.abs(itemCenter - containerCenter);

        if (delta < epsilon) {
          scrollIntentRef.current = null;
          clearTimeout(intentFailsafe.current);
        }
      }
      return;
    }

    cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      const centers = itemCentersRef.current;
      if (!container) return;

      const targetCenter = container.scrollTop + container.clientHeight / 2;

      const isAtTop = container.scrollTop <= 5;
      const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 5;

      let closestIndex = 0;
      let closestDist = Infinity;

      if (isAtTop) {
        closestIndex = 0;
      } else if (isAtBottom) {
        closestIndex = centers.length - 1;
      } else {
        // Only run the loop if we aren't at the very top or bottom
        let closestDist = Infinity;
        for (let i = 0; i < centers.length; i++) {
          const c = centers[i];
          if (c === undefined) continue;
          const dist = Math.abs(c - targetCenter);
          if (dist < closestDist) {
            closestDist = dist;
            closestIndex = i;
          }
        }
      }

      if (closestIndex !== lastScrollIndex.current) {
        lastScrollIndex.current = closestIndex;
        scrollIntentRef.current = 'user';
        setCurrentIndex(closestIndex);
      }
    });
  }, []);

  // Clamp currentIndex when list shrinks
  useEffect(() => {
    setCurrentIndex((prev) => Math.min(prev, Math.max(0, currentPageHighlights.length - 1)));
  }, [currentPageHighlights.length]);

  // Auto-focus newly added highlight
  useEffect(() => {
    if (!lastAddedHighlightId) return;

    const index = currentPageHighlights.findIndex((h) => h.id === lastAddedHighlightId);
    if (index === -1) return;

    scrollIntentRef.current = 'programmatic';
    lastScrollIndex.current = index;
    setCurrentIndex(index);
    clearLastAdded();
  }, [lastAddedHighlightId, currentPageHighlights, clearLastAdded]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(scrollRaf.current);
      clearTimeout(intentFailsafe.current);
    };
  }, []);

  // Unregister drawer element and layout on unmount
  useEffect(() => {
    return () => {
      setDrawerElement(null);
      setDrawerLayout(null);
    };
  }, []);

  useEffect(() => {
    // If we just transitioned from having a selected highlight to NOT having one
    if (!selectedHighlightId && isOpen && innerRef.current) {
      innerRef.current.focus();
    }
  }, [selectedHighlightId, isOpen]);

  if (!isVisible) return null;

  return (
    /* Outer div — positioning only, translate updated by FAB rAF */
    <div
      ref={(el) => {
        drawerRef.current = el;
        setDrawerElement(el);
      }}
      data-drawer
      className="fixed top-0 left-0"
      style={{
        width: '376px',
        height: '270px',
        zIndex: 1000,
        ...drawerStyle,
      }}
    >
      {/* Inner div — visuals + animation */}
      <div
        ref={innerRef}
        tabIndex={0}
        className={`w-full h-full bg-bg-elevated rounded-lg overflow-hidden ${isClosing ? styles.drawerClosing : styles.drawerEntering}`}
        style={{
          contain: 'paint',
          boxShadow: '0 2px 5px -1px rgba(0, 0, 0, 0.35)',
          outline: 'none',
          ...innerStyle,
        }}
        onAnimationEnd={handleDrawerAnimationEnd}
        onKeyDown={handleKeyDown}
      >
        {USE_INLINE_EXPAND ? (
          /* Single scroll container with expandable items */
          <div
            ref={scrollContainerRef}
            className={`${styles.scrollContainer} h-full`}
          >
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
                  <HighlightExpandableListItem
                    key={highlight.id}
                    highlight={highlight}
                    index={index}
                    totalItems={currentPageHighlights.length}
                    itemRefs={itemRefs}
                    onExpand={expandItem}
                    onCollapse={collapseItem}
                    isStaggering={isStaggering}
                    onStaggerEnd={handleStaggerEnd}
                  />
                ))
              )}
            </div>
          </div>
        ) : (
          <div
            className={detailStyles.slideContainer}
            data-detail-active={selectedHighlight ? 'true' : 'false'}
          >
            {/* List pane */}
            <div className={detailStyles.listPane}>
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className={`${styles.scrollContainer} h-full`}
              >
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
                        onClick={selectIndex}
                        isStaggering={isStaggering}
                        onStaggerEnd={handleStaggerEnd}
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
        )}
      </div>
    </div>
  );
};
