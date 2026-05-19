#!/usr/bin/env bash

# Stage-to-context mapping: defines which sources to include per stage
# Format: "stage:layer:priority:source_type:source_path"
# priority: p0=must-read, p1=important, p2=reference, p3=historical
stage_context_sources() {
  local stage="$1"
  case "$stage" in
    feature-created|analyze-current-state)
      cat <<'EOF'
global:p0:dir:docs/standards
global:p0:dir:runtime/ai-rules
workspace:p1:dir:docs/as-is
workspace:p1:dir:docs/architecture
domain:p2:dir:docs/business
domain:p2:dir:docs/domain
domain:p2:dir:docs/glossary
repo:p0:repo-evidence
feature:p0:dir:FEATURE/context
feature:p0:dir:FEATURE/docs
runtime:p1:dir:FEATURE/tasks
EOF
      ;;
    gap-analysis)
      cat <<'EOF'
global:p0:dir:docs/standards
feature:p0:file:FEATURE/docs/01-current-state.md
feature:p0:file:FEATURE/feature.yaml
feature:p0:file:FEATURE/context/constraints.md
workspace:p1:dir:docs/standards
workspace:p2:dir:docs/decisions
feature:p1:dir:FEATURE/memory
EOF
      ;;
    solution-design)
      cat <<'EOF'
global:p0:dir:docs/standards
feature:p0:file:FEATURE/docs/01-current-state.md
feature:p0:file:FEATURE/docs/02-gap-analysis.md
feature:p0:dir:FEATURE/memory
workspace:p1:dir:docs/architecture
workspace:p1:dir:docs/standards
workspace:p2:dir:docs/decisions
repo:p1:repo-evidence
EOF
      ;;
    task-breakdown)
      cat <<'EOF'
feature:p0:file:FEATURE/docs/04-technical-design.md
feature:p0:file:FEATURE/docs/01-current-state.md
feature:p1:file:FEATURE/context/constraints.md
feature:p1:dir:FEATURE/tasks
repo:p1:repo-evidence
EOF
      ;;
    implementation)
      cat <<'EOF'
feature:p0:file:FEATURE/docs/05-task-breakdown.md
feature:p0:file:FEATURE/docs/04-technical-design.md
feature:p0:file:FEATURE/context/constraints.md
feature:p1:file:FEATURE/memory/decision-log.md
global:p1:dir:docs/standards
runtime:p0:dir:FEATURE/tasks
EOF
      ;;
    local-validation)
      cat <<'EOF'
feature:p0:file:FEATURE/docs/06-acceptance.md
feature:p0:file:FEATURE/tests/test-plan.md
feature:p1:file:FEATURE/reports/implementation-log.md
repo:p1:repo-evidence
EOF
      ;;
    architecture-review)
      cat <<'EOF'
global:p0:dir:.dapei/rules
feature:p0:dir:FEATURE/reports
feature:p1:file:FEATURE/docs/04-technical-design.md
workspace:p1:dir:docs/architecture
workspace:p1:dir:docs/standards
EOF
      ;;
    acceptance)
      cat <<'EOF'
feature:p0:file:FEATURE/docs/06-acceptance.md
feature:p0:dir:FEATURE/reports
feature:p1:dir:FEATURE/memory
EOF
      ;;
    *)
      # general/fallback: load everything
      cat <<'EOF'
global:p0:dir:docs/standards
global:p0:dir:runtime/ai-rules
workspace:p1:dir:docs/as-is
workspace:p1:dir:docs/architecture
workspace:p1:dir:docs/workflows
domain:p2:dir:docs/business
domain:p2:dir:docs/domain
domain:p2:dir:docs/glossary
repo:p1:repo-evidence
feature:p0:dir:FEATURE/context
feature:p0:dir:FEATURE/docs
runtime:p1:dir:FEATURE/tasks
EOF
      ;;
  esac
}

