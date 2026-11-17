// Storage bench: do concurrent writes from several tabs survive, and do tabs see each other's
// changes? Runs the app's real storage layer and store (bench/storage/tab.ts) in simulated
// tabs sharing one fake extension storage (bench/storage/host.ts), on a fixed seeded workload.
//
// Build first (autoresearch.sh does): bun bench/seed/make-seed.ts, then
//   npx vite build -c bench/storage/vite.config.ts --mode tab   (and --mode host)
// Run: bun bench/storage/run.ts            (CHROME_PATH selects another Chromium, e.g. Helium)
//      bun bench/storage/run.ts --verbose  (lists every lost action)
import puppeteer from 'puppeteer-core';
import { join } from 'node:path';
import { judge } from './oracle';
import { planRound } from './workload';
import type { RoundSpec, SeedBackup } from './workload';
import type { RoundPlan, RoundResult } from './types';

const ROUNDS: RoundSpec[] = [
  { seed: 1, profile: 'chromium', deleteAll: false },
  { seed: 2, profile: 'firefox', deleteAll: false },
  { seed: 3, profile: 'chromium', deleteAll: false },
  { seed: 4, profile: 'firefox', deleteAll: true },
  { seed: 5, profile: 'chromium', deleteAll: false },
  { seed: 6, profile: 'firefox', deleteAll: false },
  { seed: 7, profile: 'chromium', deleteAll: true },
  { seed: 8, profile: 'firefox', deleteAll: false },
];

const root = join(import.meta.dir, '../..');
const verbose = process.argv.includes('--verbose');
// Control run: the same actions, one at a time with nothing overlapping. Any loss here is a
// bug in the bench or a plain logic bug in the app, not a race.
const serial = process.argv.includes('--serial');
const SERIAL_GAP_MS = 400;
const seed = (await Bun.file(join(root, 'bench/seed/seed-30-sites.json')).json()) as SeedBackup;
const tabCode = await Bun.file(join(import.meta.dir, '.build/tab.js')).text();
const hostCode = await Bun.file(join(import.meta.dir, '.build/host.js')).text();
const backgroundCode = await Bun.file(join(import.meta.dir, '.build/background/background.js')).text();

// A real http origin: a secure context (crypto.randomUUID), nothing else is fetched
const server = Bun.serve({
  port: 0,
  fetch: () => new Response('<!doctype html><title>storage bench</title><body></body>', { headers: { 'content-type': 'text/html' } }),
});
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-first-run', '--disable-background-networking', '--disable-extensions'],
});

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
};

const total = {
  lost: 0,
  failedOps: 0,
  collateral: 0,
  staleViews: 0,
  staleSettings: 0,
  ops: 0,
  writes: 0,
  bytes: 0,
  messages: 0,
  backgroundWakes: 0,
  errors: 0,
  syncMs: [] as number[],
  opMs: [] as number[],
  lostByKind: {} as Record<string, number>,
};
const perRound: string[] = [];
const detail: unknown[] = [];

try {
  // Helium's first-launch setup must settle before the first navigation
  if (process.env.CHROME_PATH) await Bun.sleep(3000);
  const page = await browser.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'load' });
      break;
    } catch (error) {
      if (attempt >= 2 || !String(error).includes('ERR_ABORTED')) throw error;
    }
  }
  await page.addScriptTag({ content: hostCode });
  await page.evaluate(`window.__sim.load(${JSON.stringify(tabCode)}, ${JSON.stringify(backgroundCode)})`);

  for (const spec of ROUNDS) {
    const planned: RoundPlan = planRound(seed, spec);
    const lateIndex = planned.ops.findIndex((p) => p.at >= planned.lateTabAt);
    const plan: RoundPlan = serial
      ? {
          ...planned,
          lateTabAt: lateIndex * SERIAL_GAP_MS - SERIAL_GAP_MS / 2,
          ops: planned.ops.map((p, index) => ({ ...p, at: index * SERIAL_GAP_MS })),
        }
      : planned;
    const result = (await page.evaluate(`window.__sim.runRound(${JSON.stringify(plan)})`)) as RoundResult;
    const verdict = judge(seed, plan, result, plan.graceMs);

    total.lost += verdict.lost.size;
    total.failedOps += verdict.failedOps;
    total.collateral += verdict.collateral;
    total.staleViews += verdict.staleViews;
    total.staleSettings += verdict.staleSettings;
    total.ops += verdict.opsRun;
    total.writes += result.writes;
    total.bytes += result.bytesWritten;
    total.messages += result.messages;
    total.backgroundWakes += result.backgroundWakes;
    total.errors += result.errors.length + pageErrors.length;
    total.syncMs.push(...verdict.syncMs);
    total.opMs.push(...verdict.opMs);
    for (const [kind, count] of Object.entries(verdict.lostByKind)) {
      total.lostByKind[kind] = (total.lostByKind[kind] ?? 0) + count;
    }
    perRound.push(`${spec.seed}:${verdict.lost.size}`);
    detail.push({ spec, lost: [...verdict.lost], errors: [...result.errors, ...pageErrors.splice(0)], result });

    if (verbose) {
      console.log(
        `round ${spec.seed} (${spec.profile}${spec.deleteAll ? ', delete all' : ''}): ops=${verdict.opsRun} lost=${verdict.lost.size} ` +
          `stale=${verdict.staleViews}/${result.tabs.length} events=${result.events} errors=${result.errors.length}`
      );
      for (const [key, why] of verdict.lost) {
        const op = key.startsWith('op:') ? plan.ops[Number(key.slice(3))] : null;
        console.log(`  ${key}${op ? ` ${op.op.kind} tab${op.tab} @${op.at}ms` : ''}: ${why}`);
      }
      for (const error of result.errors.slice(0, 5)) console.log(`  error: ${error}`);
    }
  }
} finally {
  await browser.close();
  server.stop(true);
}

await Bun.write(join(import.meta.dir, '.build/last-run.json'), JSON.stringify(detail, null, 1));

const perOp = (value: number) => (total.ops === 0 ? 0 : value / total.ops);
console.log(`METRIC lost_updates=${total.lost}`);
console.log(`METRIC stale_views=${total.staleViews}`);
console.log(`METRIC stale_settings=${total.staleSettings}`);
console.log(`METRIC sync_ms_p95=${percentile(total.syncMs, 0.95).toFixed(1)}`);
console.log(`METRIC sync_ms_p50=${percentile(total.syncMs, 0.5).toFixed(1)}`);
console.log(`METRIC op_ms_p95=${percentile(total.opMs, 0.95).toFixed(1)}`);
console.log(`METRIC writes_per_op=${perOp(total.writes).toFixed(2)}`);
console.log(`METRIC bytes_written_per_op=${perOp(total.bytes).toFixed(0)}`);
console.log(`METRIC messages_per_op=${perOp(total.messages).toFixed(2)}`);
console.log(`METRIC failed_ops=${total.failedOps}`);
console.log(`METRIC collateral_losses=${total.collateral}`);
console.log(`METRIC runtime_errors=${total.errors}`);
console.log(`METRIC background_wakes=${total.backgroundWakes}`);
console.log(`METRIC ops=${total.ops}`);
console.log(`ASI lost_by_round=${perRound.join(',')}`);
console.log(`ASI lost_by_kind=${Object.entries(total.lostByKind).map(([kind, count]) => `${kind}:${count}`).join(',') || 'none'}`);
