// In-page simulator for the storage bench. One page hosts every context of one "browser":
// each tab and the background page is a same-origin iframe (its own JS realm, so its own
// copy of the app's modules) wired to a fake extension API backed by ONE shared storage.
//
// What the fake models (what chrome.storage.local / browser.storage.local guarantee):
//   - every get/set/remove/clear call is applied atomically, at some point after the call;
//     nothing spans two calls (get -> set is two points, other contexts can land between)
//   - calls from one context are applied in the order they were made; last write wins per key
//   - values are JSON-serialised at call time; results are fresh copies
//   - storage.onChanged reaches every context, the writer included, later and independently
//     of the write's own callback
//   - chromium profile: callback-only `chrome.*` (Manifest V2: no promises), onChanged lists
//     only keys whose value changed. firefox profile: promise `browser.*` plus `chrome.*`,
//     onChanged lists every key that was set
//   - runtime.sendMessage reaches the background page, which is an event page: it is unloaded
//     after BG_IDLE_MS without pending work and re-run from scratch for the next event
//
// Time is virtual. Every latency comes from a seeded PRNG and every timer in a context runs
// on the virtual clock, so a round replays identically. Per-origin primitives that would
// wrongly link the "tabs" (BroadcastChannel, navigator.locks, localStorage, ...) throw:
// real tabs are on different sites.
import type { TabBench } from './tab';
import { visible } from './types';
import type { Op, OpResult, Planned, Profile, RoundPlan, RoundResult, Snapshot, SyncSample } from './types';

const BG_IDLE_MS = 40; // virtual ms without pending work before the event page unloads
const EPOCH = Date.UTC(2026, 4, 2); // virtual clock origin for Date.now()
const MAX_EVENTS = 2_000_000;
const NO_RECEIVER = 'Could not establish connection. Receiving end does not exist.';
const PORT_CLOSED = 'The message port closed before a response was received.';
const PER_ORIGIN = ['BroadcastChannel', 'localStorage', 'sessionStorage', 'indexedDB', 'SharedWorker'];

type Listener = (...args: unknown[]) => unknown;
/** Outcome of an API call: `json` is the serialised result, `error` becomes lastError / a rejection */
interface Reply {
  json?: string;
  error?: string;
}
type Core = (args: unknown[], done: (reply: Reply) => void) => void;

interface Realm {
  name: string;
  tabId: number | null; // null: background page
  frame: HTMLIFrameElement;
  win: Window & typeof globalThis;
  alive: boolean;
  onChanged: Set<Listener>;
  onMessage: Set<Listener>;
  onInstalled: Set<Listener>;
  keepalive: number; // pending API callbacks / owed message responses
  lastActive: number;
  // Per-channel delivery clocks: each channel is first-in first-out
  lastApply: number;
  lastResponse: number;
  lastEvent: number;
  lastMessageOut: number; // arrival time of this context's last outgoing message
}

interface SimEvent {
  at: number;
  seq: number;
  realm: Realm | null;
  run: () => void;
  cancelled: boolean;
}

// ─── Round state (reset by runRound) ───

let profile: Profile = 'chromium';
let random: () => number = Math.random;
let now = 0;
let seq = 0;
let activity = 0;
let processed = 0;
let queue: SimEvent[] = [];
let data = new Map<string, string>(); // key -> JSON
let realms: Realm[] = [];
let background: Realm | null = null;
let backgroundListens = { onChanged: false, onMessage: false };
let stats = { writes: 0, reads: 0, bytesWritten: 0, messages: 0, backgroundWakes: 0 };
let errors: string[] = [];
const code = { tab: '', background: '' };

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded latency in [min, max) virtual ms, to 1/100 ms */
const latency = (min: number, max: number) => Math.round((min + random() * (max - min)) * 100) / 100;

// ─── Virtual clock ───

function schedule(at: number, realm: Realm | null, run: () => void): SimEvent {
  const event: SimEvent = { at, seq: seq++, realm, run, cancelled: false };
  let lo = 0;
  let hi = queue.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (queue[mid].at <= at) lo = mid + 1;
    else hi = mid;
  }
  queue.splice(lo, 0, event);
  activity++;
  return event;
}

const channel = new MessageChannel();
let wake: (() => void) | null = null;
channel.port1.onmessage = () => wake?.();
function turn(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  wake = resolve;
  channel.port2.postMessage(0);
  return promise;
}

