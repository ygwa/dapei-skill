#!/usr/bin/env bash
# scripts/check-version-consistency.sh
# =============================================================================
# Assert every version source (root, engine/, packages/*/package.json, SKILL.md,
# .claude-plugin/plugin.json, skills/*/.claude-plugin/plugin.json) agrees.
# The authoritative list lives in scripts/lib/release-version.mjs.
# Exits 0 on success, 2 on drift, 1 on other errors. Used by CI.
# =============================================================================
set -euo pipefail
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$SCRIPT_ROOT/scripts/lib/release-version.mjs" check
