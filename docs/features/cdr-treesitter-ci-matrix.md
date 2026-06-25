# CI matrix proposal — `feature/cdr-treesitter-finding-layer`

> Companion to `docs/features/cdr-treesitter-finding-layer.md` §"Phase 1 — CI matrix baseline".
> Tree-sitter ships **per-platform native prebuilds**; the existing CI runs on `ubuntu-latest` (linux-x64) only, which leaves 3 of 6 supported platforms untested.

## Current state (gap analysis)

Read `.github/workflows/ci.yml` (as of `feature/cdr-treesitter-finding-layer` branch base):

- **All 5 jobs run on `ubuntu-latest`** (lines 12, 25, 40, 61, 91, 117).
- Node 22 is the runtime (lines 51, 73, 102).
- No `macos-*` runner, no `ubuntu-*-arm` runner.

Implication: a tree-sitter native binding that fails on darwin-arm64 (Apple Silicon, common dev machine) or linux-arm64 (AWS Graviton, increasingly common CI host) **silently breaks those users** — the failure surfaces only at install time.

## Tree-sitter prebuild matrix

Per the verified 2025 npm registry state:

| Grammar | darwin-x64 | darwin-arm64 | linux-x64 | linux-arm64 | win32-x64 | win32-arm64 |
|---|---|---|---|---|---|---|
| `tree-sitter@0.25.0` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `tree-sitter-typescript@0.23.2` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `tree-sitter-javascript@0.25.0` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `tree-sitter-python@0.25.0` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `tree-sitter-java` (npm lag risk) | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ |

> **Java caveat**: the standalone `tree-sitter-java` npm has slower release cadence than JS / TS / Python. If the pinned version lacks prebuilds for a target platform, `node-gyp` rebuild kicks in. **Linux-arm64 win32-arm64 are the most likely to fall back to source build.** A `node-gyp` rebuild requires `python3` + `make` + `g++` in the runner image; GitHub-hosted runners have these but the build adds ~60–120 s.

## Proposed workflow change

Add a new job `treesitter-platform-matrix` that runs on PRs touching `packages/runtime-adapters/src/treesitter/**`, `tests/fixtures/treesitter/**`, `tests/unit/treesitter-*.test.mjs`, or `packages/runtime-adapters/package.json`:

```yaml
treesitter-platform-matrix:
  name: Tree-sitter native binding — ${{ matrix.label }}
  strategy:
    fail-fast: false
    matrix:
      include:
        - os: ubuntu-latest
          arch: x64
          label: linux-x64 (current default)
        - os: macos-latest
          arch: arm64
          label: darwin-arm64 (Apple Silicon)
        - os: macos-13
          arch: x64
          label: darwin-x64 (Intel macOS, still in support)
        - os: ubuntu-24.04-arm
          arch: arm64
          label: linux-arm64 (AWS Graviton)
  runs-on: ${{ matrix.os }}
  steps:
    - uses: actions/checkout@v4

    - uses: pnpm/action-setup@v4
      with:
        version: 10

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '22'

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Verify tree-sitter grammar prebuild loads
      run: |
        node --input-type=module -e "
          import { TreeSitterCodeMapAdapter } from './packages/runtime-adapters/src/treesitter/index.ts';
          const adapter = new TreeSitterCodeMapAdapter();
          const doctor = adapter.fullDoctor();
          console.log('platform:', process.platform, process.arch);
          console.log('languages:', doctor.languages);
          if (doctor.languages.length !== 4) {
            console.error('Expected 4 languages, got', doctor.languages.length);
            process.exit(1);
          }
        "

    - name: Run tree-sitter smoke tests
      run: npm run test:unit -- tests/unit/treesitter-smoke.test.mjs tests/unit/treesitter-decorators.test.mjs tests/unit/treesitter-types.test.mjs

    - name: Cold-start budget check (< 500 ms total)
      run: |
        node --input-type=module -e "
          import { performance } from 'node:perf_hooks';
          import { TreeSitterCodeMapAdapter } from './packages/runtime-adapters/src/treesitter/index.ts';
          const t0 = performance.now();
          const adapter = new TreeSitterCodeMapAdapter();
          const doctor = adapter.fullDoctor();
          const elapsed = performance.now() - t0;
          console.log('cold start:', elapsed.toFixed(0), 'ms');
          if (elapsed > 500) {
            console.error('Cold start exceeded 500 ms budget');
            process.exit(1);
          }
        "
```

