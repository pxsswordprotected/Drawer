// Offline regression for the hover notes tooltip: pure geometry (no browser), then real-browser
// behavior driven through real mouse events on highlights made through the real UI.
// Build first: npx vite build --mode extension --outDir bench/drag/.ext
// Run: bun bench/tooltip/run.ts (CHROME_PATH can select Helium).
import puppeteer, { type Page } from 'puppeteer-core';
import { join } from 'node:path';
import {
  CONE_TOLERANCE,
  TOOLTIP_GAP,
  TOOLTIP_MIN_HEIGHT,
  isInSafeZone,
  placeTooltip,
  tooltipRect,
  type Rect,
  type TooltipSide,
} from '../../src/content/tooltipGeometry';

declare global {
  interface Window {
    __pointer?: { x: number; y: number };
    __tipClasses?: Set<string>;
    __both?: number;
    __sampling?: boolean;
    __maxDim?: number;
    __dimSampling?: boolean;
  }
}

let checks = 0;
let failures = 0;
function expect(label: string, ok: boolean, detail: unknown = '') {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ` ${JSON.stringify(detail)}`}`);
}
const near = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;

// ─── Part A: geometry ───
{
  const vp = { width: 1280, height: 800 };
  const line = { left: 100, right: 300, top: 400, bottom: 420 };
  const place = (l: Rect, pointerX: number, v = vp) => placeTooltip({ highlightId: 'x', pointerX, line: l }, v);

  const a = place(line, 200);
  expect(
    'geometry: above, centered, clamped left',
    a.side === 'above' && a.anchorY === 388 && a.maxHeight === 270 && a.x === 24 && a.originX === 176,
    a
  );
  const fits = place({ ...line, top: 306, bottom: 326 }, 200);
  expect('geometry: top=306 fits above', fits.side === 'above' && fits.anchorY === 294 && fits.maxHeight === 270, fits);
  const noFit = place({ ...line, top: 305, bottom: 325 }, 200);
  expect('geometry: top=305 goes below', noFit.side === 'below' && noFit.anchorY === 337 && noFit.maxHeight === 270, noFit);
  const topLine = place({ ...line, top: 30, bottom: 50 }, 200);
  expect('geometry: page top goes below', topLine.side === 'below' && topLine.anchorY === 62, topLine);
  const short = place({ ...line, top: 180, bottom: 200 }, 200, { width: 1280, height: 400 });
  expect(
    'geometry: neither fits, more room below, max height capped to it',
    short.side === 'below' && short.anchorY === 212 && short.maxHeight === 164,
    short
  );
  const tie = place({ ...line, top: 190, bottom: 210 }, 200, { width: 1280, height: 400 });
  expect('geometry: equal room goes above', tie.side === 'above' && tie.anchorY === 178 && tie.maxHeight === 154, tie);
  const tiny = place({ ...line, top: 100, bottom: 120 }, 200, { width: 1280, height: 250 });
  expect(
    'geometry: tiny viewport floors at the minimum height',
    tiny.side === 'below' && tiny.anchorY === 132 && tiny.maxHeight === TOOLTIP_MIN_HEIGHT && TOOLTIP_MIN_HEIGHT === 96,
    tiny
  );
  expect('geometry: clamped right', place(line, 1270).x === 880);
  expect('geometry: narrow viewport', place(line, 200, { width: 300, height: 800 }).x === 24);

  const tipFull = tooltipRect(a, 270);
  expect(
    'geometry: rect at max height',
    tipFull.left === 24 && tipFull.right === 400 && tipFull.top === 118 && tipFull.bottom === 388,
    tipFull
  );
  const tipShort = tooltipRect(a, 100);
  expect(
    'geometry: rect grows upward from the fixed bottom edge',
    tipShort.top === 288 && tipShort.bottom === 388,
    tipShort
  );
  const below = place({ left: 100, right: 300, top: 300, bottom: 320 }, 200);
  expect('geometry: below anchors at line.bottom + 12', below.side === 'below' && below.anchorY === 332, below);
  const belowRect = tooltipRect(below, 270);
  expect(
    'geometry: below rect grows downward from the fixed top edge',
    belowRect.top === 332 && belowRect.bottom === 602 && tooltipRect(below, 100).top === 332,
    belowRect
  );
  for (const side of ['above', 'below'] as TooltipSide[]) {
    const l = side === 'above' ? line : { left: 100, right: 300, top: 300, bottom: 320 };
    const p = side === 'above' ? a : below;
    const rect = side === 'above' ? tipFull : belowRect;
    const ap = side === 'above' ? { x: 200, y: 405 } : { x: 200, y: 315 };
    const at = (x: number, y: number, landed = false) => isInSafeZone({ x, y }, p, rect, l, ap, landed);
    const gapY = side === 'above' ? 394 : 326;
    const edgeY = side === 'above' ? [388, 400] : [320, 332];
    const insideTipY = side === 'above' ? 387.9 : 332.1;
    expect(`zone ${side}: bridge`, at(200, gapY));
    expect(`zone ${side}: bridge edges`, at(200, edgeY[0]) && at(200, edgeY[1]));
    expect(`zone ${side}: cone right of bridge, only before landing`, at(340, gapY) && !at(340, gapY, true));
    expect(`zone ${side}: outside cone`, !at(350, gapY) && !at(380 + CONE_TOLERANCE + 1, gapY));
    expect(`zone ${side}: inside tooltip is the caller's job`, !at(200, insideTipY));
  }
}

// ─── Part B: browser ───
const root = join(import.meta.dir, '../..');
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const path = new URL(req.url).pathname;
    const file = path.startsWith('/ext/fonts/')
      ? Bun.file(join(root, 'public', path.slice(5)))
      : path.startsWith('/ext/')
        ? Bun.file(join(root, 'bench/drag/.ext', path.slice(5)))
        : Bun.file(join(root, 'bench/drag/fixtures/article.html'));
    return new Response(file);
  },
});
const origin = `http://127.0.0.1:${server.port}`;
const bundle = await Bun.file(join(root, 'bench/drag/.ext/content.js')).text();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  defaultViewport: { width: 1280, height: 800 },
  args: ['--no-first-run', '--disable-background-networking', '--disable-extensions'],
});
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const errors: string[] = [];

