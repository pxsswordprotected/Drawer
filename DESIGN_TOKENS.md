# Design Tokens - Drawer Extension

## Typography

**Font**: Geist (Vercel's font) - ✅ **Already installed and configured**
**Default Weight**: Light (300) - used for all text unless specified otherwise

The font is imported in `src/index.css` and set as the default font family.

### Font Weights Available
- `font-light` (300) - **Default for most text**
- `font-normal` (400)
- `font-medium` (500)
- `font-semibold` (600)
- `font-bold` (700)

Use other weights only when explicitly needed (e.g., headings, emphasis).

---

## Colors (Dark Mode Default)

### Backgrounds
- `bg-bg-main` - #1A1A1A (Main background)
- `bg-bg-elevated` - #242424 (Cards, drawer, elevated surfaces)

### Text
- `text-text-main` - #F5F5F5 (Primary text)
- `text-text-secondary` - #8C8C8C (Secondary/muted text)

### UI Elements
- `border-divider` - #484848 (Borders, dividers)

### Semantic Colors
- `text-error` / `bg-error` - #CC2424 (Errors, destructive actions)
- `text-success` / `bg-success` - #14C935 (Success, good-to-go states)

### Highlight Colors (for text highlighting)
- Yellow: #FFEB3B
- Green: #4CAF50
- Blue: #2196F3
- Pink: #E91E63
- Purple: #9C27B0

---

## Spacing

**Rule**: Even numbers only
**Minimum margin**: 16px (p-4) on all menus and main views

Common spacing values:
- `gap-2` / `p-2` - 8px
- `gap-4` / `p-4` - 16px (minimum for views)
- `gap-6` / `p-6` - 24px
- `gap-8` / `p-8` - 32px

---

## Shadows (Dark Mode Optimized)

- `shadow-drawer` - Subtle elevation for drawer
- `shadow-card` - Subtle elevation for cards

---

## Border Radius

- Default: 8px (`rounded`)
- Large: 12px (`rounded-lg`)

---

## Animation Durations

- `duration-fast` - 150ms (quick interactions)
- `duration-normal` - 300ms (standard transitions)

---

## Design Philosophy

**Not Complicated**: Intentionally minimal design system.
- Dark mode first (light mode maybe later)
- Clean, readable, functional
- System doesn't need to be fancy, just consistent

---

**Last Updated**: 2026-02-02
