#!/usr/bin/env bash

codebase_registry_file() {
  printf '%s\n' "$DAPEI_DIR/codebases.yaml"
}

codebase_add() {
  local name="$1"
  local url="$2"
  [[ -n "$name" && -n "$url" ]] || die "usage: dapei codebase add <name> <git-url>"
  require_cmd git

  local target="$CODEBASE_DIR/$name"
  local registry
  registry="$(codebase_registry_file)"

  [[ ! -d "$target/.git" ]] || die "codebase '$name' already exists"
  mkdir -p "$CODEBASE_DIR" "$DAPEI_DIR"
  git clone "$url" "$target" || die "clone failed for '$name'"

  local added_at default_branch
  added_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  default_branch="$(default_branch_for_repo "$target")"

  if [[ ! -f "$registry" ]]; then
    cat > "$registry" <<EOF_REGISTRY
version: "0.2"
codebases:
EOF_REGISTRY
  fi

  if grep -q "name: $name" "$registry" 2>/dev/null; then
    log "codebase '$name' already in registry"
  else
    cat >> "$registry" <<EOF_ENTRY
  - name: $name
    path: codebase/$name
    url: $url
    added-at: $added_at
    default-branch: $default_branch
    test-commands: []
EOF_ENTRY
  fi

  log "codebase '$name' added from $url"
}

codebase_sync_one() {
  local name="$1"
  local target="$CODEBASE_DIR/$name"
  [[ -d "$target/.git" ]] || die "codebase '$name' not found"
  require_cmd git

  if repo_has_remote "$target"; then
    log "fetching $name..."
    git -C "$target" fetch origin || die "fetch failed for '$name'"
  else
    warn "codebase '$name' has no origin remote; skipped fetch"
  fi

  local branch hash
  branch="$(git -C "$target" rev-parse --abbrev-ref HEAD)"
  hash="$(git -C "$target" rev-parse --short HEAD)"
  log "codebase '$name' synced, $branch at $hash"
}

codebase_sync() {
  local target="$1"
  if [[ "$target" == "--all" ]]; then
    local found=0
    while IFS= read -r repo; do
      [[ -n "$repo" ]] || continue
      found=1
      codebase_sync_one "$repo"
    done < <(registered_repo_names)
    [[ $found -eq 1 ]] || warn "no registered codebases"
    return 0
  fi
  codebase_sync_one "$target"
}

codebase_list() {
  local registry
  registry="$(codebase_registry_file)"
  if [[ ! -f "$registry" ]]; then
    echo "No codebases registered."
    return 0
  fi

  local count
  count="$(registered_repo_names | wc -l | tr -d ' ')"
  echo "Codebases ($count):"

  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    local repo_path="$CODEBASE_DIR/$name"
    if [[ -d "$repo_path/.git" ]]; then
      local hash branch
      hash="$(git -C "$repo_path" rev-parse --short HEAD 2>/dev/null || echo "???")"
      branch="$(git -C "$repo_path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "???")"
      echo "  - $name: $branch ($hash)"
    else
      echo "  - $name: not cloned"
    fi
  done < <(registered_repo_names)
}

detect_repo_language() {
  local repo_path="$1"
  local result=""
  [[ -f "$repo_path/package.json" ]] && result="$result nodejs"
  [[ -f "$repo_path/pom.xml" ]] && result="$result java-maven"
  [[ -f "$repo_path/build.gradle" || -f "$repo_path/build.gradle.kts" ]] && result="$result java-gradle"
  [[ -f "$repo_path/pyproject.toml" || -f "$repo_path/requirements.txt" ]] && result="$result python"
  [[ -f "$repo_path/go.mod" ]] && result="$result go"
  [[ -f "$repo_path/Cargo.toml" ]] && result="$result rust"
  [[ -n "$result" ]] || result=" unknown"
  echo "$result" | xargs
}

detect_test_commands() {
  local repo_path="$1"
  if [[ -f "$repo_path/package.json" ]]; then
    if grep -q '"test"' "$repo_path/package.json"; then
      echo "npm test"
    fi
    if [[ -f "$repo_path/pnpm-lock.yaml" ]]; then
      echo "pnpm test"
    fi
    if [[ -f "$repo_path/yarn.lock" ]]; then
      echo "yarn test"
    fi
  fi
  [[ -f "$repo_path/pyproject.toml" || -f "$repo_path/requirements.txt" ]] && echo "pytest"
  [[ -f "$repo_path/go.mod" ]] && echo "go test ./..."
  [[ -f "$repo_path/Cargo.toml" ]] && echo "cargo test"
  [[ -f "$repo_path/pom.xml" ]] && echo "mvn test"
  [[ -f "$repo_path/build.gradle" || -f "$repo_path/build.gradle.kts" ]] && echo "./gradlew test"
}

codebase_analyze_one() {
  local name="$1"
  local repo_path="$CODEBASE_DIR/$name"
  [[ -d "$repo_path/.git" ]] || die "codebase '$name' not found"

  local branch hash language files
  branch="$(git -C "$repo_path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
  hash="$(git -C "$repo_path" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
  language="$(detect_repo_language "$repo_path")"
  files="$(find "$repo_path" -maxdepth 2 -type f -not -path '*/.git/*' | sed "s#^$repo_path/##" | sort | head -40)"

  echo "## $name"
  echo
  echo "- Path: codebase/$name"
  echo "- Branch: $branch"
  echo "- Revision: $hash"
  echo "- Detected stack: $language"
  echo "- Test commands:"
  local command_count=0
  while IFS= read -r cmd; do
    [[ -n "$cmd" ]] || continue
    command_count=$((command_count + 1))
    echo "  - \`$cmd\`"
  done < <(detect_test_commands "$repo_path")
  [[ $command_count -gt 0 ]] || echo "  - TBD"
  echo
  echo "### Top-level Evidence"
  if [[ -n "$files" ]]; then
    while IFS= read -r file; do
      echo "- $file"
    done <<< "$files"
  else
    echo "- No files detected."
  fi
  echo
}

codebase_analyze() {
  local target="$1"
  mkdir -p "$ROOT_DIR/docs/as-is" "$ROOT_DIR/docs/architecture" "$ROOT_DIR/docs/standards"

  local report="$ROOT_DIR/docs/as-is/repo-inventory.md"
  local technical="$ROOT_DIR/docs/architecture/technical-current-state.md"
  local generated_at
  generated_at="$(date '+%Y-%m-%d %H:%M:%S %z')"

  {
    echo "# Repository Inventory"
    echo
    echo "- Generated At: $generated_at"
    echo "- Source: \`dapei codebase analyze $target\`"
    echo
    if [[ "$target" == "--all" ]]; then
      local found=0
      while IFS= read -r repo; do
        [[ -n "$repo" ]] || continue
        found=1
        codebase_analyze_one "$repo"
      done < <(registered_repo_names)
      [[ $found -eq 1 ]] || echo "No registered codebases."
    else
      codebase_analyze_one "$target"
    fi
  } > "$report"

  {
    echo "# Technical Current State"
    echo
    echo "- Generated At: $generated_at"
    echo "- Source Inventory: docs/as-is/repo-inventory.md"
    echo
    echo "## Summary"
    echo
    echo "This file is generated from repository evidence. Treat architecture conclusions as a starting point for human and agent refinement."
    echo
    echo "## Known Repositories"
    echo
    if [[ "$target" == "--all" ]]; then
      registered_repo_names | sed 's/^/- /'
    else
      echo "- $target"
    fi
  } > "$technical"

  log "codebase analysis written: $report"
  log "technical current state written: $technical"
}
