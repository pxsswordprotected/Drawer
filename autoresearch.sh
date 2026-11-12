#!/usr/bin/env bash
# Benchmark: how often dragging the Drawer logo selects page text in the background.
# Primary metric: selection_trials (lower is better). See bench/drag/run.ts.
set -euo pipefail
cd "$(dirname "$0")"

# Guardrails: the app must still type-check and lint clean (errors only).
npx tsc --noEmit
npx eslint src --ext .ts,.tsx --quiet

# Build the real content script exactly as shipped (normal extension build).
npx vite build --mode extension --outDir bench/drag/.ext --emptyOutDir --logLevel error

# Deterministic workload: offline page fixtures, scripted mouse/trackpad gestures,
# real Chrome (headless), fresh page per trial, no network.
bun bench/drag/run.ts
