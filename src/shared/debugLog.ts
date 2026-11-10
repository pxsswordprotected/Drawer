// Debug log: structured events from real-page use, exported as JSON for analysis.
// Compiled in only when __DRAWER_DEBUG__ is true (dev page, `npm run build:extension:debug`).
// Every call site is wrapped in `if (__DRAWER_DEBUG__)`, so the normal extension build drops
// this module. Page content is captured only as short text excerpts, plus a bounded HTML
// snippet when saving or restoring a highlight fails or matches inexactly.

import { useDrawerStore } from '@/store/drawerStore';
import { isExtensionContext } from './storage';
import { downloadJson } from './exportHighlights';

const KEY_PREFIX = 'drawerDebug:';
// Highlights share extension storage (≈10 MB quota in Chrome); keep the log well below it
const MAX_SESSIONS = 20;
const MAX_EVENTS_PER_SESSION = 500;
const SNIPPET_MAX_CHARS = 2000;
const FLUSH_DELAY_MS = 1000;
const BLOCK_SELECTOR = 'p, li, blockquote, pre, td, th, h1, h2, h3, h4, h5, h6, article, section, div';

type DebugEvent = { t: number; type: string } & Record<string, unknown>;

interface DebugSession {
  id: string;
  url: string;
  title: string;
  startedAt: number;
  userAgent: string;
  extensionVersion: string | null;
  events: DebugEvent[];
}

let session: DebugSession | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
// Dynamic import: webextension-polyfill throws when loaded outside an extension (the dev
// page), so it is only imported once extension context is confirmed, as in storage.ts
async function extensionStorage() {
  return isExtensionContext() ? (await import('webextension-polyfill')).default.storage.local : null;
}

async function readSessions(): Promise<DebugSession[]> {
  const ext = await extensionStorage();
  if (ext) {
    const all = await ext.get(null);
    return Object.entries(all)
      .filter(([key]) => key.startsWith(KEY_PREFIX))
      .map(([, value]) => value as DebugSession);
  }
  const sessions: DebugSession[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(KEY_PREFIX)) sessions.push(JSON.parse(localStorage.getItem(key)!));
  }
  return sessions;
}

async function removeSessions(ids: string[]): Promise<void> {
  const keys = ids.map((id) => KEY_PREFIX + id);
  const ext = await extensionStorage();
  if (ext) await ext.remove(keys);
  else keys.forEach((key) => localStorage.removeItem(key));
}

async function flush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!session) return;
  const key = KEY_PREFIX + session.id;
  try {
    const ext = await extensionStorage();
    if (ext) await ext.set({ [key]: session });
    else localStorage.setItem(key, JSON.stringify(session));
  } catch (error) {
    console.warn('[drawer debug] failed to persist log', error);
  }
}

export function debugLog(type: string, data: Record<string, unknown> = {}): void {
  if (!session) return;
  session.events.push({ t: Date.now(), type, ...data });
  if (session.events.length > MAX_EVENTS_PER_SESSION) session.events.shift();
  if (!flushTimer) flushTimer = setTimeout(() => void flush(), FLUSH_DELAY_MS);
}

/** Whitespace-collapsed text, cut to `max` characters */
export function excerpt(text: string, max = 60): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

/** outerHTML of the block containing `node`, cut to SNIPPET_MAX_CHARS */
export function snippetOf(node: Node | null | undefined): string | null {
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  const block = el?.closest(BLOCK_SELECTOR) ?? el;
  if (!block) return null;
  const html = block.outerHTML;
  return html.length > SNIPPET_MAX_CHARS ? `${html.slice(0, SNIPPET_MAX_CHARS)}…[truncated]` : html;
}

