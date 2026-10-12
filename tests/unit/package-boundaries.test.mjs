// Package boundary enforcement.
//
// The six `packages/*` entry points are real workspace packages: every
// cross-package reference must go through the package name (`@dapei/...`)
// and every package's `exports` map is the only way in. These tests read
// the real manifests and sources, so a new `../`-style import, a missing
// `exports` entry, a dependency cycle, or a declared-but-unused dependency
// fails here instead of surfacing as a confusing resolution error later.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');

const PACKAGE_NAMES = ['core', 'cdr', 'catalog', 'doc-gen', 'router', 'runtime-adapters'];

const SCANNABLE = /\.(?:ts|mts|cts|mjs|cjs|js)$/;

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (SCANNABLE.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Every module specifier a source file can carry: static `import ... from`,
 * bare `import`, `export ... from`, dynamic `import(...)`, and `require(...)`.
 */
function specifiersOf(source) {
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g;
  return [...source.matchAll(re)].map((match) => match[2]);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

const manifests = new Map(
  PACKAGE_NAMES.map((name) => [name, readJson(join(PACKAGES_DIR, name, 'package.json'))])
);
const rootManifest = readJson(join(REPO_ROOT, 'package.json'));

function dapeiDependencies(manifest) {
  const all = { ...manifest.dependencies, ...manifest.devDependencies };
  return Object.keys(all).filter((name) => name.startsWith('@dapei/')).sort();
}

const BARE_SPEC = /^@dapei\/([a-z0-9-]+)(\/.*)?$/;

test('package sources never import outside their own package with a relative path', () => {
  const offenders = [];
  for (const pkg of PACKAGE_NAMES) {
    const pkgDir = join(PACKAGES_DIR, pkg);
    const srcDir = join(pkgDir, 'src');
    for (const file of listFiles(srcDir)) {
      for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
        if (!spec.startsWith('.')) continue;
        const target = resolve(dirname(file), spec);
        const rel = relative(pkgDir, target);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          offenders.push(
            `${relative(REPO_ROOT, file)}: relative import "${spec}" escapes packages/${pkg}/`
          );
        }
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('tests and scripts never reach a package through a relative path', () => {
  const offenders = [];
  const quoted = /(['"`])([^'"`\n]*)\1/g;
  for (const dir of ['tests', 'scripts']) {
    for (const file of listFiles(join(REPO_ROOT, dir))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(quoted)) {
        if (/(?:\.\.\/)+packages\//.test(match[2])) {
          offenders.push(
            `${relative(REPO_ROOT, file)}: "${match[2]}" references a package by relative path`
          );
        }
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('every @dapei import is a declared dependency with an exported subpath', () => {
  const offenders = [];
  const check = (file, spec, deps) => {
    const match = BARE_SPEC.exec(spec);
    const where = `${relative(REPO_ROOT, file)}: "${spec}"`;
    if (!match) {
      offenders.push(`${where} is not a valid @dapei/<package>[/subpath] specifier`);
      return;
    }
    const name = match[1];
    if (!PACKAGE_NAMES.includes(name)) {
      offenders.push(`${where} names an unknown package @dapei/${name}`);
      return;
    }
    if (!Object.hasOwn(deps, `@dapei/${name}`)) {
      offenders.push(`${where} is not declared in dependencies of its importer`);
    }
    const exportsMap = manifests.get(name).exports ?? {};
    const subpath = match[2] ? `.${match[2]}` : '.';
    if (!Object.hasOwn(exportsMap, subpath)) {
      offenders.push(`${where} needs "${subpath}" in @dapei/${name}'s exports map`);
    }
  };

  for (const pkg of PACKAGE_NAMES) {
    const deps = manifests.get(pkg).dependencies ?? {};
    for (const file of listFiles(join(PACKAGES_DIR, pkg, 'src'))) {
      for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
        if (spec.startsWith('@dapei/')) check(file, spec, deps);
      }
    }
  }

  const rootDeps = rootManifest.devDependencies ?? {};
  for (const dir of ['engine', 'tests']) {
    for (const file of listFiles(join(REPO_ROOT, dir))) {
      for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
        if (spec.startsWith('@dapei/')) check(file, spec, rootDeps);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test('the package dependency graph is acyclic', () => {
  const graph = new Map(
    PACKAGE_NAMES.map((name) => [name, dapeiDependencies(manifests.get(name))])
  );
  const state = new Map();
  const stack = [];
  const cycles = [];

  const visit = (name) => {
    state.set(name, 'visiting');
    stack.push(name);
    for (const dep of graph.get(name) ?? []) {
      const bare = dep.slice('@dapei/'.length);
      if (!graph.has(bare)) continue;
      if (state.get(bare) === 'visiting') {
        cycles.push([...stack.slice(stack.indexOf(bare)), bare].join(' -> '));
      } else if (state.get(bare) !== 'done') {
        visit(bare);
      }
    }
    stack.pop();
    state.set(name, 'done');
  };

  for (const name of PACKAGE_NAMES) if (state.get(name) !== 'done') visit(name);
  assert.deepEqual(cycles, [], `dependency cycle(s): ${cycles.join('; ')}`);
});

test('no declared @dapei dependency is unused', () => {
  for (const pkg of PACKAGE_NAMES) {
    const declared = dapeiDependencies(manifests.get(pkg));
    const srcDir = join(PACKAGES_DIR, pkg, 'src');
    const used = new Set();
    for (const file of listFiles(srcDir)) {
      for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
        const match = BARE_SPEC.exec(spec);
        if (match) used.add(match[1]);
      }
    }
    const unused = declared
      .map((dep) => dep.slice('@dapei/'.length))
      .filter((name) => !used.has(name));
    assert.deepEqual(
      unused,
      [],
      `packages/${pkg} declares unused @dapei dependencies: ${unused.join(', ')}`
    );
  }
});