/** Lets every context finish its promise chains before the next event is delivered */
async function settle(): Promise<void> {
  let quiet = 0;
  while (quiet < 2) {
    const before = activity;
    await turn();
    quiet = activity === before ? quiet + 1 : 0;
  }
}

/** Delivers events in virtual-time order while `keepGoing()` holds and events remain */
async function pump(keepGoing: () => boolean): Promise<void> {
  await settle();
  while (keepGoing() && queue.length > 0) {
    const event = queue.shift()!;
    if (event.cancelled || (event.realm && !event.realm.alive)) continue;
    if (++processed > MAX_EVENTS) throw new Error('bench: event limit reached (runaway timers?)');
    now = Math.max(now, event.at);
    try {
      event.run();
    } catch (error) {
      errors.push(`${event.realm?.name ?? 'backend'}: ${describe(error)}`);
    }
    await settle();
  }
}

async function runUntil(time: number): Promise<void> {
  await pump(() => queue.length > 0 && queue[0].at <= time);
  now = Math.max(now, time);
}

/** Runs the simulation until `promise` settles */
async function drive<T>(promise: Promise<T>): Promise<T> {
  let state: { value: T } | { error: unknown } | null = null;
  promise.then(
    (value) => (state = { value }),
    (error: unknown) => (state = { error })
  );
  await pump(() => state === null);
  await settle();
  const settled = state as { value: T } | { error: unknown } | null;
  if (settled === null) throw new Error('bench: promise never settled and no events remain');
  if ('error' in settled) throw settled.error;
  return settled.value;
}

const describe = (error: unknown) =>
  error instanceof Error || (typeof error === 'object' && error !== null && 'message' in error)
    ? String((error as { message: unknown }).message)
    : String(error);

// ─── Contexts ───

function createRealm(name: string, tabId: number | null): Realm {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  const win = frame.contentWindow as Window & typeof globalThis;
  const realm: Realm = {
    name,
    tabId,
    frame,
    win,
    alive: true,
    onChanged: new Set(),
    onMessage: new Set(),
    onInstalled: new Set(),
    keepalive: 0,
    lastActive: now,
    lastApply: 0,
    lastResponse: 0,
    lastEvent: 0,
    lastMessageOut: 0,
  };
  win.addEventListener('error', (e) => errors.push(`${name}: ${e.message}`));
  win.addEventListener('unhandledrejection', (e) => errors.push(`${name}: unhandled ${describe(e.reason)}`));
  installClock(realm);
  for (const key of PER_ORIGIN) {
    Object.defineProperty(win, key, {
      configurable: true,
      get() {
        throw new Error(`bench: ${key} is per-origin and real tabs are on different sites`);
      },
    });
  }
  Object.defineProperty(win.navigator, 'locks', {
    configurable: true,
    get() {
      throw new Error('bench: navigator.locks is per-origin and real tabs are on different sites');
    },
  });
  const api = makeApi(realm);
  Object.assign(win, profile === 'firefox' ? { chrome: api.chrome, browser: api.browser } : { chrome: api.chrome });
  realms.push(realm);
  return realm;
}

function destroyRealm(realm: Realm): void {
  realm.alive = false;
  realm.frame.remove();
  realms = realms.filter((r) => r !== realm);
}

function loadScript(realm: Realm, source: string): void {
  const script = realm.win.document.createElement('script');
  script.textContent = source;
  realm.win.document.head.appendChild(script);
}

/** setTimeout/setInterval/Date.now/performance.now of a context, on the virtual clock */
function installClock(realm: Realm): void {
  const win = realm.win;
  const timers = new Map<number, SimEvent>();
  let nextId = 1;
  const start = (repeat: boolean) => (handler: TimerHandler, ms?: number, ...args: unknown[]) => {
    const id = nextId++;
    const delay = Math.max(repeat ? 1 : 0, Number(ms) || 0);
    const arm = () =>
      timers.set(
        id,
        schedule(now + delay, realm, () => {
          if (repeat) arm();
          else timers.delete(id);
          if (typeof handler === 'function') handler(...args);
        })
      );
    arm();
    return id;
  };
  const stop = (id?: number) => {
    const event = id === undefined ? undefined : timers.get(id);
    if (event) event.cancelled = true;
    if (id !== undefined) timers.delete(id);
  };
  Object.assign(win, {
    setTimeout: start(false),
    setInterval: start(true),
    clearTimeout: stop,
    clearInterval: stop,
  });
  win.Date.now = () => EPOCH + Math.floor(now);
  Object.defineProperty(win.performance, 'now', { configurable: true, value: () => now });
}

