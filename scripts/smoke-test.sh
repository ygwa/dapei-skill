#!/usr/bin/env bash
# Smoke test for dapei-skill v0.2 baseline
# Validates that scripts/dapei can run from a fresh clone

set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DAPEI="$SCRIPT_ROOT/scripts/dapei"

echo "=== dapei smoke test ==="

# Test 1: dapei help must succeed (dapei exits 1 when no args, so capture output)
echo -n "test 1 - help: "
output=$(bash "$DAPEI" 2>&1) || true
if echo "$output" | grep -q "Usage"; then
  echo "PASS"
else
  echo "FAIL"
  exit 1
fi

# Test 2: init workspace in temp dir
TMPDIR="${TMPDIR:-/tmp}"
TEST_DIR=$(mktemp -d "$TMPDIR/dapei-smoke-XXXX")
trap 'rm -rf "$TEST_DIR"' EXIT

echo -n "test 2 - init workspace: "
if DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" init workspace 2>&1 | grep -q "workspace initialized"; then
  echo "PASS"
else
  echo "FAIL"
  rm -rf "$TEST_DIR"
  exit 1
fi

# Test 3: key files exist after init
echo -n "test 3 - key files: "
REQUIRED=(
  "$TEST_DIR/.dapei/workspace.yaml"
  "$TEST_DIR/.dapei/commands.yaml"
  "$TEST_DIR/.dapei/feature.schema.yaml"
  "$TEST_DIR/.dapei/workflows/feature-lifecycle.yaml"
  "$TEST_DIR/docs/agents.md"
  "$TEST_DIR/runtime/templates/01-current-state.md.template"
)
FAILED=0
for f in "${REQUIRED[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "missing: $f"
    FAILED=1
  fi
done
if [[ $FAILED -eq 0 ]]; then
  echo "PASS"
else
  echo "FAIL"
  exit 1
fi

# Test 4: workspace conforms
echo -n "test 4 - workspace conforms: "
source "$SCRIPT_ROOT/scripts/lib/core.sh" 2>/dev/null || true
# shellcheck source=scripts/lib/core.sh
source "$SCRIPT_ROOT/scripts/lib/core.sh"
ROOT_DIR="$TEST_DIR"
if is_conforming_workspace_dir "$ROOT_DIR"; then
  echo "PASS"
else
  echo "FAIL"
  exit 1
fi

echo "=== all smoke tests passed ==="