import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { useDrawerStore } from '@/store/drawerStore';
import { useShallow } from 'zustand/react/shallow';
import { Highlight, ExportScope } from '@/shared/types';
import { DRAWER_CONFIG, PANEL_SURFACE_CLASS } from '@/shared/constants';
import styles from './HighlightsDrawer.module.css';
import { setDrawerElement, setDrawerLayout } from '@/shared/drawerDom';
import { HighlightItemExpandable } from './HighlightItemExpandable';
import { TrashIcon } from '@/shared/TrashIcon';
import { DrawerToolbar } from './DrawerToolbar';
import { generateMarkdown, downloadMarkdown, copyMarkdown } from '@/shared/exportHighlights';
import { DrawerSettings } from './DrawerSettings';
import { PageTitle } from './PageTitle';
import { FolderList } from './FolderList';
import { pageUrl } from '@/shared/pageUrl';
import { ChevronDownIcon } from '@/shared/ChevronDownIcon';

const EDGE_MARGIN = DRAWER_CONFIG.EDGE_MARGIN;

// Stagger animation constants (shared between delay calculations and scroll timing)
const STAGGER_BASE = 20;
const STAGGER_PER_ITEM = 35;

// A folder's name label sticks to the top of the list: 16 top padding + 20 line + 4 bottom (see .folderLabel)
const FOLDER_LABEL_HEIGHT = 40;
const UNFILED_LABEL = 'Unfiled';

// ─── Page grouping types ───
interface PageGroup {
  url: string;
  pageTitle: string;
  highlights: Highlight[];
  isCurrentPage: boolean;
  mostRecentTimestamp: number;
  folderId: string | null; // null: in no folder
}

