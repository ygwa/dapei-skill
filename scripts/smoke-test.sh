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

# Test 5: prepare a local fixture repo for repos add/analyze
echo -n "test 5 - fixture repo: "
FIXTURE_SOURCE="$SCRIPT_ROOT/tests/fixtures/sample-node-repo"
FIXTURE_REPO="$TEST_DIR-fixture-repo"
trap 'rm -rf "$TEST_DIR" "$FIXTURE_REPO"' EXIT
cp -R "$FIXTURE_SOURCE" "$FIXTURE_REPO"
if [[ ! -f "$FIXTURE_REPO/.git/COMMIT_EDITMSG" ]]; then
  git -C "$FIXTURE_REPO" init -b main >/dev/null 2>&1
  git -C "$FIXTURE_REPO" add . >/dev/null 2>&1
  git -C "$FIXTURE_REPO" -c user.name="dapei smoke" -c user.email="dapei-smoke@example.com" commit -m "fixture baseline" >/dev/null 2>&1
fi
if [[ -d "$FIXTURE_REPO/.git" ]]; then
  echo "PASS"
else
  echo "FAIL"
  exit 1
fi

# Test 6: repos add/list/analyze
echo -n "test 6 - repos lifecycle: "
DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" repos add sample-app "$FIXTURE_REPO" >/dev/null 2>&1
DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" repos list >/dev/null 2>&1
DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" repos analyze --all >/dev/null 2>&1
if [[ -f "$TEST_DIR/docs/as-is/repo-inventory.md" ]] &&
   [[ -f "$TEST_DIR/docs/architecture/technical-current-state.md" ]] &&
   grep -q "sample-app" "$TEST_DIR/docs/as-is/repo-inventory.md"; then
  echo "PASS"
else
  echo "FAIL"
  exit 1
fi

# Test 7: create feature and build context
echo -n "test 7 - feature context: "
DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" create feature smoke-feature --repos sample-app --objective "Validate the v0.2 platform baseline" >/dev/null 2>&1
DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" context build smoke-feature --stage analyze-current-state >/dev/null 2>&1
if [[ -f "$TEST_DIR/features/smoke-feature/feature.yaml" ]] &&
   [[ -e "$TEST_DIR/features/smoke-feature/repos/sample-app/.git" ]] &&
   grep -q "Stage: analyze-current-state" "$TEST_DIR/features/smoke-feature/context/runtime-context.md"; then
  echo "PASS"
else
  echo "FAIL"
  exit 1
fi

# Test 8: workflow stage, validation, and report
echo -n "test 8 - workflow validate report: "
DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" run workflow smoke-feature --stage analyze-current-state >/dev/null 2>&1
DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" validate feature smoke-feature >/dev/null 2>&1
DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" report feature smoke-feature >/dev/null 2>&1
if [[ -f "$TEST_DIR/features/smoke-feature/reports/stage-analyze-current-state.completed" ]] &&
   [[ -f "$TEST_DIR/features/smoke-feature/reports/validation-report.md" ]] &&
   [[ -f "$TEST_DIR/features/smoke-feature/reports/daily-report.md" ]] &&
   grep -q "Status: PASS" "$TEST_DIR/features/smoke-feature/reports/validation-report.md"; then
  echo "PASS"
else
  echo "FAIL"
  exit 1
fi

echo "=== all smoke tests passed ==="
