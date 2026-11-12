// Offline, real-browser regression for drawer content across page-group/lifecycle states.
// Build first: npx vite build --mode extension --outDir bench/drag/.ext
// Run: bun bench/drawer/run.ts (CHROME_PATH can select Helium).
import puppeteer, { type Page } from 'puppeteer-core';
import { join } from 'node:path';
import type { Highlight } from '../../src/shared/types';

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
const current = `${origin}/`;
const other = 'https://example.com/other';
const third = 'https://example.com/third';
const bundle = await Bun.file(join(root, 'bench/drag/.ext/content.js')).text();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  defaultViewport: { width: 1280, height: 800 },
  args: ['--no-first-run', '--disable-background-networking', '--disable-extensions'],
});
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function highlight(id: string, url: string): Highlight {
  return {
    id, url, text: `Saved passage ${id}`, pageTitle: `Page ${new URL(url).pathname}`,
    notes: [], color: '#ffff02', timestamp: 1000,
    position: { startXPath: '', endXPath: '', startOffset: 0, endOffset: 0, textContext: { before: '', after: '' } },
  };
}
async function fresh(data: Highlight[]): Promise<Page> {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => req.url().startsWith(origin) ? req.continue() : req.abort());
  for (let attempt = 0; ; attempt++) {
    try { await page.goto(current, { waitUntil: 'load' }); break; }
    catch (error) { if (attempt >= 2 || !String(error).includes('ERR_ABORTED')) throw error; }
  }
  await page.evaluate((data) => {
    localStorage.clear();
    localStorage.setItem('highlights', JSON.stringify(data));
    (window as any).chrome = {
      runtime: { id: 'drawer-test', getURL: (p: string) => `${location.origin}/ext/${p}`, onMessage: { addListener() {} } },
    };
  }, data);
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => document.getElementById('drawer-extension-root')?.shadowRoot?.querySelector('.react-draggable'));
  await pause(200);
  return page;
}
async function click(page: Page, selector: string, index = 0) {
  const point = await page.evaluate((selector, index) => {
    const element = document.getElementById('drawer-extension-root')!.shadowRoot!.querySelectorAll(selector)[index] as HTMLElement;
    if (!element) throw new Error(`Missing control ${selector} (${index})`);
    element.scrollIntoView({ block: 'nearest' });
    const box = element.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, selector, index);
  await page.mouse.click(point.x, point.y);
}
let trials = 0;
let failures = 0;
async function check(page: Page, label: string, expected: string) {
  await pause(400); // Allow the 150ms drawer and 250ms row entrances to finish.
  const view = await page.evaluate(() => {
    const panel = document.getElementById('drawer-extension-root')?.shadowRoot?.querySelector('[data-drawer]');
    if (!panel) throw new Error(`Drawer disappeared at ${location.href}: ${document.body.textContent?.slice(0, 200)}`);
    const clip = panel.getBoundingClientRect();
    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    const visible: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      let hidden = false;
      for (let el = node.parentElement; el; el = el.parentElement) {
        const css = getComputedStyle(el);
        if (css.display === 'none' || css.visibility === 'hidden' || css.contentVisibility === 'hidden' || Number(css.opacity) === 0) hidden = true;
      }
      const range = document.createRange(); range.selectNodeContents(node);
      if (!hidden && [...range.getClientRects()].some(r => r.width > 0 && r.height > 0 && r.bottom > clip.top && r.top < clip.bottom && r.right > clip.left && r.left < clip.right)) visible.push(node.textContent);
    }
    return { visible: visible.join(' '), dom: panel.textContent, saved: JSON.parse(localStorage.highlights).length };
  });
  trials++;
  const pass = view.visible.includes(expected);
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${pass ? '' : `: ${JSON.stringify(view)}`}`);
}
// Let browser startup (including Helium's first-launch initialization) settle before injection.
await pause(3000);
try {
  const cases: [string, Highlight[], string][] = [
    ['empty storage', [], 'No highlights saved.'],
    ['one current-page group', [highlight('current', current)], 'Saved passage current'],
    ['one other-page group', [highlight('other', other)], 'Page /other'],
    ['one other-page group, multiple highlights', [highlight('other-1', other), highlight('other-2', other)], 'Page /other'],
    ['two other-page groups', [highlight('other', other), highlight('third', third)], 'Page /other'],
    ['current and other page', [highlight('current', current), highlight('other', other)], 'Saved passage current'],
  ];
  for (const [label, data, expected] of cases) {
    const page = await fresh(data);
    await click(page, '.react-draggable');
    await check(page, label, expected);
    if (label === 'one other-page group') {
      await page.screenshot({ path: '/tmp/drawer-single-other-page.png' });
      await click(page, '[data-page-header]');
      await check(page, 'expand lone other-page group', 'Saved passage other');
      await click(page, '[data-page-header]');
      await check(page, 'collapse lone other-page group', 'Page /other');
      await click(page, '[aria-label="Settings"]');
      await check(page, 'open settings from lone group', 'General');
      await click(page, '[aria-label="Settings"]');
      await check(page, 'return from settings to lone group', 'Page /other');
      await click(page, '[aria-label="Toggle export mode"]');
      await check(page, 'export from lone other-page group', 'Selected');
      await click(page, '[aria-label="Toggle export mode"]');
      await check(page, 'return from export to lone group', 'Page /other');
    }
    for (const delay of [0, 40, 100, 140, 180]) {
      await click(page, '.react-draggable'); await pause(delay); await click(page, '.react-draggable');
      await check(page, `${label}, reopen after ${delay}ms`, expected);
    }
    await page.close();
  }
  const page = await fresh([highlight('current', current), highlight('other', other)]);
  await click(page, '.react-draggable'); await pause(400);
  await click(page, '[data-page-header] > div:last-child', 0);
  await check(page, 'delete current page leaving one other group', 'Page /other');
  await click(page, '[data-page-header]');
  await check(page, 'expand remaining group after deletion', 'Saved passage other');
  await click(page, '[data-page-header] > div:last-child');
  await check(page, 'delete last group shows empty message', 'No highlights saved.');
  await page.close();
} finally {
  await browser.close(); server.stop(true);
}
console.log(`METRIC drawer_content_failures=${failures}`);
console.log(`METRIC drawer_content_trials=${trials}`);
if (failures) process.exitCode = 1;
