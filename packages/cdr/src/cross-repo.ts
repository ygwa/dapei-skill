import { existsSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { CapabilityError } from "@dapei/core/types";
import { cognitivePaths, loadCognitiveIndex } from "@dapei/core/cognitive-index";
import { parseYamlDocument, stringifyYamlDocument, type YamlValue } from "@dapei/core/yaml-doc";
import { ensureDir, read, write, workspacePaths, listFilesRecursively } from "@dapei/runtime-adapters/system";
import type { AnyCap } from "./internal/shared.ts";

// ---------------------------------------------------------------------------
// 12. cdr.business.cross_link — v0.5
//
// Pure read-only computation: scan all business-rules, resolve their
// `applies_to[]` against the cognitive index, and emit a cross-repo view
// at `docs/as-is/cross-repo/cross-links.yaml`. Groups by `kind` so a
// reader can see all `compensation` rules or all `sla` rules in one place.
//
// This is the engine's answer to "what business relationships span
// multiple repos?" — answered by walking the evidence-backed rule
// artifacts the AI has already written, not by guessing from event
// names or by static call-graph analysis (which is the CodeGraph v1.0
// job, not v0.5).
//
// P1 red line: this capability only reads. It does not write behavior,
// business-rule, or index entries. It does not need evidence validation.
// ---------------------------------------------------------------------------

const CROSS_REPO_KINDS = new Set([
  "invariant",
  "constraint",
  "authorization",
  "sla",
  "compensation"
]);

interface CrossLinkRule {
  id: string;
  kind: string;
  description: string;
  applies_to: Array<{ behavior: string; repo: string | undefined }>;
  covered_repos: string[];
  evidence_kind: string;
  evidence_level: string;
}

export const cdrBusinessCrossLink: AnyCap = {
  id: "cdr.business.crosslink",
  version: "1.0.0",
  inputSchema: {
    properties: {
      min_confidence: { type: "string", enum: ["low", "medium", "high"] },
      kinds: { type: "array" },
      include_intra_repo: { type: "boolean" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const cp = cognitivePaths(ctx.rootDir);
    const index = loadCognitiveIndex(ctx.rootDir);

    const minConfidence = typeof input.min_confidence === "string"
      ? String(input.min_confidence)
      : "low";
    const confidenceRank: Record<string, number> = { low: 0, medium: 1, high: 2 };
    const minRank = confidenceRank[minConfidence] ?? 0;

    const allowedKinds = Array.isArray(input.kinds) && input.kinds.length > 0
      ? new Set((input.kinds as unknown[]).map((k) => String(k)).filter((k) => CROSS_REPO_KINDS.has(k)))
      : CROSS_REPO_KINDS;

    const includeIntraRepo = input.include_intra_repo === true;

    if (!existsSync(cp.businessRulesDir)) {
      // No business rules yet — emit an empty cross-link view so the
      // caller still has a well-formed file to render. An empty workspace
      // is a legitimate state, not an error.
      const emptyOutDir = join(cp.docsDir, "as-is", "cross-repo");
      ensureDir(emptyOutDir);
      const emptyOutFile = join(emptyOutDir, "cross-links.yaml");
      const emptyDoc: Record<string, YamlValue> = {
        generated_at: ctx.now.toISOString(),
        product: cp.workspaceName,
        total_rules: 0,
        cross_repo_rules: 0,
        intra_repo_rules: 0,
        groups: [] as unknown as YamlValue,
        filter: {
          min_confidence: minConfidence,
          kinds: [...allowedKinds],
          include_intra_repo: includeIntraRepo
        }
      };
      const emptyContent = stringifyYamlDocument(emptyDoc);
      write(emptyOutFile, emptyContent.endsWith("\n") ? emptyContent : `${emptyContent}\n`);
      return {
        ok: true,
        data: {
          path: relative(ctx.rootDir, emptyOutFile),
          total_rules: 0,
          cross_repo_rules: 0,
          intra_repo_rules: 0,
          by_kind: {},
          rules: [],
          skipped: []
        },
        sideEffects: [`cross-link view written: ${relative(ctx.rootDir, emptyOutFile)}`],
        reportFragments: ["no business rules indexed yet — emitted empty cross-link view"]
      };
    }

    const ruleFiles = listFilesRecursively(cp.businessRulesDir, [".yaml", ".yml"], 200);
    const skipped: Array<{ file: string; reason: string }> = [];
    const rules: CrossLinkRule[] = [];

    for (const rf of ruleFiles) {
      if (basename(rf).startsWith("_")) continue;
      let doc: Record<string, unknown>;
      try {
        doc = parseYamlDocument(read(rf)) as Record<string, unknown>;
      } catch (e) {
        skipped.push({ file: relative(ctx.rootDir, rf), reason: "unparseable" });
        continue;
      }

      const id = String(doc.id || basename(rf, ".yaml"));
      const kind = String(doc.kind || "unknown");
      if (!allowedKinds.has(kind)) {
        skipped.push({ file: relative(ctx.rootDir, rf), reason: `kind ${kind} not in filter` });
        continue;
      }
      const confidence = doc.confidence as { kind?: string; level?: string } | undefined;
      const evidenceKind = String(confidence?.kind || "unknown");
      const evidenceLevel = String(confidence?.level || "unknown");
      if ((confidenceRank[evidenceLevel] ?? 0) < minRank) {
        skipped.push({ file: relative(ctx.rootDir, rf), reason: `confidence ${evidenceLevel} < ${minConfidence}` });
        continue;
      }

      const rawAppliesTo = Array.isArray(doc.applies_to) ? doc.applies_to : [];
      const appliesTo: Array<{ behavior: string; repo: string | undefined }> = [];
      const coveredRepos = new Set<string>();

      for (const raw of rawAppliesTo) {
        const bid = String(raw);
        // Resolve the behavior id against the cognitive index to recover
        // the repo. If the behavior is unknown to the index (e.g., it was
        // written under a different id scheme) we still keep the link —
        // the rule's applies_to is what it is — but the repo stays
        // undefined for the unknown id and is reported in skipped.
        const matched = index.behaviors.find((b) => b.id === bid);
        if (matched) {
          appliesTo.push({ behavior: bid, repo: matched.repo });
          if (matched.repo) coveredRepos.add(matched.repo);
        } else {
          appliesTo.push({ behavior: bid, repo: undefined });
          skipped.push({ file: relative(ctx.rootDir, rf), reason: `applies_to id '${bid}' not in cognitive index` });
        }
      }

      const isCrossRepo = coveredRepos.size > 1;
      const isIntraRepo = coveredRepos.size === 1;
      if (!isCrossRepo && !isIntraRepo) continue;
      if (!includeIntraRepo && isIntraRepo) continue;

      rules.push({
        id,
        kind,
        description: String(doc.description || doc.expr || ""),
        applies_to: appliesTo,
        covered_repos: [...coveredRepos].sort(),
        evidence_kind: evidenceKind,
        evidence_level: evidenceLevel
      });
    }

    rules.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return a.id.localeCompare(b.id);
    });

    const crossRepoRules = rules.filter((r) => r.covered_repos.length > 1);
    const intraRepoRules = rules.filter((r) => r.covered_repos.length <= 1);

    const byKind: Record<string, number> = {};
    for (const r of rules) byKind[r.kind] = (byKind[r.kind] || 0) + 1;

    // Derive product name from workspace.yaml if present, else fall back
    // to the workspace's directory name.
    const wsFile = join(cp.dapeiDir, "workspace.yaml");
    let product = cp.workspaceName;
    if (existsSync(wsFile)) {
      try {
        const wsDoc = parseYamlDocument(read(wsFile));
        const ws = wsDoc.workspace as Record<string, unknown> | undefined;
        if (ws && typeof ws.name === "string") product = String(ws.name);
      } catch {
      }
    }

    const groups: Array<{ kind: string; rules: CrossLinkRule[] }> = [];
    for (const r of rules) {
      const g = groups.find((x) => x.kind === r.kind);
      if (g) g.rules.push(r);
      else groups.push({ kind: r.kind, rules: [r] });
    }

    const outDir = join(cp.docsDir, "as-is", "cross-repo");
    ensureDir(outDir);
    const outFile = join(outDir, "cross-links.yaml");
    const outDoc: Record<string, YamlValue> = {
      generated_at: ctx.now.toISOString(),
      product,
      total_rules: rules.length,
      cross_repo_rules: crossRepoRules.length,
      intra_repo_rules: intraRepoRules.length,
      groups: groups as unknown as YamlValue,
      filter: {
        min_confidence: minConfidence,
        kinds: [...allowedKinds],
        include_intra_repo: includeIntraRepo
      }
    };
    const content = stringifyYamlDocument(outDoc);
    write(outFile, content.endsWith("\n") ? content : `${content}\n`);

    return {
      ok: true,
      data: {
        path: relative(ctx.rootDir, outFile),
        total_rules: rules.length,
        cross_repo_rules: crossRepoRules.length,
        intra_repo_rules: intraRepoRules.length,
        by_kind: byKind,
        rules,
        skipped
      },
      sideEffects: [`cross-link view written: ${relative(ctx.rootDir, outFile)}`],
      reportFragments: [
        `cross-linked ${rules.length} rule(s) (${crossRepoRules.length} cross-repo, ${intraRepoRules.length} intra-repo)`,
        skipped.length
          ? `${skipped.length} rule(s) skipped — see report for reasons`
          : "no rules skipped"
      ]
    };
  }
};

// ---------------------------------------------------------------------------
// 13. cdr.cross_repo.doc.generate — v0.5
//
// Read the cross-link view written by cdr.business.cross_link and emit a
// VitePress section at <output>/cross-repo/. The section is a peer of
// the existing /behaviors/ /domains/ etc. sections and uses the same
// Vue 3 components already in the per-portal theme.
//
// The page set:
//   cross-repo/index.md            — overview grouped by kind
//   cross-repo/<rule-id>.md        — one page per cross-repo rule
//   cross-repo/event-graph.md      — single Mermaid diagram of all
//                                    cross-repo relationships
//
// Does not touch the doc-gen package or its existing sections. The
// caller is expected to have run cdr.business.cross_link first; if the
// cross-links.yaml file is missing, this capability fails fast with a
// clear error pointing the caller at the missing capability.
// ---------------------------------------------------------------------------

function crossLinkRuleIdSlug(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function crossLinkRuleToMermaidEdge(rule: CrossLinkRule): string[] {
  const lines: string[] = [];
  for (let i = 0; i < rule.applies_to.length - 1; i++) {
    const a = rule.applies_to[i];
    const b = rule.applies_to[i + 1];
    const aId = `${a.behavior}@${a.repo || "?"}`;
    const bId = `${b.behavior}@${b.repo || "?"}`;
    const aSafe = aId.replace(/[^a-zA-Z0-9_]/g, "_");
    const bSafe = bId.replace(/[^a-zA-Z0-9_]/g, "_");
    lines.push(`  ${aSafe}["${aId}"] -- "${rule.kind}: ${rule.id}" --> ${bSafe}["${bId}"]`);
  }
  return lines;
}

function crossLinkRuleToMermaidSubgraph(rule: CrossLinkRule): string[] {
  const repoGroups = new Map<string, string[]>();
  for (const a of rule.applies_to) {
    const repo = a.repo || "unknown";
    if (!repoGroups.has(repo)) repoGroups.set(repo, []);
    repoGroups.get(repo)!.push(a.behavior);
  }
  const lines: string[] = [];
  for (const [repo, behaviors] of repoGroups.entries()) {
    lines.push(`  subgraph ${repo.replace(/[^a-zA-Z0-9_]/g, "_")}`);
    for (const b of behaviors) {
      const nodeId = `${b}@${repo}`.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`    ${nodeId}["${b}@${repo}"]`);
    }
    lines.push("  end");
  }
  lines.push(...crossLinkRuleToMermaidEdge(rule));
  return lines;
}

export const cdrCrossRepoDocGenerate: AnyCap = {
  id: "cdr.crossrepo.doc.generate",
  version: "1.0.0",
  inputSchema: {
    properties: {
      output_dir: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const p = workspacePaths(ctx.rootDir);
    const cp = cognitivePaths(ctx.rootDir);
    const outputDir = join(p.rootDir, typeof input.output_dir === "string" ? String(input.output_dir) : ".dapei/docs-portal");

    const crossLinksFile = join(cp.docsDir, "as-is", "cross-repo", "cross-links.yaml");
    if (!existsSync(crossLinksFile)) {
      throw new CapabilityError(
        "FILE_MISSING",
        `${relative(ctx.rootDir, crossLinksFile)} not found — run cdr.business.cross_link first`
      );
    }

    const crossLinksDoc = parseYamlDocument(read(crossLinksFile)) as Record<string, unknown>;
    const groups = (Array.isArray(crossLinksDoc.groups) ? crossLinksDoc.groups : []) as Array<{ kind: string; rules: CrossLinkRule[] }>;
    const product = String(crossLinksDoc.product || p.workspaceName);

    const sectionDir = join(outputDir, "cross-repo");
    ensureDir(sectionDir);

    let indexMd = `---
title: Cross-Repo Business Rules
---

# Cross-Repo Business Rules

> Auto-generated from business-rule artifacts. Each rule here was authored by the AI, validated by the engine (P1 red line: \`kind=fact\` requires \`sources[]\`), and clustered here because it spans more than one repository.

- **Product:** ${product}
- **Generated:** ${String(crossLinksDoc.generated_at || "")}
- **Total rules:** ${String(crossLinksDoc.total_rules || 0)}
- **Cross-repo:** ${String(crossLinksDoc.cross_repo_rules || 0)}
- **Intra-repo (filtered out):** ${String(crossLinksDoc.intra_repo_rules || 0)}

## Grouped by kind

`;

    for (const g of groups) {
      indexMd += `### ${g.kind} (${g.rules.length})\n\n`;
      for (const r of g.rules) {
        indexMd += `- [${r.id}](/cross-repo/${crossLinkRuleIdSlug(r.id)}) — spans ${r.covered_repos.join(", ")}\n`;
      }
      indexMd += "\n";
    }

    indexMd += `## Event Graph (cross-repo only)\n\n`;
    indexMd += "```mermaid\ngraph LR\n";
    for (const g of groups) {
      for (const r of g.rules) {
        if (r.covered_repos.length > 1) {
          indexMd += crossLinkRuleToMermaidSubgraph(r).join("\n") + "\n";
        }
      }
    }
    indexMd += "```\n";

    write(join(sectionDir, "index.md"), indexMd);

    for (const g of groups) {
      for (const r of g.rules) {
        const slug = crossLinkRuleIdSlug(r.id);
        let md = `---
title: "${r.id}"
---

# ${r.id}

- **Kind:** \`${r.kind}\`
- **Confidence:** ${r.evidence_kind} (${r.evidence_level})
- **Covered repos:** ${r.covered_repos.map((r) => `\`${r}\``).join(", ")}

${r.description}

## Applies To

| Behavior | Repo |
|----------|------|
${r.applies_to.map((a) => `| \`${a.behavior}\` | ${a.repo ? `\`${a.repo}\`` : "_(unknown — not in cognitive index)_"} |`).join("\n")}

## Mermaid

\`\`\`mermaid
graph LR
${crossLinkRuleToMermaidSubgraph(r).join("\n")}
\`\`\`
`;
        write(join(sectionDir, `${slug}.md`), md);
      }
    }

    return {
      ok: true,
      data: {
        output_dir: typeof input.output_dir === "string" ? String(input.output_dir) : ".dapei/docs-portal",
        section: "cross-repo",
        pages_generated: 1 + groups.reduce((sum, g) => sum + g.rules.length, 0),
        rules_rendered: groups.reduce((sum, g) => sum + g.rules.length, 0)
      },
      sideEffects: ["cross-repo portal section generated"],
      reportFragments: [`generated cross-repo portal section under ${relative(p.rootDir, sectionDir)}`]
    };
  }
};