/** Runs `fn` against the extension UI's shadow root */
const ui = <T>(page: Page, fn: (root: ShadowRoot, arg: string) => T, arg = ''): Promise<T> =>
  page.evaluate(`(${fn.toString()})(document.getElementById('drawer-extension-root').shadowRoot, ${JSON.stringify(arg)})`) as Promise<T>;

interface Tip {
  rect: Rect;
  width: number;
  height: number;
  text: string;
  placeholder: string | null;
  closing: boolean;
}
const tooltip = (page: Page): Promise<Tip | null> =>
  ui(page, (r) => {
    const el = r.querySelector('[data-highlight-tooltip]') as HTMLElement | null;
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return {
      rect: { left: b.left, right: b.right, top: b.top, bottom: b.bottom },
      width: b.width,
      height: b.height,
      text: el.textContent ?? '',
      placeholder: el.querySelector('textarea')?.getAttribute('placeholder') ?? null,
      closing: /drawerClosing/.test(el.firstElementChild?.className ?? ''),
    };
  });
interface Metrics {
  top: number;
  bottom: number;
  height: number;
  panelBottom: number;
  areas: { value: string; placeholder: string | null; top: number; bottom: number }[]; // textareas, visual order
  scrollTop: number;
  fadeTop: boolean;
  fadeBottom: boolean;
  mask: string;
  wrapperTransition: string;
  panelTransition: string;
}
const metrics = (page: Page): Promise<Metrics> =>
  ui(page, (r) => {
    const el = r.querySelector('[data-highlight-tooltip]') as HTMLElement;
    const panel = el.firstElementChild as HTMLElement;
    const list = el.querySelector('[data-tooltip-list]') as HTMLElement;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(list);
    return {
      top: b.top,
      bottom: b.bottom,
      height: b.height,
      panelBottom: panel.getBoundingClientRect().bottom,
      areas: [...el.querySelectorAll('textarea')]
        .map((t) => {
          const tb = t.getBoundingClientRect();
          return { value: t.value, placeholder: t.getAttribute('placeholder'), top: tb.top, bottom: tb.bottom };
        })
        .sort((x, y) => x.top - y.top),
      scrollTop: list.scrollTop,
      fadeTop: list.hasAttribute('data-fade-top'),
      fadeBottom: list.hasAttribute('data-fade-bottom'),
      mask: cs.maskImage || cs.webkitMaskImage || 'none',
      wrapperTransition: getComputedStyle(el).transitionDuration,
      panelTransition: getComputedStyle(panel).transitionDuration,
    };
  });
const drawerVisible = (page: Page) =>
  ui(page, (r) => {
    const el = r.querySelector('[data-drawer]');
    if (!el) return false;
    for (let e: Element | null = el; e; e = e.parentElement) if (getComputedStyle(e).contentVisibility === 'hidden') return false;
    return true;
  });
const dim = (page: Page, id: string) =>
  page.evaluate((id) => {
    const m = document.querySelector(`mark[data-highlight-id="${id}"]`)!;
    return Number(getComputedStyle(m).getPropertyValue('--drawer-mark-dim'));
  }, id);
const markRects = (page: Page, id: string): Promise<Rect[]> =>
  page.evaluate((id) => {
    const rects: Rect[] = [];
    for (const m of document.querySelectorAll(`mark[data-highlight-id="${id}"]`))
      for (const r of m.getClientRects()) rects.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    return rects;
  }, id);
const center = (r: Rect) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });

async function fresh(): Promise<Page> {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setRequestInterception(true);
  page.on('request', (req) => (req.url().startsWith(origin) ? req.continue() : req.abort()));
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(`${origin}/`, { waitUntil: 'load' });
      break;
    } catch (error) {
      if (attempt >= 2 || !String(error).includes('ERR_ABORTED')) throw error;
    }
  }
  await page.evaluate(() => {
    localStorage.clear();
    Object.assign(window, {
      chrome: {
        runtime: { id: 'drawer-test', getURL: (p: string) => `${location.origin}/ext/${p}`, onMessage: { addListener() {} } },
      },
    });
  });
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => document.getElementById('drawer-extension-root')?.shadowRoot?.querySelector('.react-draggable'));
  await pause(300);
  return page;
}

/** A neutral spot with no text, so no highlight and no tooltip */
const PARK = { x: 6, y: 6 };
async function park(page: Page) {
  await page.mouse.move(PARK.x, PARK.y);
  await pause(450);
}
async function clickUi(page: Page, selector: string) {
  const point = await ui(
    page,
    (r, selector) => {
      const el = r.querySelector(selector) as HTMLElement;
      if (!el) throw new Error(`Missing ${selector}`);
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    },
    selector
  );
  await page.mouse.click(point.x, point.y);
}
async function moveSteps(page: Page, to: { x: number; y: number }, steps: number, ms: number) {
  const from = await page.evaluate(() => window.__pointer ?? { x: 0, y: 0 });
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await pause(ms / steps);
  }
}
async function goto(page: Page, p: { x: number; y: number }) {
  await page.mouse.move(p.x, p.y);
}

