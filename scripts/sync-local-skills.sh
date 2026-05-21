#!/usr/bin/env bash
# Sync dapei-skill to AI tools' local skills directory
#
# This script maintains the skill in .agents/skills/ (standard location)
# and creates symlinks for Claude Code, Cursor, and other AI tools.
#
# Usage:
#   scripts/sync-local-skills.sh [options]
#
# Options:
#   --claude-code    Sync to Claude Code only (default: all available)
#   --cursor         Sync to Cursor only
#   --all            Sync to all available tools
#   --dry-run        Show what would be synced without copying
#   --force          Skip version check, always sync
#   -h, --help       Show this help

set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_NAME="dapei-skill"

# Default: sync all available tools
TARGET="all"
DRY_RUN=false
FORCE=false

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
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

SKILL_SOURCE="$SCRIPT_ROOT/.agents/skills/$SKILL_NAME"
SKILL_SOURCE_PATH="$SKILL_SOURCE"

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

# Sync to Claude Code (creates symlink to .agents/skills/dapei-skill)
sync_claude_code() {
  local installed_ver="$1"

  if [[ ! -d "$HOME/.claude" ]]; then
    echo "  [skip] Claude Code not found at ~/.claude"
    return
  fi

  local target_dir="$HOME/.claude/skills/$SKILL_NAME"

  if [[ "$installed_ver" != "not-installed" ]] && [[ "$FORCE" == "false" ]]; then
    local installed_num=$(version_to_num "$installed_ver")
    local source_ver=$(get_skill_version)
    local source_num=$(version_to_num "$source_ver")
    if [[ "$installed_num" -ge "$source_num" ]]; then
      echo "  [skip] Claude Code already at v$installed_ver (source: v$source_ver)"
      return
    fi
  fi

  local source_ver=$(get_skill_version)
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [dry-run] Would sync Claude Code: v$installed_ver -> v$source_ver (symlink)"
  else
    echo "  [sync] Claude Code: linking to v$source_ver"
    rm -rf "$target_dir"
    ln -sfn "$SKILL_SOURCE_PATH" "$target_dir"
  fi
}

# Sync to Cursor (creates symlink to .agents/skills/dapei-skill)
sync_cursor() {
  if [[ ! -d "$HOME/.cursor" ]]; then
    echo "  [skip] Cursor not found at ~/.cursor"
    return
  fi

  local target_dir="$HOME/.cursor/rules"
  mkdir -p "$target_dir"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [dry-run] Would sync Cursor rules (symlink)"
  else
    echo "  [sync] Cursor rules (symlink to skill)"
    # Create a marker file that references the skill
    cat > "$target_dir/dapei-skill.mdc" <<EOF
# dapei-skill for Cursor

Use the dapei-skill from: ~/.claude/skills/dapei-skill/SKILL.md

To update: run \`bash scripts/sync-local-skills.sh --cursor\` from dapei-skill repo.
EOF
  fi
}

# Sync to Agent Shell (creates symlink to .agents/skills/dapei-skill)
sync_agent_shell() {
  if [[ ! -d "$HOME/.agent-shell" ]]; then
    echo "  [skip] Agent Shell not found at ~/.agent-shell"
    return
  fi

  local target_dir="$HOME/.agent-shell/skills"
  mkdir -p "$target_dir"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [dry-run] Would sync Agent Shell skills (symlink)"
  else
    echo "  [sync] Agent Shell skills (symlink to skill)"
    rm -rf "$target_dir/$SKILL_NAME"
    ln -sfn "$SKILL_SOURCE_PATH" "$target_dir/$SKILL_NAME"
  fi
}

main() {
  echo "=== dapei-skill local sync ==="
  echo ""

  # Validate source
  if [[ ! -d "$SKILL_SOURCE_PATH" ]]; then
    echo "Error: Skill source not found at $SKILL_SOURCE_PATH"
    echo "This should be the standard location for dapei-skill."
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
      sync_claude_code "$installed_ver"
    fi
  fi

  if [[ "$TARGET" == "all" ]] || [[ "$TARGET" == "cursor" ]]; then
    echo "Cursor:      (checking...)"
    sync_cursor
  fi

  if [[ "$TARGET" == "all" ]] || [[ "$TARGET" == "agent-shell" ]]; then
    echo "Agent Shell: (checking...)"
    sync_agent_shell
  fi

  echo ""
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "=== dry-run complete (no changes made) ==="
  else
    echo "=== sync complete ==="
    echo ""
    echo "Restart the AI tool or start a new session to use the updated skill."
  fi
}

main