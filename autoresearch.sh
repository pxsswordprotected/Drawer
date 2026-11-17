#!/usr/bin/env bash
# Benchmark: do concurrent writes from several tabs survive, and do tabs see each other's
# changes? Primary metric: lost_updates (lower is better). See bench/storage/run.ts.
# Regression guards for the rest of the app: bench/checks.sh.
set -euo pipefail
cd "$(dirname "$0")"

# Guardrails: the app and the bench must type-check, the app must lint clean (errors only).
npx tsc --noEmit
npx tsc --noEmit -p bench/storage/tsconfig.json
npx eslint src --ext .ts,.tsx --quiet

# Seed data (30 sites, 130 highlights; deterministic) and the bench's two browser bundles:
# the app's real storage layer + store for each simulated tab, and the simulator itself.
bun bench/seed/make-seed.ts > /dev/null
npx vite build -c bench/storage/vite.config.ts --mode tab --logLevel error
npx vite build -c bench/storage/vite.config.ts --mode host --logLevel error

# Deterministic workload: 8 seeded rounds x 90 write actions from 5 simulated tabs sharing one
# fake extension storage, on a virtual clock with seeded latencies. Offline, headless Chrome.
bun bench/storage/run.ts
