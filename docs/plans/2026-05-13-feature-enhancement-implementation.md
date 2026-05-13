# Feature Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance dapei.skill with codebase management (add/sync/list), feature creation with branch management, and incremental code review.

**Architecture:** Add new CLI commands as shell functions in `scripts/dapei`, new YAML schemas for codebases and feature metadata, and feature review logic using Git operations.

**Tech Stack:** Bash CLI, YAML (for metadata), Git (for diff/review)

---

## Task 1: Add codebases.yaml Schema

**Files:**
- Create: `.dapei/codebases.schema.yaml`

**Step 1: Create schema file**

```yaml
$schema: "https://json-schema.org/draft/2020-12/schema"
title: dapei codebases registry
type: object
required:
  - version
  - codebases
properties:
  version:
    type: string
    enum: ["0.1"]
  codebases:
    type: array
    items:
      type: object
      required:
        - name
        - path
        - url
        - added-at
      properties:
        name:
          type: string
        path:
          type: string
        url:
          type: string
        added-at:
          type: string
          format: date-time
        default-branch:
          type: string
```

**Step 2: Add to .dapei/workspace.yaml**

Modify `workspace.yaml` to add `codebases_file: .dapei/codebases.yaml`

**Step 3: Commit**

```bash
git add .dapei/codebases.schema.yaml .dapei/workspace.yaml
git commit -m "feat: add codebases schema"
```

---

## Task 2: Add Feature Metadata Schema Enhancement

**Files:**
- Modify: `.dapei/feature.schema.yaml`
- Create: `.dapei/feature-v2.schema.yaml` (new enhanced version)

**Step 1: Create enhanced feature schema with repo branch info**

```yaml
$schema: "https://json-schema.org/draft/2020-12/schema"
title: dapei feature manifest v2
type: object
required:
  - version
  - feature
properties:
  version:
    type: string
    enum: ["0.2"]
  feature:
    type: object
    required:
      - name
      - objective
      - owner
      - repos
      - acceptance
    properties:
      name:
        type: string
        pattern: "^[a-z0-9-]+$"
      objective:
        type: string
        minLength: 10
      owner:
        type: string
      repos:
        type: array
        minItems: 1
        items:
          type: object
          required:
            - name
            - branch
            - base-ref
          properties:
            name:
              type: string
            branch:
              type: string
            base-ref:
              type: string
              description: "master commit hash at feature creation"
            base-time:
              type: string
              format: date-time
      scope:
        type: object
        properties:
          in:
            type: array
            items: { type: string }
          out:
            type: array
            items: { type: string }
      acceptance:
        type: array
        minItems: 1
        items:
          type: string
      risk_level:
        type: string
        enum: [low, medium, high]
      dependencies:
        type: array
        items: { type: string }
      last-review-at:
        type: string
        format: date-time
additionalProperties: false
```

**Step 2: Commit**

```bash
git add .dapei/feature-v2.schema.yaml
git commit -m "feat: add feature schema v2 with branch metadata"
```

---

## Task 3: Add codebase Commands to CLI

**Files:**
- Modify: `scripts/dapei`

**Step 1: Add codebase_add function**

Add after `require_cmd()` function:

