import React, { useEffect, useRef, useState } from 'react';
import { useDrawerStore } from '@/store/drawerStore';
import { COLOR_OPTIONS, highlighterStyle } from './ColorSwatch';
import styles from './HighlightTooltip.module.css';

const SWATCH = 16;
const GAP = 12;
const STEP = SWATCH + GAP;
const MARGIN = 16; // hover margin around the open flyout before it closes

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The highlight's current color; hovering it fans the other palette colors out to its left.
 * A pick recolors the highlight and collapses the menu, which stays shut until the cursor has
 * left the swatch and come back.
 */
export const HighlightColorPicker: React.FC<{ highlightId: string; color: string }> = ({
  highlightId,
  color,
}) => {
  const current = COLOR_OPTIONS.find((o) => same(o.value, color));
  const others = COLOR_OPTIONS.filter((o) => !same(o.value, color));
  const reach = others.length * STEP + SWATCH;

  const [open, setOpen] = useState(false);
  const [suppressed, setSuppressed] = useState(false); // from a pick until the cursor leaves the picker's hover area
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Clears suppression once the cursor is seen outside the picker's hover area
  useEffect(() => {
    if (!suppressed) return;
    const onMove = (e: PointerEvent) => {
      if (rootRef.current && !e.composedPath().includes(rootRef.current)) setSuppressed(false);
    };
    window.addEventListener('pointermove', onMove, { capture: true, passive: true });
    return () => window.removeEventListener('pointermove', onMove, { capture: true });
  }, [suppressed]);

  // Closes when the cursor leaves the flyout's rectangle plus a margin (a coordinate test, not
  // an overlay, so it never intercepts clicks on the rows below)
  useEffect(() => {
    if (!open) return;
    const onMove = (e: PointerEvent) => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const inside =
        e.clientX >= r.right - reach - MARGIN &&
        e.clientX <= r.right + MARGIN &&
        e.clientY >= r.top - MARGIN &&
        e.clientY <= r.bottom + MARGIN;
      if (!inside) setOpen(false);
    };
    window.addEventListener('pointermove', onMove, { capture: true, passive: true });
    return () => window.removeEventListener('pointermove', onMove, { capture: true });
  }, [open, reach]);

  const collapse = () => {
    setOpen(false);
    setSuppressed(true);
  };

  const pick = (value: string) => {
    if (!same(value, color)) void useDrawerStore.getState().setHighlightColor(highlightId, value);
    collapse();
    const root = rootRef.current;
    // The picked button unmounts into the trigger; suppression stops the focus from reopening
    if (root?.contains((root.getRootNode() as ShadowRoot).activeElement)) triggerRef.current?.focus();
  };

  // Mouse clicks must not focus a swatch: focus inside the tooltip would keep it open
  const keepFocus = (e: React.PointerEvent) => e.preventDefault();

  return (
    <div
      ref={rootRef}
      data-color-picker
      data-open={open ? '' : undefined}
      className={styles.picker}
      style={{ width: SWATCH, height: SWATCH }}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onPointerEnter={() => {
        if (!suppressed) setOpen(true);
      }}
    >
      {/* Invisible hover area as wide as the open flyout, so the menu is easy to reach */}
      <div aria-hidden className={styles.hit} style={{ width: reach }} />
      {others.map((opt, i) => {
        const offset = STEP * (others.length - i);
        return (
          <button
            key={opt.value}
            type="button"
            className={`${styles.swatch} ${styles.other}`}
            aria-label={`${opt.name} highlight color`}
            tabIndex={open ? 0 : -1}
            style={
              {
                ...highlighterStyle(opt.value, false, SWATCH),
                right: offset,
                '--slide': `${offset}px`,
              } as React.CSSProperties
            }
            onPointerDown={keepFocus}
            onClick={() => pick(opt.value)}
          />
        );
      })}
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.swatch} ${styles.current}`}
        aria-label={`${current?.name ?? 'Custom'} highlight color`}
        aria-expanded={open}
        style={highlighterStyle(color, true, SWATCH)}
        onPointerDown={keepFocus}
        onFocus={() => {
          if (!suppressed) setOpen(true);
        }}
        onClick={() => (open ? collapse() : setOpen(true))}
      />
    </div>
  );
};
