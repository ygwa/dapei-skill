#!/usr/bin/env bash
# scripts/check-version-consistency.sh
# =============================================================================
# Assert all 6 version sources (root, engine/, packages/*/package.json, SKILL.md)
# agree. Exits 0 on success, 2 on drift, 1 on other errors. Used by CI.
# =============================================================================
set -euo pipefail
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$SCRIPT_ROOT/scripts/lib/release-version.mjs" check
