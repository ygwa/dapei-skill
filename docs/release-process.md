# Release Process

How dapei-skill is versioned, released, and how changes get into `CHANGELOG.md`.

## TL;DR

```bash
# 1. Land your PR with an entry in the [Unreleased] section of CHANGELOG.md.
# 2. Once you're ready to cut a release:
bash scripts/release.sh patch    # or minor / major / --auto
# 3. Push the commit and the tag.
git push origin main && git push origin vX.Y.Z
```

The script refuses to proceed if the working tree is dirty, the branch is not
`main`, the version sources are out of sync, or the tag already exists.

---

## Versioning policy (Semantic Versioning)

| Bump   | When                                                                       |
| ------ | -------------------------------------------------------------------------- |
| patch  | Backward-compatible bug fixes, internal refactors, docs, CI tweaks.         |
| minor  | New backward-compatible features (e.g. a new `cognitive.*` capability).     |
| major  | Breaking changes to the `SKILL.md` contract, capability IDs, or CLI shape.  |

`scripts/release.sh --auto` infers the bump type from conventional commits
since the last tag:

- `feat!:` or `BREAKING CHANGE:` footer → **major**
- `feat:` → **minor**
- everything else (`fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `perf:`,
  `ci:`, `style:`) → **patch**

You can always override by passing an explicit `patch|minor|major`.

### Cadence

There is no fixed schedule. A release should be cut when:

- A meaningful feature lands and the cognitive / guardrail surface area changed.
- A breaking change has been documented and migration path is in the PR.
- A bug fix is important enough to ship outside the next feature release.

Prefer small, frequent releases over big infrequent ones. Two patches a week
beats one major a quarter.

---

## What changes when a release is cut

`scripts/release.sh patch|minor|major [--changelog]` (changelog is on by
default) updates **all six** version sources atomically:

1. `package.json` (root)
2. `engine/package.json`
3. `packages/core/package.json`
4. `packages/router/package.json`
5. `packages/runtime-adapters/package.json`
6. `SKILL.md` YAML frontmatter

Plus:

- `CHANGELOG.md` — moves accumulated `[Unreleased]` content into a new dated
  `## [X.Y.Z] - YYYY-MM-DD` section above the previous version, then resets
  `[Unreleased]` to an empty template.
- `package-lock.json` — refreshed via `npm install --package-lock-only`.

After the bump, the script runs `npm run typecheck` and `npm run build` to
verify nothing broke, then creates a single `chore(release): vX.Y.Z` commit
and an annotated tag `vX.Y.Z`.

---

## What to do as a contributor

For every PR that changes user-facing behavior, add a bullet to the matching
subsection under `## [Unreleased]` in `CHANGELOG.md`:

```markdown
## [Unreleased]

### Added
- `cognitive.artifact.export` capability for batch archival.

### Fixed
- `repos.sync` no longer loses submodule pointers on dirty worktrees.
```

Subsections in use: **Added**, **Changed**, **Fixed**, **Removed**. Leave the
others empty (or remove them if you only touch one category). Match the tone
and detail of the existing entries — short, declarative, references file paths
or capability IDs.

If your PR is purely internal (CI, comments, dev tooling with no user
impact), **you do not need a CHANGELOG entry**. The maintainer will batch
those into the next patch.

---

## Pre-release checklist for the maintainer

Before running `scripts/release.sh`:

- [ ] `git status` is clean.
- [ ] You are on `main` (the script will warn and confirm if not).
- [ ] `bash scripts/check-version-consistency.sh` passes.
- [ ] `npm run verify` passes locally (typecheck + build + tests + smoke).
- [ ] `[Unreleased]` in `CHANGELOG.md` reflects everything that's about to
      ship — read it as a release note and check it makes sense to a user.
- [ ] You have a clean place to push from (network access to `origin`).

If any of the above fails, the script will tell you. Do not bypass with
`--skip-checks` or `--yes` unless you understand why.

---

## How CI prevents drift

`.github/workflows/ci.yml` runs the `version-consistency` job on every push
and PR. It fails the build the moment any of the 6 sources disagrees. This
is the safety net that catches the kind of drift that already happened
historically (sub-packages stuck at 2.1.0 while the root was at 2.2.0).

To reproduce locally: `bash scripts/check-version-consistency.sh`.

---

## Git tag conventions

- Tags are **annotated** (`git tag -a vX.Y.Z -m "Release vX.Y.Z"`), not
  lightweight, so `git show vX.Y.Z` shows the release commit.
- Tag format: `vX.Y.Z` (lowercase `v`, semver, no `v`-prefix on the version
  inside CHANGELOG / package.json / SKILL.md).
- No pre-release tags yet (`-alpha.1`, `-rc.1`). If we need them later, the
  bump logic in `scripts/lib/release-version.mjs` will need a small extension.
- Do not delete or move tags once pushed — they are part of the public
  install contract (`npx skills add ygwa/dapei-skill@vX.Y.Z`).

---

## Why this is a script, not `standard-version` or `release-please`

- Zero new dependencies. The whole pipeline is ~250 lines of bash + a 200
  line node module we already need.
- Transparent: any maintainer can read `scripts/release.sh` and know
  exactly what it does.
- Plays nicely with our existing `npm run verify` gate and the `dist/`
  build artifact (which the script rebuilds to make sure the bundle still
  builds, even though `dist/` itself is gitignored).
- If we ever want GitHub Release auto-creation, the `release-please` /
  `changesets` pattern can be layered on top — the script already produces
  the right commit and tag.

---

## References

- `scripts/release.sh` — main entry point
- `scripts/lib/release-version.mjs` — version sync + CHANGELOG logic
- `scripts/check-version-consistency.sh` — CI / pre-release check
- `CHANGELOG.md` — current state

## Promoting plans to ADRs

When a design plan from `plans/` is delivered (feature shipped, CHANGELOG entry written):

1. Identify the load-bearing decision(s) the plan made
2. Create a new ADR at `docs/decisions/ADR-NNNN-<slug>.md` using `docs/decisions/TEMPLATE.md`
3. Reference the source plan in the ADR `references:` block
4. Leave the plan in `plans/` (gitignored) as the working draft — the ADR is the durable record

ADRs are numbered sequentially. Status flow: `proposed` → `accepted` → optionally `superseded by ADR-NNNN`.
