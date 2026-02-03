# Drawer - Browser Extension for Highlights

## What is This?

**Drawer** is a Firefox browser extension that lets users highlight text on any webpage, add notes, and access all highlights through a draggable drawer interface.

Think: Arc Browser's "Boost" feature meets annotation tools like Hypothesis, but with a focus on personal knowledge management.

## Current Status

**Phase**: Infrastructure Setup (Phase 0)
**Next Step**: Finalize design tokens in Figma before implementing UI components

### What's Been Built
✅ Project scaffolding (Vite + React + TypeScript)
✅ Extension manifest (Firefox MV2)
✅ Storage abstraction layer (`src/shared/storage.ts`)
✅ Core TypeScript interfaces (`src/shared/types.ts`)
✅ Shadow DOM setup (`src/content/shadowRoot.ts`)
✅ Build configuration (Tailwind + CRXJS)

### What's NOT Built Yet
❌ UI components (waiting for design tokens)
❌ Highlight manager
❌ Content script
❌ Background script
❌ Popup

## Key Architecture Decisions

### 1. Storage Abstraction Layer
**Why it matters**: `StorageService` class enables **zero-refactoring migration** from `browser.storage` to a database backend (PostgreSQL, MongoDB, Supabase) when this becomes part of a larger ecosystem.

All components call `storageService.saveHighlight()` instead of direct `browser.storage` calls. Future database integration = update one file, components stay unchanged.

### 2. Hybrid Styling Approach
- **Tailwind CSS**: 80% of styling (layout, spacing, colors, typography)
- **CSS Modules**: Complex animations (drawer slide-in, drag effects, toast transitions)

Benefits: Fast development + powerful animations without Tailwind limitations.

### 3. Shadow DOM for CSS Isolation
Extension UI lives in Shadow DOM to prevent conflicts with host page styles (critical for working across all websites).

### 4. No Separate Dashboard Page
Drawer toggles between "Current Page" and "All Highlights" views. All functionality (search, export, settings) built into the drawer UI. Inspired by https://benji.org/family-values

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Framework**: React 18+
- **Build**: Vite 5+ with CRXJS plugin (HMR for content scripts!)
- **Storage**: `browser.storage.local` (with migration path to database)
- **Styling**: Tailwind CSS + CSS Modules
- **State**: Zustand (cross-context state between content/popup/background)
- **Manifest**: V2 (Firefox has no deprecation timeline)

## Project Structure

```
drawer-extension/
├── manifest.json              # Extension config
├── package.json
├── vite.config.ts             # Vite + CRXJS
├── tailwind.config.ts         # Design tokens (UPDATE after Figma work)
├── src/
│   ├── shared/
│   │   ├── types.ts           # Core interfaces
│   │   ├── storage.ts         # Storage abstraction (database-ready)
│   │   ├── constants.ts       # Defaults
│   ├── content/
│   │   ├── shadowRoot.ts      # Shadow DOM setup
│   │   └── (UI files to be created after design phase)
│   ├── background/            # (Not created yet)
│   ├── popup/                 # (Not created yet)
│   └── components/            # (Not created yet)
```

## Next Steps (Phase 0 - Before Coding UI)

**You need to do this in Figma:**

1. **Define Core Design Tokens**:
   - Color palette (primary, neutral, semantic, highlight colors)
   - Spacing scale (4px or 8px base)
   - Typography (font families, sizes, weights, line heights)
   - Shadows (card, drawer, hover states)
   - Border radius (sm, md, lg, xl)
   - Animation durations (fast: 150ms, normal: 300ms, slow: 500ms)

2. **Export to `tailwind.config.ts`**:
   - Use Figma plugins ("Figma Tokens", "Design Tokens") or manual copy
   - Update the existing `tailwind.config.ts` with your values

3. **Create Rough Component Designs** (iteration-friendly):
   - Drawer shell (draggable container)
   - Highlight card
   - Toast notification
   - Search bar
   - (Don't need pixel-perfect, will iterate during development)

**Timeline**: 1-2 days if design tokens partially exist

## After Phase 0

Then come back and we'll implement:
- Content script with highlight manager (XPath serialization)
- Draggable drawer UI with your designs
- Toast notifications for notes
- Background script for keyboard shortcuts
- Browser popup

## Full Documentation

**Detailed implementation plan**: `~/.claude/plans/inherited-launching-raccoon.md`

This file contains:
- Complete architecture diagrams
- Phase-by-phase breakdown (Phases 1-4)
- Database migration strategy
- Testing checklists
- Distribution guide
- Code examples for all major features

## How to Run (When Ready)

```bash
# Install dependencies
npm install

# Development (with HMR)
npm run dev

# Load in Firefox
# 1. Open about:debugging#/runtime/this-firefox
# 2. Click "Load Temporary Add-on"
# 3. Select dist/manifest.json
```

## Important Notes

- **Don't code UI yet**: Waiting for design token finalization
- **Storage layer is database-ready**: Future migration requires zero component changes
- **Shadow DOM is mandatory**: CSS isolation prevents conflicts on host pages
- **All future features go in drawer**: No separate dashboard/options page

---

**Last Updated**: 2026-02-02
**Current Phase**: Phase 0 (Design Token Finalization)
**Blocking**: Figma design tokens export
