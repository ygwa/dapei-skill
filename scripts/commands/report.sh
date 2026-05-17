#!/usr/bin/env bash

feature_review() {
  local feature="$1"
  local feature_dir
  feature_dir="$(require_feature_dir "$feature")"
  local feature_yaml="$feature_dir/feature.yaml"
  [[ -f "$feature_yaml" ]] || die "feature.yaml not found for $feature"

  local report="$feature_dir/reports/daily-report.md"
  mkdir -p "$feature_dir/reports"

  local review_date last_review
  review_date="$(date '+%Y-%m-%d %H:%M:%S %z')"
  last_review="$(awk -F'"' '/^[[:space:]]*last-review-at:[[:space:]]*"/ { print $2 }' "$feature_yaml" | head -1 || true)"

  {
    echo "# Daily Review: $feature"
    echo
    echo "- Date: $review_date"
    echo "- Previous Review: ${last_review:-none}"
    echo
  } > "$report"

  local repo
  while IFS= read -r repo; do
    [[ -n "$repo" ]] || continue
    local repo_path="$CODEBASE_DIR/$repo"
    {
      echo "## Repo: $repo"
      echo
    } >> "$report"

    if [[ ! -d "$repo_path/.git" ]]; then
      echo "- Status: missing from codebase" >> "$report"
      echo >> "$report"
      continue
    fi

    local branch="feature/$feature"
    local base_ref
    base_ref="$(awk -v target="$repo" '
      $0 ~ "name: \"" target "\"" { in_repo=1; next }
      in_repo && /base-ref:/ {
        line=$0
        sub(/^.*base-ref:[[:space:]]*"/, "", line)
        sub(/".*$/, "", line)
        print line
        exit
      }
    ' "$feature_yaml")"

    if [[ -n "$last_review" ]]; then
      echo "### Commits since last review" >> "$report"
      git -C "$repo_path" log --since="$last_review" --oneline "$branch" 2>/dev/null | head -30 | sed 's/^/- /' >> "$report" || true
    else
      echo "### Recent commits on feature branch" >> "$report"
      git -C "$repo_path" log --oneline "$branch" 2>/dev/null | head -30 | sed 's/^/- /' >> "$report" || true
    fi

    local diff_stats
    diff_stats="$(git -C "$repo_path" diff --stat "$base_ref..$branch" 2>/dev/null | tail -1 || echo "no diff")"
    {
      echo
      echo "- Diff Stats: \`$diff_stats\`"
      echo
    } >> "$report"
  done < <(feature_repo_names "$feature_yaml")

  local review_ts tmp_file
  review_ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  tmp_file="$(mktemp)"
  awk -v ts="$review_ts" '
    BEGIN { updated=0 }
    /^[[:space:]]*last-review-at:/ {
      print "  last-review-at: \"" ts "\""
      updated=1
      next
    }
    { print }
    END {
      if (!updated) {
        print "  last-review-at: \"" ts "\""
      }
    }
  ' "$feature_yaml" > "$tmp_file"
  mv "$tmp_file" "$feature_yaml"

  log "review report generated: $report"
}

report_feature() {
  local feature="$1"
  local feature_dir
  feature_dir="$(require_feature_dir "$feature")"

  local daily="$feature_dir/reports/daily-report.md"
  local arch="$feature_dir/reports/architecture-review.md"
  local guardrail_report="$feature_dir/reports/guardrail-report.md"

  "$SCRIPT_ROOT/scripts/dapei-guardrail" "$feature" >/dev/null || true

  {
    echo "# Daily Report"
    echo
    echo "- Feature: $feature"
    echo "- Generated At: $(date '+%Y-%m-%d %H:%M:%S %z')"
    echo "- Progress Source: reports/feature-progress.md"
    echo "- Risk Source: memory/risk.md"
    echo "- Open Questions Source: memory/open-questions.md"
    echo "- Test Source: reports/test-report.md"
    echo "- Guardrail Source: reports/guardrail-report.md"
    echo
    echo "## Current Status"
    echo
    if [[ -f "$feature_dir/reports/feature-progress.md" ]]; then
      tail -40 "$feature_dir/reports/feature-progress.md"
    else
      echo "- No progress report yet."
    fi
  } > "$daily"

  {
    echo "# Architecture Review"
    echo
    echo "- Feature: $feature"
    echo "- Generated At: $(date '+%Y-%m-%d %H:%M:%S %z')"
    echo "- Guardrail Report: $guardrail_report"
    echo "- Mode: report"
    echo
    echo "## Review Focus"
    echo
    echo "- Architecture layering"
    echo "- Domain boundaries"
    echo "- API compatibility"
    echo "- Performance and reliability constraints"
    echo "- Test coverage and local reproducibility"
  } > "$arch"

  log "report pack generated for feature: $feature"
}

feature_status() {
  if [[ ! -d "$FEATURES_DIR" ]]; then
    echo "No features found."
    return 0
  fi

  local count
  count="$(find "$FEATURES_DIR" -mindepth 1 -maxdepth 1 -type d -not -name ".templates" | wc -l | tr -d ' ')"
  echo "Features ($count):"

  local feat_dir
  for feat_dir in "$FEATURES_DIR"/*; do
    [[ -d "$feat_dir" ]] || continue
    [[ "$(basename "$feat_dir")" == ".templates" ]] && continue

    local feature feature_yaml
    feature="$(basename "$feat_dir")"
    feature_yaml="$feat_dir/feature.yaml"
    echo "  - $feature"

    if [[ -f "$feature_yaml" ]]; then
      local repo
      while IFS= read -r repo; do
        [[ -n "$repo" ]] || continue
        local repo_path="$CODEBASE_DIR/$repo"
        if [[ -d "$repo_path/.git" ]]; then
          local branch head
          branch="$(git -C "$repo_path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
          head="$(git -C "$repo_path" rev-parse --short HEAD 2>/dev/null || echo unknown)"
          echo "    - $repo: $branch ($head)"
        else
          echo "    - $repo: missing"
        fi
      done < <(feature_repo_names "$feature_yaml")
    fi
  done
}
