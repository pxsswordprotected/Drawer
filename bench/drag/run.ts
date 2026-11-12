// Drag-selection benchmark: does dragging the Drawer logo select page text?
//
// Loads offline page fixtures in real Chrome, injects the production content script
// (bench/drag/.ext/content.js, built by autoresearch.sh) with a stub `chrome.runtime`,
// then drags the logo with scripted mouse/trackpad-like gestures. Each trial runs on a
// fresh page load. A recorder in the page samples the document selection every frame and
// on every selectionchange, during the gesture and for 300 ms after release.
//
// Primary metric: selection_trials = trials in which any non-whitespace page text was
// selected at any sample point (lower is better).
// Guards (exit 1 if violated): every drag must move the logo, the click gesture must open
// the drawer, and ordinary text selection must still work after dragging.

import puppeteer, { type Page } from 'puppeteer-core';
import { join } from 'node:path';

const ROOT = join(import.meta.dir);
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// FIREFOX_PATH set: run in Firefox (WebDriver BiDi) instead of Chromium
const FIREFOX = process.env.FIREFOX_PATH;
const VIEWPORT = { width: 1280, height: 800 };
const FIXTURES = ['internalthenexternal.html', 'article.html'];

// ─── Static server (fixtures + built extension assets) ───
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    const file = pathname.startsWith('/ext/')
      ? Bun.file(join(ROOT, '.ext', pathname.slice(5)))
      : Bun.file(join(ROOT, 'fixtures', pathname.slice(1)));
    return (await file.exists()) ? new Response(file) : new Response('not found', { status: 404 });
  },
});
const ORIGIN = `http://localhost:${server.port}`;
const CONTENT_JS = await Bun.file(join(ROOT, '.ext', 'content.js')).text();

// ─── In-page helpers ───
const STUB_CHROME = `
  window.chrome = window.chrome || {};
  // id: webextension-polyfill (bundled into content.js) refuses to load without one
  window.chrome.runtime = {
    id: 'drawer-bench',
    getURL: (p) => location.origin + '/ext/' + p,
    onMessage: { addListener() {} },
    getManifest: () => ({ version: 'bench' }),
  };
`;

// Samples selection; exposes window.__rec.{maxChars, visible, sample()}. A selection
// that already existed when the recorder was installed (the plus-icon gesture makes one
// on purpose) doesn't count; only a different, non-empty selection does.
const RECORDER = `(() => {
  const base = (document.getSelection() || '').toString();
  const rec = { base, maxChars: 0, last: 0, visible: false, samples: 0, active: true };
  const isVisible = (sel) => {
    const node = sel.anchorNode;
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el) return false;
    const bg = getComputedStyle(el, '::selection').backgroundColor;
    return !!bg && bg !== 'transparent' && !/rgba\\([^)]*,\\s*0\\)$/.test(bg);
  };
  rec.sample = () => {
    rec.samples++;
    rec.last = 0; // stays 0 unless this sample finds counted page text
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString();
    if (text === base) return;
    // Text selected entirely inside the extension UI (drawer) isn't page text. Firefox
    // reports shadow-tree selections on the document; Chromium doesn't.
    const ui = document.getElementById('drawer-extension-root')?.shadowRoot;
    if (ui && sel.getComposedRanges) {
      const [r] = sel.getComposedRanges({ shadowRoots: [ui] });
      if (r && ui.contains(r.startContainer) && ui.contains(r.endContainer)) return;
    }
    const chars = text.replace(/\\s+/g, '').length;
    rec.last = chars;
    if (chars > rec.maxChars) rec.maxChars = chars;
    if (chars > 0 && isVisible(sel)) rec.visible = true;
  };
  document.addEventListener('selectionchange', rec.sample);
  const tick = () => { if (!rec.active) return; rec.sample(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__rec = rec;
})()`;

