import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useDrawerStore } from '@/store/drawerStore';
import { Highlight } from '@/shared/types';
import { DRAWER_CONFIG } from '@/shared/constants';
import styles from './HighlightsDrawer.module.css';
import { setDrawerElement, setDrawerLayout } from '@/shared/drawerDom';
import { HighlightItemExpandable } from './HighlightItemExpandable';
import { TrashIcon } from '@/shared/TrashIcon';
import { ExportScope } from './ExportPanel';
import { generateMarkdown, downloadMarkdown, copyMarkdown } from '@/shared/exportHighlights';

const EDGE_MARGIN = DRAWER_CONFIG.EDGE_MARGIN;

// Stagger animation constants (shared between delay calculations and scroll timing)
const STAGGER_BASE = 20;
const STAGGER_PER_ITEM = 35;
const STAGGER_DURATION = 250;

// ─── Page grouping types ───
interface PageGroup {
  url: string;
  pageTitle: string;
  highlights: Highlight[];
  isCurrentPage: boolean;
  mostRecentTimestamp: number;
}

export const HighlightsDrawer: React.FC = () => {
  const {
    isOpen,
    allHighlights,
    isLoading,
    logoPosition,
    closeDrawer,
    drawerTrigger,
    loadAllHighlights,
    selectedHighlightId,
    lastAddedHighlightId,
    clearLastAdded,
    expandedGroupUrl,
    toggleGroupExpanded,
    setExpandedGroupUrl,
    clearSelectedHighlight,
    selectHighlight,
    pendingScrollHighlightId,
    clearPendingScrollHighlight,
    deletePageGroup,
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

    // Sort by most recent highlight descending
    groups.sort((a, b) => b.mostRecentTimestamp - a.mostRecentTimestamp);

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
  const [exportMode, setExportMode] = useState(false);
  const [exportScreen, setExportScreen] = useState<'select' | 'options'>('select');
  const [exportSuccess, setExportSuccess] = useState<'copy' | 'download' | null>(null);
  const [exportExiting, setExportExiting] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>('current');
  const [exportSelectedIds, setExportSelectedIds] = useState<Set<string>>(new Set());
  const [exportScopeError, setExportScopeError] = useState<string | null>(null);
  const [exportIncludeNotes, setExportIncludeNotes] = useState(true);
  const [exportIncludeTimestamps, setExportIncludeTimestamps] = useState(true);

  const currentPageHighlights = useMemo(
    () => allHighlights.filter((h) => h.url === currentUrl),
    [allHighlights, currentUrl]
  );

  // Export selection helpers
  const toggleExportHighlight = useCallback((id: string) => {
    setExportScope('selected');
    setExportSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleExportPage = useCallback((highlights: Highlight[]) => {
    setExportScope('selected');
    setExportSelectedIds((prev) => {
      const next = new Set(prev);
      const anySelected = highlights.some((h) => prev.has(h.id));
      for (const h of highlights) {
        if (anySelected) next.delete(h.id);
        else next.add(h.id);
      }
      return next;
    });
  }, []);

  const handleExportScopeChange = useCallback(
    (newScope: ExportScope) => {
      setExportScopeError(null);
      if (newScope === 'current') {
        if (currentPageHighlights.length === 0) {
          setExportScopeError('No highlights on this page');
          return;
        }
        setExportSelectedIds(new Set(currentPageHighlights.map((h) => h.id)));
      } else if (newScope === 'all') {
        setExportSelectedIds(new Set(allHighlights.map((h) => h.id)));
      }
      if (newScope === 'selected') {
        setExportSelectedIds(new Set());
      }
      setExportScope(newScope);
    },
    [currentPageHighlights, allHighlights]
  );

  const cycleExportScope = useCallback(() => {
    const order: ExportScope[] = ['current', 'all', 'selected'];
    let nextIndex = (order.indexOf(exportScope) + 1) % order.length;
    // Skip 'current' if no highlights on this page
    if (order[nextIndex] === 'current' && currentPageHighlights.length === 0) {
      nextIndex = (nextIndex + 1) % order.length;
    }
    handleExportScopeChange(order[nextIndex]);
  }, [exportScope, handleExportScopeChange, currentPageHighlights]);

  const highlightsToExport = useMemo(
    () => allHighlights.filter((h) => exportSelectedIds.has(h.id)),
    [allHighlights, exportSelectedIds]
  );

  const resetExportState = useCallback(() => {
    setExportMode(false);
    setExportScreen('select');
    setExportScope('current');
    setExportSelectedIds(new Set());
    setExportScopeError(null);
    setExportSuccess(null);
    setExportExiting(false);
  }, []);

  const handleExportCopy = useCallback(async () => {
    const md = generateMarkdown(highlightsToExport, {
      includeNotes: exportIncludeNotes,
      includeTimestamps: exportIncludeTimestamps,
    });
    try {
      await copyMarkdown(md);
      setExportSuccess('copy');
      setTimeout(() => {
        setExportExiting(true);
        setTimeout(() => resetExportState(), 200);
      }, 1000);
    } catch {
      /* silently fail */
    }
  }, [highlightsToExport, exportIncludeNotes, exportIncludeTimestamps, resetExportState]);

  const handleExportDownload = useCallback(() => {
    const md = generateMarkdown(highlightsToExport, {
      includeNotes: exportIncludeNotes,
      includeTimestamps: exportIncludeTimestamps,
    });
    downloadMarkdown(md);
    setExportSuccess('download');
    setTimeout(() => {
      setExportExiting(true);
      setTimeout(() => resetExportState(), 200);
    }, 1000);
  }, [highlightsToExport, exportIncludeNotes, exportIncludeTimestamps, resetExportState]);

  // Scroll intent tracking
  const scrollIntentRef = useRef<'programmatic' | null>(null);
  const scrollEndCleanup = useRef<(() => void) | null>(null);

  // Sync visibility and stagger with isOpen + trigger intent
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsClosing(false);
      if (drawerTrigger === 'logo') setIsStaggering(true);
      if (drawerTrigger === 'mark') setIsStaggering(false);
    } else {
      setIsClosing(true);
      setIsStaggering(false);
    }
  }, [isOpen, drawerTrigger]);

  const handleDrawerAnimationEnd = useCallback(
    (e: React.AnimationEvent) => {
      if (e.target === e.currentTarget && isClosing) {
        setIsVisible(false);
        setIsClosing(false);
        setExportMode(false);
        setExportScreen('select');
        setExportScope('current');
        setExportSelectedIds(new Set());
        setExportScopeError(null);
        setExportIncludeNotes(true);
        setExportIncludeTimestamps(true);
      }
    },
    [isClosing]
  );

  const handleStaggerEnd = useCallback(() => {
    setIsStaggering(false);
  }, []);

  // ─── Unified scroll controller ───
  const scrollTo = useCallback((el: HTMLElement, alignment: 'top' | 'center' = 'top') => {
    const container = scrollContainerRef.current;
    if (!container || !el) return;

    // Clean up any previous scroll-end listener
    scrollEndCleanup.current?.();

    scrollIntentRef.current = 'programmatic';

    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const elTopInScroll = elRect.top - containerRect.top + container.scrollTop;
    const target =
      alignment === 'center'
        ? elTopInScroll - containerRect.height / 2 + elRect.height / 2
        : elTopInScroll - 16;

    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });

    // Clear intent when scroll finishes via scrollend event
    const onScrollEnd = () => {
      scrollIntentRef.current = null;
      cleanup();
    };
    const cleanup = () => {
      container.removeEventListener('scrollend', onScrollEnd);
      scrollEndCleanup.current = null;
    };
    container.addEventListener('scrollend', onScrollEnd, { once: true });
    scrollEndCleanup.current = cleanup;
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

  // Auto-expand current page group when drawer opens
  useEffect(() => {
    if (isOpen && !isLoading) {
      const currentGroup = pageGroups.find((g) => g.isCurrentPage);
      if (currentGroup) setExpandedGroupUrl(currentGroup.url);
    }
  }, [isOpen, isLoading]);

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
      scrollIntentRef.current = null;
      scrollEndCleanup.current?.();
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

  // Keyboard navigation handler (cross-page navigation)
  const keyNavActive = useRef(false);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();

      keyNavActive.current = true;
      setCurrentIndex((prev) => {
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        return Math.max(0, Math.min(highlightGlobalIndices.total - 1, prev + dir));
      });
    },
    [highlightGlobalIndices.total]
  );

  // Programmatic scroll on keyboard navigation only
  useEffect(() => {
    if (!keyNavActive.current) return;
    keyNavActive.current = false;

    const el = itemRefs.current[currentIndex];
    if (!el) return;
    scrollTo(el, 'center');
  }, [currentIndex, scrollTo]);

  // Wheel + pointerdown: immediately override programmatic intent
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!isOpen || !container) return;

    const clearProgrammatic = () => {
      if (scrollIntentRef.current === 'programmatic') {
        scrollIntentRef.current = null;
        scrollEndCleanup.current?.();
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

    // Don't auto-scroll if user is expanded on a highlight — avoid interrupting their flow
    if (!selectedHighlightId) {
      // Ensure the group containing the new highlight is expanded
      const newHighlight = allHighlights.find((h) => h.id === lastAddedHighlightId);
      if (newHighlight && expandedGroupUrl !== newHighlight.url) {
        setExpandedGroupUrl(newHighlight.url);
      }
      selectHighlight(lastAddedHighlightId);
      setCurrentIndex(globalIndex);
      // Wait for React to mount refs after group expansion
      setTimeout(() => {
        const el = itemRefs.current[globalIndex];
        if (el) scrollTo(el, 'center');
      }, 0);
    }
    clearLastAdded();
  }, [
    lastAddedHighlightId,
    highlightGlobalIndices,
    clearLastAdded,
    selectedHighlightId,
    scrollTo,
    allHighlights,
    expandedGroupUrl,
    setExpandedGroupUrl,
  ]);

  // Scroll to highlight when triggered from page mark click
  useEffect(() => {
    if (!pendingScrollHighlightId || isLoading) return;

    const index = highlightGlobalIndices.map.get(pendingScrollHighlightId);

    // If the group just expanded, highlightGlobalIndices may not have
    // the index yet. Do NOT clear pending — let the next render retry.
    if (index === undefined) return;

    selectHighlight(pendingScrollHighlightId);

    // Wait for React to mount refs and CSS to apply after group expansion
    const timeoutId = setTimeout(() => {
      const el = itemRefs.current[index];
      if (el) scrollTo(el);
      clearPendingScrollHighlight();
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [pendingScrollHighlightId, isLoading, highlightGlobalIndices, scrollTo]);

  // Auto-scroll to current page section (once per drawer open)
  const hasScrolledOnOpen = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      hasScrolledOnOpen.current = false;
      return;
    }
    if (!isVisible || isLoading || hasScrolledOnOpen.current || !scrollContainerRef.current) return;
    if (pageGroups.length === 0) return;

    const sectionEl = currentPageSectionRef.current;
    if (!sectionEl) return;

    const firstGroup = pageGroups[0];
    if (firstGroup?.isCurrentPage) return;

    hasScrolledOnOpen.current = true;

    requestAnimationFrame(() => {
      if (sectionEl) scrollTo(sectionEl);
    });
  }, [isOpen, isVisible, isLoading, pageGroups.length, scrollTo]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      scrollEndCleanup.current?.();
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

  // Render-phase state update: instantly cancel stagger if a new item is added.
  // React will discard the current render and restart with isStaggering = false.
  if (lastAddedHighlightId && isStaggering) {
    setIsStaggering(false);
  }

  if (!isVisible) return null;

  return (
    <>
      {/* Export icon — fixed above draggable logo */}
      {allHighlights.length > 0 && logoPosition && !isClosing && (
        <button
          onClick={() => {
            if (exportMode) {
              setExportExiting(true);
              setTimeout(() => resetExportState(), 200);
            } else {
              setExportMode(true);
              if (currentPageHighlights.length > 0) {
                setExportScope('current');
                setExportSelectedIds(new Set(currentPageHighlights.map((h) => h.id)));
              } else {
                setExportScope('selected');
                setExportSelectedIds(new Set());
              }
            }
          }}
          className="fixed cursor-pointer"
          style={{
            left: logoPosition.x - 10,
            top: logoPosition.y - 22 - 8 - 20,
            zIndex: 1001,
            background: 'none',
            border: 'none',
            padding: 0,
            lineHeight: 0,
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            fill="#8C8C8C"
            viewBox="0 0 256 256"
          >
            <path d="M224,104a8,8,0,0,1-16,0V59.32l-66.33,66.34a8,8,0,0,1-11.32-11.32L196.68,48H152a8,8,0,0,1,0-16h64a8,8,0,0,1,8,8Zm-40,24a8,8,0,0,0-8,8v72H48V80h72a8,8,0,0,0,0-16H48A16,16,0,0,0,32,80V208a16,16,0,0,0,16,16H176a16,16,0,0,0,16-16V136A8,8,0,0,0,184,128Z" />
          </svg>
        </button>
      )}
      {/* Outer div — positioning only, translate updated by FAB rAF */}
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
          className={`relative w-full h-full bg-bg-elevated rounded-lg overflow-hidden ${isClosing ? styles.drawerClosing : styles.drawerEntering}`}
          style={{
            contain: 'paint',
            boxShadow: '0 2px 5px -1px rgba(0, 0, 0, 0.35)',
            outline: 'none',
            ...innerStyle,
          }}
          onAnimationEnd={handleDrawerAnimationEnd}
          onKeyDown={handleKeyDown}
        >
          <>
            {/* Single scroll container with expandable items */}
            <div ref={scrollContainerRef} className={`${styles.scrollContainer} h-full`}>
              <div
                className={`px-[38px] py-2 ${exportMode ? 'pb-16' : ''} ${styles.highlightList}`}
                data-has-expanded={selectedHighlightId ? '' : undefined}
                data-group-expanded={expandedGroupUrl ? '' : undefined}
                data-export-mode={exportMode ? '' : undefined}
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
                  (() => {
                    let hiddenHighlightsBefore = 0;
                    return pageGroups.map((group, groupIndex) => {
                      const isCollapsed = expandedGroupUrl !== group.url;
                      const rawGlobalIndex =
                        highlightGlobalIndices.map.get(group.highlights[0]?.id) ?? 0;
                      const effectiveIndex = Math.max(0, rawGlobalIndex - hiddenHighlightsBefore);
                      const correctedDelay = STAGGER_BASE + effectiveIndex * STAGGER_PER_ITEM;
                      if (isCollapsed) {
                        hiddenHighlightsBefore += group.highlights.length;
                      }
                      return (
                        <React.Fragment key={group.url}>
                          {groupIndex > 0 &&
                            (exportMode ||
                              expandedGroupUrl !== pageGroups[groupIndex - 1]?.url) && (
                              <div
                                className={`border-t border-divider mx-auto ${isStaggering ? styles.staggerDivider : ''}`}
                                style={{
                                  width: '300px',
                                  ...(isStaggering
                                    ? {
                                        animationDelay: `${correctedDelay}ms`,
                                      }
                                    : {}),
                                }}
                              />
                            )}
                          <div ref={group.isCurrentPage ? currentPageSectionRef : undefined}>
                            {/* Section header — only when multiple page groups exist */}
                            {(pageGroups.length > 1 || group.isCurrentPage) && (
                              <div
                                data-item-expanded={!isCollapsed ? '' : undefined}
                                data-export-selected={
                                  exportMode && group.highlights.some((h) => exportSelectedIds.has(h.id)) ? '' : undefined
                                }
                                className={`pt-4 ${isCollapsed ? 'pb-4' : 'pb-2'} ${isStaggering ? styles.staggerEntry : ''}`}
                                style={
                                  isStaggering
                                    ? {
                                        animationDelay: `${correctedDelay}ms`,
                                      }
                                    : undefined
                                }
                              >
                                <div
                                  data-page-header
                                  className={styles.pageHeader}
                                  onClick={(e) => {
                                    // Always clear selected highlight when switching pages
                                    if (selectedHighlightId) {
                                      clearSelectedHighlight();
                                    }
                                    const isClosing = !isCollapsed;
                                    toggleGroupExpanded(group.url);
                                    if (isClosing) {
                                      handleStaggerEnd();
                                    }
                                    if (isCollapsed) {
                                      const headerEl = e.currentTarget as HTMLElement;
                                      requestAnimationFrame(() => scrollTo(headerEl));
                                    }
                                  }}
                                >
                                  {exportMode &&
                                    (() => {
                                      const allInGroup = group.highlights.every((h) =>
                                        exportSelectedIds.has(h.id)
                                      );
                                      const someInGroup = group.highlights.some((h) =>
                                        exportSelectedIds.has(h.id)
                                      );
                                      return (
                                        <input
                                          type="checkbox"
                                          checked={allInGroup}
                                          ref={(el) => {
                                            if (el) el.indeterminate = someInGroup && !allInGroup;
                                          }}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            toggleExportPage(group.highlights);
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          disabled={exportScreen === 'options'}
                                          className={`${styles.checkbox} ${exportExiting ? styles.checkboxExiting : styles.checkboxEntering}`}
                                          style={{
                                            position: 'absolute',
                                            left: -24,
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                          }}
                                        />
                                      );
                                    })()}
                                  <p
                                    className={`text-base ${styles.pageTitle} ${isCollapsed ? 'font-light text-text-main' : 'font-medium text-text-main'}`}
                                  >
                                    {group.pageTitle || group.url}
                                  </p>
                                  {!exportMode && (
                                    <div
                                      className={styles.pageTrashIcon}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deletePageGroup(group.url);
                                      }}
                                    >
                                      <TrashIcon size={14} className="text-text-secondary" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Highlights within this group */}
                            {!isCollapsed &&
                              group.highlights.map((highlight, i) => {
                                const globalIdx = highlightGlobalIndices.map.get(highlight.id)!;
                                const isLastInGroup = i === group.highlights.length - 1;
                                return (
                                  <React.Fragment key={highlight.id}>
                                    <div
                                      ref={(el) => (itemRefs.current[globalIdx] = el)}
                                      data-item-expanded={
                                        selectedHighlightId === highlight.id ? '' : undefined
                                      }
                                      data-export-selected={
                                        exportMode && exportSelectedIds.has(highlight.id) ? '' : undefined
                                      }
                                      className={
                                        selectedHighlightId === highlight.id ? 'pt-4' : 'py-4'
                                      }
                                      style={{ position: 'relative' }}
                                    >
                                      {exportMode && (
                                        <input
                                          type="checkbox"
                                          checked={exportSelectedIds.has(highlight.id)}
                                          onChange={() => toggleExportHighlight(highlight.id)}
                                          disabled={exportScreen === 'options'}
                                          className={`${styles.checkbox} ${exportExiting ? styles.checkboxExiting : styles.checkboxEntering}`}
                                          style={{
                                            position: 'absolute',
                                            left: -24,
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                          }}
                                        />
                                      )}
                                      <HighlightItemExpandable
                                        highlight={highlight}
                                        index={globalIdx}
                                        onScrollToItem={(idx: number) => {
                                          const el = itemRefs.current[idx];
                                          if (el) scrollTo(el);
                                        }}
                                        isStaggering={isStaggering}
                                        onStaggerEnd={
                                          isLastInGroup && !isCollapsed
                                            ? handleStaggerEnd
                                            : undefined
                                        }
                                        hideActions={exportMode}
                                      />
                                    </div>
                                    {!isLastInGroup && selectedHighlightId !== highlight.id && (
                                      <div
                                        className={`border-t border-divider mx-auto ${isStaggering ? styles.staggerDivider : ''}`}
                                        style={{
                                          width: '300px',
                                          ...(isStaggering
                                            ? {
                                                animationDelay: `${STAGGER_BASE + globalIdx * STAGGER_PER_ITEM + 17}ms`,
                                              }
                                            : {}),
                                        }}
                                      />
                                    )}
                                  </React.Fragment>
                                );
                              })}
                          </div>
                        </React.Fragment>
                      );
                    });
                  })()
                )}
              </div>
            </div>
            {/* Floating export bar */}
            {exportMode && !isLoading && allHighlights.length > 0 && !(exportExiting && !exportSuccess) && (
              <div
                className={`absolute bottom-3 left-1/2 bg-bg-elevated rounded-lg px-3.5 py-2.5 ${exportExiting && exportSuccess ? styles.exportBarExiting : styles.exportBarEntering}`}
                style={{
                  zIndex: 10,
                  boxShadow: '0 -2px 8px rgba(0,0,0,0.3)',
                  width: '236px',
                }}
              >
                {exportScreen === 'select' ? (
                  <div className="flex items-center justify-between">
                    {/* Scope cycle button: vertical dots + active label */}
                    <button
                      onClick={cycleExportScope}
                      className="flex items-center gap-1.5 cursor-pointer px-2 py-1.5"
                      style={{ background: 'none', border: 'none' }}
                      aria-label={`Export scope: ${exportScope === 'current' ? 'Current page' : exportScope === 'all' ? 'All highlights' : 'Selected'}. Click to change.`}
                    >
                      <span className="flex flex-col items-center gap-1" aria-hidden="true">
                        {(['current', 'all', 'selected'] as const).map((scope) => (
                          <span
                            key={scope}
                            className={`block rounded-full transition-opacity ${
                              exportScope === scope
                                ? 'w-1.5 h-1.5 bg-text-main'
                                : 'w-1 h-1 bg-text-secondary opacity-40'
                            }`}
                          />
                        ))}
                      </span>
                      <span
                        className="text-sm font-light text-text-main"
                        style={{ marginLeft: '6px' }}
                      >
                        {exportScope === 'current'
                          ? 'Current page'
                          : exportScope === 'all'
                            ? 'All highlights'
                            : 'Selected'}
                      </span>
                    </button>
                    {exportScopeError && (
                      <p className="text-red-400 text-xs font-light">{exportScopeError}</p>
                    )}
                    {/* Next button */}
                    <button
                      onClick={() => setExportScreen('options')}
                      disabled={exportSelectedIds.size === 0}
                      className="px-3 text-sm font-light bg-[#373737] text-text-main hover:bg-[#444] transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center"
                      style={{ borderRadius: '8px', height: '32px', paddingTop: '1px' }}
                    >
                      Next ({exportSelectedIds.size})
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 py-1">
                    {/* Back arrow */}
                    <button
                      onClick={() => setExportScreen('select')}
                      className="text-text-secondary hover:text-text-main text-sm cursor-pointer self-start flex items-center justify-center"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        width: '22px',
                        height: '22px',
                      }}
                    >
                      &larr;
                    </button>
                    {/* Options */}
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-text-main text-sm font-light">Include notes</span>
                      <input
                        type="checkbox"
                        checked={exportIncludeNotes}
                        onChange={(e) => setExportIncludeNotes(e.target.checked)}
                        className={styles.toggle}
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-text-main text-sm font-light">Include timestamps</span>
                      <input
                        type="checkbox"
                        checked={exportIncludeTimestamps}
                        onChange={(e) => setExportIncludeTimestamps(e.target.checked)}
                        className={styles.toggle}
                      />
                    </label>
                    {/* Export action buttons */}
                    <div className="flex gap-2 pt-1">
                      <div style={{ flex: '1 1 0', minWidth: 0 }}>
                        {exportSuccess === 'copy' ? (
                          <div
                            className="w-full flex items-center justify-center"
                            style={{ borderRadius: '8px', height: '32px', background: '#2a3a2a' }}
                          >
                            <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                              <path d="M1 5.5L5 9.5L13 1.5" stroke="#4CAF50" strokeWidth="1.5" strokeLinejoin="miter" strokeLinecap="square" />
                            </svg>
                          </div>
                        ) : (
                          <button
                            onClick={handleExportCopy}
                            disabled={exportSuccess !== null}
                            className="w-full px-3 text-sm font-light bg-[#373737] text-text-main hover:bg-[#444] transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                            style={{ borderRadius: '8px', height: '32px' }}
                          >
                            Copy
                          </button>
                        )}
                      </div>
                      <div style={{ flex: '1 1 0', minWidth: 0 }}>
                        {exportSuccess === 'download' ? (
                          <div
                            className="w-full flex items-center justify-center"
                            style={{ borderRadius: '8px', height: '32px', background: '#2a3a2a' }}
                          >
                            <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                              <path d="M1 5.5L5 9.5L13 1.5" stroke="#4CAF50" strokeWidth="1.5" strokeLinejoin="miter" strokeLinecap="square" />
                            </svg>
                          </div>
                        ) : (
                          <button
                            onClick={handleExportDownload}
                            disabled={exportSuccess !== null}
                            className="w-full px-3 text-sm font-light bg-[#373737] text-text-main hover:bg-[#444] transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                            style={{ borderRadius: '8px', height: '32px' }}
                          >
                            Download
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        </div>
      </div>
    </>
  );
};