```bash
codebase_add() {
  local name="$1"
  local url="$2"

  if [[ -z "$name" || -z "$url" ]]; then
    err "usage: dapei codebase add <name> <git-url>"
    return 1
  fi

  local target="$CODEBASE_DIR/$name"
  local codebases_file="$DAPEI_DIR/codebases.yaml"

  if [[ -d "$target/.git" ]]; then
    err "codebase '$name' already exists"
    return 1
  fi

  mkdir -p "$CODEBASE_DIR"

  if [[ "$url" =~ ^https?:// ]]; then
    git clone "$url" "$target"
  else
    git clone "$url" "$target"
  fi

  if [[ ! -d "$target/.git" ]]; then
    err "clone failed for '$name'"
    return 1
  fi

  mkdir -p "$DAPEI_DIR"

  if [[ -f "$codebases_file" ]]; then
    if grep -q "name: $name" "$codebases_file" 2>/dev/null; then
      log "codebase '$name' already in registry"
    else
      local added_at
      added_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      local default_branch
      default_branch=$(git -C "$target" rev-parse --abbrev-ref HEAD)
      cat >> "$codebases_file" <<EOF

  - name: $name
    path: $target
    url: $url
    added-at: $added_at
    default-branch: $default_branch
EOF
    fi
  else
    cat > "$codebases_file" <<EOF
version: "0.1"
codebases:
  - name: $name
    path: $target
    url: $url
    added-at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
    default-branch: $(git -C "$target" rev-parse --abbrev-ref HEAD)
EOF
  fi

  log "codebase '$name' added from $url"
}
```

**Step 2: Add codebase_sync function**

```bash
codebase_sync() {
  local name="$1"

  if [[ -z "$name" ]]; then
    err "usage: dapei codebase sync <name>"
    return 1
  fi

  local target="$CODEBASE_DIR/$name"

  if [[ ! -d "$target/.git" ]]; then
    err "codebase '$name' not found. Run 'dapei codebase add' first."
    return 1
  fi

  log "syncing $name..."
  git -C "$target" fetch origin
  local head
  head=$(git -C "$target" rev-parse --abbrev-ref HEAD)
  local hash
  hash=$(git -C "$target" rev-parse --short HEAD)
  log "codebase '$name' synced, $head at $hash"
}
```

**Step 3: Add codebase_list function**

```bash
codebase_list() {
  local codebases_file="$DAPEI_DIR/codebases.yaml"

  if [[ ! -f "$codebases_file" ]]; then
    echo "No codebases registered."
    return 0
  fi

  local count
  count=$(grep -c "name:" "$codebases_file" 2>/dev/null || echo 0)
  echo "📦 Codebases ($count):"

  while IFS read -r line; do
    if [[ "$line" =~ name:\ ]]; then
      name=$(echo "$line" | sed 's/.*name: //' | tr -d ' ')
      if [[ -d "$CODEBASE_DIR/$name/.git" ]]; then
        local hash
        hash=$(git -C "$CODEBASE_DIR/$name" rev-parse --short HEAD 2>/dev/null || echo "???")
        local branch
        branch=$(git -C "$CODEBASE_DIR/$name" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "???")
        echo "  • $name - $branch ($hash)"
      else
        echo "  • $name - (not cloned)"
      fi
    fi
  done < "$codebases_file"
}
```

**Step 4: Add codebase command parser in main()**

In `main()`, add to case statement:

```bash
"codebase add")
  if [[ ${#args[@]} -lt 4 ]]; then
    err "usage: dapei codebase add <name> <git-url>"
    exit 1
  fi
  codebase_add "${args[2]}" "${args[3]}"
  ;;
"codebase sync")
  if [[ ${#args[@]} -lt 3 ]]; then
    err "usage: dapei codebase sync <name>"
    exit 1
  fi
  codebase_sync "${args[2]}"
  ;;
"codebase list")
  codebase_list
  ;;
```

**Step 5: Commit**

```bash
git add scripts/dapei
git commit -m "feat: add codebase add/sync/list commands"
```

---

## Task 4: Enhance feature create with branch creation and base-ref recording

**Files:**
- Modify: `scripts/dapei`

**Step 1: Add create_feature_branch function**

```bash
create_feature_branch() {
  local repo="$1"
  local feature="$2"

  local repo_path="$CODEBASE_DIR/$repo"
  if [[ ! -d "$repo_path/.git" ]]; then
    err "repo '$repo' not found in codebase"
    return 1
  fi

  local branch_name="feature/$feature"
  local default_branch
  default_branch=$(git -C "$repo_path" rev-parse --abbrev-ref HEAD)

  local base_ref
  base_ref=$(git -C "$repo_path" rev-parse HEAD)

  git -C "$repo_path" checkout -b "$branch_name" 2>/dev/null || {
    log "branch '$branch_name' already exists in '$repo'"
    return 0
  }

  echo "$base_ref"
}
```