const LOGO_STATE = `(() => {
  const host = document.getElementById('drawer-extension-root');
  const root = host && host.shadowRoot;
  if (!root) return null;
  const logo = [...root.querySelectorAll('div.absolute')].find((el) => {
    const r = el.getBoundingClientRect();
    return Math.round(r.width) === 44 && Math.round(r.height) === 44;
  });
  if (!logo) return null;
  const r = logo.getBoundingClientRect();
  return {
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
    drawerOpen: !!root.querySelector('[aria-label="Settings"]'),
  };
})()`;

type Logo = { x: number; y: number; drawerOpen: boolean };

async function freshPage(page: Page, fixture: string): Promise<Logo> {
  // Some Chromium builds (Helium) abort the very first navigation of a fresh browser;
  // retry a few times so the run measures gestures, not browser startup
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(`${ORIGIN}/${fixture}`, { waitUntil: 'load' });
      break;
    } catch (error) {
      if (attempt >= 3 || !String(error).includes('ERR_ABORTED')) throw error;
      await sleep(300);
    }
  }
  await page.evaluate(STUB_CHROME);
  await page.evaluate(() => localStorage.clear());
  await page.addScriptTag({ content: CONTENT_JS });
  let logo: Logo | null = null;
  for (let i = 0; i < 100 && !logo; i++) {
    logo = await page.evaluate(LOGO_STATE);
    if (!logo) await sleep(20);
  }
  if (!logo) throw new Error(`logo not found on ${fixture}`);
  await sleep(200); // lazy react-draggable chunk + layout settle
  await page.evaluate(() => document.getSelection()?.removeAllRanges());
  return page.evaluate(LOGO_STATE) as Promise<Logo>;
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

// Shape of the in-page recorder installed by RECORDER
interface Recorder {
  base: string; // selection text when the recorder started (not counted)
  maxChars: number;
  last: number; // counted chars at the most recent sample
  visible: boolean;
  active: boolean;
  sample: () => void;
}

// ─── Gestures ───
type Pt = { x: number; y: number };
type Gesture = {
  name: string;
  isDrag: boolean; // drags must move the logo; non-drag logo gestures must open the drawer
  // 'ui': press-and-drag on other extension controls (no logo guards).
  // 'info': reported separately as drawer_dragout_selection, not in the primary metric.
  kind?: 'ui' | 'info';
  prepare?: (page: Page, logo: Pt) => Promise<void>; // runs before the recorder starts
  run: (page: Page, from: Pt, to: Pt) => Promise<void>;
};

// Center of an element inside the extension's shadow root
async function uiPoint(page: Page, selector: string): Promise<Pt> {
  const pt = await page.evaluate((sel) => {
    const root = document.getElementById('drawer-extension-root')?.shadowRoot;
    const el = root?.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);
  if (!pt) throw new Error(`extension element not found: ${selector}`);
  return pt;
}

async function openDrawer(page: Page, logo: Pt) {
  await page.mouse.click(logo.x, logo.y);
  await sleep(500); // open animation + toolbar mount
}

async function pressDrag(page: Page, from: Pt, to: Pt) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await moveLinear(page, from, to, 15, 10);
  await page.mouse.up();
}

// First line of plain paragraph text fully in view, away from the right edge (logo)
async function paragraphText(page: Page): Promise<(Pt & { w: number }) | null> {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if ((n.textContent ?? '').trim().length < 40) continue;
      // Plain paragraph text only: dragging a link starts a link drag, not a selection
      const parent = n.parentElement;
      if (parent?.tagName !== 'P' || parent.closest('a, button, nav')) continue;
      const range = document.createRange();
      range.setStart(n, 0);
      range.setEnd(n, 30);
      const r = range.getBoundingClientRect();
      if (r.width > 100 && r.top > 0 && r.bottom < innerHeight && r.left > 0 && r.right < innerWidth - 100) {
        return { x: r.left + 2, y: r.top + r.height / 2, w: r.width };
      }
    }
    return null;
  });
}

async function moveLinear(page: Page, from: Pt, to: Pt, steps: number, gapMs: number) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    if (gapMs) await sleep(gapMs);
  }
}

