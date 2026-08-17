#!/bin/bash
# Apply the dsh-session-slim core patch to a DeepSeek Harness checkout.
#
# Usage:
#   bash scripts/apply-core-patch.sh [path-to-deepseek-harness]
#
# The patch contains the source-level optimizations:
#   - sourceEventSeqs intervalization (range form)
#   - settled assistant/chunk pruning in history/live paths
#   - client-side live-window chunk pruning
# It is idempotent-ish: `git apply --check` refuses when already applied.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATCH="$ROOT/patches/0001-session-performance.patch"

CHECKOUT="${1:-}"
if [ -z "$CHECKOUT" ]; then
  for candidate in "$HOME/dsh-harness" "$HOME/dsh" "$HOME/.dsh/dsh-harness"; do
    if [ -d "$candidate/packages" ]; then CHECKOUT="$candidate"; break; fi
  done
fi
if [ -z "$CHECKOUT" ] || [ ! -d "$CHECKOUT/packages" ]; then
  echo "apply-core-patch: cannot locate the dsh checkout (set arg or DSH_CHECKOUT)" >&2
  exit 1
fi

cd "$CHECKOUT"
if [ ! -d .git ]; then
  echo "apply-core-patch: $CHECKOUT is not a git checkout" >&2
  exit 1
fi

if git apply --check "$PATCH" 2>/dev/null; then
  git apply "$PATCH"
  echo "apply-core-patch: applied $PATCH to $CHECKOUT"
else
  if git apply --reverse --check "$PATCH" 2>/dev/null; then
    echo "apply-core-patch: patch already applied to $CHECKOUT (no-op)"
  else
    echo "apply-core-patch: patch does not apply cleanly; check for conflicts" >&2
    git apply --check "$PATCH" >&2 || true
    exit 1
  fi
fi
