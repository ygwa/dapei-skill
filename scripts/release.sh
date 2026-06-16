#!/usr/bin/env bash
# scripts/release.sh
# =============================================================================
# Cut a dapei-skill release. Bumps version across all 6 sources, updates the
# CHANGELOG, refreshes the lockfile, verifies the bundle builds, commits, and
# tags. Designed so the maintainer cannot accidentally forget a step.
#
# Usage:
#   scripts/release.sh <patch|minor|major> [options]
#   scripts/release.sh --auto [options]
#
# Options:
#   --auto         Infer bump type from commits since the last tag.
#   --dry-run      Show what would change, do not write anything or commit.
#   --no-tag       Bump files and commit, but skip creating a git tag.
#   --push         Push commit and tag to origin after creating them.
#   --yes          Skip the confirmation prompt.
#   --skip-checks  Skip `npm run typecheck` and `npm run build` (NOT recommended).
#   -h, --help     Show this help.
#
# Version sources (6) and CHANGELOG are kept in sync by
# scripts/lib/release-version.mjs. This script orchestrates git/release
# concerns on top of that.
# =============================================================================

set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB="$SCRIPT_ROOT/scripts/lib/release-version.mjs"
CHANGELOG="$SCRIPT_ROOT/CHANGELOG.md"

BUMP_KIND=""
AUTO=false
DRY_RUN=false
NO_TAG=false
PUSH=false
YES=false
SKIP_CHECKS=false

main_branch="main"

# ---------- arg parsing ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    patch|minor|major) BUMP_KIND="$1"; shift ;;
    --auto)            AUTO=true; shift ;;
    --dry-run)         DRY_RUN=true; shift ;;
    --no-tag)          NO_TAG=true; shift ;;
    --push)            PUSH=true; shift ;;
    --yes)             YES=true; shift ;;
    --skip-checks)     SKIP_CHECKS=true; shift ;;
    -h|--help)
      sed -n '2,30p' "$0"; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Run '$0 --help' for usage." >&2
      exit 1 ;;
  esac
done

if [[ "$AUTO" == false && -z "$BUMP_KIND" ]]; then
  echo "Error: bump kind required (patch|minor|major) or --auto" >&2
  echo "Run '$0 --help' for usage." >&2
  exit 1
fi

cd "$SCRIPT_ROOT"

# ---------- helpers ----------
log()  { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

run() {
  if [[ "$DRY_RUN" == true ]]; then
    printf '  [dry-run] %s\n' "$*"
  else
    printf '  > %s\n' "$*"
    eval "$@"
  fi
}

# ---------- preflight: repo state ----------
log "==> Preflight checks"

# 1. Working tree clean
if ! git diff --quiet HEAD 2>/dev/null; then
  die "working tree has uncommitted changes. Commit or stash them first."
fi
if [[ -n "$(git ls-files --others --exclude-standard 2>/dev/null)" ]]; then
  die "working tree has untracked files. Commit or remove them first."
fi
log "    working tree clean"

# 2. On main branch
current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "$main_branch" ]]; then
  warn "current branch is '$current_branch', not '$main_branch'."
  if [[ "$YES" != true ]]; then
    read -r -p "    continue anyway? [y/N] " reply
    [[ "$reply" =~ ^[Yy]$ ]] || die "aborted."
  fi
fi
log "    on branch '$current_branch'"

# 3. Version sources currently agree
if ! node "$LIB" check >/dev/null; then
  die "version sources are out of sync. Run 'node $LIB check' to see drift."
fi
current_version="$(node -e "
  const pkg = JSON.parse(require('fs').readFileSync('${SCRIPT_ROOT}/package.json', 'utf8'));
  process.stdout.write(pkg.version);
")"
log "    current version $current_version"

# ---------- infer bump type if --auto ----------
if [[ "$AUTO" == true ]]; then
  last_tag="$(git describe --tags --abbrev=0 2>/dev/null || echo '')"
  if [[ -z "$last_tag" ]]; then
    log "    no previous tag found, defaulting to minor (first release)"
    BUMP_KIND="minor"
  else
    log "    scanning commits since $last_tag"
    commits="$(git log "${last_tag}..HEAD" --pretty=format:"%s" 2>/dev/null || true)"
    if echo "$commits" | grep -qE '(^| )feat(!|\([^)]+\))?!:|BREAKING CHANGE'; then
      BUMP_KIND="major"
    elif echo "$commits" | grep -qE '(^| )feat(\([^)]+\))?:'; then
      BUMP_KIND="minor"
    else
      BUMP_KIND="patch"
    fi
    log "    detected bump: $BUMP_KIND"
    echo "$commits" | head -20 | sed 's/^/        /'
  fi
fi

# ---------- compute next version ----------
case "$BUMP_KIND" in
  patch) next_version="${current_version%.*}.$((${current_version##*.}+1))" ;;
  minor) next_version="$(echo "$current_version" | awk -F. '{print $1"."$2+1".0"}')" ;;
  major) next_version="$(echo "$current_version" | awk -F. '{print $1+1".0.0"}')" ;;
esac
# Reject if tag already exists
if git rev-parse "v$next_version" >/dev/null 2>&1; then
  die "tag v$next_version already exists. Choose a different bump."
fi

# ---------- preflight: build / typecheck ----------
if [[ "$SKIP_CHECKS" != true ]]; then
  log "==> Running typecheck"
  run npm run typecheck
  log "==> Running build"
  run npm run build
fi

# ---------- preview ----------
log ""
log "==> Release plan"
log "    current:  $current_version"
log "    next:     $next_version ($BUMP_KIND)"
log "    tag:      v$next_version"
log "    push:     $PUSH"
log "    files affected:"
log "      - package.json"
log "      - engine/package.json"
log "      - packages/core/package.json"
log "      - packages/router/package.json"
log "      - packages/runtime-adapters/package.json"
log "      - SKILL.md (frontmatter)"
log "      - CHANGELOG.md"
log "      - package-lock.json"
log ""

if [[ "$YES" != true ]]; then
  read -r -p "Proceed? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || die "aborted."
fi

# ---------- execute ----------
log "==> Bumping version"
run node "$LIB" bump "$BUMP_KIND" --changelog "--date=$(date +%Y-%m-%d)"

log "==> Syncing package-lock.json"
run npm install --package-lock-only --no-audit --no-fund

# Re-verify version sources are in sync (catches any logic bugs)
if ! node "$LIB" check >/dev/null; then
  die "post-bump version sources are out of sync. Inspect manually."
fi

# Stage everything (release.sh will create a separate commit for the release).
log "==> Staging files"
run git add \
  package.json \
  engine/package.json \
  packages/core/package.json \
  packages/router/package.json \
  packages/runtime-adapters/package.json \
  SKILL.md \
  CHANGELOG.md \
  package-lock.json

log "==> Committing"
commit_msg="chore(release): v$next_version

- bump version across all 6 sources
- move [Unreleased] entries to [$next_version]
- refresh package-lock"
run git commit -m "$commit_msg"

if [[ "$NO_TAG" == true ]]; then
  log ""
  log "Done. No tag created (--no-tag). To tag later: git tag -a v$next_version"
  exit 0
fi

log "==> Creating tag v$next_version"
run git tag -a "v$next_version" -m "Release v$next_version"

if [[ "$PUSH" == true ]]; then
  log "==> Pushing to origin"
  run git push origin "$current_branch"
  run git push origin "v$next_version"
fi

log ""
log "Release v$next_version complete."
if [[ "$PUSH" != true ]]; then
  log "Next: git push origin $current_branch && git push origin v$next_version"
fi
