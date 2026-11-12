# Drawer

**Work in progress.** Not ready for public use.

A browser extension for saving and organizing text highlights & notes across the web. Works with Firefox and Chromium-based browsers.

## What it does

- Highlight text on any webpage and save it
- View all your highlights in a floating drawer, grouped by page
- Add notes to highlights
- Color-code highlights 
- Export highlights to json or md (soon)
- +more

## Development

```bash
npm install
npm run dev
```

### Drawer content regression

Page-group headers remain available even when all saved highlights belong to one other page.
The offline browser check covers that case, empty storage, expanding/collapsing groups,
settings/export round trips, deletion, and reopening before/after the exit animation finishes.

```bash
npx vite build --mode extension --outDir bench/drag/.ext
bun bench/drawer/run.ts
# Helium instead of Chrome:
CHROME_PATH="/Applications/Helium.app/Contents/MacOS/Helium" bun bench/drawer/run.ts
```

### Debug build (real-site testing)

```bash
npm run build:extension:debug   # same as build:extension, plus the debug log
```

Load `dist/` as an unpacked extension (Manifest V2: use Helium or Firefox). The extension then records
structured events (highlight saves, restores on revisit, clicks/holds on highlights, drawer open/close,
the extension's own errors) to extension storage, capped at the 20 most recent page loads. In
Settings → General, **Export log** downloads them as `drawer-debug-<date>.json` and **Clear** empties
the log. Page content is kept only as short excerpts, plus up to 2 KB of surrounding HTML when a save or
restore fails or matches inexactly. The dev page (`npm run dev`) logs the same way. The normal
`build:extension` contains none of this.

## Status

Late development. Not published to any browser extension store yet.
