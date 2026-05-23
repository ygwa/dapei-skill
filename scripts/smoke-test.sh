#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DAPEI="$SCRIPT_ROOT/scripts/dapei"

echo "=== dapei smoke test ==="

echo -n "test 1 - help: "
output=$(bash "$DAPEI" 2>&1) || true
if echo "$output" | grep -q "Usage"; then
  echo "PASS"
else
  echo "FAIL"
  exit 1
fi

TMPDIR="${TMPDIR:-/tmp}"
TEST_DIR=$(mktemp -d "$TMPDIR/dapei-smoke-XXXX")
FIXTURE_REPO=""
trap 'rm -rf "$TEST_DIR" "$FIXTURE_REPO"' EXIT

echo -n "test 2 - init workspace: "
if DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" init workspace 2>&1 | grep -q "workspace initialized"; then
  echo "PASS"
else
  echo "FAIL"
  exit 1
fi

echo -n "test 3 - key files: "
REQUIRED=(
  "$TEST_DIR/.dapei/workspace.yaml"
  "$TEST_DIR/.dapei/commands.yaml"
  "$TEST_DIR/.dapei/feature.schema.yaml"
  "$TEST_DIR/.dapei/workflows/feature-lifecycle.yaml"
  "$TEST_DIR/.dapei/cognitive/index.yaml"
  "$TEST_DIR/.dapei/schemas/behavior.schema.yaml"
  "$TEST_DIR/docs/agents.md"
  "$TEST_DIR/docs/as-is/behavior"
  "$TEST_DIR/docs/as-is/state-machines"
  "$TEST_DIR/runtime/templates/01-current-state.md.template"
)
for f in "${REQUIRED[@]}"; do
  [[ -e "$f" ]] || { echo "FAIL missing $f"; exit 1; }
done
echo "PASS"

echo -n "test 4 - feature status: "
if DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" status feature >/dev/null 2>&1; then
  echo "PASS"
else
  echo "FAIL"
  exit 1
fi

echo -n "test 5 - fixture repo: "
FIXTURE_SOURCE="$SCRIPT_ROOT/tests/fixtures/sample-node-repo"
FIXTURE_REPO="$TEST_DIR-fixture-repo"
cp -R "$FIXTURE_SOURCE" "$FIXTURE_REPO"
if [[ ! -d "$FIXTURE_REPO/.git" ]]; then
  git -C "$FIXTURE_REPO" init -b main >/dev/null 2>&1
  git -C "$FIXTURE_REPO" add . >/dev/null 2>&1
  git -C "$FIXTURE_REPO" -c user.name="dapei smoke" -c user.email="dapei-smoke@example.com" commit -m "fixture baseline" >/dev/null 2>&1
fi
echo "PASS"

echo -n "test 6 - repos lifecycle: "
DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" repos add sample-app "$FIXTURE_REPO" >/dev/null 2>&1
DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" repos list >/dev/null 2>&1
DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" repos analyze --all >/dev/null 2>&1
[[ -f "$TEST_DIR/docs/as-is/repo-inventory.md" ]] || { echo "FAIL"; exit 1; }
echo "PASS"

echo -n "test 7 - feature context: "
DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" create feature smoke-feature --repos sample-app --objective "Validate the v2 platform baseline" >/dev/null 2>&1
DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" context build smoke-feature --stage analyze-current-state >/dev/null 2>&1
[[ -f "$TEST_DIR/features/smoke-feature/feature.yaml" ]] || { echo "FAIL"; exit 1; }
[[ -e "$TEST_DIR/features/smoke-feature/repos/sample-app/.git" ]] || { echo "FAIL"; exit 1; }
echo "PASS"

echo -n "test 8 - workflow validate report: "
DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" run workflow smoke-feature --stage analyze-current-state >/dev/null 2>&1
DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" validate feature smoke-feature >/dev/null 2>&1
DAPEI_WORKSPACE_ROOT="$TEST_DIR" "$DAPEI" report feature smoke-feature >/dev/null 2>&1
[[ -f "$TEST_DIR/features/smoke-feature/reports/stage-analyze-current-state.completed" ]] || { echo "FAIL"; exit 1; }
[[ -f "$TEST_DIR/features/smoke-feature/reports/validation-report.md" ]] || { echo "FAIL"; exit 1; }
[[ -f "$TEST_DIR/features/smoke-feature/reports/daily-report.md" ]] || { echo "FAIL"; exit 1; }
echo "PASS"

echo -n "test 9 - cognitive discover scaffold: "
DAPEI_WORKSPACE_ROOT="$TEST_DIR" node "$SCRIPT_ROOT/engine/dapei-engine.ts" run --capability cognitive.discover --input '{"target":"sample-app"}' >/dev/null 2>&1
[[ -f "$TEST_DIR/docs/as-is/behavior/_candidates.yaml" ]] || { echo "FAIL missing: _candidates.yaml"; exit 1; }
grep -q "awaiting_agent_analysis" "$TEST_DIR/docs/as-is/behavior/_candidates.yaml" || { echo "FAIL missing: awaiting_agent_analysis status"; exit 1; }
cp "$FIXTURE_SOURCE/expected/behavior/order-create.yaml" "$TEST_DIR/order-create.yaml"
UPSERT_INPUT=$(node -e "const fs=require('fs'); console.log(JSON.stringify({type:'behavior', content: fs.readFileSync('$TEST_DIR/order-create.yaml','utf8')}))")
DAPEI_WORKSPACE_ROOT="$TEST_DIR" node "$SCRIPT_ROOT/engine/dapei-engine.ts" run --capability cognitive.artifact.upsert --input "$UPSERT_INPUT" >/dev/null 2>&1
[[ -f "$TEST_DIR/docs/as-is/behavior/order-create.yaml" ]] || { echo "FAIL missing: behavior artifact"; exit 1; }
grep -q "order-create" "$TEST_DIR/.dapei/cognitive/index.yaml" || { echo "FAIL missing: index entry"; exit 1; }
echo "PASS"

echo "=== all smoke tests passed ==="
