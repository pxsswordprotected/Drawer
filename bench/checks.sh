#!/usr/bin/env bash
# Regression guards for everything the storage bench doesn't cover: the three browser benches
# must stay at their known-good values. Run before keeping a change: bash bench/checks.sh
set -euo pipefail
cd "$(dirname "$0")/.."

npx tsc --noEmit
npx eslint src --ext .ts,.tsx --quiet
npx vite build --mode extension --outDir bench/drag/.ext --emptyOutDir --logLevel error

out=$(mktemp)
trap 'rm -f "$out"' EXIT
fail=0

# expect <metric> <value>: the metric line must be present with exactly this value
expect() {
  local got
  got=$(grep -E "^METRIC $1=" "$out" | tail -1 | cut -d= -f2 || true)
  if [ "$got" = "$2" ]; then
    echo "ok    $1=$got"
  else
    echo "FAIL  $1=${got:-<missing>} (expected $2)"
    fail=1
  fi
}

echo "== drawer"
bun bench/drawer/run.ts > "$out" 2>&1 || true
expect drawer_content_failures 0
expect drawer_content_trials 45

echo "== drag"
bun bench/drag/run.ts > "$out" 2>&1 || true
for metric in selection_trials visible_selection_trials post_release_selection_trials selected_chars \
  drawer_dragout_selection drag_failures click_failures select_blocked drawer_select_blocked; do
  expect "$metric" 0
done
expect trials 54

echo "== anchoring"
bun bench/anchoring/run.ts > "$out" 2>&1 || true
expect anchor_accuracy 99.81
expect resolve_errors 0

echo "== tooltip"
bun bench/tooltip/run.ts > "$out" 2>&1 || true
expect tooltip_failures 0

exit "$fail"