/** Makes a highlight through the real UI: drag-select chars [from, to) of paragraph `para`, click the plus icon */
async function highlight(page: Page, para: number, from: number, to: number): Promise<string> {
  const before = await page.evaluate(() => [...new Set([...document.querySelectorAll('mark[data-highlight-id]')].map((m) => (m as HTMLElement).dataset.highlightId))]);
  const pts = await page.evaluate(
    (para, from, to) => {
      const p = document.querySelectorAll('#text p')[para] as HTMLElement;
      p.scrollIntoView({ block: 'center' });
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      const at = (index: number) => {
        let n = 0;
        for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
          if (index < n + node.length) return { node, offset: index - n };
          n += node.length;
        }
        throw new Error('index past paragraph');
      };
      const charRect = (i: number) => {
        walker.currentNode = p;
        const { node, offset } = at(i);
        const r = document.createRange();
        r.setStart(node, offset);
        r.setEnd(node, offset + 1);
        return r.getBoundingClientRect();
      };
      const a = charRect(from);
      const z = charRect(to - 1);
      return { start: { x: a.left + 1, y: (a.top + a.bottom) / 2 }, end: { x: z.right - 1, y: (z.top + z.bottom) / 2 } };
    },
    para,
    from,
    to
  );
  await pause(100);
  await page.mouse.move(pts.start.x, pts.start.y);
  await page.mouse.down();
  await page.mouse.move(pts.end.x, pts.end.y, { steps: 8 });
  await page.mouse.up();
  await pause(300);
  await page
    .waitForFunction(() => !!document.getElementById('drawer-extension-root')?.shadowRoot?.querySelector('[data-selection-plus-icon]'), { timeout: 3000 })
    .catch(async () => {
      throw new Error(`no plus icon for para ${para} [${from},${to}): ${JSON.stringify({ pts, selection: await page.evaluate(() => String(getSelection())) })}`);
    });
  await clickUi(page, '[data-selection-plus-icon]');
  await page.waitForFunction(
    (before) => [...document.querySelectorAll('mark[data-highlight-id]')].some((m) => !before.includes((m as HTMLElement).dataset.highlightId!)),
    {},
    before
  );
  await pause(900);
  await page.mouse.move(PARK.x, PARK.y);
  const after = await page.evaluate(() => [...new Set([...document.querySelectorAll('mark[data-highlight-id]')].map((m) => (m as HTMLElement).dataset.highlightId))]);
  const id = after.find((x) => !before.includes(x));
  if (!id) throw new Error('no new highlight');
  return id as string;
}

/** Char index range [from, to) of the chars of paragraph `para` on one line whose x lies in [x0, x1], plus line tops */
async function lineChars(page: Page, para: number, line: number, x0: number, x1: number) {
  return page.evaluate(
    (para, line, x0, x1) => {
      const p = document.querySelectorAll('#text p')[para] as HTMLElement;
      p.scrollIntoView({ block: 'center' });
      const text = p.textContent!;
      const node = p.firstChild as Text; // marks may already wrap parts: use the whole paragraph's first text node only before marking
      const tops: number[] = [];
      const chars: { i: number; left: number; right: number; top: number }[] = [];
      for (let i = 0; i < text.length; i++) {
        const r = document.createRange();
        r.setStart(node, i);
        r.setEnd(node, i + 1);
        const b = r.getBoundingClientRect();
        if (!tops.some((t) => Math.abs(t - b.top) < 2)) tops.push(b.top);
        chars.push({ i, left: b.left, right: b.right, top: b.top });
      }
      tops.sort((a, b) => a - b);
      const lineChars = chars.filter((c) => Math.abs(c.top - tops[line]) < 2 && c.left >= x0 && c.right <= x1);
      return { from: lineChars[0]?.i ?? -1, to: (lineChars.at(-1)?.i ?? -2) + 1, x: lineChars[0]?.left ?? 0 };
    },
    para,
    line,
    x0,
    x1
  );
}

/** Scroll so `id`'s first mark rect sits at viewport y = `top` */
async function scrollMarkTo(page: Page, id: string, top: number) {
  await page.evaluate(
    (id, top) => {
      const m = document.querySelector(`mark[data-highlight-id="${id}"]`)!;
      window.scrollBy(0, m.getBoundingClientRect().top - top);
    },
    id,
    top
  );
  await pause(150);
}

async function hoverOpen(page: Page, id: string, which: 'first' | 'last' = 'first'): Promise<Tip> {
  const rects = await markRects(page, id);
  const target = center(which === 'first' ? rects[0] : rects[rects.length - 1]);
  await page.mouse.move(target.x, target.y);
  await page.waitForFunction(() => document.getElementById('drawer-extension-root')!.shadowRoot!.querySelector('[data-highlight-tooltip]'), { timeout: 3000 });
  await pause(250);
  const tip = await tooltip(page);
  if (!tip) throw new Error('tooltip did not open');
  return tip;
}

