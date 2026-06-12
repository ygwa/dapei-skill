import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SKILLS_DIR = join(REPO_ROOT, 'skills');

test('documentation-contract: all SKILL.md files contain @dapei user entry point', () => {
  const skillDirs = readdirSync(SKILLS_DIR).filter(f => {
    const p = join(SKILLS_DIR, f, 'SKILL.md');
    return existsSync(p);
  });

  assert.ok(skillDirs.length > 0, 'should have SKILL.md files');

  for (const skillDir of skillDirs) {
    const content = readFileSync(join(SKILLS_DIR, skillDir, 'SKILL.md'), 'utf8');
    assert.ok(content.includes('@dapei'), `${skillDir}/SKILL.md should contain @dapei user entry`);
  }
});

test('documentation-contract: each SKILL.md has user entry examples', () => {
  for (const skillName of readdirSync(SKILLS_DIR)) {
    const skillMdPath = join(SKILLS_DIR, skillName, 'SKILL.md');
    if (!existsSync(skillMdPath)) continue;

    const content = readFileSync(skillMdPath, 'utf8');

    // Should have a "用户入口" or "user entry" section with @dapei commands
    const hasUserSection = content.includes('用户入口') || content.includes('## User') || content.includes('## Usage');
    assert.ok(hasUserSection, `${skillName}/SKILL.md should have user entry section`);

    // Should contain at least one @dapei invocation
    const dapeiMatches = content.match(/@dapei\s+\w+/g);
    assert.ok(dapeiMatches && dapeiMatches.length > 0, `${skillName}/SKILL.md should have @dapei commands`);
  }
});

test('documentation-contract: SKILL.md references match capability implementations', () => {
  // Capability IDs that are implemented (extracted from source)
  const implementedCaps = new Set([
    'workspace.init', 'workspace.report', 'workspace.validate', 'workspace.status',
    'feature.create', 'feature.status', 'feature.stage', 'feature.tasks', 'feature.review', 'feature.close', 'feature.guardrail', 'feature.report',
    'repos.add', 'repos.analyze', 'repos.sync', 'repos.list', 'repos.check', 'repos.remove',
    'context.build', 'cognitive.discover', 'cognitive.artifact.list', 'cognitive.artifact.upsert',
    'validation.run', 'validation.detect', 'validation.execute', 'validation.report', 'workflow.runStage', 'workflow.status', 'memory.append', 'audit.query',
    'cdr.profile', 'cdr.entries', 'cdr.domain', 'cdr.capability', 'cdr.index', 'cdr.doc', 'cdr.behavior', 'cdr.state', 'cdr.business'
  ]);

  for (const skillName of readdirSync(SKILLS_DIR)) {
    const skillMdPath = join(SKILLS_DIR, skillName, 'SKILL.md');
    if (!existsSync(skillMdPath)) continue;

    const content = readFileSync(skillMdPath, 'utf8');
    // Extract capability IDs referenced in backticks (e.g., `workspace.init`, `feature.create`)
    const capRefs = [...content.matchAll(/`([a-z]+\.[a-z]+)`/g)].map(m => m[1]);

    // Each referenced capability should be implemented (ignore common false positives)
    for (const ref of capRefs) {
      if (['package.json', 'feature.yaml', 'workspace.yaml', 'repos.yaml', 'repo.yaml', 'pom.xml', 'package-lock.json', 'tsconfig.json', 'go.mod', 'go.sum', 'agents.md', 'README.md', 'index.yaml', 'cognitive.yaml', 'commands.yaml', 'feature.schema.yaml', 'repos.schema.yaml', 'domain.yaml'].includes(ref)) continue;
      assert.ok(implementedCaps.has(ref), `${skillName}/SKILL.md references ${ref} which is not a known capability`);
    }
  }
});