import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDrawerStore } from '@/store/drawerStore';
import { DRAWER_CONFIG, PANEL_SURFACE_CLASS } from '@/shared/constants';
import type { TooltipTarget } from '@/shared/types';
import { placeTooltip, TOOLTIP_GAP } from '@/content/tooltipGeometry';
import type { Highlight } from '@/shared/types';
import { AddNoteRow, NoteRows, newestFirst } from './Notes';
import { HighlightColorPicker } from './HighlightColorPicker';
import styles from './HighlightsDrawer.module.css';
import tooltipStyles from './HighlightTooltip.module.css';

/**
 * Notes for the highlight under the cursor. Looks and animates like the drawer (same panel
 * shell, same enter/exit keyframes); `highlightHover` decides when `tooltip` is set.
 */
export const HighlightTooltip: React.FC = () => {
  const tooltip = useDrawerStore((s) => s.tooltip);
  const isOpen = useDrawerStore((s) => s.isOpen);

  // `shown` outlives `tooltip` by the exit animation
  const [shown, setShown] = useState<TooltipTarget | null>(null);
  const [closing, setClosing] = useState(false);

  const highlight = useDrawerStore((s) => s.allHighlights.find((h) => h.id === shown?.highlightId));

  if (tooltip && shown !== tooltip) {
    setShown(tooltip);
    setClosing(false);
  }
  if (!tooltip && shown && !closing) setClosing(true);
  // The drawer took over: gone at once, no exit animation
  if (isOpen && shown) {
    setShown(null);
    setClosing(false);
  }

  const placement = useMemo(
    () => (shown ? placeTooltip(shown, { width: window.innerWidth, height: window.innerHeight }) : null),
    [shown]
  );

  if (!shown || !highlight || !placement || isOpen) return null;

  const above = placement.side === 'above';

  return (
    <div
      data-highlight-tooltip
      className={`fixed left-0${closing ? ' pointer-events-none' : ''}`}
      style={{
        width: DRAWER_CONFIG.WIDTH,
        zIndex: 1000,
        top: placement.anchorY,
        translate: `${placement.x}px ${above ? '-100%' : '0px'}`,
      }}
    >
      <div
        key={shown.highlightId}
        className={`${PANEL_SURFACE_CLASS} flex flex-col selection:bg-selected selection:text-bg-main ${closing ? styles.drawerClosing : styles.drawerEntering}`}
        style={{
          contain: 'paint',
          outline: 'none',
          maxHeight: placement.maxHeight,
          // The highlight's edge, TOOLTIP_GAP beyond the near edge: the scale animation grows from it at any height
          transformOrigin: `${placement.originX}px ${above ? `calc(100% + ${TOOLTIP_GAP}px)` : `${-TOOLTIP_GAP}px`}`,
        }}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && closing) {
            setShown(null);
            setClosing(false);
          }
        }}
      >
        <TooltipBody highlight={highlight} above={above} />
      </div>
    </div>
  );
};

/**
 * Notes label pinned top-left, the add-note input at the end nearest the highlight, notes
 * stacked away from it (newest next to the input). State lives here so it resets with the panel `key`.
 */
const TooltipBody: React.FC<{ highlight: Highlight; above: boolean }> = ({ highlight, above }) => {
  const notes = useMemo(() => newestFirst(highlight.notes), [highlight.notes]);
  const hasNotes = notes.length > 0;
  const listRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ top: false, bottom: false });

  const updateFade = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const offset = Math.abs(el.scrollTop); // distance from the input end
    const hiddenNear = offset > 1;
    const hiddenFar = el.scrollHeight - el.clientHeight - offset > 1;
    const next = above ? { top: hiddenFar, bottom: hiddenNear } : { top: hiddenNear, bottom: hiddenFar };
    setFade((prev) => (prev.top === next.top && prev.bottom === next.bottom ? prev : next));
  }, [above]);

  // Panel height changes, notes added/removed, a note's textarea growing
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    updateFade();
    const ro = new ResizeObserver(updateFade);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => ro.disconnect();
  }, [notes, updateFade]);

  // Keep the list at the input end when a note is added
  const count = notes.length;
  const prevCount = useRef(count);
  useEffect(() => {
    if (count > prevCount.current) listRef.current?.scrollTo({ top: 0 });
    prevCount.current = count;
  }, [count]);

  const header = (
    <div className="shrink-0 px-[38px] pt-4 pb-1">
      <div className="flex h-5 items-center justify-between">
        <p className="text-text-secondary text-xs">Notes</p>
        <HighlightColorPicker highlightId={highlight.id} color={highlight.color} />
      </div>
    </div>
  );
  const list = (
    <div
      ref={listRef}
      data-tooltip-list
      data-fade-top={fade.top ? '' : undefined}
      data-fade-bottom={fade.bottom ? '' : undefined}
      onScroll={updateFade}
      className={`${tooltipStyles.list} ${above ? tooltipStyles.listAbove : tooltipStyles.listBelow}`}
    >
      <NoteRows highlightId={highlight.id} notes={notes} borderSide={above ? 'top' : 'bottom'} />
    </div>
  );

  return above ? (
    <>
      {header}
      {list}
      <div className="shrink-0 px-[38px] pb-2">
        {hasNotes && <div className="border-t border-divider" />}
        <AddNoteRow highlightId={highlight.id} hasNotes={hasNotes} />
      </div>
    </>
  ) : (
    <>
      {header}
      <div className="shrink-0 px-[38px]">
        <AddNoteRow highlightId={highlight.id} hasNotes={hasNotes} />
        {hasNotes && <div className="border-t border-divider" />}
      </div>
      {list}
    </>
  );
};