/** Compact "TAG.class:offset" description of a range boundary, for locating selections in logs */
function describeBoundary(node: Node, offset: number): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement;
    return `#text(${JSON.stringify(excerpt(node.textContent ?? '', 12))}) in ${parent?.tagName ?? '?'}:${offset}`;
  }
  const el = node as Element;
  const cls = typeof el.className === 'string' && el.className ? `.${el.className.split(' ')[0]}` : '';
  return `${el.tagName}${cls}:${offset}`;
}

export function describeRangeEnds(range: Range): { start: string; end: string; commonAncestor: string } {
  const ancestor = range.commonAncestorContainer;
  return {
    start: describeBoundary(range.startContainer, range.startOffset),
    end: describeBoundary(range.endContainer, range.endOffset),
    commonAncestor: describeBoundary(ancestor, 0).replace(/:0$/, ''),
  };
}

/** Whether the page's own text (excluding the extension UI) contains `text` */
export function pageTextIncludes(text: string): boolean {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('[data-drawer]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let pageText = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) pageText += node.textContent;
  return pageText.replace(/\s+/g, '').includes(text.replace(/\s+/g, '').slice(0, 40));
}

export function errorInfo(error: unknown): { message: string; stack?: string } {
  return error instanceof Error
    ? { message: error.message, stack: error.stack }
    : { message: String(error) };
}

/** Start a session for this page load: page context, errors, drawer open/close, URL changes */
export function initDebugLog(): void {
  if (session) return;
  const runtime = isExtensionContext() ? chrome.runtime : null;
  const current: DebugSession = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url: location.href,
    title: document.title,
    startedAt: Date.now(),
    userAgent: navigator.userAgent,
    extensionVersion: runtime?.getManifest().version ?? null,
    events: [],
  };
  session = current;

  debugLog('page.load', {
    nodes: document.getElementsByTagName('*').length,
    textLength: document.body?.textContent?.length ?? 0,
  });

  // Only the extension's own errors (the content script shares `window` with the page)
  const ownBase = runtime?.getURL('') ?? null;
  const isOwn = (...sources: (string | undefined)[]) =>
    !ownBase || sources.some((source) => source?.includes(ownBase));
  window.addEventListener('error', (e) => {
    if (isOwn(e.filename, e.error?.stack)) {
      debugLog('error', { message: e.message, source: e.filename, line: e.lineno, stack: e.error?.stack });
    }
  });
  window.addEventListener('unhandledrejection', (e) => {
    const info = errorInfo(e.reason);
    if (isOwn(info.stack)) debugLog('error.unhandledRejection', info);
  });

  useDrawerStore.subscribe((state, prev) => {
    if (state.isOpen === prev.isOpen) return;
    debugLog(state.isOpen ? 'drawer.open' : 'drawer.close', {
      trigger: state.isOpen ? state.drawerTrigger : undefined,
      highlightCount: state.allHighlights.length,
    });
  });

  // Single-page apps change the URL without reloading; highlights are keyed by URL
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href === lastUrl) return;
    debugLog('page.urlChange', { from: lastUrl, to: location.href });
    lastUrl = location.href;
  }, 1000);

  // Persist pending events before the page goes away (navigation, reload, tab hidden)
  window.addEventListener('pagehide', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });

  // Keep only the newest sessions
  void readSessions().then((all) => {
    const stale = all
      .filter((s) => s.id !== current.id)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(MAX_SESSIONS - 1);
    if (stale.length) void removeSessions(stale.map((s) => s.id));
  });
}

/** Download every stored session as one JSON file */
export async function exportDebugLog(): Promise<void> {
  await flush();
  const sessions = (await readSessions()).sort((a, b) => a.startedAt - b.startedAt);
  const json = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      sessionCount: sessions.length,
      eventCount: sessions.reduce((sum, s) => sum + s.events.length, 0),
      sessions,
    },
    null,
    2
  );
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  downloadJson(json, `drawer-debug-${stamp}.json`);
}

export async function clearDebugLog(): Promise<void> {
  if (session) session.events = [];
  const all = await readSessions();
  await removeSessions(all.map((s) => s.id));
}
