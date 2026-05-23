#!/usr/bin/env bash

init_workspace() {
  if ! is_effectively_empty_dir "$ROOT_DIR" && ! is_conforming_workspace_dir "$ROOT_DIR"; then
    die "current directory is not empty and does not look like a dapei workspace: $ROOT_DIR"
  fi

  mkdir -p "$DAPEI_DIR/workflows" "$DAPEI_DIR/rules"
  mkdir -p "$REPOS_DIR" "$FEATURES_DIR"
  mkdir -p "$ROOT_DIR/docs/as-is" "$ROOT_DIR/docs/architecture" "$ROOT_DIR/docs/standards"
  mkdir -p "$ROOT_DIR/docs/business" "$ROOT_DIR/docs/domain" "$ROOT_DIR/docs/glossary"
  mkdir -p "$ROOT_DIR/docs/workflows" "$ROOT_DIR/docs/decisions" "$ROOT_DIR/docs/feature-impact"
  mkdir -p "$ROOT_DIR/docs/integrations" "$ROOT_DIR/docs/observability" "$ROOT_DIR/docs/playbooks" "$ROOT_DIR/docs/specs"
  mkdir -p "$ROOT_DIR/runtime/templates" "$ROOT_DIR/runtime/ai-rules"

  if [[ ! -f "$DAPEI_DIR/workspace.yaml" ]]; then
    local workspace_name
    workspace_name="$(basename "$ROOT_DIR")"
    cat > "$DAPEI_DIR/workspace.yaml" <<EOF_WORKSPACE
version: 0.2
workspace:
  name: $workspace_name
  root: .
  default_branch: main
  locale: zh-CN
  repos_file: .dapei/repos.yaml

repos:
  root_dir: repos
  feature_repo_mode: worktree
  managed_repos: []

context_loading:
  strategy: layered
  bundle_file: context/runtime-context.md
  layers:
    - name: global
      priority: 10
      merge_policy: deny
      sources:
        - docs/standards
        - runtime/ai-rules
    - name: workspace
      priority: 20
      merge_policy: append
      sources:
        - docs/as-is
        - docs/architecture
        - docs/workflows
    - name: domain
      priority: 30
      merge_policy: append
      sources:
        - docs/business
        - docs/domain
        - docs/glossary
    - name: repo
      priority: 40
      merge_policy: append
      sources:
        - docs/as-is/repo-inventory.md
    - name: feature
      priority: 50
      merge_policy: override
      sources:
        - features/<feature>/context
        - features/<feature>/docs
    - name: runtime
      priority: 60
      merge_policy: override
      sources:
        - features/<feature>/tasks

agent_runtime:
  default_profile: implementer
  profiles:
    - name: analyst
      responsibilities:
        - reverse-engineer repos current state
        - distinguish evidence from inference
    - name: architect
      responsibilities:
        - produce business and technical design
        - validate architecture boundaries
    - name: implementer
      responsibilities:
        - implement scoped tasks
        - update memory and reports
    - name: reviewer
      responsibilities:
        - validate tests, risks, and architecture drift

quality_gates:
  guardrail_mode: report
  required_reports:
    - feature-progress
    - daily-report
    - architecture-review
    - validation-report
EOF_WORKSPACE
  fi

  copy_if_missing "$SOURCE_DAPEI_DIR/commands.yaml" "$DAPEI_DIR/commands.yaml"
  copy_if_missing "$SOURCE_DAPEI_DIR/feature.schema.yaml" "$DAPEI_DIR/feature.schema.yaml"
  copy_if_missing "$SOURCE_DAPEI_DIR/repos.schema.yaml" "$DAPEI_DIR/repos.schema.yaml"
  copy_if_missing "$SOURCE_DAPEI_DIR/workflows/feature-lifecycle.yaml" "$DAPEI_DIR/workflows/feature-lifecycle.yaml"
  copy_if_missing "$SOURCE_DAPEI_DIR/rules/api.yaml" "$DAPEI_DIR/rules/api.yaml"
  copy_if_missing "$SOURCE_DAPEI_DIR/rules/ddd.yaml" "$DAPEI_DIR/rules/ddd.yaml"
  copy_if_missing "$SOURCE_DAPEI_DIR/rules/layering.yaml" "$DAPEI_DIR/rules/layering.yaml"
  copy_if_missing "$SOURCE_DAPEI_DIR/rules/naming.yaml" "$DAPEI_DIR/rules/naming.yaml"

  if [[ -d "$SOURCE_TEMPLATES_DIR" ]]; then
    while IFS= read -r template_file; do
      copy_if_missing "$template_file" "$ROOT_DIR/runtime/templates/$(basename "$template_file")"
    done < <(find "$SOURCE_TEMPLATES_DIR" -mindepth 1 -maxdepth 1 -type f | sort)
  fi

  copy_if_missing "$SOURCE_RUNTIME_DIR/ai-rules/README.md" "$ROOT_DIR/runtime/ai-rules/README.md"

  if [[ ! -f "$ROOT_DIR/docs/agents.md" ]]; then
    cat > "$ROOT_DIR/docs/agents.md" <<'EOF_DOC'
# Workspace Agents

Use this workspace as the durable source of engineering context.

- `repos/` contains managed Git repositories.
- `docs/` contains current business, architecture, technology, standards, and decisions.
- `features/` contains feature-specific execution workspaces.
- Start feature work from `features/<feature>/agents.md` and `features/<feature>/context/runtime-context.md`.
EOF_DOC
  fi

  log "workspace initialized at $WORKSPACE_DIR"
}