**Step 2: Modify write_feature_manifest to include branch metadata**

Replace `write_feature_manifest` with enhanced version:

```bash
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
    echo "  repos:"
    for r in "${repos[@]}"; do
      r="$(echo "$r" | xargs)"
      [[ -z "$r" ]] && continue
      local repo_path="$CODEBASE_DIR/$r"
      local base_ref="unknown"
      local base_time="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
      if [[ -d "$repo_path/.git" ]]; then
        base_ref=$(git -C "$repo_path" rev-parse HEAD)
        base_time=$(git -C "$repo_path" log -1 --format="%aI" HEAD 2>/dev/null || echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ")")
      fi
      echo "    - name: \"$r\""
      echo "      branch: \"feature/$feature\""
      echo "      base-ref: \"$base_ref\""
      echo "      base-time: \"$base_time\""
    done
    echo "  scope:"
    echo "    in: []"
    echo "    out: []"
    echo "  acceptance:"
    echo "    - \"define acceptance criteria\""
    echo '  risk_level: "medium"'
    echo "  dependencies: []"
  } > "$feature_dir/feature.yaml"
}
```

**Step 3: Modify create_feature to create branches**

After `ln -sfn` in `create_feature`, add:

```bash
create_feature_branch "$repo" "$name" || exit 1
```

**Step 4: Commit**

```bash
git add scripts/dapei
git commit -m "feat: create feature branches with base-ref tracking"
```

---

## Task 5: Add feature review command

**Files:**
- Modify: `scripts/dapei`

**Step 1: Add feature_review function**

```bash
feature_review() {
  local feature="$1"
  local feature_dir="$FEATURES_DIR/$feature"

  if [[ ! -d "$feature_dir" ]]; then
    err "feature not found: $feature"
    return 1
  fi

  local feature_yaml="$feature_dir/feature.yaml"
  if [[ ! -f "$feature_yaml" ]]; then
    err "feature.yaml not found for $feature"
    return 1
  fi

  local report="$feature_dir/reports/daily-report.md"
  mkdir -p "$feature_dir/reports"

  local review_date
  review_date=$(date '+%Y-%m-%d %H:%M:%S %z')

  echo "# Daily Review: $feature" > "$report"
  echo "Date: $review_date" >> "$report"
  echo "" >> "$report"

  local last_review
  last_review=$(grep "last-review-at:" "$feature_yaml" 2>/dev/null | cut -d'"' -f2 || echo "")

  while IFS= read -r line; do
    if [[ "$line" =~ name:\ \"([^\"]+)\" ]]; then
      local repo="${BASH_REMATCH[1]}"
      local repo_path="$CODEBASE_DIR/$repo"
      if [[ -d "$repo_path/.git" ]]; then
        echo "## Repo: $repo" >> "$report"
        echo "" >> "$report"

        local branch="feature/$feature"
        local base_ref
        base_ref=$(grep -A5 "name: \"$repo\"" "$feature_yaml" 2>/dev/null | grep "base-ref:" | head -1 | cut -d'"' -f2)

        if [[ -n "$last_review" ]]; then
          echo "### Commits since last review ($last_review)" >> "$report"
          git -C "$repo_path" log --since="$last_review" --oneline "$branch" 2>/dev/null | while IFS read -r commit_line; do
            echo "- $commit_line" >> "$report"
          done
        else
          echo "### All commits on branch (no prior review)" >> "$report"
          git -C "$repo_path" log --oneline "$branch" 2>/dev/null | head -20 | while IFS read -r commit_line; do
            echo "- $commit_line" >> "$report"
          done
        fi

        local diff_stats
        diff_stats=$(git -C "$repo_path" diff --stat "$base_ref..$branch" 2>/dev/null | tail -1 || echo "no diff")
        echo "" >> "$report"
        echo "**Changes:** \`$diff_stats\`" >> "$report"
        echo "" >> "$report"
      fi
    fi
  done < "$feature_yaml"

  sed -i "s/last-review-at:.*/last-review-at: \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"/" "$feature_yaml" 2>/dev/null || true

  log "review report generated: $report"
}
```

