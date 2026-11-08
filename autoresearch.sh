#!/usr/bin/env bash
# Benchmark: % of saved highlights re-located exactly after a page reload or edit.
# Primary metric: anchor_accuracy (higher is better). See bench/anchoring/run.ts.
set -euo pipefail
cd "$(dirname "$0")"

# Guardrails: the app must still type-check and lint clean (errors only).
npx tsc --noEmit
npx eslint src --ext .ts,.tsx --quiet

# Deterministic workload: seeded fixture pages + edits, jsdom, no network.
bun bench/anchoring/run.ts
