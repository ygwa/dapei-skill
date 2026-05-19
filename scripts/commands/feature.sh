#!/usr/bin/env bash

prompt_yes_no() {
  local prompt="$1"
  local ans
  read -r -p "$prompt [y/N]: " ans
  [[ "$ans" =~ ^[Yy]$ ]]
}

clone_repo_interactive() {
  local repo="$1"
  local target="$CODEBASE_DIR/$repo"

  if repo_exists "$repo"; then
    log "repo '$repo' already exists in codebase"
    return 0
  fi

  if ! prompt_yes_no "repo '$repo' not found. clone now?"; then
    die "repo '$repo' is required for mapping"
  fi

  local remote_url
  read -r -p "remote git url for '$repo': " remote_url
  [[ -n "$remote_url" ]] || die "remote url is required"
  codebase_add "$repo" "$remote_url"
  [[ -d "$target/.git" ]] || die "clone failed for '$repo'"
}

prepare_feature_branch() {
  local repo="$1"
  local feature="$2"
  local repo_path="$CODEBASE_DIR/$repo"
  [[ -d "$repo_path/.git" ]] || die "repo '$repo' not found in codebase"

  local base_branch branch_name base_ref
  branch_name="feature/$feature"
  base_branch="$(default_branch_for_repo "$repo_path")"

  if repo_has_remote "$repo_path"; then
    git -C "$repo_path" fetch origin || die "fetch failed for '$repo'"
  fi

  if git -C "$repo_path" show-ref --verify --quiet "refs/heads/$base_branch"; then
    git -C "$repo_path" checkout "$base_branch" >/dev/null 2>&1 || die "checkout failed: $repo/$base_branch"
  elif git -C "$repo_path" show-ref --verify --quiet "refs/remotes/origin/$base_branch"; then
    git -C "$repo_path" checkout -B "$base_branch" "origin/$base_branch" >/dev/null 2>&1 || die "checkout failed: $repo/$base_branch"
  else
    warn "default branch '$base_branch' not found for '$repo'; using current HEAD"
  fi

  if repo_has_remote "$repo_path"; then
    git -C "$repo_path" pull --ff-only origin "$base_branch" >/dev/null 2>&1 || warn "could not fast-forward '$repo/$base_branch'; continuing from local HEAD"
  fi

  base_ref="$(git -C "$repo_path" rev-parse HEAD)"

  if git -C "$repo_path" show-ref --verify --quiet "refs/heads/$branch_name"; then
    log "branch '$branch_name' already exists in '$repo'"
    git -C "$repo_path" checkout "$branch_name" >/dev/null 2>&1 || die "checkout failed: $repo/$branch_name"
  else
    git -C "$repo_path" checkout -b "$branch_name" >/dev/null 2>&1 || die "branch create failed: $repo/$branch_name"
  fi

  echo "$base_ref"
}

