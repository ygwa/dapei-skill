import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { CapabilityError } from "@dapei/core/types";
import { cognitivePaths } from "@dapei/core/cognitive-index";
import { parseYamlDocument } from "@dapei/core/yaml-doc";
import { ensureDir, read, write, workspacePaths } from "@dapei/runtime-adapters/system";
import type { AnyCap } from "./internal/shared.ts";

// ---------------------------------------------------------------------------
// 17. cdr.reverse_cluster.doc.generate — v0.8
//
// Renders the L1 capability map and the cluster-suggestions report to the
// VitePress portal under <output>/l1/. Peer of v0.5's
// `cdr.crossrepo.doc.generate` (which renders cross-repo business rules
// at /cross-repo/). The two sections are siblings and use the same Vue
// 3 components already shipped in the per-portal theme.
//
// Page set:
//   l1/index.md                 — L1 overview + Mermaid total graph
//   l1/<capability-id>.md       — one page per capability
//   l1/cluster-suggestions.md   — the cdr.domain.suggest output, rendered
//                                 for the AI to consult when authoring
//                                 cdr.domain.compose calls.
//
// The capability NEVER re-runs cdr.capability.map.synth or
// cdr.domain.suggest. It only reads the artifacts those capabilities
// already wrote. If the product-map is missing, the capability fails
// fast with a clear pointer at cdr.capability.map.synth.
// ---------------------------------------------------------------------------

function l1CapabilitySlug(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function l1CapabilityToMermaidSubgraph(cap: Record<string, unknown>): string[] {
  const id = String(cap.id || "");
  const name = String(cap.name || id);
  const safe = id.replace(/[^a-zA-Z0-9_]/g, "_");
  const lines: string[] = [];
  lines.push(`  subgraph ${safe}["${name}"]`);
  const repos = Array.isArray(cap.spans_repos) ? (cap.spans_repos as unknown[]).map((r) => String(r)) : [];
  if (repos.length === 0) {
    lines.push(`    ${safe}_empty["(no repos)"]`);
  } else {
    for (const repo of repos) {
      const safeRepo = repo.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`    ${safe}_${safeRepo}["${repo}"]`);
    }
  }
  lines.push("  end");
  return lines;
}

function l1CapabilitiesToMermaidTotalGraph(capabilities: Array<Record<string, unknown>>): string {
  if (capabilities.length === 0) return "graph TD\n  empty[No capabilities synthesized yet]";
  const lines: string[] = ["graph TD"];
  for (const cap of capabilities) {
    lines.push(...l1CapabilityToMermaidSubgraph(cap));
  }
  return lines.join("\n");
}

