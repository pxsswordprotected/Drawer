// Background script: an event page the browser starts when it has an event for it and unloads
// when idle. It forwards keyboard commands to the active tab, and it is the one writer of
// stored data: tabs send it WriteOps and it applies them one at a time, in the order they
// arrive, so two tabs can never overwrite each other's changes (see shared/storage.ts). It
// keeps nothing in memory between events.
import { runWrite } from '@/shared/storage';
import { WRITE_MESSAGE } from '@/shared/constants';
import type { WriteOp } from '@/shared/types';

// Cross-browser extension API (Firefox exposes `browser`, Chrome exposes `chrome`)
const api = typeof browser !== 'undefined' ? browser : chrome;

api.commands.onCommand.addListener(async (command: string) => {
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]?.id) return;
  if (command === 'toggle-drawer') api.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_DRAWER' });
  if (command === 'create-highlight') api.tabs.sendMessage(tabs[0].id, { type: 'CREATE_HIGHLIGHT' });
});

const isWrite = (message: unknown): message is { type: typeof WRITE_MESSAGE; op: WriteOp } =>
  typeof message === 'object' && message !== null && 'type' in message && message.type === WRITE_MESSAGE;

api.runtime.onMessage.addListener(
  (message: unknown, _sender: unknown, sendResponse: (reply: { error?: string }) => void) => {
    if (!isWrite(message)) return;
    runWrite(message.op).then(
      () => sendResponse({}),
      (error: unknown) => sendResponse({ error: error instanceof Error ? error.message : String(error) })
    );
    return true; // the reply comes after the write; the open reply also keeps the page loaded
  }
);