context_emit_file() {
  local output="$1"
  local layer="$2"
  local priority="$3"
  local source_file="$4"
  local reason="$5"
  local max_lines="${6:-200}"

  local rel_path
  rel_path="${source_file#$ROOT_DIR/}"

  {
    echo
    echo "## Source: $rel_path"
    echo
    echo "- Layer: $layer"
    echo "- Priority: $priority"
    echo "- Reason: $reason"
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
  local priority="$3"
  local source_dir="$4"
  local reason="$5"
  local max_files="${6:-30}"

  if [[ ! -d "$source_dir" ]]; then
    {
      echo
      echo "## Missing Source: ${source_dir#$ROOT_DIR/}"
      echo
      echo "- Layer: $layer"
      echo "- Priority: $priority"
      echo "- Status: not found"
      echo "- Action: this source does not exist yet; consider running \`dapei codebase analyze\` or manually populating it"
    } >> "$output"
    return 0
  fi

  local count=0
  while IFS= read -r file; do
    [[ "$(basename "$file")" == "runtime-context.md" ]] && continue
    [[ "$(basename "$file")" == "context-index.yaml" ]] && continue
    count=$((count + 1))
    [[ $count -le $max_files ]] || break
    context_emit_file "$output" "$layer" "$priority" "$file" "stage-context-map from $source_dir"
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

    # Module structure evidence
    {
      echo
      echo "### Module Structure (top 2 levels)"
      echo '```'
    } >> "$output"
    find "$repo_path" -maxdepth 2 -type d -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/vendor/*' -not -path '*/__pycache__/*' -not -path '*/target/*' -not -path '*/.next/*' -not -path '*/dist/*' -not -path '*/build/*' | sed "s#^$repo_path/##" | sort | head -50 >> "$output"
    echo '```' >> "$output"

    # Key config files
    {
      echo
      echo "### Key Configuration Files"
    } >> "$output"
    local configs=(
      "package.json" "pom.xml" "build.gradle" "build.gradle.kts"
      "go.mod" "Cargo.toml" "pyproject.toml" "requirements.txt"
      "Dockerfile" "docker-compose.yml" "docker-compose.yaml"
      ".env.example" "Makefile" "tsconfig.json"
      "application.yml" "application.yaml" "application.properties"
    )
    for cfg in "${configs[@]}"; do
      if [[ -f "$repo_path/$cfg" ]]; then
        echo "- \`$cfg\` ($(wc -l < "$repo_path/$cfg" | tr -d ' ') lines)" >> "$output"
      fi
    done

    # Recent commit summary
    {
      echo
      echo "### Recent Commits (last 10)"
    } >> "$output"
    git -C "$repo_path" log --oneline -10 2>/dev/null | sed 's/^/- /' >> "$output" || echo "- No commits found" >> "$output"

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
  local index_file="$feature_dir/context/context-index.yaml"
  local generated_at
  generated_at="$(date '+%Y-%m-%d %H:%M:%S %z')"

  # Write context header
  {
    echo "# Runtime Context"
    echo
    echo "- Feature: $feature"
    echo "- Stage: $stage"
    echo "- Generated At: $generated_at"
    echo "- Strategy: stage-aware layered context"
    echo
    echo "## Context Loading Notes"
    echo
    echo "This context bundle is stage-specific. Different stages load different sources."
    echo "Priority legend: p0=must-read, p1=important, p2=reference, p3=historical."
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

  # Write context index header
  {
    echo "# Context Index"
    echo "feature: $feature"
    echo "stage: $stage"
    echo "generated_at: \"$generated_at\""
    echo "sources:"
  } > "$index_file"

  # Process stage-specific sources
  local source_count=0
  while IFS=: read -r layer priority source_type source_path; do
    [[ -n "$layer" ]] || continue

    # Replace FEATURE placeholder
    local resolved_path
    resolved_path="${source_path//FEATURE/$feature_dir}"

    # If path doesn't start with /, make it relative to ROOT_DIR
    if [[ "$resolved_path" != /* ]]; then
      resolved_path="$ROOT_DIR/$resolved_path"
    fi

    source_count=$((source_count + 1))

    case "$source_type" in
      dir)
        context_collect_dir "$output" "$layer" "$priority" "$resolved_path" "stage=$stage"
        {
          echo "  - layer: $layer"
          echo "    priority: $priority"
          echo "    type: directory"
          echo "    path: \"${source_path//FEATURE/features/$feature}\""
          echo "    reason: \"stage-specific context for $stage\""
        } >> "$index_file"
        ;;
      file)
        if [[ -f "$resolved_path" ]]; then
          context_emit_file "$output" "$layer" "$priority" "$resolved_path" "stage=$stage"
          {
            echo "  - layer: $layer"
            echo "    priority: $priority"
            echo "    type: file"
            echo "    path: \"${source_path//FEATURE/features/$feature}\""
            echo "    reason: \"stage-specific context for $stage\""
          } >> "$index_file"
        else
          {
            echo
            echo "## Missing Source: ${source_path//FEATURE/features/$feature}"
            echo
            echo "- Layer: $layer"
            echo "- Priority: $priority"
            echo "- Status: not found"
          } >> "$output"
          {
            echo "  - layer: $layer"
            echo "    priority: $priority"
            echo "    type: file"
            echo "    path: \"${source_path//FEATURE/features/$feature}\""
            echo "    status: missing"
          } >> "$index_file"
        fi
        ;;
      repo-evidence)
        context_collect_repo_summary "$output" "$feature_yaml"
        {
          echo "  - layer: $layer"
          echo "    priority: $priority"
          echo "    type: repo-evidence"
          echo "    reason: \"runtime repo metadata and structure\""
        } >> "$index_file"
        ;;
    esac
  done < <(stage_context_sources "$stage")

  # Append summary
  {
    echo
    echo "total_sources: $source_count"
  } >> "$index_file"

  log "runtime context built: $output (stage=$stage, sources=$source_count)"
  log "context index built: $index_file"
}