**Step 2: Add feature_status function**

```bash
feature_status() {
  local features_dir="$FEATURES_DIR"

  if [[ ! -d "$features_dir" ]]; then
    echo "No features found."
    return 0
  fi

  local count
  count=$(find "$features_dir" -maxdepth 1 -type d -not -name features | wc -l)
  echo "📋 Features ($count):"

  for feat_dir in "$features_dir"/*; do
    [[ ! -d "$feat_dir" ]] && continue
    [[ "$(basename "$feat_dir")" == ".templates" ]] && continue

    local feature="$(basename "$feat_dir")"
    local feature_yaml="$feat_dir/feature.yaml"

    echo "  🔵 $feature"

    if [[ -f "$feature_yaml" ]]; then
      while IFS read -r line; do
        if [[ "$line" =~ name:\ \"([^\"]+)\" ]]; then
          local repo="${BASH_REMATCH[1]}"
          local repo_path="$CODEBASE_DIR/$repo"
          if [[ -d "$repo_path/.git" ]]; then
            local branch="feature/$feature"
            local head
            head=$(git -C "$repo_path" rev-parse --short "$branch" 2>/dev/null || echo "???")
            local base_ref
            base_ref=$(grep -A5 "name: \"$repo\"" "$feature_yaml" 2>/dev/null | grep "base-ref:" | head -1 | cut -d'"' -f2 | cut -c1-8)
            echo "    └── $repo - $branch ($base_ref...→$head)"
          fi
        fi
      done < "$feature_yaml"
    fi
  done
}
```

**Step 3: Add parser in main()**

```bash
"review feature")
  if [[ ${#args[@]} -lt 3 ]]; then
    err "usage: dapei review feature <name>"
    exit 1
  fi
  feature_review "${args[2]}"
  ;;

"status feature")
  feature_status
  ;;
```

Also update usage() to include new commands.

**Step 4: Commit**

```bash
git add scripts/dapei
git commit -m "feat: add feature review and status commands"
```

---

## Task 6: Test the implementation

**Step 1: Test codebase add**

```bash
cd /Users/ygwang/Develop/github/dapei-skill
./scripts/dapei codebase list
```

**Step 2: Test feature status**

```bash
./scripts/dapei status feature
```

**Step 3: Test feature review (on existing feature if any)**

```bash
./scripts/dapei review feature payment-refactor
cat workspace/features/payment-refactor/reports/daily-report.md
```

---

## Task 7: Update docs and design

**Files:**
- Modify: `docs/plans/2026-05-13-feature-enhancement-design.md`

Add CLI reference section:

```markdown
## CLI Reference (v0.2)

### Codebase Commands
- `dapei codebase add <name> <git-url>` - Add new codebase
- `dapei codebase sync <name>` - Sync latest from origin
- `dapei codebase list` - List all codebases

### Feature Commands
- `dapei create feature <name> --repos repo1,repo2` - Create with branch creation
- `dapei review feature <name>` - Generate incremental review
- `dapei status feature` - Show all features and branch status
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `.dapei/codebases.schema.yaml` | NEW - Codebase registry schema |
| `.dapei/feature-v2.schema.yaml` | NEW - Enhanced feature schema with branch metadata |
| `.dapei/workspace.yaml` | MODIFY - Add codebases_file reference |
| `scripts/dapei` | MODIFY - Add codebase add/sync/list, feature review/status, branch creation |

---

## Execution Option

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?