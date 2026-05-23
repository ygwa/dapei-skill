#!/usr/bin/env bash

ROOT_DIR="${DAPEI_WORKSPACE_ROOT:-$(pwd)}"
WORKSPACE_DIR="$ROOT_DIR"
REPOS_DIR="$WORKSPACE_DIR/repos"
FEATURES_DIR="$WORKSPACE_DIR/features"
DAPEI_DIR="$ROOT_DIR/.dapei"
SOURCE_DAPEI_DIR="$SCRIPT_ROOT/.dapei"
SOURCE_RUNTIME_DIR="$SCRIPT_ROOT/runtime"
SOURCE_TEMPLATES_DIR="$SCRIPT_ROOT/runtime/templates"

log() { echo "[dapei] $*"; }
warn() { echo "[dapei][warn] $*" >&2; }
err() { echo "[dapei][error] $*" >&2; }
die() { err "$*"; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

is_effectively_empty_dir() {
  local dir="$1"
  [[ -z "$(find "$dir" -mindepth 1 -maxdepth 1 ! -name ".DS_Store" ! -name ".gitkeep" -print -quit 2>/dev/null)" ]]
}

is_conforming_workspace_dir() {
  local dir="$1"
  if [[ -d "$dir/.dapei" ]]; then
    return 0
  fi

  local count=0
  [[ -d "$dir/repos" ]] && count=$((count + 1))
  [[ -d "$dir/docs" ]] && count=$((count + 1))
  [[ -d "$dir/features" ]] && count=$((count + 1))
  [[ $count -ge 2 ]]
}

copy_if_missing() {
  local source_path="$1"
  local target_path="$2"
  if [[ -e "$target_path" || ! -e "$source_path" ]]; then
    return 0
  fi
  mkdir -p "$(dirname "$target_path")"
  cp "$source_path" "$target_path"
}

template_dir() {
  if [[ -d "$ROOT_DIR/runtime/templates" ]]; then
    printf '%s\n' "$ROOT_DIR/runtime/templates"
    return 0
  fi
  printf '%s\n' "$SOURCE_TEMPLATES_DIR"
}

render_doc_template() {
  local template_path="$1"
  local output_path="$2"
  local date_value="$3"
  local objective_value="$4"
  local repos_value="$5"

  awk -v date="$date_value" -v objective="$objective_value" -v repos="$repos_value" '
    {
      gsub(/\{\{date\}\}/, date)
      gsub(/\{\{objective\}\}/, objective)
      if ($0 ~ /\{\{repos\}\}/) {
        print repos
        next
      }
      print
    }
  ' "$template_path" > "$output_path"
}

DAPEI_PARSED_REPOS=""
DAPEI_PARSED_OBJECTIVE=""
DAPEI_PARSED_STAGE=""

parse_create_feature_args() {
  DAPEI_PARSED_REPOS=""
  DAPEI_PARSED_OBJECTIVE=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repos)
        shift
        DAPEI_PARSED_REPOS="${1:-}"
        ;;
      --objective)
        shift
        DAPEI_PARSED_OBJECTIVE="${1:-}"
        ;;
      *)
        ;;
    esac
    shift || true
  done
}

parse_stage_arg() {
  DAPEI_PARSED_STAGE=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --stage)
        shift
        DAPEI_PARSED_STAGE="${1:-}"
        ;;
      *)
        ;;
    esac
    shift || true
  done
}

feature_dir_for() {
  printf '%s\n' "$FEATURES_DIR/$1"
}

require_feature_dir() {
  local feature="$1"
  local feature_dir="$FEATURES_DIR/$feature"
  [[ -d "$feature_dir" ]] || die "feature not found: $feature"
  printf '%s\n' "$feature_dir"
}

repo_exists() {
  local repo="$1"
  [[ -d "$REPOS_DIR/$repo/.git" ]]
}

registered_repo_names() {
  local repos_file="$DAPEI_DIR/repos.yaml"
  if [[ ! -f "$repos_file" ]]; then
    return 0
  fi
  awk '/^[[:space:]]*- name:/ { print $3 }' "$repos_file" | tr -d '"'
}

feature_repo_names() {
  local feature_yaml="$1"
  awk '
    BEGIN { in_repos=0 }
    /^[[:space:]]+repos:[[:space:]]*$/ { in_repos=1; next }
    in_repos && /^[[:space:]]{2}[a-zA-Z0-9_-]+:[[:space:]]*.*$/ { in_repos=0 }
    in_repos {
      if ($0 ~ /name:[[:space:]]*"/) {
        line=$0
        sub(/^.*name:[[:space:]]*"/, "", line)
        sub(/".*$/, "", line)
        print line
      }
    }
  ' "$feature_yaml"
}

default_branch_for_repo() {
  local repo_path="$1"
  local branch
  branch="$(git -C "$repo_path" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)"
  if [[ -n "$branch" ]]; then
    printf '%s\n' "$branch"
    return 0
  fi
  if git -C "$repo_path" show-ref --verify --quiet refs/heads/main || git -C "$repo_path" show-ref --verify --quiet refs/remotes/origin/main; then
    printf '%s\n' "main"
    return 0
  fi
  if git -C "$repo_path" show-ref --verify --quiet refs/heads/master || git -C "$repo_path" show-ref --verify --quiet refs/remotes/origin/master; then
    printf '%s\n' "master"
    return 0
  fi
  git -C "$repo_path" rev-parse --abbrev-ref HEAD
}

repo_has_remote() {
  local repo_path="$1"
  git -C "$repo_path" remote get-url origin >/dev/null 2>&1
}

worktree_add() {
  local repo_path="$1"
  local branch_name="$2"
  local worktree_path="$3"

  if [[ -d "$worktree_path/.git" ]]; then
    die "worktree already exists at '$worktree_path'"
  fi

  if ! git -C "$repo_path" show-ref --verify --quiet "refs/heads/$branch_name"; then
    die "branch '$branch_name' does not exist in '$repo_path'"
  fi

  git -C "$repo_path" worktree add "$worktree_path" "$branch_name"
}

worktree_remove() {
  local repo_path="$1"
  local worktree_path="$2"
  local force="${3:-false}"

  if [[ ! -d "$worktree_path/.git" ]]; then
    warn "worktree does not exist at '$worktree_path', nothing to remove"
    return 0
  fi

  local args=("$worktree_path")
  if [[ "$force" == "true" ]]; then
    args+=(--force)
  fi

  git -C "$repo_path" worktree remove "${args[@]}"
}

worktree_has_unmerged() {
  local repo_path="$1"
  local worktree_path="$2"

  if [[ ! -d "$worktree_path/.git" ]]; then
    return 1
  fi

  ! git -C "$worktree_path" diff-index --quiet HEAD --
}

repo_is_clean() {
  local repo_path="$1"
  git -C "$repo_path" diff-index --quiet HEAD --
}

shell_quote() {
  printf "%q" "$1"
}