init_feature_files() {
  local feature="$1"
  local objective="$2"
  local repos_summary="$3"
  local feature_dir="$FEATURES_DIR/$feature"

  mkdir -p "$feature_dir"/{repos,docs,context,memory,tests/regression,reports,tasks,artifacts}

  cat > "$feature_dir/context/business-context.md" <<'EOF_CTX'
# Business Context

Describe business constraints, stakeholders, expected outcomes, and domain language.
EOF_CTX

  cat > "$feature_dir/context/architecture-context.md" <<'EOF_CTX'
# Architecture Context

Describe architecture boundaries, integration constraints, and non-functional requirements.
EOF_CTX

  cat > "$feature_dir/context/repo-context.md" <<'EOF_CTX'
# Repo Context

Describe touched repositories, modules, entrypoints, tests, and unknowns.
EOF_CTX

  cat > "$feature_dir/context/feature-context.md" <<EOF_CTX
# Feature Context

- Feature: $feature
- Objective: ${objective:-TBD}
- Repos: $repos_summary
EOF_CTX

  cat > "$feature_dir/context/constraints.md" <<'EOF_CTX'
# Constraints

- Keep changes scoped to this feature workspace.
- Do not bypass architecture boundaries without recording a decision.
- Update tests and reports before acceptance.
EOF_CTX

  cat > "$feature_dir/memory/decision-log.md" <<'EOF_MEM'
# Decision Log

| Date | Decision | Evidence | Impact |
| --- | --- | --- | --- |
EOF_MEM

  cat > "$feature_dir/memory/tradeoff.md" <<'EOF_MEM'
# Tradeoffs

| Date | Option | Tradeoff | Decision |
| --- | --- | --- | --- |
EOF_MEM

  cat > "$feature_dir/memory/risk.md" <<'EOF_MEM'
# Risk Log

| Date | Risk | Severity | Mitigation | Status |
| --- | --- | --- | --- | --- |
EOF_MEM

  cat > "$feature_dir/memory/open-questions.md" <<'EOF_MEM'
# Open Questions

| Date | Question | Owner | Status |
| --- | --- | --- | --- |
EOF_MEM

  cat > "$feature_dir/memory/timeline.md" <<'EOF_MEM'
# Timeline

| Time | Event |
| --- | --- |
EOF_MEM

  cat > "$feature_dir/tasks/backlog.md" <<'EOF_TASK'
# Backlog

| Priority | Task | Repo | Status |
| --- | --- | --- | --- |
EOF_TASK

  cat > "$feature_dir/tasks/plan.md" <<'EOF_TASK'
# Plan

## Current Stage

TBD
EOF_TASK

  cat > "$feature_dir/tests/test-plan.md" <<'EOF_TEST'
# Test Plan

## Priority

- P0: critical business and data consistency paths
- P1: important integration and regression paths
- P2: edge cases and usability checks

## Cases

| Priority | Scenario | Method | Expected Result | Status |
| --- | --- | --- | --- | --- |
EOF_TEST

  cat > "$feature_dir/reports/feature-progress.md" <<'EOF_REP'
# Feature Progress

- Status: initialized
EOF_REP

  cat > "$feature_dir/reports/daily-report.md" <<'EOF_REP'
# Daily Report
EOF_REP

  cat > "$feature_dir/reports/architecture-review.md" <<'EOF_REP'
# Architecture Review
EOF_REP

  local current_date templates
  current_date="$(date '+%Y-%m-%d')"
  templates="$(template_dir)"

  render_doc_template "$templates/01-current-state.md.template" "$feature_dir/docs/01-current-state.md" "$current_date" "${objective:-TBD}" "$repos_summary"
  render_doc_template "$templates/02-gap-analysis.md.template" "$feature_dir/docs/02-gap-analysis.md" "$current_date" "${objective:-TBD}" "$repos_summary"
  render_doc_template "$templates/03-business-design.md.template" "$feature_dir/docs/03-business-design.md" "$current_date" "${objective:-TBD}" "$repos_summary"
  render_doc_template "$templates/04-technical-design.md.template" "$feature_dir/docs/04-technical-design.md" "$current_date" "${objective:-TBD}" "$repos_summary"
  render_doc_template "$templates/05-task-breakdown.md.template" "$feature_dir/docs/05-task-breakdown.md" "$current_date" "${objective:-TBD}" "$repos_summary"
  render_doc_template "$templates/06-acceptance.md.template" "$feature_dir/docs/06-acceptance.md" "$current_date" "${objective:-TBD}" "$repos_summary"

  cat > "$feature_dir/agents.md" <<EOF_AG
# Feature Agents

Feature: $feature
Objective: ${objective:-TBD}
Repos: $repos_summary

## Working Contract

- Read \`context/runtime-context.md\` before stage work.
- Keep decisions in \`memory/decision-log.md\`.
- Keep risks in \`memory/risk.md\`.
- Keep implementation notes and validation results in \`reports/\`.
- Code changes must happen through mapped repositories under \`repos/\`.

## Roles

1. Analyst Agent: current-state and gap analysis.
2. Architect Agent: business and technical design.
3. Implementer Agent: code changes and local validation.
4. QA Agent: test design, repeatable validation, and regression report.
5. Review Agent: architecture drift, style, constraints, and risk review.
EOF_AG
}

write_feature_manifest() {
  local feature="$1"
  local repos_csv="$2"
  local objective="$3"
  local feature_dir="$FEATURES_DIR/$feature"

  IFS=',' read -r -a repos <<<"$repos_csv"

  {
    echo 'version: "0.2"'
    echo "feature:"
    echo "  name: \"$feature\""
    echo "  objective: \"${objective:-TBD}\""
    echo '  owner: "unassigned"'
    echo '  isolation: "symlink"'
    echo "  repos:"
    for repo in "${repos[@]}"; do
      repo="$(echo "$repo" | xargs)"
      [[ -n "$repo" ]] || continue
      local repo_path="$CODEBASE_DIR/$repo"
      local base_ref="unknown"
      local base_time
      base_time="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
      if [[ -d "$repo_path/.git" ]]; then
        base_ref="$(git -C "$repo_path" rev-parse HEAD 2>/dev/null || echo unknown)"
        base_time="$(git -C "$repo_path" log -1 --format="%aI" HEAD 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")"
      fi
      echo "    - name: \"$repo\""
      echo "      branch: \"feature/$feature\""
      echo "      base-ref: \"$base_ref\""
      echo "      base-time: \"$base_time\""
      echo "      path: \"repos/$repo\""
    done
    echo "  scope:"
    echo "    in: []"
    echo "    out: []"
    echo "  acceptance:"
    echo "    - \"define acceptance criteria\""
    echo '  risk_level: "medium"'
    echo "  dependencies: []"
    echo '  last-review-at: null'
  } > "$feature_dir/feature.yaml"
}

create_feature() {
  local name="$1"
  local repos_csv="$2"
  local objective="$3"
  [[ "$name" =~ ^[a-z0-9-]+$ ]] || die "feature name must match ^[a-z0-9-]+$"

  local feature_dir="$FEATURES_DIR/$name"
  [[ ! -d "$feature_dir" ]] || die "feature already exists: $name"
  mkdir -p "$feature_dir/repos"

  IFS=',' read -r -a repos <<<"$repos_csv"
  local repos_summary=""

  for repo in "${repos[@]}"; do
    repo="$(echo "$repo" | xargs)"
    [[ -n "$repo" ]] || continue
    if ! repo_exists "$repo"; then
      clone_repo_interactive "$repo"
    fi
    prepare_feature_branch "$repo" "$name" >/dev/null
    ln -sfn "$CODEBASE_DIR/$repo" "$feature_dir/repos/$repo"
    if [[ -z "$repos_summary" ]]; then
      repos_summary="$repo"
    else
      repos_summary="$repos_summary, $repo"
    fi
    log "mapped repo: $repo"
  done

  [[ -n "$repos_summary" ]] || die "--repos is required"
  init_feature_files "$name" "$objective" "$repos_summary"
  write_feature_manifest "$name" "$repos_csv" "$objective"
  context_build "$name" "feature-created"

  log "feature workspace created: $feature_dir"
}

close_feature() {
  local name="$1"
  local feature_dir
  feature_dir="$(require_feature_dir "$name")"
  local feature_yaml="$feature_dir/feature.yaml"
  [[ -f "$feature_yaml" ]] || die "feature.yaml not found for $name"

  log "closing and archiving feature $name..."

  # 1. Verify existence of acceptance report or validation report as safety checks
  if [[ ! -f "$feature_dir/reports/acceptance-report.md" ]] && [[ ! -f "$feature_dir/reports/validation-report.md" ]]; then
    warn "neither reports/acceptance-report.md nor reports/validation-report.md found. feature should be validated before close."
  fi

  # 2. Backfill decisions to docs/decisions
  mkdir -p "$ROOT_DIR/docs/decisions"
  local decision_log="$feature_dir/memory/decision-log.md"
  if [[ -f "$decision_log" ]]; then
    local dest_decision="$ROOT_DIR/docs/decisions/$name-decisions.md"
    cat > "$dest_decision" <<EOF
# Decisions for Feature: $name

- Archive Date: $(date '+%Y-%m-%d')
- Source: features/$name/memory/decision-log.md

$(cat "$decision_log")
EOF
    log "archived decision log to docs/decisions/$name-decisions.md"
  fi

  # 3. Create feature impact document
  mkdir -p "$ROOT_DIR/docs/feature-impact"
  local impact_doc="$ROOT_DIR/docs/feature-impact/$name.md"
  local objective
  objective="$(awk -F'"' '/^[[:space:]]*objective:[[:space:]]*"/ { print $2 }' "$feature_yaml" | head -1 || echo "TBD")"
  
  cat > "$impact_doc" <<EOF
# Feature Impact: $name

- Archive Date: $(date '+%Y-%m-%d')
- Objective: $objective

## Architecture & Code Changes

The changes introduced by this feature are scoped to the following repositories:
$(feature_repo_names "$feature_yaml" | sed 's/^/- /')

## Key Decisions Made
See [docs/decisions/$name-decisions.md](../decisions/$name-decisions.md) for full rationale.

## Documentation & Standards Alignment
The design documents and task breakdowns are retained in features/$name/docs/ for historical reference.
EOF
  log "created feature impact file: docs/feature-impact/$name.md"

  # 4. Mark status in feature manifest
  local tmp_file
  tmp_file="$(mktemp)"
  awk '
    /^[[:space:]]*owner:/ {
      print "  owner: \"archived\""
      next
    }
    { print }
  ' "$feature_yaml" > "$tmp_file"
  mv "$tmp_file" "$feature_yaml"

  # Write completion stage marker
  mkdir -p "$feature_dir/reports"
  local marker_file="$feature_dir/reports/stage-acceptance.completed"
  {
    echo "stage: acceptance"
    echo "completed-at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "note: archived and closed"
  } > "$marker_file"

  log "feature $name closed and archived successfully."
}

