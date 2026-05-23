#!/usr/bin/env bash

select_validation_commands() {
  local repo_path="$1"
  detect_test_commands "$repo_path" | awk '!seen[$0]++'
}

run_validation_command() {
  local repo="$1"
  local repo_path="$2"
  local cmd="$3"
  local output_file="$4"
  local started ended status
  started="$(date '+%Y-%m-%d %H:%M:%S %z')"

  {
    echo
    echo "### Command: \`$cmd\`"
    echo
    echo "- Repo: $repo"
    echo "- Cwd: repos/$repo"
    echo "- Started At: $started"
  } >> "$output_file"

  set +e
  local command_output
  command_output="$(cd "$repo_path" && bash -lc "$cmd" 2>&1)"
  status=$?
  set -e
  ended="$(date '+%Y-%m-%d %H:%M:%S %z')"

  {
    echo "- Finished At: $ended"
    echo "- Exit Code: $status"
    echo
    echo '```text'
    printf '%s\n' "$command_output" | tail -120
    echo '```'
  } >> "$output_file"

  return $status
}

validate_feature() {
  local feature="$1"
  local feature_dir
  feature_dir="$(require_feature_dir "$feature")"
  local feature_yaml="$feature_dir/feature.yaml"
  [[ -f "$feature_yaml" ]] || die "feature.yaml not found for $feature"

  mkdir -p "$feature_dir/reports"
  local test_report="$feature_dir/reports/test-report.md"
  local validation_report="$feature_dir/reports/validation-report.md"
  local generated_at
  generated_at="$(date '+%Y-%m-%d %H:%M:%S %z')"

  {
    echo "# Test Report"
    echo
    echo "- Feature: $feature"
    echo "- Generated At: $generated_at"
  } > "$test_report"

  local overall_status="PASS"
  local repo
  while IFS= read -r repo; do
    [[ -n "$repo" ]] || continue
    local repo_path="$REPOS_DIR/$repo"
    {
      echo
      echo "## Repo: $repo"
    } >> "$test_report"

    if [[ ! -d "$repo_path/.git" ]]; then
      echo "- Status: MISSING" >> "$test_report"
      overall_status="FAIL"
      continue
    fi

    local command_count=0
    local cmd
    while IFS= read -r cmd; do
      [[ -n "$cmd" ]] || continue
      command_count=$((command_count + 1))
      if ! run_validation_command "$repo" "$repo_path" "$cmd" "$test_report"; then
        overall_status="FAIL"
      fi
    done < <(select_validation_commands "$repo_path")

    if [[ $command_count -eq 0 ]]; then
      echo "- Status: SKIPPED" >> "$test_report"
      echo "- Reason: no candidate test command detected" >> "$test_report"
    fi
  done < <(feature_repo_names "$feature_yaml")

  "$SCRIPT_ROOT/scripts/dapei-guardrail" "$feature" >/dev/null || overall_status="FAIL"

  {
    echo "# Validation Report"
    echo
    echo "- Feature: $feature"
    echo "- Generated At: $generated_at"
    echo "- Status: $overall_status"
    echo "- Test Report: reports/test-report.md"
    echo "- Guardrail Report: reports/guardrail-report.md"
    echo
    echo "## Acceptance Readiness"
    if [[ "$overall_status" == "PASS" ]]; then
      echo "- Validation checks did not report failures."
    else
      echo "- One or more validation checks failed or were missing."
    fi
  } > "$validation_report"

  log "validation report generated: $validation_report"
  [[ "$overall_status" == "PASS" ]]
}