## Job placement

Insert after the existing `test-layers` job (after line 88). The job depends on `pnpm install`, which `test-layers` also uses — no need to repeat Node setup boilerplate beyond what's shown.

## Runner cost / latency budget

| Runner | Approximate cost (per minute) | Approximate job duration |
|---|---|---|
| `ubuntu-latest` | $0.008 | ~90 s (smoke tests) |
| `macos-latest` (arm64) | $0.08 | ~120 s |
| `macos-13` (x64) | $0.08 | ~120 s |
| `ubuntu-24.04-arm` | $0.008 | ~120 s (or longer if Java rebuilds from source) |

**Estimated total per PR**: ~$0.40. **Acceptable** for the safety it buys (catching platform-specific native binding regressions before merge).

## Alternative: lighter matrix

If cost is a concern, start with **3 platforms**:

```yaml
matrix:
  include:
    - { os: ubuntu-latest, label: linux-x64 }
    - { os: macos-latest, label: darwin-arm64 }
    - { os: ubuntu-24.04-arm, label: linux-arm64 }
```

Drop `macos-13` (Intel macOS). Add it back if a user reports issues there.

## Triggering scope (path filter)

Use GitHub Actions' `paths` filter so the matrix only runs when tree-sitter code or fixtures change:

```yaml
on:
  push:
    branches: [main, feature/*]
    paths:
      - 'packages/runtime-adapters/src/treesitter/**'
      - 'packages/runtime-adapters/package.json'
      - 'tests/fixtures/treesitter/**'
      - 'tests/unit/treesitter-*.test.mjs'
  pull_request:
    branches: [main]
    paths:
      - 'packages/runtime-adapters/src/treesitter/**'
      - 'packages/runtime-adapters/package.json'
      - 'tests/fixtures/treesitter/**'
      - 'tests/unit/treesitter-*.test.mjs'
```

This keeps existing CI surface unchanged for non-tree-sitter PRs.

## Risk: macOS runner image vs. tree-sitter prebuilds

`macos-latest` (Apple Silicon) and `macos-13` (Intel) runners **do** have `xcode-select` and the C++ toolchain. If a prebuild is missing for the runner's arch, `node-gyp` can rebuild from source — but this:

1. Adds 60–120 s to job duration.
2. Requires `pnpm install` to NOT pass `--frozen-lockfile` for that one case (rebuild path produces a `.node` file outside the lockfile's expectations).

Mitigation: in the install step, allow fallback rebuild:

```yaml
- name: Install dependencies (allow tree-sitter rebuild fallback)
  run: pnpm install --no-frozen-lockfile
```

Only on the matrix job; the main `test-layers` job keeps `--frozen-lockfile` for reproducibility.

## Acceptance

The matrix proposal lands when:

- [ ] `treesitter-platform-matrix` job is added to `.github/workflows/ci.yml`.
- [ ] At least 3 platforms are exercised (linux-x64, darwin-arm64, linux-arm64).
- [ ] Cold-start budget check (< 500 ms) is in the job.
- [ ] Path filter restricts the job to tree-sitter-related changes.
- [ ] CI green on at least one of the non-default platforms before merge (proves the prebuilds actually exist).

## What this does NOT cover

- **Bun**: native `tree-sitter` doesn't load under Bun. WASM escape hatch is a v1.1+ feature.
- **Windows ARM64**: not in scope; dapei's `engines` and CI runners are Unix-focused.
- **Source-build fallback path**: tested implicitly when a prebuild is missing, but not asserted as a contract. If a user reports `node-gyp` failures on an exotic arch, that's a v1.1 issue.