const GESTURES: Gesture[] = [
  {
    name: 'mouse-fast',
    isDrag: true,
    run: async (page, from, to) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await moveLinear(page, from, to, 10, 0);
      await page.mouse.up();
    },
  },
  {
    name: 'mouse-slow',
    isDrag: true,
    run: async (page, from, to) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await moveLinear(page, from, to, 40, 16);
      await page.mouse.up();
    },
  },
  {
    // Trackpad: press, hold still, then drag slowly
    name: 'trackpad-press-hold',
    isDrag: true,
    run: async (page, from, to) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await sleep(350);
      await moveLinear(page, from, to, 30, 16);
      await page.mouse.up();
    },
  },
  {
    // Trackpad: finger jitter below the drag threshold before the real movement
    name: 'trackpad-jitter-start',
    isDrag: true,
    run: async (page, from, to) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      for (const [dx, dy] of [[1, 0], [2, 1], [1, 2], [3, 1], [2, 3], [3, 3]]) {
        await page.mouse.move(from.x - dx, from.y - dy);
        await sleep(30);
      }
      await moveLinear(page, { x: from.x - 3, y: from.y - 3 }, to, 25, 16);
      await page.mouse.up();
    },
  },
  {
    // Trackpad: low event rate, large jumps between moves
    name: 'trackpad-coarse',
    isDrag: true,
    run: async (page, from, to) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await moveLinear(page, from, to, 5, 40);
      await page.mouse.up();
    },
  },
  {
    // macOS "tap to click" + tap-and-drag: a quick click, then a press that arrives as
    // the second click (clickCount 2) and drags
    name: 'trackpad-tap-drag',
    isDrag: true,
    run: async (page, from, to) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down({ clickCount: 1 });
      await page.mouse.up({ clickCount: 1 });
      await sleep(80);
      await page.mouse.down({ clickCount: 2 });
      await moveLinear(page, from, to, 25, 16);
      await page.mouse.up({ clickCount: 2 });
    },
  },
  {
    // Drag leaves the window and is released outside it
    name: 'drag-out-of-window',
    isDrag: true,
    run: async (page, from, to) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await moveLinear(page, from, to, 15, 10);
      // Firefox's WebDriver rejects off-viewport moves; release at the left edge there
      await moveLinear(page, to, { x: FIREFOX ? 0 : -40, y: to.y }, 8, 10);
      await page.mouse.up();
      await page.mouse.move(to.x, to.y);
    },
  },
  {
    // Drag out and back over the start, sweeping text both ways
    name: 'drag-out-and-back',
    isDrag: true,
    run: async (page, from, to) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await moveLinear(page, from, to, 20, 10);
      await moveLinear(page, to, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, 10, 10);
      await page.mouse.up();
    },
  },
  {
    // Click with a 2 px wobble: should open the drawer, never select
    name: 'click-wobble',
    isDrag: false,
    run: async (page, from) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x - 2, from.y - 1);
      await sleep(60);
      await page.mouse.up();
    },
  },
  {
    // Drag the logo while the drawer is open (drag closes it)
    name: 'drag-drawer-open',
    isDrag: true,
    prepare: openDrawer,
    run: (page, from, to) => pressDrag(page, from, to),
  },
  {
    // Press the toolbar's Settings button and drag off it across the page
    name: 'toolbar-settings-press-drag',
    isDrag: false,
    kind: 'ui',
    prepare: openDrawer,
    run: async (page, _from, to) => pressDrag(page, await uiPoint(page, '[aria-label="Settings"]'), to),
  },
  {
    name: 'toolbar-export-press-drag',
    isDrag: false,
    kind: 'ui',
    prepare: openDrawer,
    run: async (page, _from, to) =>
      pressDrag(page, await uiPoint(page, '[aria-label="Toggle export mode"]'), to),
  },
  {
    // Select page text so the "+" button appears, then press it and drag away (no save)
    name: 'plus-icon-press-drag',
    isDrag: false,
    kind: 'ui',
    prepare: async (page) => {
      const t = await paragraphText(page);
      if (!t) throw new Error('no paragraph text for plus-icon gesture');
      await page.mouse.move(t.x, t.y);
      await page.mouse.down();
      await moveLinear(page, t, { x: t.x + t.w - 4, y: t.y }, 8, 10);
      await page.mouse.up();
      await sleep(150);
    },
    run: async (page, _from, to) => pressDrag(page, await uiPoint(page, '[data-selection-plus-icon]'), to),
  },
  {
    // Press on the drawer's own text and drag out over the page (informational: selecting
    // inside the drawer is allowed; spilling into page text is reported separately)
    name: 'drawer-text-drag-out',
    isDrag: false,
    kind: 'info',
    prepare: openDrawer,
    run: async (page, _from, to) => {
      const pt = await page.evaluate(() => {
        const root = document.getElementById('drawer-extension-root')?.shadowRoot;
        const p = root && [...root.querySelectorAll('[data-drawer] p')].find((el) => el.textContent?.trim());
        if (!p) return null;
        const r = p.getBoundingClientRect();
        return { x: r.left + 4, y: r.top + Math.min(10, r.height / 2) };
      });
      if (!pt) throw new Error('no drawer text');
      await pressDrag(page, pt, to);
    },
  },
];