try {
  // Let browser startup (including Helium's first-launch initialization) settle before injection.
  await pause(3000);
  const page = await fresh();
  await page.evaluate(() => addEventListener('pointermove', (e) => (window.__pointer = { x: e.clientX, y: e.clientY }), true));

  // Paragraphs by measured position: single-rect paragraphs only (columns can split one in two)
  const paras = await page.evaluate(() =>
    [...document.querySelectorAll('#text p')].map((p, i) => {
      const rects = p.getClientRects();
      const b = p.getBoundingClientRect();
      return { i, single: rects.length === 1, x: b.left + window.scrollX, y: b.top + window.scrollY };
    })
  );
  const pick = (col: number, minY: number) => {
    const colX = [32, 32 + 384 + 32, 32 + 2 * (384 + 32)][col];
    return paras.find((p) => p.single && Math.abs(p.x - colX) < 40 && p.y >= minY)!.i;
  };
  const topPara = 0;
  const leftPara = pick(0, 1200);
  const rightPara = pick(2, 1200);
  const midPara = pick(1, 1200);
  const multiPara = pick(1, 2000);
  const adjPara = pick(2, 2400);
  const stackPara = pick(0, 2400);

  console.log('seeding highlights through the UI...');
  const H = {
    top: await highlight(page, topPara, 0, 14),
    left: await highlight(page, leftPara, 0, 14),
    right: await highlight(page, rightPara, 0, 14),
    mid: await highlight(page, midPara, 0, 14),
    multi: await highlight(page, multiPara, 0, 260),
    adjA: await highlight(page, adjPara, 0, 10),
    adjB: await highlight(page, adjPara, 12, 22),
  };
  // Two stacked highlights: B on line 1, A on line 2, overlapping in x (A is hovered, B is crossed)
  {
    const l2 = await lineChars(page, stackPara, 1, 0, 1e9);
    const x0 = l2.x + 20;
    const l2c = await lineChars(page, stackPara, 1, x0, x0 + 80);
    const l1c = await lineChars(page, stackPara, 0, x0, x0 + 80);
    (H as Record<string, string>).stackB = await highlight(page, stackPara, l1c.from, l1c.to);
    // Line 2's text node indexes shift once B's marks split line 1's node, so measure again by whole-paragraph chars
    (H as Record<string, string>).stackA = await highlight(page, stackPara, l2c.from, l2c.to);
  }
  const ids = H as unknown as Record<string, string>;

  // Class names captured through the whole run: proves the drawer's enter/exit classes are the ones used
  await ui(page, (r) => {
    window.__tipClasses = new Set<string>();
    new MutationObserver(() => {
      const el = r.querySelector('[data-highlight-tooltip]')?.firstElementChild;
      if (el) for (const c of el.classList) window.__tipClasses?.add(c);
    }).observe(r, { subtree: true, attributes: true, childList: true });
  });

  // ── timing ──
  {
    await scrollMarkTo(page, ids.mid, 500);
    const c = center((await markRects(page, ids.mid))[0]);
    await page.mouse.move(c.x, c.y);
    await pause(150);
    expect('rest 150ms: no tooltip yet', (await tooltip(page)) === null);
    await pause(300);
    const tip = await tooltip(page);
    expect('rest 450ms: tooltip present', !!tip);
    expect('width 376, height fits the empty content', !!tip && near(tip.width, 376, 1) && tip.height >= 60 && tip.height <= TOOLTIP_MIN_HEIGHT, tip);
    expect('starts with "Notes"', !!tip && tip.text.startsWith('Notes'), tip?.text);
    expect(
      'inside viewport with 24px margin',
      !!tip && tip.rect.left >= 23.5 && tip.rect.top >= 23.5 && tip.rect.right <= 1280 - 23.5 && tip.rect.bottom <= 800 - 23.5,
      tip?.rect
    );
    expect('zero notes: placeholder "No notes yet"', tip?.placeholder === 'No notes yet', tip?.placeholder);

    // placement above: bottom = line.top - 12
    const line = (await markRects(page, ids.mid))[0];
    expect('room above: tooltip.bottom = line.top - 12', !!tip && near(tip.rect.bottom, line.top - TOOLTIP_GAP), { tip: tip?.rect, line });

    // dimming
    await pause(250);
    const dims = [await dim(page, ids.mid), await dim(page, ids.left), await dim(page, ids.multi)];
    expect('dim: hovered 1, others 0.4', dims[0] === 1 && dims[1] === 0.4 && dims[2] === 0.4, dims);
    const classes = (await page.evaluate(() => [...(window.__tipClasses ?? [])])) as string[];
    expect('uses the drawer enter keyframes class', classes.some((c) => /drawerEntering/.test(c)), classes);

    await park(page);
    await pause(250);
    expect('closed after leaving', (await tooltip(page)) === null);
    expect('dim restored', (await dim(page, ids.left)) === 1 && (await dim(page, ids.mid)) === 1);
    const classes2 = (await page.evaluate(() => [...(window.__tipClasses ?? [])])) as string[];
    expect('uses the drawer exit keyframes class', classes2.some((c) => /drawerClosing/.test(c)), classes2);
  }

  // ── gliding past never opens ──
  {
    await scrollMarkTo(page, ids.mid, 500);
    const rect = (await markRects(page, ids.mid))[0];
    await page.mouse.move(rect.left - 20, center(rect).y);
    await moveSteps(page, { x: rect.right + 20, y: center(rect).y }, 6, 200);
    await pause(500);
    expect('glide across in <300ms: never opens', (await tooltip(page)) === null);
    await park(page);
  }

  // ── placement: page top below, left edge, right column, short viewport ──
  {
    await page.evaluate(() => window.scrollTo(0, 0));
    await pause(150);
    const tip = await hoverOpen(page, ids.top);
    const line = (await markRects(page, ids.top))[0];
    expect('page top: tooltip below, top = line.bottom + 12', near(tip.rect.top, line.bottom + TOOLTIP_GAP), { tip: tip.rect, line });
    await park(page);
  }
  {
    await scrollMarkTo(page, ids.left, 500);
    const tip = await hoverOpen(page, ids.left);
    expect('left edge: left >= 24', tip.rect.left >= 23.5, tip.rect);
    await park(page);
    await scrollMarkTo(page, ids.right, 500);
    const tipR = await hoverOpen(page, ids.right);
    expect('right column: right <= innerWidth - 24', tipR.rect.right <= 1280 - 23.5, tipR.rect);
    await park(page);
  }
  {
    await page.setViewport({ width: 1280, height: 400 });
    await pause(300);
    await scrollMarkTo(page, ids.mid, 200);
    const tip = await hoverOpen(page, ids.mid);
    expect('viewport 400px tall: tooltip inside', tip.rect.top >= 23.5 && tip.rect.bottom <= 400 - 23.5, tip.rect);
    // resize closes it
    await page.setViewport({ width: 1280, height: 800 });
    await pause(500);
    expect('resize closes', (await tooltip(page)) === null);
    await park(page);
  }

  // ── cone ──
  {
    await scrollMarkTo(page, ids.mid, 500);
    const tip = await hoverOpen(page, ids.mid);
    const c = center((await markRects(page, ids.mid))[0]);
    await moveSteps(page, { x: tip.rect.left + 120, y: tip.rect.bottom - 20 }, 12, 400);
    await pause(700);
    const after = await tooltip(page);
    expect('cone: diagonal path to tooltip stays open', !!after && !after.closing, after);
    // landed: leaving the tooltip to the plain page closes it
    await page.mouse.move(tip.rect.right + 10, tip.rect.top + 60);
    await pause(550);
    expect('leave tooltip to plain page: closes', (await tooltip(page)) === null);

    // coming back to the highlight within the grace keeps it
    const tip2 = await hoverOpen(page, ids.mid);
    await moveSteps(page, { x: tip2.rect.left + 120, y: tip2.rect.bottom - 20 }, 8, 250);
    await page.mouse.move(tip2.rect.right + 10, tip2.rect.top + 60);
    await goto(page, center((await markRects(page, ids.mid))[0]));
    await pause(500);
    expect('back on the highlight within grace: stays open', !!(await tooltip(page)));
    await park(page);

    // sideways away from the tooltip
    await hoverOpen(page, ids.mid);
    const here = center((await markRects(page, ids.mid))[0]);
    await page.mouse.move(here.x, here.y + 100);
    await pause(550);
    expect('leave sideways/below: closes within grace + exit', (await tooltip(page)) === null);

    // stall in the gap
    const tip3 = await hoverOpen(page, ids.mid);
    await page.mouse.move(center((await markRects(page, ids.mid))[0]).x, tip3.rect.bottom + 6);
    await pause(250);
    expect('stall: still open shortly after stopping in the gap', !!(await tooltip(page)));
    await pause(600);
    expect('stall: closed after 600ms stopped in the gap', (await tooltip(page)) === null);
    await park(page);
  }

  // ── multi-line highlight keeps one tooltip ──
  {
    await scrollMarkTo(page, ids.multi, 450);
    const rects = await markRects(page, ids.multi);
    expect('multi-line highlight has >= 3 line rects', rects.length >= 3, rects.length);
    const tipA = await hoverOpen(page, ids.multi, 'last');
    await page.evaluate(() => {
      const el = document.getElementById('drawer-extension-root')!.shadowRoot!.querySelector('[data-highlight-tooltip]') as HTMLElement;
      el.dataset.same = '1';
    });
    const first = center(rects[0]);
    await page.mouse.move(first.x, first.y);
    await pause(600);
    const tipB = await tooltip(page);
    const same = await ui(page, (r) => (r.querySelector('[data-highlight-tooltip]') as HTMLElement | null)?.dataset.same === '1');
    expect('multi-line: moving to another line keeps the same tooltip in place', !!tipB && same && near(tipA.rect.top, tipB.rect.top, 0.5) && near(tipA.rect.left, tipB.rect.left, 0.5), { tipA: tipA.rect, tipB: tipB?.rect, same });
    await park(page);
  }

  // ── adjacent highlights switch immediately ──
  {
    await scrollMarkTo(page, ids.adjA, 500);
    const tipA = await hoverOpen(page, ids.adjA);
    expect('adjacent: A is focused', (await dim(page, ids.adjA)) === 1 && (await dim(page, ids.adjB)) === 0.4);
    const b = center((await markRects(page, ids.adjB))[0]);
    await page.mouse.move(b.x, b.y);
    await pause(120);
    const tipB = await tooltip(page);
    expect('adjacent: switches to B without the 300ms wait', !!tipB && !near(tipB.rect.left, tipA.rect.left, 1), { a: tipA.rect, b: tipB?.rect });
    await pause(350);
    expect('adjacent: dim moved to B', (await dim(page, ids.adjB)) === 1 && (await dim(page, ids.adjA)) === 0.4);
    await park(page);
  }

  // ── crossing another highlight inside the zone ──
  {
    await scrollMarkTo(page, ids.stackA, 500);
    const tip = await hoverOpen(page, ids.stackA);
    const a = center((await markRects(page, ids.stackA))[0]);
    await moveSteps(page, { x: a.x, y: tip.rect.bottom - 20 }, 10, 350);
    await pause(500);
    const after = await tooltip(page);
    expect(
      'path crosses another highlight inside the zone: tooltip stays on the original',
      !!after && near(after.rect.top, tip.rect.top, 0.5) && (await dim(page, ids.stackA)) === 1 && (await dim(page, ids.stackB)) === 0.4,
      { tip: tip.rect, after: after?.rect }
    );
    await park(page);
  }

  // ── drawer exclusivity ──
  {
    await scrollMarkTo(page, ids.mid, 500);
    await hoverOpen(page, ids.mid);
    await page.evaluate(() => {
      const r = document.getElementById('drawer-extension-root')!.shadowRoot!;
      window.__both = 0;
      window.__sampling = true;
      const visible = () => {
        const el = r.querySelector('[data-drawer]');
        if (!el) return false;
        for (let e: Element | null = el; e; e = e.parentElement) if (getComputedStyle(e).contentVisibility === 'hidden') return false;
        return true;
      };
      const tick = () => {
        if (r.querySelector('[data-highlight-tooltip]') && visible()) window.__both = (window.__both ?? 0) + 1;
        if (window.__sampling) requestAnimationFrame(tick);
      };
      tick();
    });
    const logo = await ui(page, (r) => {
      const b = (r.querySelector('.react-draggable') as HTMLElement).getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.mouse.move(logo.x, logo.y);
    await page.mouse.down();
    await page.mouse.up();
    await pause(600);
    expect('logo click: drawer opens', await drawerVisible(page));
    expect('logo click: tooltip gone', (await tooltip(page)) === null);

    // hovering a highlight with the drawer open
    await scrollMarkTo(page, ids.left, 500);
    const c = center((await markRects(page, ids.left))[0]);
    await page.mouse.move(c.x, c.y);
    await pause(700);
    expect('drawer open: hovering a highlight shows no tooltip', (await tooltip(page)) === null);

    // close the drawer (logo), then hover: opens after the delay, never overlapping
    await page.mouse.move(logo.x, logo.y);
    await page.mouse.down();
    await page.mouse.up();
    await pause(100);
    await page.mouse.move(c.x, c.y);
    await pause(250);
    expect('after closing the drawer: no tooltip before the delay', (await tooltip(page)) === null);
    await pause(400);
    expect('after closing the drawer: opens after resting', !!(await tooltip(page)));
    const both = await page.evaluate(() => {
      window.__sampling = false;
      return window.__both ?? 0;
    });
    expect('never a frame with the tooltip and the drawer together', both === 0, both);
    await park(page);
  }

  // ── Escape closes the tooltip and nothing else ──
  {
    await scrollMarkTo(page, ids.mid, 500);
    await hoverOpen(page, ids.mid);
    await page.keyboard.press('Escape');
    await pause(400);
    expect('Escape: tooltip closes', (await tooltip(page)) === null);
    expect('Escape: drawer stays closed', !(await drawerVisible(page)));
    await park(page);
  }

  // ── scroll closes ──
  {
    await scrollMarkTo(page, ids.mid, 500);
    await hoverOpen(page, ids.mid);
    await page.evaluate(() => window.scrollBy(0, 40));
    await pause(500);
    expect('page scroll closes', (await tooltip(page)) === null);
    await park(page);
  }

  // ── notes sync, both directions ──
  {
    await scrollMarkTo(page, ids.mid, 500);
    const tip = await hoverOpen(page, ids.mid);
    await moveSteps(page, { x: tip.rect.left + 120, y: tip.rect.bottom - 20 }, 8, 250);
    const typeInto = async (text: string) => {
      await clickUi(page, '[data-highlight-tooltip] textarea[placeholder]');
      await page.keyboard.type(text);
      await page.keyboard.press('Enter');
      await pause(400);
    };
    await typeInto('from tooltip');
    const t1 = await tooltip(page);
    const stored = await page.evaluate(() => localStorage.highlights);
    expect('tooltip note: shown in the tooltip', !!t1 && (await ui(page, (r) => [...r.querySelectorAll('[data-highlight-tooltip] textarea')].some((t) => (t as HTMLTextAreaElement).value === 'from tooltip'))));
    expect('tooltip note: saved to storage', stored.includes('from tooltip'));

    // typing keeps it open with the cursor far away; clicking the page closes it
    await clickUi(page, '[data-highlight-tooltip] textarea[placeholder]');
    await page.keyboard.type('draft');
    await page.mouse.move(60, 700);
    await pause(1000);
    expect('typing: stays open with the cursor away', !!(await tooltip(page)));
    await page.mouse.click(60, 700);
    await pause(500);
    expect('typing: click-away closes', (await tooltip(page)) === null);

    // open the drawer and find the note in the same highlight's row
    const logo = await ui(page, (r) => {
      const b = (r.querySelector('.react-draggable') as HTMLElement).getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.mouse.click(logo.x, logo.y);
    await pause(600);
    const inDrawer = await ui(page, (r) => [...r.querySelectorAll('[data-drawer] textarea')].some((t) => (t as HTMLTextAreaElement).value === 'from tooltip'));
    expect('tooltip note: present in the drawer', inDrawer);

    // expand the row
    await ui(page, (r) => {
      const row = [...r.querySelectorAll('[data-drawer] [data-expanded]')].find((e) => e.textContent?.includes('from tooltip')) as HTMLElement | undefined;
      row?.click();
    });
    await pause(500);

    // drawer → tooltip: add a note in the drawer row, close the drawer, hover
    await clickUi(page, '[data-drawer] [data-expanded="true"] textarea');
    await page.keyboard.type('from drawer');
    await page.keyboard.press('Enter');
    await pause(400);
    await page.mouse.click(logo.x, logo.y);
    await pause(500);
    await scrollMarkTo(page, ids.mid, 500);
    const tip2 = await hoverOpen(page, ids.mid);
    const values = (await metrics(page)).areas.map((t) => t.value);
    expect('drawer note: listed in the tooltip, oldest to newest top to bottom, input last', JSON.stringify(values) === JSON.stringify(['from tooltip', 'from drawer', '']), values);

    // edit in the tooltip (blur saves), then clear + Enter deletes
    await moveSteps(page, { x: tip2.rect.left + 120, y: tip2.rect.bottom - 20 }, 8, 250);
    const second = await ui(page, (r) => {
      const t = [...r.querySelectorAll('[data-highlight-tooltip] textarea')].sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top)[1] as HTMLElement;
      const b = t.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.mouse.click(second.x, second.y);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.type('edited here');
    await clickUi(page, '[data-highlight-tooltip] textarea[placeholder]'); // focus the add box: blur saves the edit
    await pause(400);
    expect('edit + blur in tooltip: stored', (await page.evaluate(() => localStorage.highlights)).includes('edited here'));
    await page.mouse.click(second.x, second.y);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await pause(400);
    expect('clear + Enter in tooltip: note deleted', !(await page.evaluate(() => localStorage.highlights)).includes('edited here'));
    await page.mouse.click(60, 700);
    await pause(400);
  }

  // ── wheel inside a tooltip with many notes ──
  {
    await scrollMarkTo(page, ids.left, 500);
    const tip = await hoverOpen(page, ids.left);
    await moveSteps(page, { x: tip.rect.left + 120, y: tip.rect.bottom - 20 }, 8, 250);
    for (let i = 0; i < 8; i++) {
      await clickUi(page, '[data-highlight-tooltip] textarea[placeholder]');
      await page.keyboard.type(`note ${i}`);
      await page.keyboard.press('Enter');
      await pause(150);
    }
    const full = await metrics(page);
    const before = await ui(page, (r) => (r.querySelector('[data-tooltip-list]') as HTMLElement).scrollTop);
    expect('wheel: list opens at the input end with a fade only at the far edge', before === 0 && full.fadeTop && !full.fadeBottom, { before, full });
    const scrollY = await page.evaluate(() => window.scrollY);
    await page.mouse.move(tip.rect.left + 188, full.top + 135);
    await page.mouse.wheel({ deltaY: -300 });
    await pause(400);
    const top = await ui(page, (r) => (r.querySelector('[data-tooltip-list]') as HTMLElement).scrollTop);
    expect('wheel: notes list scrolls, page does not, tooltip stays', top < 0 && (await page.evaluate(() => window.scrollY)) === scrollY && !!(await tooltip(page)), { top });
    await page.mouse.click(60, 700);
    await pause(400);
  }

  // ── adaptive height: the edge facing the highlight stays put, the far edge follows the content ──
  {
    const noteText = (i: number) => `note ${i} lorem ipsum dolor sit amet consectetur`;
    const addNote = async (text: string) => {
      await clickUi(page, '[data-highlight-tooltip] textarea[placeholder]');
      await page.keyboard.type(text);
      await page.keyboard.press('Enter');
      await pause(150);
    };

    // Above: grows up
    await scrollMarkTo(page, ids.adjA, 500);
    const tip0 = await hoverOpen(page, ids.adjA);
    const m0 = await metrics(page);
    await moveSteps(page, { x: tip0.rect.left + 120, y: tip0.rect.bottom - 20 }, 8, 250);
    const heights = [m0.height];
    let bottomDrift = 0;
    let shrank = false;
    let tooTall = false;
    for (let i = 1; i <= 8; i++) {
      await addNote(noteText(i));
      const m = await metrics(page);
      bottomDrift = Math.max(bottomDrift, Math.abs(m.bottom - m0.bottom));
      shrank ||= m.height < heights[heights.length - 1] - 0.5;
      tooTall ||= m.height > 270.5;
      heights.push(m.height);
    }
    const m8 = await metrics(page);
    expect('above: bottom edge fixed while notes are added', bottomDrift <= 0.5, bottomDrift);
    expect('above: height never decreases, never exceeds 270', !shrank && !tooTall, heights);
    expect('above: first note grows the tooltip', heights[1] > heights[0] + 10, heights);
    expect('above: height reaches 270 by note 8', near(m8.height, 270, 1), heights);
    expect(
      'above: input last in visual order, inside the panel; newest note right above it',
      m8.areas.at(-1)!.placeholder !== null && m8.areas.at(-1)!.bottom <= m8.panelBottom + 0.5 && m8.areas.at(-2)!.value === noteText(8),
      m8.areas.slice(-3)
    );
    expect('above: list opens at the input end, fade only at the top', m8.scrollTop === 0 && m8.fadeTop && !m8.fadeBottom, m8);
    expect('above: the fade is a mask on the list', m8.mask !== 'none', m8.mask);
    expect('instant: no transition on the wrapper or the panel', m8.wrapperTransition === '0s' && m8.panelTransition === '0s', m8);

    // Scroll up, then add: back at the input end
    await page.mouse.move(tip0.rect.left + 188, m8.top + 135);
    await page.mouse.wheel({ deltaY: -300 });
    await pause(300);
    const scrolled = await metrics(page);
    expect('scrolled up: fade appears at the input end', scrolled.scrollTop < 0 && scrolled.fadeBottom, scrolled);
    await addNote(noteText(9));
    const after = await metrics(page);
    expect('add a note while scrolled: list returns to the input end', after.scrollTop === 0 && !after.fadeBottom, after);
    await page.mouse.click(60, 700);
    await pause(500);

    // Shrinks again when notes are deleted
    await scrollMarkTo(page, ids.adjB, 500);
    const tipB = await hoverOpen(page, ids.adjB);
    const hB = (await metrics(page)).height;
    await moveSteps(page, { x: tipB.rect.left + 120, y: tipB.rect.bottom - 20 }, 8, 250);
    await addNote('first');
    await addNote('second');
    const grown = (await metrics(page)).height;
    for (let i = 0; i < 2; i++) {
      const p = await ui(page, (r) => {
        const t = [...r.querySelectorAll('[data-highlight-tooltip] textarea')].sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top)[0] as HTMLElement;
        const b = t.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      });
      await page.mouse.click(p.x, p.y);
      await ui(page, (r) => (r.activeElement as HTMLTextAreaElement).select());
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Enter');
      await pause(100);
    }
    await pause(300);
    const shrunk = await metrics(page);
    expect('shrinks: height returns to the empty height after deleting the notes', grown > hB + 20 && near(shrunk.height, hB, 0.5) && near(shrunk.bottom, tipB.rect.bottom, 0.5), { hB, grown, shrunk: shrunk.height });

    // Instant: the height is final two frames after the store update
    const countBefore = (await metrics(page)).areas.length;
    await clickUi(page, '[data-highlight-tooltip] textarea[placeholder]');
    await page.keyboard.type('instant');
    await page.keyboard.press('Enter');
    const frames = await ui(
      page,
      (r, arg) => {
        const sel = () => r.querySelector('[data-highlight-tooltip]') as HTMLElement;
        const count = () => sel().querySelectorAll('textarea').length;
        const raf = () => new Promise<void>((res) => requestAnimationFrame(() => res()));
        return new Promise<{ h1: number; h2: number }>((resolve) => {
          const tick = async () => {
            if (count() <= Number(arg)) return void requestAnimationFrame(tick);
            await raf();
            await raf();
            const h1 = sel().getBoundingClientRect().height;
            setTimeout(() => resolve({ h1, h2: sel().getBoundingClientRect().height }), 300);
          };
          tick();
        });
      },
      String(countBefore)
    );
    expect('instant: height final two frames after the note appears', near(frames.h1, frames.h2, 0.5), frames);
    await page.mouse.click(60, 700);
    await pause(500);

    // Below: grows down
    await page.evaluate(() => window.scrollTo(0, 0));
    await pause(150);
    const tipT = await hoverOpen(page, ids.top);
    const mT = await metrics(page);
    await moveSteps(page, { x: tipT.rect.left + 120, y: tipT.rect.top + 20 }, 8, 250);
    const hs = [mT.height];
    let topDrift = 0;
    let shrankBelow = false;
    for (let i = 1; i <= 8; i++) {
      await addNote(noteText(i));
      const m = await metrics(page);
      topDrift = Math.max(topDrift, Math.abs(m.top - mT.top));
      shrankBelow ||= m.height < hs[hs.length - 1] - 0.5;
      hs.push(m.height);
    }
    const mB = await metrics(page);
    expect('below: top edge fixed while notes are added', topDrift <= 0.5, topDrift);
    expect('below: height grows then caps at 270', !shrankBelow && hs[1] > hs[0] + 10 && near(mB.height, 270, 1) && Math.max(...hs) <= 270.5, hs);
    expect(
      'below: input first in visual order, newest note right under it',
      mB.areas[0].placeholder !== null && mB.areas[1].value === noteText(8) && mB.areas[0].top >= mB.top - 0.5,
      mB.areas.slice(0, 3)
    );
    expect('below: list opens at the input end, fade only at the bottom', mB.scrollTop === 0 && mB.fadeBottom && !mB.fadeTop, mB);
    await page.mouse.click(60, 700);
    await pause(500);

    // Hit-testing follows the measured height: the 8-note tooltip is 270 tall
    await scrollMarkTo(page, ids.left, 500);
    const tipL = await hoverOpen(page, ids.left);
    await moveSteps(page, { x: tipL.rect.left + 120, y: tipL.rect.bottom - 20 }, 12, 400);
    await pause(700);
    const afterL = await tooltip(page);
    const pointer = await page.evaluate(() => window.__pointer!);
    expect(
      'measured height: diagonal path into a 270px tooltip stays open, pointer over it',
      near(tipL.height, 270, 1) && !!afterL && !afterL.closing && pointer.y >= afterL.rect.top && pointer.y <= afterL.rect.bottom,
      { tipL: tipL.rect, afterL: afterL?.rect, pointer }
    );
    await park(page);
  }

  // ── drag, touch, hold-to-delete, click ──
  {
    await scrollMarkTo(page, ids.mid, 500);
    const rect = (await markRects(page, ids.mid))[0];
    await page.mouse.move(rect.left - 60, center(rect).y);
    await page.mouse.down();
    await page.mouse.move(rect.right + 20, center(rect).y, { steps: 10 });
    await pause(500);
    expect('button held while crossing a highlight: no tooltip', (await tooltip(page)) === null);
    await page.mouse.up();
    await page.mouse.click(60, 700);
    await pause(300);

    await page.evaluate((id) => {
      const m = document.querySelector(`mark[data-highlight-id="${id}"]`)!;
      const b = m.getBoundingClientRect();
      m.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch', clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, bubbles: true }));
    }, ids.mid);
    await pause(600);
    expect('touch pointer: no tooltip', (await tooltip(page)) === null);
    await park(page);
  }
  {
    // click the highlight with the tooltip open: drawer opens on it, dim never lapses
    await scrollMarkTo(page, ids.mid, 500);
    await hoverOpen(page, ids.mid);
    const otherId = ids.left;
    await page.evaluate((otherId) => {
      window.__maxDim = 0;
      window.__dimSampling = true;
      const tick = () => {
        const m = document.querySelector(`mark[data-highlight-id="${otherId}"]`)!;
        window.__maxDim = Math.max(window.__maxDim ?? 0, Number(getComputedStyle(m).getPropertyValue('--drawer-mark-dim')));
        if (window.__dimSampling) requestAnimationFrame(tick);
      };
      tick();
    }, otherId);
    const c = center((await markRects(page, ids.mid))[0]);
    await page.mouse.click(c.x, c.y);
    await pause(900);
    const maxDim = await page.evaluate(() => {
      window.__dimSampling = false;
      return window.__maxDim ?? 0;
    });
    expect('click highlight with tooltip open: drawer opens, tooltip gone', (await drawerVisible(page)) && (await tooltip(page)) === null);
    expect('click highlight with tooltip open: row expanded', await ui(page, (r) => !!r.querySelector('[data-drawer] [data-expanded="true"]')));
    expect('click highlight with tooltip open: dim never lapses', maxDim <= 0.6, maxDim);
    expect('click highlight with tooltip open: others still dimmed', (await dim(page, ids.left)) === 0.4);
    const logo = await ui(page, (r) => {
      const b = (r.querySelector('.react-draggable') as HTMLElement).getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.mouse.click(logo.x, logo.y);
    await pause(600);
    await park(page);
  }
  {
    // hold-to-delete with the tooltip open
    await scrollMarkTo(page, ids.top, 500);
    await hoverOpen(page, ids.top);
    const c = center((await markRects(page, ids.top))[0]);
    await page.mouse.down();
    await pause(150);
    expect('hold: tooltip closes on press', (await tooltip(page)) === null || (await tooltip(page))!.closing);
    await pause(1100);
    await page.mouse.up();
    await pause(900);
    expect('hold 1s: highlight deleted', (await markRects(page, ids.top)).length === 0);
    await park(page);
  }

  // ── reduced motion ──
  {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await scrollMarkTo(page, ids.mid, 500);
    await hoverOpen(page, ids.mid);
    await park(page);
    await pause(300);
    expect('reduced motion: opens and closes', (await tooltip(page)) === null);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  }

  expect('no console or page errors', errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
  server.stop(true);
}

console.log(`METRIC tooltip_failures=${failures}`);
console.log(`METRIC tooltip_checks=${checks}`);
if (failures) process.exitCode = 1;
