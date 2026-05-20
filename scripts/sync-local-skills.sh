#!/usr/bin/env bash
# Sync dapei-skill from local workspace to AI tools' local skills directory
#
# Usage:
#   scripts/sync-local-skills.sh [options] [workspace/repos/dapei-skill]
#
# Options:
#   --claude-code    Sync to Claude Code only (default: all available)
#   --cursor         Sync to Cursor only
#   --all            Sync to all available tools
#   --dry-run        Show what would be synced without copying
#   --force          Skip version check, always copy
#   -h, --help       Show this help
#
# Examples:
#   bash scripts/sync-local-skills.sh
#   bash scripts/sync-local-skills.sh --dry-run
#   bash scripts/sync-local-skills.sh --claude-code /path/to/repos/dapei-skill

set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_NAME="dapei-skill"

# Default: sync all available tools
TARGET="all"
DRY_RUN=false
FORCE=false
SKILL_SOURCE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --claude-code)
      TARGET="claude-code"
      shift
      ;;
    --cursor)
      TARGET="cursor"
      shift
      ;;
    --all)
      TARGET="all"
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    -h|--help)
      grep "^#" "$0" | tail -n +2 | head -n 20
      exit 0
      ;;
    -*)
      echo "Unknown option: $1"
      exit 1
      ;;
    *)
      if [[ -z "$SKILL_SOURCE" ]]; then
        SKILL_SOURCE="$1"
      fi
      shift
      ;;
  esac
done

# Default source if not provided
if [[ -z "$SKILL_SOURCE" ]]; then
  SKILL_SOURCE="$SCRIPT_ROOT/workspace/repos/dapei-skill"
fi

SKILL_SOURCE_PATH="$SKILL_SOURCE/.claude/skills/$SKILL_NAME"

# Detect skill version from SKILL.md
get_skill_version() {
  local skill_md="$SKILL_SOURCE_PATH/SKILL.md"
  if [[ -f "$skill_md" ]]; then
    grep -m1 "^version:" "$skill_md" | sed 's/version: *//' || echo "unknown"
  else
    echo "missing"
  fi
}

# Detect installed version
get_installed_version() {
  local target_dir="$HOME/.claude/skills/$SKILL_NAME"
  if [[ -f "$target_dir/SKILL.md" ]]; then
    grep -m1 "^version:" "$target_dir/SKILL.md" | sed 's/version: *//' || echo "unknown"
  else
    echo "not-installed"
  fi
}

# Calculate effective version string for comparison
version_to_num() {
  echo "$1" | sed 's/^v//' | awk -F. '{ printf "%03d%03d%03d\n", $1, $2, $3 }'
}

# Sync to Claude Code
sync_claude_code() {
  local source_path="$1"
  local target_dir="$HOME/.claude/skills/$SKILL_NAME"
  local installed_ver="$2"
  local source_ver="$3"

  if [[ ! -d "$HOME/.claude/skills" ]]; then
    echo "  [skip] Claude Code not found at ~/.claude/skills"
    return
  fi

  if [[ "$installed_ver" != "not-installed" ]] && [[ "$FORCE" == "false" ]]; then
    local installed_num=$(version_to_num "$installed_ver")
    local source_num=$(version_to_num "$source_ver")
    if [[ "$installed_num" -ge "$source_num" ]]; then
      echo "  [skip] Claude Code already at v$installed_ver (source: v$source_ver)"
      return
    fi
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [dry-run] Would sync Claude Code: v$source_ver -> v$installed_ver"
  else
    echo "  [sync] Claude Code: v$installed_ver -> v$source_ver"
    rm -rf "$target_dir"
    cp -R "$source_path" "$target_dir"
  fi
}

# Sync to Cursor
sync_cursor() {
  local source_path="$1"
  local source_dir="$source_path/../../.."

  if [[ ! -d "$HOME/.cursor" ]]; then
    echo "  [skip] Cursor not found at ~/.cursor"
    return
  fi

  local cursor_source="$source_dir/.cursor/rules/dapei-core.mdc"
  if [[ ! -f "$cursor_source" ]]; then
    echo "  [skip] Cursor rules file not found in source"
    return
  fi

  local target_dir="$HOME/.cursor/rules"
  mkdir -p "$target_dir"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [dry-run] Would sync Cursor rules"
  else
    echo "  [sync] Cursor rules"
    cp "$cursor_source" "$target_dir/dapei-core.mdc"
  fi
}

main() {
  echo "=== dapei-skill local sync ==="
  echo ""

  # Validate source
  if [[ ! -d "$SKILL_SOURCE_PATH" ]]; then
    echo "Error: Skill source not found at $SKILL_SOURCE_PATH"
    echo ""
    echo "Hint: Clone dapei-skill into workspace/repos/, or pass path as argument:"
    echo "  bash scripts/sync-local-skills.sh /path/to/workspace/repos/dapei-skill"
    exit 1
  fi

  local source_ver=$(get_skill_version)
  echo "Source:      $SKILL_SOURCE_PATH"
  echo "Version:     v$source_ver"
  echo "Target:      $TARGET"
  echo "Mode:        ${DRY_RUN:+dry-run / }${FORCE:+force / }normal"
  echo ""

  # Show installed versions for reference
  if [[ "$TARGET" == "all" ]] || [[ "$TARGET" == "claude-code" ]]; then
    local installed_ver=$(get_installed_version)
    echo "Claude Code: installed v$installed_ver"
    if [[ "$DRY_RUN" == "true" ]] || [[ "$FORCE" == "true" ]]; then
      sync_claude_code "$SKILL_SOURCE_PATH" "$installed_ver" "$source_ver"
    fi
  fi

  if [[ "$TARGET" == "all" ]] || [[ "$TARGET" == "cursor" ]]; then
    if [[ "$TARGET" == "cursor" ]]; then
      sync_cursor "$SKILL_SOURCE_PATH"
    else
      echo "Cursor:      (checking...)"
      sync_cursor "$SKILL_SOURCE_PATH"
    fi
  fi

  echo ""
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "=== dry-run complete (no changes made) ==="
  else
    echo "=== sync complete ==="
    echo ""
    echo "Restart Claude Code or start a new session to use the updated skill."
  fi
}

main