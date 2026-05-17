#!/usr/bin/env bash

context_emit_file() {
  local output="$1"
  local layer="$2"
  local source_file="$3"
  local max_lines="${4:-160}"

  {
    echo
    echo "## Source: $source_file"
    echo
    echo "- Layer: $layer"
    echo "- Included Lines: first $max_lines"
    echo
    echo '```md'
    sed -n "1,${max_lines}p" "$source_file"
    echo '```'
  } >> "$output"
}

context_collect_dir() {
  local output="$1"
  local layer="$2"
  local source_dir="$3"
  local max_files="${4:-30}"

  if [[ ! -d "$source_dir" ]]; then
    {
      echo
      echo "## Missing Source: $source_dir"
      echo
      echo "- Layer: $layer"
      echo "- Status: missing"
    } >> "$output"
    return 0
  fi

  local count=0
  while IFS= read -r file; do
    [[ "$(basename "$file")" == "runtime-context.md" ]] && continue
    count=$((count + 1))
    [[ $count -le $max_files ]] || break
    context_emit_file "$output" "$layer" "$file"
  done < <(find "$source_dir" -type f \( -name '*.md' -o -name '*.yaml' -o -name '*.yml' \) | sort)
}

context_collect_repo_summary() {
  local output="$1"
  local feature_yaml="$2"

  {
    echo
    echo "# Repo Runtime Evidence"
    echo
  } >> "$output"

  while IFS= read -r repo; do
    [[ -n "$repo" ]] || continue
    local repo_path="$CODEBASE_DIR/$repo"
    {
      echo "## Repo: $repo"
      echo
    } >> "$output"

    if [[ ! -d "$repo_path/.git" ]]; then
      echo "- Status: missing from codebase." >> "$output"
      continue
    fi

    local branch hash default_branch
    branch="$(git -C "$repo_path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
    hash="$(git -C "$repo_path" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    default_branch="$(default_branch_for_repo "$repo_path" 2>/dev/null || echo unknown)"
    {
      echo "- Path: codebase/$repo"
      echo "- Feature Link: features/$(basename "$(dirname "$feature_yaml")")/repos/$repo"
      echo "- Current Branch: $branch"
      echo "- Current Revision: $hash"
      echo "- Default Branch: $default_branch"
      echo "- Stack: $(detect_repo_language "$repo_path")"
      echo "- Candidate Test Commands:"
    } >> "$output"

    local found=0
    while IFS= read -r cmd; do
      [[ -n "$cmd" ]] || continue
      found=1
      echo "  - \`$cmd\`" >> "$output"
    done < <(detect_test_commands "$repo_path")
    [[ $found -eq 1 ]] || echo "  - TBD" >> "$output"
    echo >> "$output"
  done < <(feature_repo_names "$feature_yaml")
}

context_build() {
  local feature="$1"
  local stage="${2:-general}"
  local feature_dir
  feature_dir="$(require_feature_dir "$feature")"
  local feature_yaml="$feature_dir/feature.yaml"
  [[ -f "$feature_yaml" ]] || die "feature.yaml not found for $feature"

  local output="$feature_dir/context/runtime-context.md"
  local generated_at
  generated_at="$(date '+%Y-%m-%d %H:%M:%S %z')"

  {
    echo "# Runtime Context"
    echo
    echo "- Feature: $feature"
    echo "- Stage: $stage"
    echo "- Generated At: $generated_at"
    echo "- Strategy: layered context bundle"
    echo
    echo "## Priority Order"
    echo
    echo "1. global: standards and AI rules"
    echo "2. workspace: as-is docs, architecture, workflow"
    echo "3. domain: business, domain, glossary"
    echo "4. repo: codebase evidence"
    echo "5. feature: feature docs and context"
    echo "6. runtime: tasks and transient execution state"
  } > "$output"

  context_collect_dir "$output" "global" "$ROOT_DIR/docs/standards"
  context_collect_dir "$output" "global" "$ROOT_DIR/runtime/ai-rules"
  context_collect_dir "$output" "workspace" "$ROOT_DIR/docs/as-is"
  context_collect_dir "$output" "workspace" "$ROOT_DIR/docs/architecture"
  context_collect_dir "$output" "workspace" "$ROOT_DIR/docs/workflows"
  context_collect_dir "$output" "domain" "$ROOT_DIR/docs/business"
  context_collect_dir "$output" "domain" "$ROOT_DIR/docs/domain"
  context_collect_dir "$output" "domain" "$ROOT_DIR/docs/glossary"
  context_collect_repo_summary "$output" "$feature_yaml"
  context_collect_dir "$output" "feature" "$feature_dir/context"
  context_collect_dir "$output" "feature" "$feature_dir/docs"
  context_collect_dir "$output" "runtime" "$feature_dir/tasks"

  log "runtime context built: $output"
}
