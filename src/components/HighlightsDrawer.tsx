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
import { Highlight } from '@/shared/types';
import { DRAWER_CONFIG } from '@/shared/constants';
import styles from './HighlightsDrawer.module.css';
import { setDrawerElement, setDrawerLayout } from '@/shared/drawerDom';
import { HighlightItemExpandable } from './HighlightItemExpandable';

const EDGE_MARGIN = DRAWER_CONFIG.EDGE_MARGIN;

// ─── Page grouping types ───
interface PageGroup {
  url: string;
  pageTitle: string;
  highlights: Highlight[];
  isCurrentPage: boolean;
  mostRecentTimestamp: number;
}

// ─── Expandable list item ───
interface HighlightExpandableListItemProps {
  highlight: Highlight;
  index: number;
  isLastInGroup: boolean;
  onScrollToItem: (index: number) => void;
  isStaggering: boolean;
  onStaggerEnd?: () => void;
}

const HighlightExpandableListItem = memo<HighlightExpandableListItemProps>(
  ({ highlight, index, isLastInGroup, onScrollToItem, isStaggering, onStaggerEnd }) => {
    return (
      <>
        <HighlightItemExpandable
          highlight={highlight}
          index={index}
          onScrollToItem={onScrollToItem}
          isStaggering={isStaggering}
          onStaggerEnd={onStaggerEnd}
        />
        {!isLastInGroup && (
          <div
            className={`border-t border-divider mx-auto mt-4 ${isStaggering ? styles.staggerDivider : ''}`}
            style={{
              width: '300px',
              ...(isStaggering ? { animationDelay: `${20 + index * 35 + 17}ms` } : {}),
            }}
          />
        )}
      </>
    );
  }
);

HighlightExpandableListItem.displayName = 'HighlightExpandableListItem';

