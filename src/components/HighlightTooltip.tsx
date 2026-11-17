import React, { useMemo, useState } from 'react';
import { useDrawerStore } from '@/store/drawerStore';
import { DRAWER_CONFIG, PANEL_SURFACE_CLASS } from '@/shared/constants';
import type { TooltipTarget } from '@/shared/types';
import { placeTooltip } from '@/content/tooltipGeometry';
import { NotesSection } from './Notes';
import styles from './HighlightsDrawer.module.css';

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

  return (
    <div
      data-highlight-tooltip
      className={`fixed top-0 left-0${closing ? ' pointer-events-none' : ''}`}
      style={{
        width: DRAWER_CONFIG.WIDTH,
        height: DRAWER_CONFIG.HEIGHT,
        zIndex: 1000,
        translate: `${placement.x}px ${placement.y}px`,
      }}
    >
      <div
        key={shown.highlightId}
        className={`${PANEL_SURFACE_CLASS} selection:bg-selected selection:text-bg-main ${closing ? styles.drawerClosing : styles.drawerEntering}`}
        style={{
          contain: 'paint',
          outline: 'none',
          transformOrigin: `${placement.origin.x}px ${placement.origin.y}px`,
        }}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && closing) {
            setShown(null);
            setClosing(false);
          }
        }}
      >
        <div className={`${styles.scrollContainer} overscroll-contain h-full`}>
          <div className="px-[38px] py-2">
            <NotesSection highlightId={highlight.id} notes={highlight.notes} />
          </div>
        </div>
      </div>
    </div>
  );
};