const TARGETS: { name: string; at: (v: typeof VIEWPORT) => Pt }[] = [
  { name: 'up-left', at: (v) => ({ x: v.width * 0.35, y: v.height * 0.3 }) },
  { name: 'left', at: (v) => ({ x: v.width * 0.45, y: v.height - 60 }) },
];

// ─── Run ───
const browser = await puppeteer.launch(
  FIREFOX
    ? { browser: 'firefox', executablePath: FIREFOX, headless: true, defaultViewport: VIEWPORT }
    : {
        executablePath: CHROME,
        headless: true,
        args: [`--window-size=${VIEWPORT.width},${VIEWPORT.height}`, '--no-first-run', '--disable-gpu'],
        defaultViewport: VIEWPORT,
      }
);

let selectionTrials = 0;
let visibleTrials = 0;
let postReleaseTrials = 0;
let selectedChars = 0;
let dragFailures = 0;
let clickFailures = 0;
let selectBlocked = 0;
let drawerSelectBlocked = 0;
let trials = 0;
let drawerDragout = 0;
const perGesture: Record<string, number> = {};
const perFixture: Record<string, number> = {};
const failures: string[] = [];

try {
  const page = await browser.newPage();
  for (const fixture of FIXTURES) {
    for (const gesture of GESTURES) {
      const targets = gesture.isDrag || gesture.kind ? TARGETS : TARGETS.slice(0, 1);
      for (const target of targets) {
        const label = `${fixture}/${gesture.name}/${target.name}`;
        const logo = await freshPage(page, fixture);
        await gesture.prepare?.(page, logo);
        await page.evaluate(RECORDER);
        await gesture.run(page, logo, target.at(VIEWPORT));
        const atRelease = await page.evaluate(() => {
          (window as unknown as { __rec: Recorder }).__rec.sample();
          const sel = document.getSelection();
          return sel ? sel.toString().replace(/\s+/g, '').length : 0;
        });
        await sleep(300);
        const rec = await page.evaluate(() => {
          const r = (window as unknown as { __rec: Recorder }).__rec;
          r.sample();
          r.active = false;
          return {
            maxChars: r.maxChars,
            visible: r.visible,
            post: r.last,
          };
        });
        const after = (await page.evaluate(LOGO_STATE)) as Logo;
        trials++;

        if (gesture.kind === 'info') {
          if (rec.maxChars > 0) {
            drawerDragout++;
            failures.push(`INFO ${label}: max=${rec.maxChars} post=${rec.post} visible=${rec.visible}`);
          }
          continue;
        }

        if (rec.maxChars > 0) {
          selectionTrials++;
          selectedChars += rec.maxChars;
          perGesture[gesture.name] = (perGesture[gesture.name] ?? 0) + 1;
          perFixture[fixture] = (perFixture[fixture] ?? 0) + 1;
          failures.push(`${label}: max=${rec.maxChars} atRelease=${atRelease} post=${rec.post} visible=${rec.visible}`);
        }
        if (rec.visible) visibleTrials++;
        if (rec.post > 0) postReleaseTrials++;

        if (gesture.kind) continue; // other UI controls: no logo guards
        if (gesture.isDrag) {
          const moved = Math.hypot(after.x - logo.x, after.y - logo.y);
          if (moved < 50) {
            dragFailures++;
            failures.push(`GUARD ${label}: logo moved only ${moved.toFixed(0)}px`);
          }
        } else if (!after.drawerOpen) {
          clickFailures++;
          failures.push(`GUARD ${label}: click did not open the drawer`);
        }
      }
    }

    // Ordinary text selection must still work after a drag (regression: blocked selectstart)
    const logo = await freshPage(page, fixture);
    await GESTURES[0].run(page, logo, TARGETS[0].at(VIEWPORT));
    await sleep(200);
    await page.evaluate(() => document.getSelection()?.removeAllRanges());
    const textPt = await paragraphText(page);
    if (textPt) {
      await page.mouse.move(textPt.x, textPt.y);
      await page.mouse.down();
      await moveLinear(page, textPt, { x: textPt.x + textPt.w - 4, y: textPt.y }, 8, 10);
      await page.mouse.up();
      await sleep(100);
      const chars = await page.evaluate(() => (document.getSelection()?.toString() ?? '').trim().length);
      if (chars === 0) {
        selectBlocked++;
        failures.push(`GUARD ${fixture}: text selection blocked after drag`);
      }
    } else {
      failures.push(`GUARD ${fixture}: no visible text found for selection check`);
      selectBlocked++;
    }

    // Text inside the drawer must stay selectable (users copy highlights and notes)
    const drawerLogo = await freshPage(page, fixture);
    await openDrawer(page, drawerLogo);
    const line = await page.evaluate(() => {
      const root = document.getElementById('drawer-extension-root')?.shadowRoot;
      const p = root && [...root.querySelectorAll('[data-drawer] p')].find((el) => el.textContent?.trim());
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return { x: r.left + 2, y: r.top + Math.min(10, r.height / 2), w: r.width };
    });
    let drawerChars = 0;
    if (line) {
      await page.mouse.move(line.x, line.y);
      await page.mouse.down();
      await moveLinear(page, line, { x: line.x + line.w - 4, y: line.y }, 8, 10);
      // Read before release: releasing on drawer text is not a click, but keep it simple
      drawerChars = await page.evaluate(() => {
        const root = document.getElementById('drawer-extension-root')?.shadowRoot as
          | (ShadowRoot & { getSelection?: () => Selection | null })
          | undefined;
        // Chromium exposes shadow-tree selections on the root; Firefox on the document
        const sel = root?.getSelection?.() ?? document.getSelection();
        return (sel?.toString() ?? '').replace(/\s+/g, '').length;
      });
      await page.mouse.up();
    }
    if (drawerChars === 0) {
      drawerSelectBlocked++;
      failures.push(`GUARD ${fixture}: drawer text could not be selected`);
    }
  }
} finally {
  await browser.close();
  server.stop(true);
}

for (const line of failures) console.log(line);
console.log(`ASI per_gesture=${JSON.stringify(perGesture)}`);
console.log(`ASI per_fixture=${JSON.stringify(perFixture)}`);
console.log(`METRIC selection_trials=${selectionTrials}`);
console.log(`METRIC visible_selection_trials=${visibleTrials}`);
console.log(`METRIC post_release_selection_trials=${postReleaseTrials}`);
console.log(`METRIC selected_chars=${selectedChars}`);
console.log(`METRIC drawer_dragout_selection=${drawerDragout}`);
console.log(`METRIC trials=${trials}`);
console.log(`METRIC drag_failures=${dragFailures}`);
console.log(`METRIC click_failures=${clickFailures}`);
console.log(`METRIC select_blocked=${selectBlocked}`);
console.log(`METRIC drawer_select_blocked=${drawerSelectBlocked}`);

if (dragFailures || clickFailures || selectBlocked || drawerSelectBlocked) {
  console.error('guard failure: dragging, clicking, or ordinary text selection broke');
  process.exit(1);
}