export const HighlightsDrawer: React.FC = () => {
  const {
    isOpen,
    allHighlights,
    isLoading,
    logoPosition,
    closeDrawer,
    loadAllHighlights,
    selectedHighlightId,
    lastAddedHighlightId,
    clearLastAdded,
    collapsedGroupUrls,
    toggleGroupCollapsed,
    clearSelectedHighlight,
  } = useDrawerStore();

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  // ─── Grouping logic ───
  const pageGroups = useMemo<PageGroup[]>(() => {
    if (allHighlights.length === 0) return [];

    const groupMap = new Map<string, PageGroup>();
    for (const h of allHighlights) {
      let group = groupMap.get(h.url);
      if (!group) {
        group = {
          url: h.url,
          pageTitle: h.pageTitle,
          highlights: [],
          isCurrentPage: h.url === currentUrl,
          mostRecentTimestamp: 0,
        };
        groupMap.set(h.url, group);
      }
      group.highlights.push(h);
      if (h.timestamp > group.mostRecentTimestamp) {
        group.mostRecentTimestamp = h.timestamp;
      }
    }

    const groups = Array.from(groupMap.values());

    // Current page first, then by most recent highlight descending
    groups.sort((a, b) => {
      if (a.isCurrentPage && !b.isCurrentPage) return -1;
      if (!a.isCurrentPage && b.isCurrentPage) return 1;
      return b.mostRecentTimestamp - a.mostRecentTimestamp;
    });

    return groups;
  }, [allHighlights, currentUrl]);

  // Global highlight index map (headers excluded) for itemRefs and stagger
  const highlightGlobalIndices = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const group of pageGroups) {
      for (const h of group.highlights) {
        map.set(h.id, idx++);
      }
    }
    return { map, total: idx };
  }, [pageGroups]);

  const drawerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const currentPageSectionRef = useRef<HTMLDivElement | null>(null);
  const [drawerStyle, setDrawerStyle] = useState<React.CSSProperties>({});
  const [innerStyle, setInnerStyle] = useState<React.CSSProperties>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isStaggering, setIsStaggering] = useState(false);
  const [spacerHeight, setSpacerHeight] = useState(0);

  // Scroll intent tracking refs
  const scrollIntentRef = useRef<'programmatic' | 'user' | null>(null);
  const scrollRaf = useRef(0);
  const intentFailsafe = useRef(0);
  const itemCentersRef = useRef<number[]>([]);
  const lastScrollIndex = useRef(0);

  // Measure container height for bottom spacer
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    setSpacerHeight(container.clientHeight);
  }, []);

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

  // ─── Inline expand/collapse scroll helpers ───
  const scrollToItemTop = useCallback((index: number) => {
    const container = scrollContainerRef.current;
    const el = itemRefs.current[index];
    if (!container || !el) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const elTopInScroll = elRect.top - containerRect.top + container.scrollTop;
    setTimeout(() => {
      container.scrollTo({ top: Math.max(0, elTopInScroll - 16), behavior: 'smooth' });
    }, 80);
  }, []);

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

  // Load all highlights when drawer opens
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      loadAllHighlights();
    }
  }, [isOpen, loadAllHighlights]);

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

  // Clamp stale itemRefs when highlights change
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, highlightGlobalIndices.total);
  }, [highlightGlobalIndices.total]);

  // Precompute item centers for scroll tracking
  const highlightIds = useMemo(
    () => allHighlights.map((h) => h.id).join(','),
    [allHighlights]
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

  // Keyboard navigation handler (cross-page navigation)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();

      scrollIntentRef.current = 'programmatic';

      setCurrentIndex((prev) => {
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const next = Math.max(0, Math.min(highlightGlobalIndices.total - 1, prev + dir));
        lastScrollIndex.current = next;
        return next;
      });
    },
    [highlightGlobalIndices.total]
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

  // Clamp currentIndex when list shrinks
  useEffect(() => {
    setCurrentIndex((prev) => Math.min(prev, Math.max(0, highlightGlobalIndices.total - 1)));
  }, [highlightGlobalIndices.total]);

  // Auto-focus newly added highlight
  useEffect(() => {
    if (!lastAddedHighlightId) return;

    const globalIndex = highlightGlobalIndices.map.get(lastAddedHighlightId);
    if (globalIndex === undefined) return;

    scrollIntentRef.current = 'programmatic';
    lastScrollIndex.current = globalIndex;
    setCurrentIndex(globalIndex);
    clearLastAdded();
  }, [lastAddedHighlightId, highlightGlobalIndices, clearLastAdded]);

  // Auto-scroll to current page section after data loads
  useEffect(() => {
    if (!isOpen || isLoading || !scrollContainerRef.current) return;

    const sectionEl = currentPageSectionRef.current;
    if (!sectionEl) return; // current page has no highlights

    // If the current page group is first, it's already at the top
    const firstGroup = pageGroups[0];
    if (firstGroup?.isCurrentPage) return;

    requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container || !sectionEl) return;

      const containerRect = container.getBoundingClientRect();
      const sectionRect = sectionEl.getBoundingClientRect();
      const sectionTopInScroll = sectionRect.top - containerRect.top + container.scrollTop;

      container.scrollTo({ top: Math.max(0, sectionTopInScroll - 16), behavior: 'smooth' });
    });
  }, [isOpen, isLoading, pageGroups]);

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
        {/* Single scroll container with expandable items */}
        <div ref={scrollContainerRef} className={`${styles.scrollContainer} h-full`}>
            <div
              className={`px-[38px] space-y-6 ${styles.highlightList}`}
              style={{ paddingTop: '20px', paddingBottom: '20px' }}
              data-has-expanded={selectedHighlightId ? '' : undefined}
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
              ) : allHighlights.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-text-secondary text-center">No highlights saved</p>
                </div>
              ) : (
                pageGroups.map((group) => {
                  const isCollapsed = collapsedGroupUrls.has(group.url);
                  return (
                  <div
                    key={group.url}
                    ref={group.isCurrentPage ? currentPageSectionRef : undefined}
                  >
                    {/* Section header — only when multiple page groups exist */}
                    {(pageGroups.length > 1 || group.isCurrentPage) && (
                      <div
                        className={`mb-2 cursor-pointer ${isStaggering ? styles.staggerEntry : ''} ${!isCollapsed && !group.isCurrentPage ? styles.pageHeaderDimmed : ''}`}
                        style={isStaggering ? { animationDelay: `${20 + (highlightGlobalIndices.map.get(group.highlights[0]?.id) ?? 0) * 35}ms` } : undefined}
                        onClick={() => {
                          if (!isCollapsed && selectedHighlightId &&
                              group.highlights.some(h => h.id === selectedHighlightId)) {
                            clearSelectedHighlight();
                          }
                          toggleGroupCollapsed(group.url);
                        }}
                      >
                        <p className={`text-base truncate ${isCollapsed ? 'font-light text-text-main' : group.isCurrentPage ? 'font-medium text-text-main' : 'text-text-secondary'}`}>
                          {group.pageTitle || group.url}
                        </p>
                      </div>
                    )}

                    {/* Highlights within this group */}
                    {!isCollapsed && group.highlights.map((highlight, i) => {
                      const globalIdx = highlightGlobalIndices.map.get(highlight.id)!;
                      const isLast = globalIdx === highlightGlobalIndices.total - 1;
                      const isLastInGroup = i === group.highlights.length - 1;
                      return (
                        <div
                          key={highlight.id}
                          ref={(el) => (itemRefs.current[globalIdx] = el)}
                          data-item-expanded={selectedHighlightId === highlight.id ? '' : undefined}
                          className={i > 0 ? 'pt-4' : undefined}
                        >
                          <HighlightExpandableListItem
                            highlight={highlight}
                            index={globalIdx}
                            isLastInGroup={isLastInGroup}
                            onScrollToItem={scrollToItemTop}
                            isStaggering={isStaggering}
                            onStaggerEnd={isLast ? handleStaggerEnd : undefined}
                          />
                        </div>
                      );
                    })}
                  </div>
                  );
                })
              )}
            </div>
            {allHighlights.length > 0 && (
              <div style={{ height: spacerHeight, flexShrink: 0 }} aria-hidden="true" />
            )}
          </div>
      </div>
    </div>
  );
};
