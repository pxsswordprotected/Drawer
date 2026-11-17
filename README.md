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

### Cross-tab storage

Each highlight and custom page title is stored under its own key (`h:<id>`, `t:<url>`), and every
tab's drawer follows storage change events, so a change in one tab shows in the others without
reopening the drawer. Tabs never write storage themselves: each change is a message to the
background script (`src/background/index.ts`), which applies changes one at a time, so two tabs
can't overwrite each other. The background is an event page, so a write after it unloaded wakes it
first (about 50 ms instead of a few). `bench/storage` replays a seeded workload of concurrent
writes from several simulated tabs against the real storage and background code and counts writes
that were lost.

```bash
bash autoresearch.sh                 # builds and runs the storage bench (METRIC lost_updates=…)
bun bench/storage/run.ts --serial    # same actions one at a time: must report 0
npm run build:extension && bun bench/storage/smoke.ts   # real extension, two tabs, in Helium
bash bench/checks.sh                 # drawer, drag and anchoring regression guards
```

Saved data from builds before this layout (one `highlights` array) is not read. Bring it back
with Settings → Restore backup.

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