/** Parses in the destination realm so results are that realm's own plain objects */
const parseIn = (realm: Realm, json: string | undefined): unknown =>
  json === undefined ? undefined : realm.win.JSON.parse(json);

function touch(realm: Realm): void {
  realm.lastActive = now;
  if (realm !== background) return;
  schedule(now + BG_IDLE_MS, realm, () => {
    if (background === realm && realm.keepalive === 0 && now - realm.lastActive >= BG_IDLE_MS) {
      destroyRealm(realm);
      background = null;
    }
  });
}

function keepalive(realm: Realm, delta: number): void {
  realm.keepalive += delta;
  if (realm.alive) touch(realm);
}

/** Runs the background script from scratch, as the browser does to deliver an event */
function wakeBackground(): Realm {
  if (background) return background;
  const realm = createRealm('background', null);
  background = realm;
  stats.backgroundWakes++;
  loadScript(realm, code.background);
  backgroundListens = { onChanged: realm.onChanged.size > 0, onMessage: realm.onMessage.size > 0 };
  touch(realm);
  return realm;
}

// ─── Shared storage backend ───

interface Change {
  oldValue?: string;
  newValue?: string;
}

function storageRequest(realm: Realm, apply: () => { json?: string; changes?: Map<string, Change> }, done: (reply: Reply) => void): void {
  activity++;
  keepalive(realm, 1);
  realm.lastApply = Math.max(now + latency(1, 8), realm.lastApply);
  schedule(realm.lastApply, null, () => {
    const result = apply();
    if (result.changes && result.changes.size > 0) broadcast(result.changes);
    realm.lastResponse = Math.max(now + latency(1, 8), realm.lastResponse);
    schedule(realm.lastResponse, realm, () => {
      keepalive(realm, -1);
      done({ json: result.json });
    });
  });
}

function broadcast(changes: Map<string, Change>): void {
  const body = [...changes].map(([key, change]) => {
    const fields = [
      change.oldValue === undefined ? '' : `"oldValue":${change.oldValue}`,
      change.newValue === undefined ? '' : `"newValue":${change.newValue}`,
    ].filter(Boolean);
    return `${JSON.stringify(key)}:{${fields.join(',')}}`;
  });
  const json = `{${body.join(',')}}`;
  const deliver = (realm: Realm, extraDelay: number) => {
    realm.lastEvent = Math.max(now + extraDelay + latency(1, 15), realm.lastEvent);
    schedule(realm.lastEvent, realm, () => {
      touch(realm);
      for (const listener of [...realm.onChanged]) listener(parseIn(realm, json), 'local');
    });
  };
  for (const realm of [...realms]) {
    if (realm.onChanged.size > 0) deliver(realm, 0);
  }
  if (!background && backgroundListens.onChanged) {
    // The event page registered a storage listener last time it ran: the event wakes it
    const wakeDelay = latency(5, 25);
    schedule(now + wakeDelay, null, () => {
      const realm = wakeBackground();
      realm.lastEvent = Math.max(now + latency(1, 15), realm.lastEvent);
      schedule(realm.lastEvent, realm, () => {
        touch(realm);
        for (const listener of [...realm.onChanged]) listener(parseIn(realm, json), 'local');
      });
    });
  }
}

