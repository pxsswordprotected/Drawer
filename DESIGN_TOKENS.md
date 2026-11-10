# Design Tokens - Drawer Extension

Source of truth: `tailwind.config.ts` (Tailwind tokens) and `src/shared/constants.ts` (highlight palette, layout constants). Use a Tailwind token whenever one exists; the "Recurring values" sections list values the UI repeats that are not tokens yet — reuse them exactly instead of inventing new ones.

---

## Typography

**Font**: Geist variable (`public/fonts/Geist-Variable.woff2`), loaded via `@font-face` in `src/index.css` and set as the Tailwind `sans` family.
**Default weight**: Light (300). `body` is 300, and every `text-*` size token bakes in weight 300.

### Sizes

| Class | Size / line-height | Used for |
|---|---|---|
| `text-xs` | 12px / 16px | Settings section labels, "Notes" label, inline error messages |
| `text-sm` | 14px / 20px | Highlight text, notes, buttons (most UI text) |
| `text-base` | 16px / 24px | Page group titles |

`text-lg` (18px) and `text-xl` (20px) exist but are unused in the drawer.

### Weights

- `font-light` (300) — default; set explicitly on buttons
- `font-medium` (500) — expanded page group title
- `font-normal` (400) — rare
- `font-semibold` / `font-bold` exist but are unused

---

## Colors (dark mode only)

### Surfaces

| Token | Value | Used for |
|---|---|---|
| `bg-bg-main` | #1A1A1A | Logo, toolbar, selection plus icon |
| `bg-bg-elevated` | #1A1A1A | Drawer panel (same value as `bg-main`: drawer and toolbar match) |

### Text

| Token | Value | Used for |
|---|---|---|
| `text-text-main` | #F5F5F5 | Primary text, icons, focused note input |
| `text-text-secondary` | #8C8C8C | Muted text, placeholders, idle icons |
| `text-bg-main` | #1A1A1A | Dark text on light fills (despite the name); currently unused |

### Lines

| Token | Value | Used for |
|---|---|---|
| `border-divider` | #484848 | Dividers between highlights/groups, checkbox borders |
| `ring-edge` / `border-edge` | rgba(255, 255, 255, 0.1) | 1px outline on the drawer panel; shows only where the page behind is dark |

### Semantic

| Token | Value | Used for |
|---|---|---|
| `text-error` / `bg-error` | #CC2424 | Trash icon on delete, inline error messages |
| `text-success` / `bg-success` | #14C935 | Defined, currently unused |

### Controls

| Token | Value | Used for |
|---|---|---|
| `bg-button` | #373737 | Button fill, toggle track, loading skeletons |
| `hover:bg-button-hover` | #444444 | Button hover fill |

In CSS modules, reference tokens with `theme()`, e.g. `theme('colors.button.DEFAULT')`, `theme('boxShadow.bevel')`.

### Recurring values (not tokens yet)

| Value | Used for |
|---|---|
| #2A2A2A | Logo hover fill |
| #2A3A2A + #4CAF50 checkmark | Success state on Backup / Restore / Copy / Download buttons |
| #DC2626 → #991B1B | "Delete all" button fill → hold-to-confirm fill |

---

## Highlight Colors

The palette users pick from in Settings is `HIGHLIGHT_COLORS` in `src/shared/constants.ts`:

| Name | Value |
|---|---|
| Yellow (default) | #FFFF02 |
| Green | #4CAF50 |
| Orange | #FF9800 |
| Blue | #1780FD |
| Pink | #E91E63 |
| Purple | #7C4BF5 |

---

## Surfaces & Depth

The drawer, toolbar, logo and buttons share one "bevel" look: a soft inner top-left highlight, plus a small drop shadow on floating controls.

| Token / name | Value | Used on |
|---|---|---|
| `shadow-bevel` | `inset 1px 1px 2.8px -1px rgba(255, 255, 255, 0.65)` | Every button, button success states, toggle track |
| `shadow-bevel-raised` | bevel + `0 2px 5px -1px rgba(0, 0, 0, 0.35)` | Toolbar, logo |
| Bevel (pressed), inline | `inset 1px 1px 2.8px -1px rgba(255, 255, 255, 0.55)` + `0 1px 2px -1px rgba(0, 0, 0, 0.45)` | Logo `:active` |
| Drop shadow, inline | `0 2px 5px -1px rgba(0, 0, 0, 0.35)` | Drawer panel (`shadow-[…]`, combined with `ring-edge`) |
| Export bar shadow | `0 -2px 8px rgba(0, 0, 0, 0.3)` | Floating export bar at the drawer bottom |

`shadow-drawer` and `shadow-card` exist in the Tailwind config but are unused.

---

## Border Radius

| Value | Class | Used for |
|---|---|---|
| 12px | `rounded-lg` | Drawer panel |
| 8px | inline `borderRadius: '8px'` | Logo, toolbar, buttons (the default `rounded` token is 8px but unused) |
| 6px | `rounded-md` | Loading skeletons |
| 4px | — | Checkboxes |
| full | `rounded-full` | Toggles, selection plus icon |

---

## Spacing & Sizing

**Rule**: even numbers (4, 8, 16, 24, 32…).

| Element | Size |
|---|---|
| Viewport edge margin (`DRAWER_CONFIG.EDGE_MARGIN`) | 24px for logo and drawer |
| Logo (FAB) | 44 × 44px |
| Drawer panel | 376 × 270px; opens 10px beside the logo, on whichever side fits |
| Drawer list padding | 38px horizontal (`px-[38px]`), 8px vertical (`py-2`) |
| Toolbar | 28px wide, two 28px icon buttons, sits 6px above (or below) the logo |
| Buttons | 32px tall, `px-4` (16px) or `px-3` (12px) horizontal padding |

---

## Motion

Motion lives in the CSS modules (per `CLAUDE.md`). Every animation has a `prefers-reduced-motion` fallback (fade only, no movement).

**Easing**: `cubic-bezier(0.19, 1, 0.22, 1)` (ease-out-expo) for almost everything. The toolbar uses `cubic-bezier(0.23, 1, 0.32, 1)`; the "Delete all" release uses a slight overshoot `cubic-bezier(0.175, 0.885, 0.32, 1.275)`.

| Duration | Used for |
|---|---|
| 60–100ms | Press feedback (`scale(0.95)`; quicker on press than release) |
| 150ms | Drawer open/close (scale 0.95 ↔ 1 + fade, pivoting from the logo), hovers, toggles, checkboxes, notes collapse |
| 160ms | Toolbar icon entry (scale 0.85 → 1) |
| 200ms | Notes fade-in, list dimming, plus-icon morph |
| 250ms | Staggered item/divider entry (translateY 10px → 0 + fade), notes expand |
| 1000ms (linear) | "Delete all" hold-to-confirm fill |

`duration-fast` (150ms) and `duration-normal` (300ms) exist in the Tailwind config but are unused.

---

## Design Philosophy

**Not Complicated**: intentionally minimal design system.
- Dark mode only for now
- Clean, readable, functional
- Doesn't need to be fancy, just consistent: reuse the values above

---

**Last Updated**: 2026-11-10
