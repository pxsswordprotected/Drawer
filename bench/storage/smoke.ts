// Real-extension check of cross-tab sync: loads the built extension (dist/) unpacked into a
// Chromium that still runs Manifest V2 (Helium), opens two tabs on different sites, and
// drives the real UI. Nothing is simulated: real chrome.storage, real background event page.
//
// Build first: npm run build:extension
// Run: bun bench/storage/smoke.ts   (CHROME_PATH overrides the browser; Chrome no longer loads MV2)
import puppeteer, { type Browser, type Page, type Target } from 'puppeteer-core';
import { join } from 'node:path';

const root = join(import.meta.dir, '../..');
const dist = join(root, 'dist');
const fixture = Bun.file(join(root, 'bench/drag/fixtures/article.html'));
// Two servers, two host names: different sites, as two real tabs would be
const serve = (hostname: string) => Bun.serve({ port: 0, hostname, fetch: () => new Response(fixture) });
const serverA = serve('127.0.0.1');
const serverB = serve('localhost');
const urlA = `http://127.0.0.1:${serverA.port}/`;
const urlB = `http://localhost:${serverB.port}/`;

let failures = 0;
const expect = (label: string, ok: boolean, detail: unknown = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ` ${JSON.stringify(detail)}`}`);
};

const browser: Browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Helium.app/Contents/MacOS/Helium',
  headless: true,
  defaultViewport: { width: 1280, height: 800 },
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--no-first-run', '--disable-background-networking', `--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});

/** Runs `fn` against the extension UI's shadow root */
const ui = <T>(page: Page, fn: (root: ShadowRoot, arg: string) => T, arg = ''): Promise<T> =>
  page.evaluate(`(${fn.toString()})(document.getElementById('drawer-extension-root').shadowRoot, ${JSON.stringify(arg)})`) as Promise<T>;
const drawerText = (page: Page) => ui(page, (r) => r.querySelector('[data-drawer]')?.textContent ?? '');
const marks = (page: Page) => page.evaluate(() => document.querySelectorAll('mark[data-highlight-id]').length);

async function open(url: string): Promise<Page> {
  const page = await browser.newPage();
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'load' });
      break;
    } catch (error) {
      if (attempt >= 2 || !String(error).includes('ERR_ABORTED')) throw error;
    }
  }
  await page.waitForFunction(
    () => document.getElementById('drawer-extension-root')?.shadowRoot?.querySelector('.react-draggable'),
    { timeout: 15000 }
  );
  await Bun.sleep(3500); // the extension's page-settle gate before it restores marks
  return page;
}
async function clickUi(page: Page, selector: string, containing = ''): Promise<void> {
  const point = await ui(
    page,
    (r, arg) => {
      const [selector, containing] = JSON.parse(arg) as [string, string];
      const el = [...r.querySelectorAll(selector)].find((e) => (e.textContent ?? '').includes(containing));
      if (!el) return null;
      el.scrollIntoView({ block: 'nearest' });
      const b = el.getBoundingClientRect();
      return { x: b.x + Math.min(b.width / 2, 60), y: b.y + Math.min(b.height / 2, 12) };
    },
    JSON.stringify([selector, containing])
  );
  if (!point) throw new Error(`missing ${selector} ${containing}`);
  await page.mouse.click(point.x, point.y);
}
/** Sends `message` to the background from a tab's content-script world (page scripts can't) */
async function sendFromContentScript(page: Page, extensionId: string, message: object): Promise<string> {
  const cdp = await page.createCDPSession();
  const worlds: number[] = [];
  cdp.on('Runtime.executionContextCreated', (e) => {
    if (e.context.origin === `chrome-extension://${extensionId}`) worlds.push(e.context.id);
  });
  await cdp.send('Runtime.enable'); // replays the contexts that already exist
  const expression = `new Promise((resolve) => chrome.runtime.sendMessage(${JSON.stringify(message)}, (reply) => resolve(JSON.stringify(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : reply))))`;
  const result = await cdp.send('Runtime.evaluate', { contextId: worlds[0], expression, awaitPromise: true, returnByValue: true });
  await cdp.detach();
  return String(result.result.value);
}
/** Waits until `probe` is true; returns how long it took, or null on timeout */
async function until(probe: () => Promise<boolean>, timeoutMs = 5000): Promise<number | null> {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (await probe()) return Math.round(performance.now() - start);
    await Bun.sleep(10);
  }
  return null;
}
/** Types a note into the focused highlight's note box and reports ms until `page` shows it */
async function addNote(page: Page, text: string): Promise<number | null> {
  await focusNoteBox(page);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  return until(async () => hasNote(page, text));
}
// Focus the add-note box and confirm it kept focus: the drawer moves focus around after
// notes are added, and a click's coordinates go stale while the list is still scrolling
async function focusNoteBox(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const focused = await ui(page, (r) => {
      const box = r.querySelector<HTMLTextAreaElement>('textarea[placeholder]');
      box?.focus();
      return !!box && r.activeElement === box;
    });
    if (focused) return;
    await Bun.sleep(100);
  }
  throw new Error('could not focus the add-note box');
}
const hasNote = (page: Page, text: string) =>
  ui(page, (r, t) => [...r.querySelectorAll('textarea')].some((a) => a.value === t), text);