function storageArea(realm: Realm): Record<'get' | 'set' | 'remove' | 'clear', Core> {
  const keyList = (keys: unknown): string[] =>
    typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys.map(String) : [];
  return {
    get([keys], done) {
      // Serialised now: the caller may change its arguments after the call
      const wanted = JSON.stringify(keys ?? null);
      stats.reads++;
      storageRequest(
        realm,
        () => {
          const parsed: unknown = JSON.parse(wanted);
          let entries: [string, string | undefined][];
          if (parsed === null) entries = [...data];
          else if (typeof parsed === 'string' || Array.isArray(parsed)) {
            entries = keyList(parsed).map((key) => [key, data.get(key)]);
          } else {
            entries = Object.entries(parsed as Record<string, unknown>).map(([key, fallback]) => [
              key,
              data.get(key) ?? JSON.stringify(fallback),
            ]);
          }
          const body = entries.filter(([, value]) => value !== undefined).map(([key, value]) => `${JSON.stringify(key)}:${value}`);
          return { json: `{${body.join(',')}}` };
        },
        done
      );
    },
    set([items], done) {
      const serialised = JSON.stringify(items ?? {});
      stats.writes++;
      stats.bytesWritten += serialised.length;
      storageRequest(
        realm,
        () => {
          const changes = new Map<string, Change>();
          for (const [key, value] of Object.entries(JSON.parse(serialised) as Record<string, unknown>)) {
            const newValue = JSON.stringify(value);
            const oldValue = data.get(key);
            if (profile === 'firefox' || oldValue !== newValue) changes.set(key, { oldValue, newValue });
            data.set(key, newValue);
          }
          return { changes };
        },
        done
      );
    },
    remove([keys], done) {
      const wanted = keyList(keys);
      stats.writes++;
      storageRequest(
        realm,
        () => {
          const changes = new Map<string, Change>();
          for (const key of wanted) {
            const oldValue = data.get(key);
            if (oldValue === undefined) continue;
            changes.set(key, { oldValue });
            data.delete(key);
          }
          return { changes };
        },
        done
      );
    },
    clear(_args, done) {
      stats.writes++;
      storageRequest(
        realm,
        () => {
          const changes = new Map<string, Change>([...data].map(([key, oldValue]) => [key, { oldValue }]));
          data = new Map();
          return { changes };
        },
        done
      );
    },
  };
}

// ─── Messaging ───

/** Hands a message to `target`'s runtime.onMessage listeners; `reply` gets the single response */
function dispatchMessage(target: Realm, messageJson: string, senderJson: string, reply: (r: Reply) => void): void {
  touch(target);
  const listeners = [...target.onMessage];
  if (listeners.length === 0) return reply({ error: NO_RECEIVER });
  let responded = false;
  let held = false;
  const finish = (r: Reply) => {
    if (responded) return;
    responded = true;
    if (held) keepalive(target, -1);
    reply(r);
  };
  const sendResponse = (value?: unknown) => finish({ json: JSON.stringify(value) });
  let keepOpen = false;
  for (const listener of listeners) {
    const returned = listener(parseIn(target, messageJson), parseIn(target, senderJson), sendResponse);
    if (returned === true) keepOpen = true;
    else if (profile === 'firefox' && typeof (returned as PromiseLike<unknown> | null)?.then === 'function') {
      keepOpen = true;
      (returned as PromiseLike<unknown>).then(sendResponse, (error: unknown) => finish({ error: describe(error) }));
    }
  }
  if (responded) return;
  if (!keepOpen) return finish(profile === 'firefox' ? {} : { error: PORT_CLOSED });
  held = true;
  keepalive(target, 1);
}

function sendMessage(from: Realm, to: 'background' | number, message: unknown, done: (r: Reply) => void): void {
  activity++;
  stats.messages++;
  const messageJson = JSON.stringify(message);
  const senderJson = JSON.stringify({
    id: 'bench-extension-id',
    ...(from.tabId === null ? {} : { tab: { id: from.tabId }, url: `https://tab${from.tabId}.example/` }),
  });
  const respond = (r: Reply) => {
    from.lastResponse = Math.max(now + latency(1, 6), from.lastResponse);
    schedule(from.lastResponse, from, () => {
      keepalive(from, -1);
      done(r);
    });
  };
  keepalive(from, 1);
  if (to === 'background') {
    if (!background && !backgroundListens.onMessage) return respond({ error: NO_RECEIVER });
    // Messages from one context arrive in the order it sent them; a sleeping event page
    // is started first
    const wakeDelay = background ? 0 : latency(5, 25);
    from.lastMessageOut = Math.max(now + wakeDelay + latency(1, 6), from.lastMessageOut);
    schedule(from.lastMessageOut, null, () => dispatchMessage(wakeBackground(), messageJson, senderJson, respond));
    return;
  }
  const target = realms.find((r) => r.tabId === to);
  if (!target) return respond({ error: NO_RECEIVER });
  from.lastMessageOut = Math.max(now + latency(1, 6), from.lastMessageOut);
  schedule(from.lastMessageOut, target, () => dispatchMessage(target, messageJson, senderJson, respond));
}

// ─── The API objects a context sees ───

function eventTarget(listeners: Set<Listener>) {
  return {
    addListener: (listener: Listener) => void listeners.add(listener),
    removeListener: (listener: Listener) => void listeners.delete(listener),
    hasListener: (listener: Listener) => listeners.has(listener),
  };
}

