import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSkillsDir, validateCommandsDir } from "../../scripts/validate-skills.mjs";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "skills-test-"));
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  };
}

test("validator: errors when SKILL.md is missing", () => {
  const { dir, cleanup } = setup();
  try {
    mkdirSync(join(dir, "broken"), { recursive: true });
    const result = validateSkillsDir(dir);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].message, /SKILL\.md/);
  } finally {
    cleanup();
  }
});

test("validator: errors when frontmatter is missing", () => {
  const { dir, cleanup } = setup();
  try {
    mkdirSync(join(dir, "noframe"), { recursive: true });
    writeFileSync(join(dir, "noframe/SKILL.md"), "# Just a heading\nbody text");
    const result = validateSkillsDir(dir);
    assert.ok(result.errors.some(e => e.path.endsWith("noframe/SKILL.md") && /frontmatter/.test(e.message)));
  } finally {
    cleanup();
  }
});

test("validator: errors when name does not match directory", () => {
  const { dir, cleanup } = setup();
  try {
    mkdirSync(join(dir, "real-name"), { recursive: true });
    writeFileSync(join(dir, "real-name/SKILL.md"), "---\nname: wrong-name\ndescription: x. Use when y.\n---\n# X");
    const result = validateSkillsDir(dir);
    assert.ok(result.errors.some(e => /name.*match.*directory/i.test(e.message)));
  } finally {
    cleanup();
  }
});

test("validator: errors when description has no 'Use when' phrase", () => {
  const { dir, cleanup } = setup();
  try {
    mkdirSync(join(dir, "skill-a"), { recursive: true });
    writeFileSync(join(dir, "skill-a/SKILL.md"), "---\nname: skill-a\ndescription: Just a thing.\n---\n# A");
    const result = validateSkillsDir(dir);
    assert.ok(result.warnings.some(w => /use when/i.test(w.message)));
  } finally {
    cleanup();
  }
});

test("validator: passes when frontmatter is well-formed", () => {
  const { dir, cleanup } = setup();
  try {
    mkdirSync(join(dir, "good"), { recursive: true });
    writeFileSync(join(dir, "good/SKILL.md"), "---\nname: good\ndescription: Does X. Use when X, Y, or Z.\n---\n# Body has fifty plus words goes here in body to satisfy any word count rule. Add more words. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Add even more words for good measure.");
    const result = validateSkillsDir(dir);
    assert.equal(result.errors.length, 0);
  } finally {
    cleanup();
  }
});

test("validator: warns on overly long body (> 3000 words)", () => {
  const { dir, cleanup } = setup();
  try {
    mkdirSync(join(dir, "long"), { recursive: true });
    const longBody = "word ".repeat(3100);
    writeFileSync(join(dir, "long/SKILL.md"), `---\nname: long\ndescription: Long thing. Use when long.\n---\n# Long\n${longBody}`);
    const result = validateSkillsDir(dir);
    assert.ok(result.warnings.some(w => /progressive disclosure|word/i.test(w.message)));
  } finally {
    cleanup();
  }
});

test("validator: errors when a referenced capability id does not exist", () => {
  const { dir, cleanup } = setup();
  try {
    mkdirSync(join(dir, "refs"), { recursive: true });
    writeFileSync(join(dir, "refs/SKILL.md"), "---\nname: refs\ndescription: x. Use when y.\n---\n`runCapability('does.not.exist')` is referenced.");
    const knownCapabilities = new Set(["cdr.profile", "feature.create"]);
    const result = validateSkillsDir(dir, { knownCapabilities });
    assert.ok(result.warnings.some(w => /does\.not\.exist/.test(w.message)));
  } finally {
    cleanup();
  }
});

test("validator: validates plugin.json manifest when present", () => {
  const { dir, cleanup } = setup();
  try {
    const skillDir = join(dir, "with-manifest");
    mkdirSync(join(skillDir, ".claude-plugin"), { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: with-manifest\ndescription: x. Use when y.\n---\n# X body has at least fifty words to satisfy the validator. Add more lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore.");
    writeFileSync(join(skillDir, ".claude-plugin/plugin.json"), JSON.stringify({
      name: "with-manifest",
      version: "1.2.3",
      description: "Test manifest"
    }));
    const result = validateSkillsDir(dir);
    assert.equal(result.errors.length, 0);
  } finally {
    cleanup();
  }
});

test("validator: errors when plugin.json name does not match skill", () => {
  const { dir, cleanup } = setup();
  try {
    const skillDir = join(dir, "mismatch");
    mkdirSync(join(skillDir, ".claude-plugin"), { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: mismatch\ndescription: x. Use when y.\n---\n# X body has at least fifty words to satisfy the validator. Add more lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore.");
    writeFileSync(join(skillDir, ".claude-plugin/plugin.json"), JSON.stringify({
      name: "wrong-name",
      version: "1.0.0",
      description: "x"
    }));
    const result = validateSkillsDir(dir);
    assert.ok(result.errors.some(e => e.path.endsWith("plugin.json") && /name.*match/i.test(e.message)));
  } finally {
    cleanup();
  }
});

test("validator: errors when command has no frontmatter", () => {
  const { dir, cleanup } = setup();
  try {
    const cmdDir = join(dir, "..", "commands-test-" + Math.random().toString(36).slice(2));
    mkdirSync(cmdDir, { recursive: true });
    writeFileSync(join(cmdDir, "bad.md"), "# no frontmatter\nbody");
    const result = validateCommandsDir(cmdDir);
    assert.ok(result.errors.some(e => /frontmatter/.test(e.message)));
    rmSync(cmdDir, { recursive: true, force: true });
  } finally {
    cleanup();
  }
});

test("validator: warns when command has no argument-hint", () => {
  const { dir, cleanup } = setup();
  try {
    const cmdDir = join(dir, "..", "commands-test-" + Math.random().toString(36).slice(2));
    mkdirSync(cmdDir, { recursive: true });
    writeFileSync(join(cmdDir, "no-hint.md"), "---\ndescription: A command\n---\n# body content goes here with at least fifty words to satisfy the validator check on body content. Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore.");
    const result = validateCommandsDir(cmdDir);
    assert.ok(result.warnings.some(w => /argument-hint/.test(w.message)));
    rmSync(cmdDir, { recursive: true, force: true });
  } finally {
    cleanup();
  }
});