export const cdrReverseClusterDocGenerate: AnyCap = {
  id: "cdr.reversecluster.doc.generate",
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

    const productMapFile = join(cp.docsDir, "as-is", "capabilities", "product-map.yaml");
    if (!existsSync(productMapFile)) {
      throw new CapabilityError(
        "FILE_MISSING",
        `${relative(ctx.rootDir, productMapFile)} not found — run cdr.capability.map.synth first`
      );
    }

    const productMapDoc = parseYamlDocument(read(productMapFile)) as Record<string, unknown>;
    const product = String(productMapDoc.product || p.workspaceName);
    const isEmpty = String(productMapDoc.status || "") === "empty";
    const rawCaps = Array.isArray(productMapDoc.capabilities) ? productMapDoc.capabilities : [];

    const sectionDir = join(outputDir, "l1");
    ensureDir(sectionDir);

    let indexMd = `---
title: L1 Capability Map
---

# L1 Capability Map

> Auto-generated from \`docs/as-is/capabilities/product-map.yaml\` (synthesized via \`cdr.capability.map.synth\`). Each capability here was either authored by the AI (manual mode) or synthesized by the engine from composed/suggested domains, with spans_repos / behavior_count / fact_ratio back-filled from the cognitive index.

- **Product:** ${product}
- **Generated:** ${String(productMapDoc.generated_at || "")}
- **Synthesized by:** ${String(productMapDoc.synthesized_by || "—")}
- **Capability count:** ${rawCaps.length}

## Total Graph

\`\`\`mermaid
${l1CapabilitiesToMermaidTotalGraph(rawCaps as Array<Record<string, unknown>>)}
\`\`\`

## Capabilities

| ID | Spans Repos | Behavior Count | Fact Ratio | Source |
|----|-------------|----------------|------------|--------|
`;

    if (isEmpty) {
      indexMd += `| _none yet_ | — | — | — | — |\n\n`;
      indexMd += `> **Status:** empty — ${String(productMapDoc.message || "no domains composed yet")}.\n\n`;
    } else {
      for (const cap of rawCaps) {
        const id = String(cap.id || "(missing id)");
        const repos = Array.isArray(cap.spans_repos) ? (cap.spans_repos as unknown[]).map((r) => String(r)).join(", ") || "—" : "—";
        const count = cap.behavior_count !== undefined ? String(cap.behavior_count) : "—";
        const ratio = cap.fact_ratio !== undefined ? String(cap.fact_ratio) : "—";
        const source = String(cap.source || "—");
        indexMd += `| [\`${id}\`](/l1/${l1CapabilitySlug(id)}) | ${repos} | ${count} | ${ratio} | ${source} |\n`;
      }
    }

    indexMd += `\n## How this was synthesized\n\n`;
    indexMd += `- **Source:** \`${relative(ctx.rootDir, productMapFile)}\`\n`;
    indexMd += `- **Cluster suggestions:** ${existsSync(join(cp.docsDir, "as-is", "cross-repo", "domain-suggestions.yaml")) ? "[view](/l1/cluster-suggestions)" : "_no cluster suggestions run yet_"}\n`;
    indexMd += `- **Re-run:** \`runCapability('cdr.capability.map.synth', { product: '${product}' }, ctx)\`\n`;

    write(join(sectionDir, "index.md"), indexMd);

    if (!isEmpty) {
      for (const cap of rawCaps) {
        const id = String(cap.id || "");
        if (!id) continue;
        const name = String(cap.name || id);
        const description = String(cap.description || "");
        const repos = Array.isArray(cap.spans_repos) ? (cap.spans_repos as unknown[]).map((r) => String(r)) : [];
        const domains = Array.isArray(cap.domains) ? (cap.domains as unknown[]).map((d) => String(d)) : [];
        const source = String(cap.source || "—");
        const behaviorCount = cap.behavior_count !== undefined ? String(cap.behavior_count) : "—";
        const factRatio = cap.fact_ratio !== undefined ? String(cap.fact_ratio) : "—";

        let pageMd = `---
title: "${id}"
---

# Capability: ${name}

- **ID:** \`${id}\`
- **Source:** ${source}
- **Spans repos:** ${repos.length > 0 ? repos.map((r) => `\`${r}\``).join(", ") : "_(none)_"}
- **Behavior count:** ${behaviorCount}
- **Fact ratio:** ${factRatio}

${description || "_no description provided_"}

## Domains

${domains.length > 0 ? domains.map((d) => `- \`${d}\``).join("\n") : "_no domains attached_"}

## Mermaid

\`\`\`mermaid
${l1CapabilityToMermaidSubgraph(cap as Record<string, unknown>).join("\n")}
\`\`\`
`;
        write(join(sectionDir, `${l1CapabilitySlug(id)}.md`), pageMd);
      }
    }

    const suggestionsFile = join(cp.docsDir, "as-is", "cross-repo", "domain-suggestions.yaml");
    if (existsSync(suggestionsFile)) {
      const sDoc = parseYamlDocument(read(suggestionsFile)) as Record<string, unknown>;
      const sClusters = Array.isArray(sDoc.clusters) ? sDoc.clusters : [];
      let sMd = `---
title: Cluster Suggestions
---

# Cluster Suggestions (from cdr.domain.suggest)

> Read-only suggestions emitted by the engine's reverse-cluster pass. These are **not** committed domains — to turn any cluster into a real domain, the AI calls \`cdr.domain.compose\` with the cluster's behavior keys.

- **Product:** ${String(sDoc.product || product)}
- **Generated:** ${String(sDoc.generated_at || "")}
- **Algorithm version:** ${String(sDoc.algorithm_version || "—")}
- **Behavior count considered:** ${String(sDoc.behavior_count || 0)}
- **Edge count:** ${String(sDoc.edge_count || 0)}
- **Reported clusters:** ${String(sDoc.reported_cluster_count || 0)}

## Clusters

| Suggested Name | Confidence | Size | Repos | Naming Reason |
|----------------|------------|------|-------|---------------|
`;

      for (const c of sClusters) {
        const co = c as Record<string, unknown>;
        const name = String(co.suggested_name || co.suggested_domain_slug || "Cluster");
        const conf = String(co.confidence || "low");
        const size = String(co.size || (Array.isArray(co.behavior_keys) ? (co.behavior_keys as unknown[]).length : 0));
        const repos = Array.isArray(co.repos) ? (co.repos as unknown[]).map((r) => String(r)).join(", ") : "—";
        const reason = String(co.naming_reason || "—");
        sMd += `| ${name} | ${conf} | ${size} | ${repos} | ${reason} |\n`;
      }

      sMd += `\n## Note\n\n${String(sDoc.note || "")}\n`;

      write(join(sectionDir, "cluster-suggestions.md"), sMd);
    }

    return {
      ok: true,
      data: {
        output_dir: typeof input.output_dir === "string" ? String(input.output_dir) : ".dapei/docs-portal",
        section: "l1",
        pages_generated: 1 + (isEmpty ? 0 : rawCaps.length) + (existsSync(suggestionsFile) ? 1 : 0),
        capabilities_rendered: isEmpty ? 0 : rawCaps.length,
        suggestions_rendered: existsSync(suggestionsFile) ? 1 : 0
      },
      sideEffects: ["l1 portal section generated"],
      reportFragments: [
        `generated l1 portal section under ${relative(p.rootDir, sectionDir)}`,
        `${isEmpty ? 0 : rawCaps.length} capability page(s)${existsSync(suggestionsFile) ? " + cluster suggestions" : ""}`
      ]
    };
  }
};