function makeApi(realm: Realm) {
  const runtime: Record<string, unknown> = {
    id: 'bench-extension-id',
    getURL: (path: string) => `${location.origin}/ext/${path}`,
    getManifest: () => ({ manifest_version: 2, version: '0.1.0' }),
    onMessage: eventTarget(realm.onMessage),
    // Background page only, like the real API
    ...(realm.tabId === null ? { onInstalled: eventTarget(realm.onInstalled) } : {}),
  };

  /** chrome.* style: optional trailing callback, runtime.lastError during it, no promise (MV2) */
  const callbackStyle =
    (core: Core) =>
    (...args: unknown[]) => {
      const callback = typeof args[args.length - 1] === 'function' ? (args.pop() as Listener) : null;
      core(args, (reply) => {
        if (reply.error === undefined) return void callback?.(parseIn(realm, reply.json));
        runtime.lastError = { message: reply.error };
        try {
          callback?.();
        } finally {
          delete runtime.lastError;
        }
      });
    };
  /** browser.* style: returns a promise */
  const promiseStyle =
    (core: Core) =>
    (...args: unknown[]) => {
      const { promise, resolve, reject } = Promise.withResolvers<unknown>();
      core(args, (reply) =>
        reply.error === undefined ? resolve(parseIn(realm, reply.json)) : reject(new realm.win.Error(reply.error))
      );
      return promise;
    };

  const area = storageArea(realm);
  // (message), (message, options) or (extensionId, message[, options])
  const messageArgs = (args: unknown[]) => (args.length >= 2 && args[0] === runtime.id ? args[1] : args[0]);
  const cores: Record<string, Core> = {
    get: area.get,
    set: area.set,
    remove: area.remove,
    clear: area.clear,
    sendMessage: (args, done) => sendMessage(realm, 'background', messageArgs(args), done),
    tabsSendMessage: ([tabId, message], done) => sendMessage(realm, Number(tabId), message, done),
    tabsQuery: (_args, done) => {
      activity++;
      const tabs = realms.filter((r) => r.tabId !== null).map((r) => ({ id: r.tabId, active: r.tabId === 0, windowId: 1 }));
      keepalive(realm, 1);
      schedule(now + latency(1, 4), realm, () => {
        keepalive(realm, -1);
        done({ json: JSON.stringify(tabs) });
      });
    },
  };

  const build = (style: (core: Core) => Listener) => {
    const local = {
      get: style(cores.get),
      set: style(cores.set),
      remove: style(cores.remove),
      clear: style(cores.clear),
    };
    const api: Record<string, unknown> = {
      runtime: Object.assign(style === callbackStyle ? runtime : Object.create(runtime), {
        sendMessage: style(cores.sendMessage),
      }),
      storage: { local, onChanged: eventTarget(realm.onChanged) },
    };
    if (realm.tabId === null) {
      // Background page only: content scripts have no tabs or commands API
      api.tabs = { query: style(cores.tabsQuery), sendMessage: style(cores.tabsSendMessage) };
      api.commands = { onCommand: eventTarget(new Set()) };
    }
    return api;
  };
  return { chrome: build(callbackStyle), browser: build(promiseStyle) };
}

// ─── Running a round ───

type BenchWindow = Window & typeof globalThis & { __bench: TabBench };
const benchOf = (realm: Realm) => (realm.win as BenchWindow).__bench;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