// Helium ships its own extension with its own background page, so pick ours by name
async function ourBackground(): Promise<Target | null> {
  for (const target of browser.targets().filter((t) => t.type() === 'background_page')) {
    const name = await (await target.page())?.evaluate(() => chrome.runtime.getManifest().name).catch(() => '');
    if (name?.includes('Drawer')) return target;
  }
  return null;
}

try {
  await Bun.sleep(3000); // Helium's first-launch setup
  const a = await open(urlA);

  // Tab A: highlight some text with the real plus icon
  const { from, to } = await a.evaluate(() => {
    const node = document.querySelectorAll('p')[0].firstChild!;
    const rect = (s: number, e: number) => {
      const r = document.createRange();
      r.setStart(node, s);
      r.setEnd(node, e);
      return r.getBoundingClientRect();
    };
    const s = rect(0, 1);
    const e = rect(39, 40);
    return { from: { x: s.x + 1, y: s.y + s.height / 2 }, to: { x: e.right - 1, y: e.y + e.height / 2 } };
  });
  await a.mouse.move(from.x, from.y);
  await a.mouse.down();
  await a.mouse.move(to.x, to.y, { steps: 10 });
  await a.mouse.up();
  await Bun.sleep(400);
  await clickUi(a, '[data-selection-plus-icon]');
  expect('A: highlight saved and marked', (await until(async () => (await marks(a)) > 0)) !== null);
  const passage = await a.evaluate(() => document.querySelector('mark[data-highlight-id]')!.textContent!.slice(0, 20));

  // Tab B, another site: open the drawer and A's page group; leave it open from here on
  const b = await open(urlB);
  await clickUi(b, '.react-draggable');
  await Bun.sleep(900);
  expect("B: drawer lists A's page", (await drawerText(b)).includes('Plain article fixture'));
  await clickUi(b, '[data-page-header]');
  await Bun.sleep(600);
  await clickUi(b, '[data-expanded]', passage); // select the highlight, so its notes show
  await Bun.sleep(600);

  // Tab A: add a note. B must show it without reopening its drawer.
  await a.bringToFront();
  await clickUi(a, '.react-draggable');
  await Bun.sleep(900);
  if (!(await ui(a, (r) => !!r.querySelector('[data-expanded="true"]')))) await clickUi(a, '[data-expanded]', passage);
  await Bun.sleep(600);
  const ownMs = await addNote(a, 'note written in tab A');
  expect('A: its own note shows', ownMs !== null, { ownMs });
  const crossMs = await until(async () => (await ui(b, (r) => [...r.querySelectorAll('textarea')].some((t) => t.value === 'note written in tab A'))));
  expect("B: shows A's note without reopening its drawer", crossMs !== null);

  // Both tabs add notes to the SAME highlight at the same moment, five times over. Without
  // a single writer, one tab's write lands on a stale copy and erases the other's note.
  const texts: string[] = [];
  for (let round = 0; round < 5; round++) {
    const textA = `race A${round}`;
    const textB = `race B${round}`;
    texts.push(textA, textB);
    await focusNoteBox(a);
    await Bun.sleep(100);
    await focusNoteBox(a);
    await a.keyboard.type(textA);
    await focusNoteBox(b);
    await Bun.sleep(100);
    await focusNoteBox(b);
    await b.keyboard.type(textB);
    await Promise.all([a.keyboard.press('Enter'), b.keyboard.press('Enter')]);
    await Bun.sleep(150);
  }
  await Bun.sleep(400);
  const missing = async (page: Page) => (await Promise.all(texts.map(async (t) => ((await hasNote(page, t)) ? null : t)))).filter(Boolean);
  expect('same highlight, two tabs writing at once: all 10 notes in A', (await missing(a)).length === 0, await missing(a));
  expect('same highlight, two tabs writing at once: all 10 notes in B', (await missing(b)).length === 0, await missing(b));

  // A write after the background page has been unloaded must wake it and still land. Idle
  // unload doesn't happen while a debugger is attached, so close the page the way an unload does.
  const unloadBackground = async (): Promise<string> => {
    const target = await ourBackground();
    if (!target) return 'already asleep';
    await (await target.page())?.close().catch(() => undefined);
    return (await until(async () => (await ourBackground()) === null, 5000)) === null ? 'could not close it' : 'closed';
  };
  const warmMs = await addNote(b, 'warm note');
  const extensionId = new URL((await ourBackground())!.url()).host;
  const unloaded = await unloadBackground();
  // The same message the app sends, from tab B's content-script world, while nothing is running
  const highlightId = await a.evaluate(() => document.querySelector<HTMLElement>('mark[data-highlight-id]')?.dataset.highlightId);
  const started = performance.now();
  const reply = await sendFromContentScript(b, extensionId, {
    type: 'STORAGE_WRITE',
    op: { type: 'addNote', highlightId, note: { id: crypto.randomUUID(), text: 'cold note', timestamp: Date.now() } },
  });
  const coldMs = (await until(async () => (await hasNote(a, 'cold note')) && (await hasNote(b, 'cold note')))) === null ? null : Math.round(performance.now() - started);
  console.log(`write after the background was unloaded (${unloaded}): reply ${reply}, in both tabs after ${coldMs} ms; awake note round trip ~${warmMs} ms`);
  expect('background unloaded for the test', unloaded === 'closed', { unloaded });
  expect('write after the background was unloaded wakes it and lands in both tabs', coldMs !== null, { reply });

  // Tab B: delete the highlight. A's mark and drawer row must go.
  await b.bringToFront();
  await ui(b, (r, text) => {
    const row = [...r.querySelectorAll('[data-expanded]')].find((e) => (e.textContent ?? '').includes(text))!;
    row.querySelector('svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  }, passage);
  const rowGone = await until(async () => !(await drawerText(a)).includes(passage));
  expect("A: drawer row removed after B's delete", rowGone !== null);
  await a.bringToFront(); // the mark animates out, which needs a visible tab
  const markGone = await until(async () => (await marks(a)) === 0, 4000);
  expect("A: page mark removed after B's delete", markGone !== null, { marks: await marks(a) });

  console.log(`cross-tab note sync: ${crossMs} ms (includes polling)`);
} finally {
  await browser.close();
  serverA.stop(true);
  serverB.stop(true);
}
console.log(`failures=${failures}`);
if (failures) process.exitCode = 1;