// memo: no props, so parent re-renders (e.g. every host-page mouseup) never reach it
export const HighlightsDrawer = React.memo(function HighlightsDrawer() {
  // useShallow: re-render only when these fields change, not on unrelated store
  // updates (defaultColor, logoResetCount)
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
    pageTitles,
    folders,
    siteFolders,
  } = useDrawerStore(
    useShallow((s) => ({
      isOpen: s.isOpen,
      allHighlights: s.allHighlights,
      isLoading: s.isLoading,
      logoPosition: s.logoPosition,
      closeDrawer: s.closeDrawer,
      drawerTrigger: s.drawerTrigger,
      loadAllHighlights: s.loadAllHighlights,
      selectedHighlightId: s.selectedHighlightId,
      lastAddedHighlightId: s.lastAddedHighlightId,
      clearLastAdded: s.clearLastAdded,
      expandedGroupUrl: s.expandedGroupUrl,
      toggleGroupExpanded: s.toggleGroupExpanded,
      setExpandedGroupUrl: s.setExpandedGroupUrl,
      clearSelectedHighlight: s.clearSelectedHighlight,
      selectHighlight: s.selectHighlight,
      pendingScrollHighlightId: s.pendingScrollHighlightId,
      clearPendingScrollHighlight: s.clearPendingScrollHighlight,
      deletePageGroup: s.deletePageGroup,
      pageTitles: s.pageTitles,
      folders: s.folders,
      siteFolders: s.siteFolders,
    }))
  );

  const currentUrl = typeof window !== 'undefined' ? pageUrl() : '';

  // ─── Grouping logic ───
  const pageGroups = useMemo<PageGroup[]>(() => {
    if (allHighlights.length === 0) return [];

    const folderIds = new Set(folders.map((f) => f.id));
    const groupMap = new Map<string, PageGroup>();
    for (const h of allHighlights) {
      let group = groupMap.get(h.url);
      if (!group) {
        const folderId = siteFolders[h.url];
        group = {
          url: h.url,
          pageTitle: pageTitles[h.url] || h.pageTitle,
          highlights: [],
          isCurrentPage: h.url === currentUrl,
          mostRecentTimestamp: 0,
          folderId: folderId && folderIds.has(folderId) ? folderId : null,
        };
        groupMap.set(h.url, group);
      }
      group.highlights.push(h);
      if (h.timestamp > group.mostRecentTimestamp) {
        group.mostRecentTimestamp = h.timestamp;
      }
    }

    const groups = Array.from(groupMap.values());

    // Folders first, by folder name (`folders` is already by name); pages in no folder last.
    // Within each, most recent highlight first.
    const folderRank = new Map(folders.map((f, i) => [f.id, i]));
    const rank = (g: PageGroup) => (g.folderId ? folderRank.get(g.folderId)! : folders.length);
    groups.sort((a, b) => rank(a) - rank(b) || b.mostRecentTimestamp - a.mostRecentTimestamp);

    return groups;
  }, [allHighlights, pageTitles, folders, siteFolders, currentUrl]);

  // Consecutive pages of one folder form a section; its name label sticks while they scroll
  const sections = useMemo(() => {
    const out: { folderId: string | null; name: string | null; groups: PageGroup[] }[] = [];
    for (const group of pageGroups) {
      const last = out[out.length - 1];
      if (last && last.folderId === group.folderId) {
        last.groups.push(group);
      } else {
        const name = folders.find((f) => f.id === group.folderId)?.name ?? null;
        out.push({ folderId: group.folderId, name, groups: [group] });
      }
    }
    return out;
  }, [pageGroups, folders]);

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

  const folderPages = useMemo(
    () => pageGroups.map((g) => ({ url: g.url, title: g.pageTitle || g.url })),
    [pageGroups]
  );

  const drawerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const currentPageSectionRef = useRef<HTMLDivElement | null>(null);
  const exportSelectRef = useRef<HTMLDivElement>(null);
  const exportOptionsRef = useRef<HTMLDivElement>(null);
  const [exportBarHeight, setExportBarHeight] = useState<number | undefined>(undefined);
  const [drawerStyle, setDrawerStyle] = useState<React.CSSProperties>({});
  const [innerStyle, setInnerStyle] = useState<React.CSSProperties>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isStaggering, setIsStaggering] = useState(false);
  // Highlight whose notes expand without animation (drawer opened from its page mark)
  const [instantExpandId, setInstantExpandId] = useState<string | null>(null);
  const [exportMode, setExportMode] = useState(false);
  const [exportScreen, setExportScreen] = useState<'select' | 'options'>('select');
  const [exportSuccess, setExportSuccess] = useState<'copy' | 'download' | null>(null);
  const [exportExiting, setExportExiting] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>('current');
  const [exportSelectedIds, setExportSelectedIds] = useState<Set<string>>(new Set());
  const [exportIncludeNotes, setExportIncludeNotes] = useState(false);
  const [exportIncludeTimestamps, setExportIncludeTimestamps] = useState(false);
  const [exportIncludePageTitles, setExportIncludePageTitles] = useState(false);
  const [settingsMode, setSettingsMode] = useState(false);
  const [foldersMode, setFoldersMode] = useState(false);
  const [pendingOpenUrl, setPendingOpenUrl] = useState<string | null>(null); // page to scroll to once the list shows
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set()); // folder sections folded in the list
  const [exportEmptyMessage, setExportEmptyMessage] = useState(false);

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
      if (newScope === 'current') {
        setExportSelectedIds(new Set(currentPageHighlights.map((h) => h.id)));
      } else if (newScope === 'all') {
        setExportSelectedIds(new Set(allHighlights.map((h) => h.id)));
      }
      if (newScope === 'selected') {
        setExportSelectedIds(new Set());
      }
      setExportScope(newScope);
      setExportIncludePageTitles(newScope !== 'current');
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

  // Measure active export screen height for smooth container morph
  useLayoutEffect(() => {
    const activeRef = exportScreen === 'select' ? exportSelectRef : exportOptionsRef;
    if (activeRef.current) {
      setExportBarHeight(activeRef.current.scrollHeight);
    }
  }, [
    exportMode,
    exportScreen,
    exportIncludeNotes,
    exportIncludeTimestamps,
    exportIncludePageTitles,
  ]);

  const resetExportState = useCallback(() => {
    setExportMode(false);
    setExportScreen('select');
    setExportScope('current');
    setExportSelectedIds(new Set());
    setExportSuccess(null);
    setExportExiting(false);
    setExportIncludeNotes(true);
    setExportIncludeTimestamps(true);
    setExportIncludePageTitles(true);
    setExportBarHeight(undefined);
  }, []);

  // Leave export mode in place: only the export UI goes away (after its 200ms exit), so the
  // list keeps its scroll position and whichever pages are expanded or collapsed
  const exitExportMode = useCallback(() => {
    setExportExiting(true);
    setTimeout(() => resetExportState(), 200);
  }, [resetExportState]);

  const handleExportCopy = useCallback(async () => {
    const md = generateMarkdown(
      highlightsToExport,
      {
        includeNotes: exportIncludeNotes,
        includeTimestamps: exportIncludeTimestamps,
        includePageTitles: exportIncludePageTitles,
      },
      pageTitles
    );
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
  }, [
    highlightsToExport,
    pageTitles,
    exportIncludeNotes,
    exportIncludeTimestamps,
    exportIncludePageTitles,
    resetExportState,
  ]);

  const handleExportDownload = useCallback(() => {
    const md = generateMarkdown(
      highlightsToExport,
      {
        includeNotes: exportIncludeNotes,
        includeTimestamps: exportIncludeTimestamps,
        includePageTitles: exportIncludePageTitles,
      },
      pageTitles
    );
    downloadMarkdown(md);
    setExportSuccess('download');
    setTimeout(() => {
      setExportExiting(true);
      setTimeout(() => resetExportState(), 200);
    }, 1000);
  }, [
    highlightsToExport,
    pageTitles,
    exportIncludeNotes,
    exportIncludeTimestamps,
    exportIncludePageTitles,
    resetExportState,
  ]);

  const hasOpenedBefore = useRef(false);

  // Sync visibility and stagger with isOpen + trigger intent
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsClosing(false);
      if (drawerTrigger === 'logo' && !hasOpenedBefore.current) setIsStaggering(true);
      hasOpenedBefore.current = true;
    } else {
      setIsClosing(true);
      setIsStaggering(false);
    }
  }, [isOpen, drawerTrigger]);

  const handleDrawerAnimationEnd = useCallback(
    (e: React.AnimationEvent) => {
      // isClosing comes from the last render and can be stale: a reopen click may already
      // have flipped the store back to open before this exit animation's end event fires.
      if (e.target === e.currentTarget && isClosing && !useDrawerStore.getState().isOpen) {
        setIsVisible(false);
        setIsClosing(false);
        setExportMode(false);
        setExportScreen('select');
        setExportScope('current');
        setExportSelectedIds(new Set());
        setExportIncludeNotes(true);
        setExportIncludeTimestamps(true);
        setExportIncludePageTitles(true);
        setExportBarHeight(undefined);
        setSettingsMode(false);
        setFoldersMode(false);
        // Deselect only now that the drawer is hidden, so nothing moves during the exit
        clearSelectedHighlight();
      }
    },
    [isClosing, clearSelectedHighlight]
  );

  const handleStaggerEnd = useCallback(() => {
    setIsStaggering(false);
  }, []);

  // ─── Unified scroll controller ───
  const scrollTo = useCallback(
    (el: HTMLElement, alignment: 'top' | 'center' = 'top', behavior: ScrollBehavior = 'smooth') => {
      const container = scrollContainerRef.current;
      if (!container || !el) return;

      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      // Rects include the open animation's scale; divide it out to get scroll-space pixels
      const scale = containerRect.height / container.offsetHeight || 1;
      const elTopInScroll = (elRect.top - containerRect.top) / scale + container.scrollTop;
      const target =
        alignment === 'center'
          ? elTopInScroll - container.clientHeight / 2 + elRect.height / scale / 2
          : elTopInScroll - 16 - (el.closest('[data-folder-section]') ? FOLDER_LABEL_HEIGHT : 0);

      container.scrollTo({ top: Math.max(0, target), behavior });
    },
    []
  );

  // A page picked in the folders view: back to the list with that page expanded and scrolled to
  // the top. The list is hidden (display: none) while folders show, so the scroll waits for the
  // commit that shows it again.
  const handleOpenPage = useCallback(
    (url: string) => {
      if (selectedHighlightId) clearSelectedHighlight();
      setFoldersMode(false);
      setExpandedGroupUrl(url);
      // The page may already be the expanded one inside a collapsed section
      const key = pageGroups.find((g) => g.url === url)?.folderId;
      if (key) {
        setCollapsedSections((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
      setPendingOpenUrl(url);
    },
    [selectedHighlightId, clearSelectedHighlight, setExpandedGroupUrl, pageGroups]
  );

  useLayoutEffect(() => {
    if (!pendingOpenUrl || foldersMode || expandedGroupUrl !== pendingOpenUrl) return;
    const header = scrollContainerRef.current?.querySelector<HTMLElement>(
      `[data-page-url="${CSS.escape(pendingOpenUrl)}"]`
    );
    setPendingOpenUrl(null);
    if (header) scrollTo(header, 'top', 'instant');
  }, [pendingOpenUrl, foldersMode, expandedGroupUrl, scrollTo]);

  const toggleSectionCollapsed = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  // Whatever expands a page (opening from its mark, a new highlight, the folders view) also
  // reopens the folder section holding it
  useEffect(() => {
    const group = pageGroups.find((g) => g.url === expandedGroupUrl);
    if (!group) return;
    const key = group.folderId;
    if (!key) return;
    setCollapsedSections((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, [expandedGroupUrl]);

  // Stable identity so memoized HighlightItemExpandable rows can skip re-renders
  const handleScrollToItem = useCallback(
    (idx: number) => {
      const el = itemRefs.current[idx];
      if (el) scrollTo(el);
    },
    [scrollTo]
  );

  // Calculate drawer position based on logo position
  useEffect(() => {
    if (!logoPosition) return;

    const drawerWidth = DRAWER_CONFIG.WIDTH;
    const drawerHeight = DRAWER_CONFIG.HEIGHT;
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
    setDrawerLayout({ width: drawerWidth, height: drawerHeight, offset });

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
    });

    // Inner div: transformOrigin for scale animation pivot
    setInnerStyle({
      transformOrigin:
        drawerSide === 'right' ? `${-gap}px ${originY}px` : `${drawerWidth + gap}px ${originY}px`,
    });
  }, [logoPosition]);

  // Load stored data (highlights, page titles, settings) eagerly on mount
  useEffect(() => {
    loadAllHighlights();
  }, []);

  // Changes from this tab and others arrive on their own; reloading on open covers any this
  // tab missed while it was in the background
  useEffect(() => {
    if (isOpen) {
      loadAllHighlights();
    }
  }, [isOpen]);

  // Auto-expand current page group when drawer opens
  useEffect(() => {
    if (isOpen && !isLoading) {
      const currentGroup = pageGroups.find((g) => g.isCurrentPage);
      if (currentGroup) setExpandedGroupUrl(currentGroup.url);
    }
  }, [isOpen, isLoading]);

  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;

    // Shadow roots and documents are both EventTargets; type the handler as Event so one
    // listener signature fits either root.
    const handleEscape = (e: Event) => {
      if ((e as KeyboardEvent).key !== 'Escape') return;
      // In export mode Escape leaves it (and does nothing while it is already leaving);
      // the drawer closes on the next press
      if (exportMode) {
        if (!exportExiting) exitExportMode();
        return;
      }
      closeDrawer();
    };

    const root: EventTarget = drawerRef.current?.getRootNode() ?? document;
    root.addEventListener('keydown', handleEscape);
    return () => root.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeDrawer, exportMode, exportExiting, exitExportMode]);

  // Initialize current index when drawer opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
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

  // Exit settings when a mark is clicked on the page
  useEffect(() => {
    if (pendingScrollHighlightId && (settingsMode || foldersMode)) {
      setSettingsMode(false);
      setFoldersMode(false);
    }
  }, [pendingScrollHighlightId, settingsMode, foldersMode]);

  // Scroll to highlight when triggered from page mark click. If the drawer was hidden when
  // the mark was clicked, jump there before the first painted frame; if it was already
  // showing, animate the scroll.
  const lastPendingIdRef = useRef<string | null>(null);
  const pendingScrollInstantRef = useRef(false);

  useLayoutEffect(() => {
    if (pendingScrollHighlightId !== lastPendingIdRef.current) {
      lastPendingIdRef.current = pendingScrollHighlightId;
      pendingScrollInstantRef.current = !isVisible;
    }
    if (!pendingScrollHighlightId || isLoading) return;

    const index = highlightGlobalIndices.map.get(pendingScrollHighlightId);

    // If the group just expanded, highlightGlobalIndices may not have
    // the index yet. Do NOT clear pending — let the next render retry.
    if (index === undefined) return;

    selectHighlight(pendingScrollHighlightId);

    if (pendingScrollInstantRef.current) {
      // Expand its notes without animation so the jump is measured on the final layout
      setInstantExpandId(pendingScrollHighlightId);
      // Contents can't be measured until the render that makes the drawer visible
      if (!isVisible) return;
      const el = itemRefs.current[index];
      if (!el) return;
      scrollTo(el, 'top', 'instant');
      // Later expands animate again; the notes are already fully open, so nothing moves
      setInstantExpandId(null);
      clearPendingScrollHighlight();
      return;
    }

    // Wait for React to mount refs and CSS to apply after group expansion
    const timeoutId = setTimeout(() => {
      const el = itemRefs.current[index];
      if (el) scrollTo(el);
      clearPendingScrollHighlight();
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [pendingScrollHighlightId, isLoading, highlightGlobalIndices, isVisible, scrollTo]);

  // Put the current page's group at the list's top edge each time the drawer opens, instead of
  // keeping wherever the list was last scrolled. Runs before the first painted frame, and only
  // once that group is the expanded one so the measured offset is the final layout. Marks do
  // their own positioning above.
  const hasScrolledOnOpen = useRef(false);

  useLayoutEffect(() => {
    if (!isOpen) {
      hasScrolledOnOpen.current = false;
      return;
    }
    if (!isVisible || isLoading || hasScrolledOnOpen.current) return;
    if (drawerTrigger === 'mark') return;

    const currentGroup = pageGroups.find((g) => g.isCurrentPage);
    const sectionEl = currentPageSectionRef.current;
    if (!currentGroup || !sectionEl || expandedGroupUrl !== currentGroup.url) return;

    hasScrolledOnOpen.current = true;
    scrollTo(sectionEl, 'top', 'instant');
  }, [isOpen, isVisible, isLoading, pageGroups, expandedGroupUrl, drawerTrigger, scrollTo]);

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

  return (
    <div
      className="selection:bg-selected selection:text-bg-main"
      style={{ contentVisibility: isVisible ? 'visible' : 'hidden' }}
    >
      {/* Toolbar — fixed above draggable logo; stays mounted through the exit animation */}
      {logoPosition && isVisible && (
        <DrawerToolbar
          logoPosition={logoPosition}
          closing={isClosing}
          isExportActive={exportMode}
          isSettingsActive={settingsMode}
          isFoldersActive={foldersMode}
          onExportToggle={() => {
            if (exportMode) {
              exitExportMode();
            } else if (allHighlights.length === 0) {
              setSettingsMode(false);
              setFoldersMode(false);
              setExportEmptyMessage(true);
              setTimeout(() => setExportEmptyMessage(false), 3000);
            } else {
              setSettingsMode(false);
              setFoldersMode(false);
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
          onSettingsClick={() => {
            if (!settingsMode && exportMode) {
              resetExportState();
            }
            setFoldersMode(false);
            setSettingsMode((prev) => !prev);
          }}
          onFoldersClick={() => {
            if (!foldersMode && exportMode) {
              resetExportState();
            }
            setSettingsMode(false);
            setFoldersMode((prev) => !prev);
          }}
        />
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
          width: `${DRAWER_CONFIG.WIDTH}px`,
          height: `${DRAWER_CONFIG.HEIGHT}px`,
          zIndex: 1000,
          ...drawerStyle,
        }}
      >
        {/* Inner div — visuals + animation */}
        <div
          ref={innerRef}
          tabIndex={0}
          className={`${PANEL_SURFACE_CLASS} w-full h-full ${isClosing ? styles.drawerClosing : styles.drawerEntering}`}
          style={{
            contain: 'paint',
            outline: 'none',
            ...innerStyle,
          }}
          onAnimationEnd={handleDrawerAnimationEnd}
          onKeyDown={handleKeyDown}
        >
          {settingsMode && <DrawerSettings />}
          {foldersMode && <FolderList pages={folderPages} onOpenPage={handleOpenPage} />}
            <div style={{ display: settingsMode || foldersMode ? 'none' : undefined }} className="h-full">
              {/* Single scroll container with expandable items */}
              <div ref={scrollContainerRef} className={`${styles.scrollContainer} h-full`}>
                <div
                  className={`px-[38px] py-2 ${exportMode ? 'pb-16' : ''} ${allHighlights.length === 0 && !isLoading ? 'h-full' : ''} ${styles.highlightList}`}
                  data-has-expanded={selectedHighlightId ? '' : undefined}
                  data-group-expanded={expandedGroupUrl ? '' : undefined}
                  data-export-mode={exportMode && !exportExiting ? '' : undefined}
                >
                  {isLoading ? (
                    <>
                      <div
                        className="bg-button rounded-md animate-pulse"
                        style={{ height: '64px' }}
                      />
                      <div className="border-t border-divider mx-auto" style={{ width: '300px' }} />
                      <div
                        className="bg-button rounded-md animate-pulse"
                        style={{ height: '48px' }}
                      />
                      <div className="border-t border-divider mx-auto" style={{ width: '300px' }} />
                      <div
                        className="bg-button rounded-md animate-pulse"
                        style={{ height: '56px' }}
                      />
                    </>
                  ) : allHighlights.length === 0 ? (
                    <div className="flex flex-col gap-2 items-center justify-center h-full">
                      <p className={`text-center text-md transition-all duration-300 ${exportEmptyMessage ? 'font-normal text-error' : 'font-light text-text-main'}`}>
                        No highlights saved.
                        <br />
                        Select text on the page to start highlighting.
                      </p>
                    </div>
                  ) : (
                    (() => {
                      let hiddenHighlightsBefore = 0;
                      const renderGroup = (group: PageGroup, prevGroup: PageGroup | undefined) => {
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
                            {prevGroup &&
                              expandedGroupUrl !== prevGroup.url && (
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
                              {/* Keep every group reachable, including a lone group from another page. */}
                                <div
                                  data-item-expanded={!isCollapsed ? '' : undefined}
                                  data-export-selected={
                                    exportMode &&
                                    group.highlights.some((h) => exportSelectedIds.has(h.id))
                                      ? ''
                                      : undefined
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
                                    data-page-url={group.url}
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
                                              top: '5px',
                                            }}
                                          />
                                        );
                                      })()}
                                    <PageTitle
                                      url={group.url}
                                      title={group.pageTitle || group.url}
                                      isCollapsed={isCollapsed}
                                      editable={!exportMode}
                                    />
                                    {!exportMode && (
                                      <div
                                        className={styles.pageTrashIcon}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deletePageGroup(group.url);
                                        }}
                                      >
                                        <TrashIcon size={14} />
                                      </div>
                                    )}
                                  </div>
                                </div>

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
                                          exportMode && exportSelectedIds.has(highlight.id)
                                            ? ''
                                            : undefined
                                        }
                                        className={
                                          selectedHighlightId === highlight.id ? 'pt-4' : 'py-4'
                                        }
                                      >
                                        <HighlightItemExpandable
                                          checkboxSlot={
                                            exportMode ? (
                                              <input
                                                type="checkbox"
                                                checked={exportSelectedIds.has(highlight.id)}
                                                onChange={() => toggleExportHighlight(highlight.id)}
                                                onClick={(e) => e.stopPropagation()}
                                                disabled={exportScreen === 'options'}
                                                className={`${styles.checkbox} ${exportExiting ? styles.checkboxExiting : styles.checkboxEntering}`}
                                                style={{
                                                  position: 'absolute',
                                                  left: -24,
                                                  top: '5px',
                                                }}
                                              />
                                            ) : undefined
                                          }
                                          highlight={highlight}
                                          index={globalIdx}
                                          onScrollToItem={handleScrollToItem}
                                          isStaggering={isStaggering}
                                          expandInstantly={instantExpandId === highlight.id}
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
                      };
                      // Pages in no folder get a label of their own once any folder section exists,
                      // so where one section ends and the next begins reads at a glance
                      const hasFolderSection = sections.some((s) => s.folderId);
                      return sections.map((section) => {
                        const label = section.name ?? (hasFolderSection ? UNFILED_LABEL : null);
                        const sectionKey = section.folderId ?? 'no-folder';
                        const { folderId } = section;
                        // Folders collapse; "Unfiled" is a plain label and always open
                        const isSectionCollapsed = folderId !== null && collapsedSections.has(folderId);
                        return (
                          <div key={sectionKey} data-folder-section={label !== null ? '' : undefined}>
                            {folderId !== null && label !== null ? (
                              <div
                                role="button"
                                aria-expanded={!isSectionCollapsed}
                                className={`${styles.folderLabel} text-text-secondary hover:text-text-main cursor-pointer text-xs transition-colors`}
                                onClick={() => toggleSectionCollapsed(folderId)}
                              >
                                <ChevronDownIcon
                                  size={16}
                                  className={`${styles.folderChevron} ${isSectionCollapsed ? styles.folderChevronCollapsed : ''}`}
                                />
                                {label}
                              </div>
                            ) : (
                              label !== null && (
                                <div className={`${styles.folderLabel} text-text-secondary text-xs`}>
                                  {label}
                                </div>
                              )
                            )}
                            {!isSectionCollapsed &&
                              section.groups.map((group, i) => renderGroup(group, section.groups[i - 1]))}
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
              </div>
              {/* Floating export bar */}
              {exportMode &&
                !isLoading &&
                allHighlights.length > 0 &&
                !(exportExiting && !exportSuccess) && (
                  <div
                    className={`absolute bottom-3 left-1/2 bg-bg-elevated rounded-lg pl-[6px] pr-3.5 py-2.5 shadow-[0_-2px_8px_rgba(0,0,0,0.3)] ring-1 ring-edge ${exportExiting && exportSuccess ? styles.exportBarExiting : styles.exportBarEntering}`}
                    style={{
                      zIndex: 10,
                      width: '236px',
                    }}
                  >
                    <div
                      className={styles.exportScreenContainer}
                      style={exportBarHeight ? { height: exportBarHeight } : undefined}
                    >
                      {/* Select screen */}
                      <div
                        ref={exportSelectRef}
                        className={`${styles.exportScreen} ${exportScreen === 'select' ? styles.exportScreenActive : styles.exportScreenInactive}`}
                      >
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
                                ? `Current page (${currentPageHighlights.length})`
                                : exportScope === 'all'
                                  ? `All highlights (${allHighlights.length})`
                                  : `Selected (${exportSelectedIds.size})`}
                            </span>
                          </button>
                          {/* Next button */}
                          <button
                            onClick={() => setExportScreen('options')}
                            disabled={exportSelectedIds.size === 0}
                            className="px-3 text-sm font-light bg-button text-text-main hover:bg-button-hover shadow-bevel transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center tabular-nums"
                            style={{ borderRadius: '8px', height: '32px', paddingTop: '1px' }}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                      {/* Options screen */}
                      <div
                        ref={exportOptionsRef}
                        className={`${styles.exportScreen} ${exportScreen === 'options' ? styles.exportScreenActive : styles.exportScreenInactive}`}
                      >
                        <div
                          className="flex flex-col gap-2 pt-[7px] pl-[10px] pr-[2px]"
                          style={{ marginBottom: '1px' }}
                        >
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
                            <span className="text-text-main text-sm font-light">
                              Include timestamps
                            </span>
                            <input
                              type="checkbox"
                              checked={exportIncludeTimestamps}
                              onChange={(e) => setExportIncludeTimestamps(e.target.checked)}
                              className={styles.toggle}
                            />
                          </label>
                          <label className="flex items-center justify-between cursor-pointer">
                            <span className="text-text-main text-sm font-light">
                              Include page titles
                            </span>
                            <input
                              type="checkbox"
                              checked={exportIncludePageTitles}
                              onChange={(e) => setExportIncludePageTitles(e.target.checked)}
                              className={styles.toggle}
                            />
                          </label>
                          {/* Back + Export action buttons */}
                          <div className="flex gap-2">
                            {/* Back arrow button */}
                            <button
                              onClick={() => setExportScreen('select')}
                              disabled={exportSuccess !== null}
                              className="flex items-center justify-center bg-button text-text-secondary hover:text-text-main hover:bg-button-hover shadow-bevel transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                              style={{
                                borderRadius: '8px',
                                height: '32px',
                                width: '32px',
                                flexShrink: 0,
                              }}
                            >
                              &larr;
                            </button>
                            <div style={{ flex: '2 1 0', minWidth: 0 }}>
                              {exportSuccess === 'copy' ? (
                                <div
                                  className="w-full flex items-center justify-center shadow-bevel"
                                  style={{
                                    borderRadius: '8px',
                                    height: '32px',
                                    background: '#2a3a2a',
                                  }}
                                >
                                  <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                                    <path
                                      d="M1 5.5L5 9.5L13 1.5"
                                      stroke="#4CAF50"
                                      strokeWidth="1.5"
                                      strokeLinejoin="miter"
                                      strokeLinecap="square"
                                    />
                                  </svg>
                                </div>
                              ) : (
                                <button
                                  onClick={handleExportCopy}
                                  disabled={exportSuccess !== null}
                                  className="w-full text-sm font-light bg-button text-text-main hover:bg-button-hover shadow-bevel transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center"
                                  style={{ borderRadius: '8px', height: '32px' }}
                                >
                                  Copy
                                </button>
                              )}
                            </div>
                            <div style={{ flex: '3 1 0', minWidth: 0 }}>
                              {exportSuccess === 'download' ? (
                                <div
                                  className="w-full flex items-center justify-center shadow-bevel"
                                  style={{
                                    borderRadius: '8px',
                                    height: '32px',
                                    background: '#2a3a2a',
                                  }}
                                >
                                  <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                                    <path
                                      d="M1 5.5L5 9.5L13 1.5"
                                      stroke="#4CAF50"
                                      strokeWidth="1.5"
                                      strokeLinejoin="miter"
                                      strokeLinecap="square"
                                    />
                                  </svg>
                                </div>
                              ) : (
                                <button
                                  onClick={handleExportDownload}
                                  disabled={exportSuccess !== null}
                                  className="w-full text-sm font-light bg-button text-text-main hover:bg-button-hover shadow-bevel transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center"
                                  style={{ borderRadius: '8px', height: '32px' }}
                                >
                                  Download
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
});