async function runRound(plan: RoundPlan): Promise<RoundResult> {
  for (const realm of [...realms]) destroyRealm(realm);
  profile = plan.profile;
  random = mulberry32(plan.seed);
  now = 0;
  seq = 0;
  activity = 0;
  processed = 0;
  queue = [];
  data = new Map();
  background = null;
  backgroundListens = { onChanged: false, onMessage: false };
  stats = { writes: 0, reads: 0, bytesWritten: 0, messages: 0, backgroundWakes: 0 };
  errors = [];

  // Install: the background script runs once, registers its listeners, gets onInstalled,
  // then goes idle
  const installing = wakeBackground();
  schedule(now + 1, installing, () => {
    touch(installing);
    for (const listener of [...installing.onInstalled]) listener(parseIn(installing, '{"reason":"install"}'));
  });
  await runUntil(now + 200);

  // Seed storage through the app's own import, in a context that then closes
  const setup = createRealm('setup', 900);
  loadScript(setup, code.tab);
  await drive(benchOf(setup).seed(plan.seedBackup));
  destroyRealm(setup);
  await runUntil(now + 200);
  stats = { writes: 0, reads: 0, bytesWritten: 0, messages: 0, backgroundWakes: 0 };

  // ── Tabs ──
  const tabs: Realm[] = [];
  interface Watcher {
    op: Planned;
    ackAt: number;
    seenAt: number | null;
  }
  const watchers: Watcher[][] = [];
  const checkWatchers = (tab: number) => {
    const pending = watchers[tab].filter((w) => w.seenAt === null);
    if (pending.length === 0) return;
    const view = benchOf(tabs[tab]).view();
    for (const watcher of pending) if (visible(watcher.op.op, view)) watcher.seenAt = now;
  };
  const openTab = (index: number, drawerOpen: boolean): Promise<void> => {
    const realm = createRealm(`tab${index}`, index);
    tabs[index] = realm;
    watchers[index] = [];
    loadScript(realm, code.tab);
    const bench = benchOf(realm);
    bench.subscribe(() => checkWatchers(index));
    return drawerOpen ? bench.mount().then(() => bench.open()) : bench.mount();
  };
  await drive(Promise.all(Array.from({ length: plan.tabs }, (_, index) => openTab(index, index !== 0))));

  // ── Workload ──
  const base = now + 20;
  let tick = 0;
  const results = new Map<number, OpResult>(
    plan.ops.map((p) => [p.id, { id: p.id, status: 'pending', start: null, ack: null, startTick: null, ackTick: null }])
  );
  const waiting = new Map<number, Planned[]>(); // dependency id -> ops held back by it
  const start = (planned: Planned) => {
    const result = results.get(planned.id)!;
    const dependency = planned.dependsOn === undefined ? undefined : results.get(planned.dependsOn);
    if (dependency && dependency.status !== 'ok') {
      if (dependency.status === 'pending') waiting.set(dependency.id, [...(waiting.get(dependency.id) ?? []), planned]);
      else result.status = 'skipped';
      return;
    }
    const realm = tabs[planned.tab];
    result.start = now;
    result.startTick = ++tick;
    activity++;
    const finish = (status: 'ok' | 'rejected', error?: unknown) => {
      activity++;
      result.status = status;
      result.ack = now;
      result.ackTick = ++tick;
      if (error !== undefined) result.error = describe(error);
      for (const held of waiting.get(planned.id) ?? []) {
        if (status === 'ok') schedule(now + 1, null, () => start(held));
        else results.get(held.id)!.status = 'skipped';
      }
      waiting.delete(planned.id);
      if (status !== 'ok') return;
      tabs.forEach((other, index) => {
        if (index === planned.tab || !other?.alive) return;
        watchers[index].push({ op: planned, ackAt: now, seenAt: null });
        checkWatchers(index);
      });
    };
    let running: Promise<void>;
    try {
      running = benchOf(realm).run(parseIn(realm, JSON.stringify(planned.op)) as Op);
    } catch (error) {
      return finish('rejected', error);
    }
    running.then(
      () => finish('ok'),
      (error: unknown) => finish('rejected', error)
    );
  };
  for (const planned of plan.ops) schedule(base + planned.at, null, () => start(planned));
  schedule(base + plan.lateTabAt, null, () => void openTab(plan.tabs, true));
  const lastAt = Math.max(plan.lateTabAt, ...plan.ops.map((p) => p.at));
  await runUntil(base + lastAt + plan.graceMs);

  // ── Results ──
  for (const result of results.values()) {
    if (result.status === 'pending' && result.start === null) result.status = 'skipped'; // held by an op that never finished
  }
  const views = tabs.map((realm) => copy(benchOf(realm).view()));
  const reader = createRealm('reader', 901);
  loadScript(reader, code.tab);
  const final: Snapshot = copy(await drive(benchOf(reader).read()));
  const sync: SyncSample[] = watchers.flatMap((list, tab) =>
    list.map((w) => ({ op: w.op.id, tab, ms: w.seenAt === null ? null : Math.max(0, w.seenAt - w.ackAt) }))
  );
  return { ops: [...results.values()], final, tabs: views, sync, ...stats, events: processed, errors };
}

Object.assign(window, {
  __sim: {
    load(tab: string, backgroundSource: string) {
      code.tab = tab;
      code.background = backgroundSource;
    },
    runRound,
  },
});
