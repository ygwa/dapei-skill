import { existsSync, readdirSync } from "node:fs";
import { join, relative, basename } from "node:path";
import type { CapabilitySpec } from "../../core/src/types.ts";
import { CapabilityError } from "../../core/src/types.ts";
import { cognitivePaths, loadCognitiveIndex } from "../../core/src/cognitive-index.ts";
import { parseYamlDocument, stringifyYamlDocument, type YamlValue } from "../../core/src/yaml-doc.ts";
import { ensureDir, read, write, workspacePaths, listFilesRecursively } from "../../runtime-adapters/src/system.ts";

export type AnyCap = CapabilitySpec<any, any>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParsedDoc {
  file: string;
  doc: Record<string, unknown>;
  /**
   * v0.4 — namespace inferred from the file's parent directory when the
   * artifact lives under `<section>/<repo>/<id>.yaml`. Empty for global
   * sections (capabilities, profiles) where the file is `<id>.yaml` directly
   * under the section root, and for legacy flat files.
   */
  repo?: string;
}

function confidenceBadge(doc: Record<string, unknown>): string {
  const conf = doc.confidence as Record<string, unknown> | undefined;
  const kind = String(conf?.kind || "unknown");
  if (kind === "fact") return "🟢 fact";
  if (kind === "inference") return "🟡 inference";
  return "🔴 unknown";
}

/**
 * Escape a string for safe inclusion in a Markdown table cell.
 *
 * Why this exists: VitePress runs the Vue SFC compiler over every Markdown
 * file. If a table cell contains `<` followed by what looks like a tag name
 * (e.g. `<repo>` from a behavior's writes.target), the HTML parser latches
 * onto it as an unclosed element and refuses to recover — which then trips
 * every subsequent Vue component tag in the file (`<CodeLink>`,
 * `<BehaviorFlow>`, `<StateMachine>`) with the misleading error
 * "Element is missing end tag." Replacing `<` and `>` with HTML entities
 * keeps the rendered output identical to the user while satisfying the HTML
 * tokenizer. The original cell value is preserved via character references,
 * which Markdown readers (including VitePress) render as `<repo>`.
 */
function mdCell(value: unknown): string {
  return String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

/**
 * Escape `<` and `>` in a string for free-form Markdown prose (descriptions,
 * summaries, etc.). Same rationale as mdCell — VitePress's HTML tokenizer
 * latches onto `<name>` shaped text as an unclosed element — but no table
 * `\|` or newline collapsing.
 */
function mdText(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Sanitize a generated Markdown page so that VitePress's HTML tokenizer does
 * not choke on stray `<name>` text in free-form prose. We only leave intact
 * the Vue component tags we explicitly emit — `<BehaviorFlow>`, `<CodeLink>`,
 * `<StateMachine>` — and HTML comments / fenced-code regions. Everything else
 * gets its `<` and `>` replaced with `&lt;` / `&gt;`. The page is still
 * rendered identically because Markdown → HTML treats the entity references
 * as the original characters.
 *
 * This is a file-level post-pass because the offending prose can come from
 * any of {description, summary, entry.method, writes.target, domain.modules,
 * risk.description, …} and chasing every writer is brittle.
 */
function sanitizeMarkdownPage(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inFence = false;
  const VUE_TAG_RE = /<\/?(?:BehaviorFlow|CodeLink|StateMachine)(?:\s|\/|>)/;
  for (const line of lines) {
    // Track fenced code blocks (``` or ~~~) and skip them entirely.
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    // Allow our known Vue component tags through untouched.
    if (VUE_TAG_RE.test(line)) {
      out.push(line);
      continue;
    }
    // If a writer (e.g. mdCell on a table cell) has already escaped this
    // content to HTML entities, leave it alone — re-escaping `&` would
    // double-escape to `&amp;lt;`.
    if (/&(?:lt|gt|amp|quot|#39);/.test(line)) {
      out.push(line);
      continue;
    }
    // Otherwise, escape any < that is not part of a recognized HTML entity
    // or attribute-style tag we have already handled.
    out.push(
      line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    );
  }
  // Restore our Vue component tags. The previous loop escaped `<BehaviorFlow`
    // to `&lt;BehaviorFlow` along with everything else; flip it back so the
    // Vue SFC compiler can register the component.
  return out
    .join("\n")
    .replace(/&lt;(\/?(?:BehaviorFlow|CodeLink|StateMachine))(?=\s|\/|&gt;)/g, "<$1")
    .replace(/&lt;(\/?(?:BehaviorFlow|CodeLink|StateMachine))&gt;/g, "<$1>");
}

function sanitizePortalDir(portalDir: string): void {
  const subDirs = ["behaviors", "states", "domains", "capabilities", "profiles", "business-rules"];
  for (const sub of subDirs) {
    const dir = join(portalDir, sub);
    if (!existsSync(dir)) continue;
    const files = listFilesRecursively(dir, [".md", ".markdown"], 500);
    for (const f of files) {
      const original = read(f);
      const sanitized = sanitizeMarkdownPage(original);
      if (sanitized !== original) write(f, sanitized);
    }
  }
}

function safeId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function loadYamlDir(dirPath: string): ParsedDoc[] {
  if (!existsSync(dirPath)) return [];
  const results: ParsedDoc[] = [];
  const files = listFilesRecursively(dirPath, [".yaml", ".yml"], 200);
  for (const f of files) {
    if (basename(f).startsWith("_")) continue;
    try {
      const content = read(f);
      const doc = parseYamlDocument(content);
      const rel = relative(dirPath, f);
      const segments = rel.split("/");
      const repo = segments.length >= 2 ? segments[0] : undefined;
      results.push({ file: f, doc: doc as Record<string, unknown>, repo });
    } catch {
      // skip unparseable files gracefully
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Cross-artifact index (cdr-portal-aggregation Round 1)
// Round 1 design: docs/04-technical-design.md § C1.
// Round 1 decisions: D1 (behaviorsByDomain join key), D2 (missing-id handled
// at page-generator level, not here), D3 (capability-map data source).
// Forward indexes (id → doc): behaviorsById / domainsByName /
// statesByEntity / rulesById. Inverted indexes: statesByBehavior /
// behaviorsByDomain (D1) / rulesByBehavior / rulesByDomain /
// capabilitiesByDomain. Built once per cdr.doc.generate invocation,
// shared by every page generator downstream.
// ---------------------------------------------------------------------------

interface CrossArtifactIndex {
  behaviorsById: Map<string, ParsedDoc>;
  domainsByName: Map<string, ParsedDoc>;
  statesByEntity: Map<string, ParsedDoc>;
  rulesById: Map<string, ParsedDoc>;
  statesByBehavior: Map<string, ParsedDoc[]>;
  behaviorsByDomain: Map<string, ParsedDoc[]>;
  rulesByBehavior: Map<string, ParsedDoc[]>;
  rulesByDomain: Map<string, ParsedDoc[]>;
  capabilitiesByDomain: Map<string, ParsedDoc[]>;
  entriesByBehaviorId: Map<string, { repo: string; id: string }>;
}

function buildCrossArtifactIndex(
  behaviorDocs: ParsedDoc[],
  domainDocs: ParsedDoc[],
  stateDocs: ParsedDoc[],
  ruleDocs: ParsedDoc[],
  capabilityDocs: ParsedDoc[],
  entryDocs: ParsedDoc[] = []
): CrossArtifactIndex {
  const behaviorsById = new Map<string, ParsedDoc>();
  for (const b of behaviorDocs) {
    const id = String(b.doc.id || basename(b.file, ".yaml"));
    if (id) behaviorsById.set(id, b);
  }

  const domainsByName = new Map<string, ParsedDoc>();
  for (const d of domainDocs) {
    const name = String(d.doc.name || d.doc.domain || basename(d.file, ".yaml"));
    if (name) domainsByName.set(name, d);
  }

  const statesByEntity = new Map<string, ParsedDoc>();
  for (const s of stateDocs) {
    const entity = String(s.doc.entity || basename(s.file, ".yaml"));
    if (entity) statesByEntity.set(entity, s);
  }

  const rulesById = new Map<string, ParsedDoc>();
  for (const r of ruleDocs) {
    const id = String(r.doc.id || basename(r.file, ".yaml"));
    if (id) rulesById.set(id, r);
  }

  const statesByBehavior = new Map<string, ParsedDoc[]>();
  for (const s of stateDocs) {
    const transitions = s.doc.transitions;
    if (!Array.isArray(transitions)) continue;
    for (const t of transitions) {
      const behaviorId = (t as Record<string, unknown>)?.behavior_id;
      if (typeof behaviorId === "string" && behaviorId) {
        const arr = statesByBehavior.get(behaviorId) || [];
        arr.push(s);
        statesByBehavior.set(behaviorId, arr);
      }
    }
  }

  // D1 — behaviorsByDomain via behavior.derived_from (no schema change)
  const behaviorsByDomain = new Map<string, ParsedDoc[]>();
  for (const b of behaviorDocs) {
    const df = b.doc.derived_from;
    if (!Array.isArray(df)) continue;
    for (const name of df) {
      if (typeof name !== "string" || !name) continue;
      if (domainsByName.has(name)) {
        const arr = behaviorsByDomain.get(name) || [];
        arr.push(b);
        behaviorsByDomain.set(name, arr);
      }
    }
  }

  const rulesByBehavior = new Map<string, ParsedDoc[]>();
  for (const r of ruleDocs) {
    const appliesTo = r.doc.applies_to;
    if (!Array.isArray(appliesTo)) continue;
    for (const id of appliesTo) {
      if (typeof id !== "string" || !id) continue;
      const arr = rulesByBehavior.get(id) || [];
      arr.push(r);
      rulesByBehavior.set(id, arr);
    }
  }

  const rulesByDomain = new Map<string, ParsedDoc[]>();
  for (const r of ruleDocs) {
    const df = r.doc.derived_from;
    if (!Array.isArray(df)) continue;
    for (const name of df) {
      if (typeof name !== "string" || !name) continue;
      if (domainsByName.has(name)) {
        const arr = rulesByDomain.get(name) || [];
        arr.push(r);
        rulesByDomain.set(name, arr);
      }
    }
  }

  const capabilitiesByDomain = new Map<string, ParsedDoc[]>();
  for (const c of capabilityDocs) {
    const capabilities = c.doc.capabilities;
    if (!Array.isArray(capabilities)) continue;
    for (const cap of capabilities) {
      const domains = (cap as Record<string, unknown>)?.domains;
      if (!Array.isArray(domains)) continue;
      for (const name of domains) {
        if (typeof name !== "string" || !name) continue;
        const arr = capabilitiesByDomain.get(name) || [];
        arr.push(cap as ParsedDoc);
        capabilitiesByDomain.set(name, arr);
      }
    }
  }

  const entriesByBehaviorId = new Map<string, { repo: string; id: string }>();
  for (const entryDoc of entryDocs) {
    const repo = String(entryDoc.doc.repo || entryDoc.repo || "");
    const entries = Array.isArray(entryDoc.doc.entries) ? (entryDoc.doc.entries as Array<Record<string, unknown>>) : [];
    for (const e of entries) {
      const id = typeof e.id === "string" && e.id ? e.id : "";
      if (id) entriesByBehaviorId.set(id, { repo, id });
    }
  }

  return {
    behaviorsById,
    domainsByName,
    statesByEntity,
    rulesById,
    statesByBehavior,
    behaviorsByDomain,
    rulesByBehavior,
    rulesByDomain,
    capabilitiesByDomain,
    entriesByBehaviorId,
  };
}

function sourcesSection(doc: Record<string, unknown>, rootDir: string): string {
  const sources = doc.sources as unknown[] | undefined;
  if (!Array.isArray(sources) || sources.length === 0) return "";
  const lines = ["\n## Sources\n"];
  for (const src of sources) {
    if (typeof src === "string") {
      lines.push(`- \`${src}\``);
    } else if (src && typeof src === "object") {
      const so = src as Record<string, unknown>;
      const file = String(so.file || "unknown");
      const lineNum = typeof so.line === "number" ? so.line : null;
      const sym = so.symbol_handle ? String(so.symbol_handle) : null;
      const repo = so.repo ? String(so.repo) : null;
      const sourceJson = JSON.stringify({ file, line: lineNum, symbol_handle: sym, repo }).replace(/'/g, "&#39;");
      lines.push(`- <CodeLink :source='${sourceJson}' />`);
    } else {
      lines.push(`- \`${String(src)}\``);
    }
  }
  return lines.join("\n") + "\n";
}

function stepsToMermaid(steps: unknown[]): string {
  if (!steps.length) return "";
  const lines = ["```mermaid", "graph TD"];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] as Record<string, unknown>;
    const label = String(step.action || step.description || step.name || `Step ${i + 1}`).replace(/"/g, "'");
    const nodeId = `S${i}`;
    lines.push(`  ${nodeId}["${label}"]`);
    if (i > 0) lines.push(`  S${i - 1} --> ${nodeId}`);
  }
  lines.push("```");
  return lines.join("\n");
}

function statesToMermaid(states: unknown[], transitions: unknown[]): string {
  const lines = ["```mermaid", "stateDiagram-v2"];
  const stateNames = (states as string[]).map((s) => String(s));
  if (stateNames.length > 0) {
    lines.push(`  [*] --> ${stateNames[0]}`);
  }
  for (const t of transitions) {
    const tr = t as Record<string, unknown>;
    const from = String(tr.from || "[*]");
    const to = String(tr.to || "[*]");
    const trigger = tr.trigger ? `: ${String(tr.trigger)}` : "";
    lines.push(`  ${from} --> ${to}${trigger}`);
  }
  lines.push("```");
  return lines.join("\n");
}

function domainModulesToMermaid(modules: unknown[]): string {
  if (!modules.length) return "";
  const lines = ["```mermaid", "graph LR"];
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i] as Record<string, unknown>;
    const name = String(mod.name || mod.id || `Module${i}`).replace(/"/g, "'");
    lines.push(`  M${i}["${name}"]`);
    const deps = mod.depends_on || mod.dependencies;
    if (Array.isArray(deps)) {
      for (const dep of deps) {
        const depStr = String(dep);
        const depIdx = modules.findIndex((m) => {
          const mm = m as Record<string, unknown>;
          return String(mm.name || mm.id) === depStr;
        });
        if (depIdx >= 0) {
          lines.push(`  M${i} --> M${depIdx}`);
        }
      }
    }
  }
  lines.push("```");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Page generators
// ---------------------------------------------------------------------------

function generateHomepage(
  productName: string,
  index: ReturnType<typeof loadCognitiveIndex>,
  sections: Record<string, number>
): string {
  const total = Object.values(sections).reduce((a, b) => a + b, 0);
  return `---
title: ${productName} - Knowledge Portal
---

# ${productName} — Knowledge Portal

> Auto-generated living documentation from code analysis.

## Overview

| Section | Count |
|---------|-------|
| Capabilities | ${sections.capabilities} |
| Domains | ${sections.domains} |
| Behaviors | ${sections.behaviors} |
| State Machines | ${sections.states} |
| Profiles | ${sections.profiles} |
| **Total Pages** | **${total}** |

## Cognitive Index

- **Behaviors indexed:** ${index.behaviors.length}
- **State machines indexed:** ${index.state_machines.length}
- **Unknowns:** ${index.unknowns.length}
- **Last updated:** ${index.updated_at}

## Quick Links

- [Capabilities](/capabilities/) — L1 Capability Map
- [Domains](/domains/) — L2 Domain decomposition
- [Behaviors](/behaviors/) — L3 Behavior specifications
- [State Machines](/states/) — Entity state diagrams
- [Profiles](/profiles/) — Repository profiles
`;
}

// cdr-portal-aggregation Round 1 T3.1 (BG-1, D4, see docs/04-technical-design.md).
function generateBusinessModulesPage(domainDocs: ParsedDoc[], ctx: CrossArtifactIndex): string {
  let md = `---
title: Business Modules
---

# Business Modules — L2 Domain Roll-Up

> Auto-generated business-module abstraction. Each section corresponds to one composed domain, with its behaviors, business rules, and the state machines those behaviors drive.

`;
  if (domainDocs.length === 0) {
    md += "*No domain documents found.*\n";
    return md;
  }

  for (const d of domainDocs) {
    const name = String(d.doc.name || d.doc.domain || basename(d.file, ".yaml"));
    const drepo = String(d.doc.repo || "—");
    const domLinkPath = drepo !== "—"
      ? `/domains/${safeId(drepo)}/${safeId(name)}`
      : `/domains/${safeId(name)}`;

    md += `## [${mdCell(name)}](${domLinkPath})\n\n`;
    md += `- **Repo:** ${mdCell(drepo)}\n`;
    md += `- **Domain page:** [${mdCell(name)}](${domLinkPath})\n`;

    const behaviors = ctx.behaviorsByDomain.get(name) || [];
    md += `- **Behaviors in this domain:** ${behaviors.length}\n`;

    const rules = ctx.rulesByDomain.get(name) || [];
    md += `- **Business rules applying to this domain:** ${rules.length}\n`;

    if (behaviors.length > 0) {
      md += "\n### Behaviors\n\n";
      for (const b of behaviors) {
        const bid = String(b.doc.id || basename(b.file, ".yaml"));
        const brepo = String(b.doc.repo || "—");
        const linkPath = brepo !== "—"
          ? `/behaviors/${safeId(brepo)}/${safeId(bid)}`
          : `/behaviors/${safeId(bid)}`;
        md += `- [${mdCell(bid)}](${linkPath}) _(repo: ${mdCell(brepo)})_\n`;
      }
    }

    if (rules.length > 0) {
      md += "\n### Business rules\n\n";
      for (const r of rules) {
        const rid = String(r.doc.id || basename(r.file, ".yaml"));
        const kind = String(r.doc.kind || "—");
        const rrepo = String(r.doc.repo || "—");
        const linkPath = rrepo !== "—"
          ? `/business-rules/${safeId(rrepo)}/${safeId(rid)}`
          : `/business-rules/${safeId(rid)}`;
        md += `- [${mdCell(rid)}](${linkPath}) _(${mdCell(kind)}, repo: ${mdCell(rrepo)})_\n`;
      }
    }

    // State machines driven by behaviors in this domain — chain via behaviors -> transitions.
    const statesSeen = new Set<string>();
    const statesList: ParsedDoc[] = [];
    for (const b of behaviors) {
      const bid = String(b.doc.id || basename(b.file, ".yaml"));
      const sms = ctx.statesByBehavior.get(bid) || [];
      for (const s of sms) {
        const key = s.file;
        if (!statesSeen.has(key)) {
          statesSeen.add(key);
          statesList.push(s);
        }
      }
    }
    if (statesList.length > 0) {
      md += "\n### State machines driven by these behaviors\n\n";
      for (const s of statesList) {
        const entity = String(s.doc.entity || basename(s.file, ".yaml"));
        const srepo = String(s.doc.repo || "—");
        const linkPath = srepo !== "—"
          ? `/states/${safeId(srepo)}/${safeId(entity)}`
          : `/states/${safeId(entity)}`;
        md += `- [${mdCell(entity)}](${linkPath}) _(repo: ${mdCell(srepo)})_\n`;
      }
    }

    md += "\n";
  }

  return md;
}

function generateCapabilityIndex(caps: ParsedDoc[]): string {
  let md = `---
title: Capabilities
---

# Capabilities — L1 Capability Map

`;
  if (caps.length === 0) {
    md += "*No capability documents found.*\n";
    return md;
  }
  md += "| Capability | Confidence | Description |\n";
  md += "|------------|------------|-------------|\n";
  for (const c of caps) {
    const id = String(c.doc.id || c.doc.name || basename(c.file, ".yaml"));
    const desc = String(c.doc.description || c.doc.summary || "—");
    md += `| [${id}](/capabilities/${safeId(id)}) | ${confidenceBadge(c.doc)} | ${desc} |\n`;
  }
  return md;
}

function generateCapabilityPage(cap: ParsedDoc, rootDir: string, ctx?: CrossArtifactIndex): string {
  const id = String(cap.doc.id || cap.doc.name || "unknown");
  const desc = String(cap.doc.description || cap.doc.summary || "");
  let md = `---
title: "${id}"
---

# Capability: ${id}

- **Confidence:** ${confidenceBadge(cap.doc)}
`;
  if (desc) md += `\n${desc}\n`;
  if (cap.doc.sub_capabilities && Array.isArray(cap.doc.sub_capabilities)) {
    md += "\n## Sub-capabilities\n\n";
    for (const sub of cap.doc.sub_capabilities as Array<Record<string, unknown>>) {
      md += `- **${String(sub.id || sub.name || "?")}** — ${String(sub.description || "")}\n`;
    }
  }

  // cdr-portal-aggregation Round 1 T2.2 (BG-3, see docs/04-technical-design.md).
  if (ctx) {
    const domains = (cap.doc.domains as unknown[] | undefined) || [];
    if (domains.length > 0) {
      md += "\n## Contributing domains\n\n";
      md += "| Domain |\n";
      md += "|--------|\n";
      for (const raw of domains) {
        const name = String(raw);
        const dom = ctx.domainsByName.get(name);
        const linkPath = dom?.repo
          ? `/domains/${safeId(dom.repo)}/${safeId(name)}`
          : `/domains/${safeId(name)}`;
        md += `| [${mdCell(name)}](${linkPath}) |\n`;
      }
      md += "\n";
    }

    const repos = (cap.doc.spans_repos as unknown[] | undefined) || [];
    if (repos.length > 0) {
      md += "\n## Spans repos\n\n";
      md += "| Repo |\n";
      md += "|------|\n";
      for (const raw of repos) {
        const rname = String(raw);
        md += `| [${mdCell(rname)}](/profiles/${safeId(rname)}) |\n`;
      }
      md += "\n";
    }
  }

  md += sourcesSection(cap.doc, rootDir);
  return md;
}

function generateDomainIndex(domains: ParsedDoc[]): string {
  let md = `---
title: Domains
---

# Domains — L2 Overview

`;
  if (domains.length === 0) {
    md += "*No domain documents found.*\n";
    return md;
  }
  md += "| Domain | Confidence | Description |\n";
  md += "|--------|------------|-------------|\n";
  for (const d of domains) {
    const name = String(d.doc.name || d.doc.domain || basename(d.file, ".yaml"));
    const desc = String(d.doc.description || d.doc.summary || "—");
    md += `| [${name}](/domains/${safeId(name)}) | ${confidenceBadge(d.doc)} | ${desc} |\n`;
  }
  return md;
}

function generateDomainPage(domain: ParsedDoc, rootDir: string, ctx?: CrossArtifactIndex): string {
  const name = String(domain.doc.name || domain.doc.domain || "unknown");
  const desc = String(domain.doc.description || domain.doc.summary || "");
  let md = `---
title: "${name}"
---

# Domain: ${name}

- **Confidence:** ${confidenceBadge(domain.doc)}
`;
  if (desc) md += `\n${desc}\n`;

  const modules = domain.doc.modules as unknown[] | undefined;
  if (Array.isArray(modules) && modules.length > 0) {
    md += "\n## Modules\n\n";
    for (const mod of modules) {
      const m = mod as Record<string, unknown>;
      md += `### ${String(m.name || m.id || "?")}\n\n`;
      if (m.description) md += `${String(m.description)}\n\n`;
      if (m.responsibilities && Array.isArray(m.responsibilities)) {
        md += "**Responsibilities:**\n\n";
        for (const r of m.responsibilities as string[]) {
          md += `- ${String(r)}\n`;
        }
        md += "\n";
      }
    }
    md += "\n## Module Relationships\n\n";
    md += domainModulesToMermaid(modules);
    md += "\n";
  }

  // cdr-portal-aggregation Round 1 T2.1 (BG-2, see docs/04-technical-design.md).
  if (ctx) {
    const behaviors = ctx.behaviorsByDomain.get(name) || [];
    if (behaviors.length > 0) {
      md += "\n## Behaviors in this domain\n\n";
      md += "| Behavior | Repo | Confidence |\n";
      md += "|----------|------|------------|\n";
      for (const b of behaviors) {
        const bid = String(b.doc.id || basename(b.file, ".yaml"));
        const brepo = String(b.doc.repo || "—");
        const linkPath = brepo !== "—"
          ? `/behaviors/${safeId(brepo)}/${safeId(bid)}`
          : `/behaviors/${safeId(bid)}`;
        md += `| [${mdCell(bid)}](${linkPath}) | ${mdCell(brepo)} | ${confidenceBadge(b.doc)} |\n`;
      }
      md += "\n";
    }

    // State machines driven by these behaviors — chain via behaviors -> transitions.
    const statesSeen = new Set<string>();
    const statesList: ParsedDoc[] = [];
    for (const b of behaviors) {
      const bid = String(b.doc.id || basename(b.file, ".yaml"));
      const sms = ctx.statesByBehavior.get(bid) || [];
      for (const s of sms) {
        const key = s.file;
        if (!statesSeen.has(key)) {
          statesSeen.add(key);
          statesList.push(s);
        }
      }
    }
    if (statesList.length > 0) {
      md += "\n## State machines driven by these behaviors\n\n";
      md += "| Entity | Repo | Confidence |\n";
      md += "|--------|------|------------|\n";
      for (const s of statesList) {
        const entity = String(s.doc.entity || basename(s.file, ".yaml"));
        const srepo = String(s.doc.repo || "—");
        const linkPath = srepo !== "—"
          ? `/states/${safeId(srepo)}/${safeId(entity)}`
          : `/states/${safeId(entity)}`;
        md += `| [${mdCell(entity)}](${linkPath}) | ${mdCell(srepo)} | ${confidenceBadge(s.doc)} |\n`;
      }
      md += "\n";
    }

    const rules = ctx.rulesByDomain.get(name) || [];
    if (rules.length > 0) {
      md += "\n## Business rules applying to this domain\n\n";
      md += "| Rule | Kind | Confidence |\n";
      md += "|------|------|------------|\n";
      for (const r of rules) {
        const rid = String(r.doc.id || basename(r.file, ".yaml"));
        const kind = String(r.doc.kind || "—");
        const rrepo = String(r.doc.repo || "—");
        const linkPath = rrepo !== "—"
          ? `/business-rules/${safeId(rrepo)}/${safeId(rid)}`
          : `/business-rules/${safeId(rid)}`;
        md += `| [${mdCell(rid)}](${linkPath}) | \`${mdCell(kind)}\` | ${confidenceBadge(r.doc)} |\n`;
      }
      md += "\n";
    }
  }

  md += sourcesSection(domain.doc, rootDir);
  return md;
}

function generateBehaviorIndex(behaviors: ParsedDoc[]): string {
  let md = `---
title: Behaviors
---

# Behaviors — L3 Specifications

`;
  if (behaviors.length === 0) {
    md += "*No behavior documents found.*\n";
    return md;
  }
  md += "| Behavior | Repo | Confidence | Entry |\n";
  md += "|----------|------|------------|-------|\n";
  for (const b of behaviors) {
    const id = String(b.doc.id || basename(b.file, ".yaml"));
    const repo = String(b.doc.repo || "—");
    const entry = b.doc.entry as Record<string, unknown> | undefined;
    const entryStr = entry ? `${String(entry.type || "")} ${String(entry.method || "")} ${String(entry.path || entry.handler || "")}`.trim() : "—";
    // v0.4 — per-repo layout: link to the per-repo page when repo is set,
    // else the flat page. Matches generateBehaviorPage's output path.
    const linkPath = repo !== "—" ? `/behaviors/${safeId(repo)}/${safeId(id)}` : `/behaviors/${safeId(id)}`;
    md += `| [${id}](${linkPath}) | ${repo} | ${confidenceBadge(b.doc)} | ${entryStr} |\n`;
  }
  return md;
}

// cdr-portal-aggregation Round 1 T3.2 (BG-7, D5, see docs/04-technical-design.md).
function groupBehaviorsByEntryType(behaviors: ParsedDoc[]): Map<string, ParsedDoc[]> {
  const groups = new Map<string, ParsedDoc[]>();
  for (const b of behaviors) {
    const entry = b.doc.entry as Record<string, unknown> | undefined;
    const type = entry && typeof entry.type === "string" && entry.type ? entry.type : "other";
    const arr = groups.get(type) || [];
    arr.push(b);
    groups.set(type, arr);
  }
  return groups;
}

function generateBehaviorByEntryTypeIndex(behaviors: ParsedDoc[]): string {
  let md = `---
title: Behaviors by Entry Type
---

# Behaviors by Entry Type

> Cross-cut view: behaviors grouped by their entry surface (api / mq / cron / rpc / cache / search / other).

`;
  const groups = groupBehaviorsByEntryType(behaviors);
  if (groups.size === 0) {
    md += "*No behavior documents found.*\n";
    return md;
  }
  md += "| Entry type | Behavior count |\n";
  md += "|------------|----------------|\n";
  const types = [...groups.keys()].sort();
  for (const t of types) {
    md += `| [${mdCell(t)}](/behaviors/by-entry-type/${safeId(t)}) | ${groups.get(t)!.length} |\n`;
  }
  return md;
}

function generateBehaviorByEntryTypePage(type: string, behaviors: ParsedDoc[]): string {
  let md = `---
title: "Behaviors — entry type: ${type}"
---

# Behaviors — entry type: \`${type}\`

> Back to [Behaviors by Entry Type index](/behaviors/by-entry-type/) · [All behaviors](/behaviors/)

`;
  if (behaviors.length === 0) {
    md += "*No behaviors of this entry type.*\n";
    return md;
  }
  md += "| Behavior | Repo | Path | Summary |\n";
  md += "|----------|------|------|---------|\n";
  for (const b of behaviors) {
    const id = String(b.doc.id || basename(b.file, ".yaml"));
    const repo = String(b.doc.repo || "—");
    const entry = b.doc.entry as Record<string, unknown> | undefined;
    const path = entry ? String(entry.path || entry.handler || "—") : "—";
    const summary = String(b.doc.description || b.doc.summary || "—");
    const linkPath = repo !== "—"
      ? `/behaviors/${safeId(repo)}/${safeId(id)}`
      : `/behaviors/${safeId(id)}`;
    md += `| [${mdCell(id)}](${linkPath}) | ${mdCell(repo)} | \`${mdCell(path)}\` | ${mdCell(summary)} |\n`;
  }
  return md;
}

// cdr-portal-aggregation Round 1 T3.4 (BG-9, see docs/04-technical-design.md).
// Renders /entries/<repo>/index.md for each repo with confirmed entries.
// Uses the real cdr.entries.propose schema (see packages/core/src/capabilities/domains/cdr.ts):
// each entries/<repo>.yaml has shape { repo, generated_at, entry_count, entries: [...] }
// and each entry inside has { id, type, status, anchor, line, method?, path?, summary?, sources }.
function generateEntriesPage(entryDoc: ParsedDoc): string {
  const repo = String(entryDoc.doc.repo || entryDoc.repo || basename(entryDoc.file, ".yaml"));
  const entries = Array.isArray(entryDoc.doc.entries) ? (entryDoc.doc.entries as Array<Record<string, unknown>>) : [];
  let md = `---
title: "Entries — ${repo}"
---

# Confirmed Entries — ${repo}

> Back to [Behaviors index](/behaviors/) · [All behaviors](/behaviors/)

- **Repo:** ${mdCell(repo)}
- **Total entries:** ${entries.length}

`;
  if (entries.length === 0) {
    md += "*No entries recorded for this repo.*\n";
    return md;
  }

  md += "| Entry | Type | Method | Path | Anchor | Line | Status | Summary |\n";
  md += "|-------|------|--------|------|--------|------|--------|---------|\n";
  for (const e of entries) {
    const id = String(e.id || "?");
    const type = String(e.type || "—");
    const method = e.method ? String(e.method) : "—";
    const path = e.path ? String(e.path) : "—";
    const anchor = String(e.anchor || "—");
    const line = typeof e.line === "number" ? String(e.line) : "—";
    const status = String(e.status || "—");
    const summary = String(e.summary || "—");
    md += `| \`${mdCell(id)}\` | \`${mdCell(type)}\` | \`${mdCell(method)}\` | \`${mdCell(path)}\` | \`${mdCell(anchor)}\` | ${mdCell(line)} | \`${mdCell(status)}\` | ${mdCell(summary)} |\n`;
  }
  return md;
}

function buildEntriesByBehaviorId(entryDocs: ParsedDoc[]): { byBehaviorId: Map<string, { repo: string; id: string }> } {
  const byBehaviorId = new Map<string, { repo: string; id: string }>();
  for (const entryDoc of entryDocs) {
    const repo = String(entryDoc.doc.repo || entryDoc.repo || "");
    const entries = Array.isArray(entryDoc.doc.entries) ? (entryDoc.doc.entries as Array<Record<string, unknown>>) : [];
    for (const e of entries) {
      const id = String(e.id || "");
      if (id) byBehaviorId.set(id, { repo, id });
    }
  }
  return { byBehaviorId };
}

function generateBehaviorPage(behavior: ParsedDoc, rootDir: string, ctx?: CrossArtifactIndex): string {
  const id = String(behavior.doc.id || "unknown");
  const desc = String(behavior.doc.description || behavior.doc.summary || "");
  const entry = behavior.doc.entry as Record<string, unknown> | undefined;

  let md = `---
title: "${id}"
---

# Behavior: ${id}

- **Confidence:** ${confidenceBadge(behavior.doc)}
- **Repo:** ${String(behavior.doc.repo || "—")}
`;
  if (entry) {
    md += `- **Entry:** ${String(entry.type || "")} ${String(entry.method || "")} ${String(entry.path || entry.handler || "")}`;
    if (ctx && ctx.entriesByBehaviorId.has(id)) {
      const ref = ctx.entriesByBehaviorId.get(id)!;
      md += ` — see [entry catalog](/entries/${safeId(ref.repo)}#${safeId(ref.id)})`;
    }
    md += "\n";
  }
  if (desc) md += `\n${desc}\n`;

  // Steps
  const steps = behavior.doc.steps as unknown[] | undefined;
  if (Array.isArray(steps) && steps.length > 0) {
    md += "\n## Steps\n\n";
    const stepsJson = JSON.stringify(steps).replace(/'/g, "&#39;");
    md += `<BehaviorFlow :steps='${stepsJson}' />\n\n`;
    md += "<details><summary>Flowchart source</summary>\n\n";
    md += stepsToMermaid(steps);
    md += "\n</details>\n";
  }

  // Writes
  const writes = behavior.doc.writes as unknown[] | undefined;
  if (Array.isArray(writes) && writes.length > 0) {
    md += "\n## Writes\n\n";
    md += "| Target | Operation | Fields |\n";
    md += "|--------|-----------|--------|\n";
    for (const w of writes) {
      const wr = w as Record<string, unknown>;
      const fields = Array.isArray(wr.fields) ? (wr.fields as string[]).join(", ") : String(wr.fields || "—");
      md += `| ${mdCell(wr.target || wr.table || "—")} | ${mdCell(wr.operation || "—")} | ${mdCell(fields)} |\n`;
    }
  }

  // Events
  const events = behavior.doc.events as unknown[] | undefined;
  if (Array.isArray(events) && events.length > 0) {
    md += "\n## Events\n\n";
    for (const ev of events) {
      md += `- \`${String(ev)}\`\n`;
    }
  }

  // Calls — v0.6 supports a mix of legacy strings and structured objects.
  const calls = behavior.doc.calls as unknown[] | undefined;
  const crossServiceCalls: Array<{ target: string; protocol: string; targetRepo: string; evidenceFile: string; evidenceLine: number | null; evidenceRepo: string | null }> = [];
  if (Array.isArray(calls) && calls.length > 0) {
    md += "\n## Calls\n\n";
    for (const c of calls) {
      if (typeof c === "string") {
        md += `- \`${c}\`\n`;
        continue;
      }
      if (!c || typeof c !== "object" || Array.isArray(c)) continue;
      const co = c as Record<string, unknown>;
      const target = String(co.target || co.service || "?");
      const protocol = typeof co.protocol === "string" ? co.protocol : "";
      const targetRepo = typeof co.target_repo === "string" ? co.target_repo : "";
      const ev = co.evidence && typeof co.evidence === "object" ? co.evidence as Record<string, unknown> : null;
      const evFile = ev ? String(ev.file || "") : "";
      const evLine = ev && typeof ev.line === "number" ? ev.line : null;
      const evRepo = ev ? (typeof ev.repo === "string" ? ev.repo : null) : null;
      const method = typeof co.method === "string" ? ` (${co.method})` : "";

      md += `- **${target}**${method}`;
      if (protocol) md += ` \`[${protocol}]\``;
      md += "\n";
      if (evFile) {
        const evJson = JSON.stringify({ file: evFile, line: evLine, repo: evRepo }).replace(/'/g, "&#39;");
        md += `  - evidence: <CodeLink :source='${evJson}' />\n`;
      }
      if (targetRepo) {
        crossServiceCalls.push({ target, protocol, targetRepo, evidenceFile: evFile, evidenceLine: evLine, evidenceRepo: evRepo });
      }
    }
  }

  // v0.6 — cross-service calls grouped by target repo
  if (crossServiceCalls.length > 0) {
    md += "\n## Cross-service calls\n\n";
    md += "This behavior calls into the following repos:\n\n";
    md += "| Target | Protocol | Target repo | Evidence |\n";
    md += "|--------|----------|-------------|----------|\n";
    for (const c of crossServiceCalls) {
      const evCell = c.evidenceFile
        ? c.evidenceLine
          ? `\`${c.evidenceFile}:${c.evidenceLine}\``
          : `\`${c.evidenceFile}\``
        : "—";
      md += `| ${mdCell(c.target)} | ${mdCell(c.protocol || "—")} | ${mdCell(c.targetRepo)} | ${evCell} |\n`;
    }
  }

  // cdr-portal-aggregation Round 1 T2.3 (BG-4, see docs/04-technical-design.md).
  if (ctx) {
    const drives = ctx.statesByBehavior.get(id) || [];
    if (drives.length > 0) {
      md += "\n## Drives transitions\n\n";
      md += "This behavior drives state transitions in:\n\n";
      md += "| State machine | Repo |\n";
      md += "|---------------|------|\n";
      for (const s of drives) {
        const entity = String(s.doc.entity || basename(s.file, ".yaml"));
        const srepo = String(s.doc.repo || "—");
        const linkPath = srepo !== "—"
          ? `/states/${safeId(srepo)}/${safeId(entity)}`
          : `/states/${safeId(entity)}`;
        md += `| [${mdCell(entity)}](${linkPath}) | ${mdCell(srepo)} |\n`;
      }
      md += "\n";
    }
  }

  // Risks
  const risks = behavior.doc.risks as unknown[] | undefined;
  if (Array.isArray(risks) && risks.length > 0) {
    md += "\n## Risks\n\n";
    for (const r of risks) {
      if (typeof r === "string") {
        md += `- ⚠️ ${r}\n`;
      } else {
        const ro = r as Record<string, unknown>;
        md += `- ⚠️ **${String(ro.name || ro.type || "Risk")}** — ${String(ro.description || ro.detail || "")}\n`;
      }
    }
  }

  md += sourcesSection(behavior.doc, rootDir);
  return md;
}

function generateStateIndex(states: ParsedDoc[]): string {
  let md = `---
title: State Machines
---

# State Machines

`;
  if (states.length === 0) {
    md += "*No state machine documents found.*\n";
    return md;
  }
  md += "| Entity | Repo | Confidence | States |\n";
  md += "|--------|------|------------|--------|\n";
  for (const s of states) {
    const entity = String(s.doc.entity || basename(s.file, ".yaml"));
    const repo = String(s.doc.repo || "—");
    const stateList = Array.isArray(s.doc.states) ? (s.doc.states as string[]).join(", ") : "—";
    // v0.4 — per-repo layout: link to the per-repo page when repo is set.
    const linkPath = repo !== "—" ? `/states/${safeId(repo)}/${safeId(entity)}` : `/states/${safeId(entity)}`;
    md += `| [${entity}](${linkPath}) | ${repo} | ${confidenceBadge(s.doc)} | ${stateList} |\n`;
  }
  return md;
}

function generateStatePage(sm: ParsedDoc, rootDir: string, ctx?: CrossArtifactIndex): string {
  const entity = String(sm.doc.entity || "unknown");
  const smRepo = String(sm.doc.repo || "—");
  let md = `---
title: "${entity}"
---

# State Machine: ${entity}

- **Confidence:** ${confidenceBadge(sm.doc)}
- **Repo:** ${smRepo}
`;

  const states = Array.isArray(sm.doc.states) ? (sm.doc.states as unknown[]) : [];
  const transitions = Array.isArray(sm.doc.transitions) ? (sm.doc.transitions as unknown[]) : [];

  if (states.length > 0) {
    md += "\n## States\n\n";
    for (const s of states) {
      md += `- \`${String(s)}\`\n`;
    }
  }

  if (transitions.length > 0) {
    md += "\n## Transitions\n\n";
    md += "| From | To | Trigger | Behavior |\n";
    md += "|------|----|---------|----------|\n";
    for (const t of transitions) {
      const tr = t as Record<string, unknown>;
      const fromCell = String(tr.from || "—");
      const toCell = String(tr.to || "—");
      const triggerCell = String(tr.trigger || "—");
      const behaviorId = typeof tr.behavior_id === "string" ? tr.behavior_id : null;

      // cdr-portal-aggregation Round 1 T2.4 (BG-4 + D2). D2: missing
      // behavior_id renders as strikethrough + tooltip, never silently
      // hidden — see docs/04-technical-design.md § D2.
      let behaviorCell = "—";
      if (behaviorId) {
        const matched = ctx?.behaviorsById.get(behaviorId);
        if (matched) {
          const brepo = String(matched.doc.repo || "—");
          const linkPath = brepo !== "—"
            ? `/behaviors/${safeId(brepo)}/${safeId(behaviorId)}`
            : `/behaviors/${safeId(behaviorId)}`;
          behaviorCell = `[${mdCell(behaviorId)}](${linkPath})`;
        } else {
          behaviorCell = `~~${mdCell(behaviorId)}~~ _(no behavior document)_`;
        }
      }

      md += `| ${mdCell(fromCell)} | ${mdCell(toCell)} | ${mdCell(triggerCell)} | ${behaviorCell} |\n`;
    }
  }

  if (states.length > 0 || transitions.length > 0) {
    const initialState = String(sm.doc.initial_state || states[0] || "");
    md += "\n## State Diagram\n\n";
    const statesJson = JSON.stringify(states).replace(/'/g, "&#39;");
    const transitionsJson = JSON.stringify(transitions).replace(/'/g, "&#39;");
    md += `<StateMachine :entity='${JSON.stringify(entity).replace(/'/g, "&#39;")}' :states='${statesJson}' :transitions='${transitionsJson}' :initial_state='${JSON.stringify(initialState).replace(/'/g, "&#39;")}' />\n\n`;
    md += "<details><summary>State diagram source</summary>\n\n";
    md += statesToMermaid(states, transitions);
    md += "\n</details>\n";
  }

  md += sourcesSection(sm.doc, rootDir);
  return md;
}

function generateProfileIndex(profiles: ParsedDoc[]): string {
  let md = `---
title: Profiles
---

# Repository Profiles

`;
  if (profiles.length === 0) {
    md += "*No profile documents found.*\n";
    return md;
  }
  md += "| Repository | Language | Description |\n";
  md += "|------------|----------|-------------|\n";
  for (const p of profiles) {
    const repo = String(p.doc.repo || p.doc.name || basename(p.file, ".yaml"));
    const lang = String(p.doc.language || p.doc.stack || "—");
    const desc = String(p.doc.description || p.doc.summary || "—");
    md += `| [${repo}](/profiles/${safeId(repo)}) | ${lang} | ${desc} |\n`;
  }
  return md;
}

function generateProfilePage(profile: ParsedDoc, rootDir: string): string {
  const repo = String(profile.doc.repo || profile.doc.name || "unknown");
  const desc = String(profile.doc.description || profile.doc.summary || "");
  let md = `---
title: "${repo}"
---

# Profile: ${repo}

- **Language/Stack:** ${String(profile.doc.language || profile.doc.stack || "—")}
- **Confidence:** ${confidenceBadge(profile.doc)}
`;
  if (desc) md += `\n${desc}\n`;

  if (profile.doc.modules && Array.isArray(profile.doc.modules)) {
    md += "\n## Modules\n\n";
    for (const mod of profile.doc.modules as Array<Record<string, unknown>>) {
      md += `- **${String(mod.name || mod.path || "?")}** — ${String(mod.description || "")}\n`;
    }
  }

  if (profile.doc.dependencies && Array.isArray(profile.doc.dependencies)) {
    md += "\n## Dependencies\n\n";
    for (const dep of profile.doc.dependencies as string[]) {
      md += `- ${String(dep)}\n`;
    }
  }

  md += sourcesSection(profile.doc, rootDir);
  return md;
}

function generateBusinessRuleIndex(rules: ParsedDoc[]): string {
  let md = `---
title: Business Rules
---

# Business Rules — Invariants, Constraints, Authorization, SLA, Compensation

`;
  if (rules.length === 0) {
    md += "*No business rule documents found.*\n";
    return md;
  }
  md += "| Rule | Kind | Confidence | Description |\n";
  md += "|------|------|------------|-------------|\n";
  for (const r of rules) {
    const id = String(r.doc.id || basename(r.file, ".yaml"));
    const kind = String(r.doc.kind || "—");
    const desc = String(r.doc.description || r.doc.expr || "—");
    const slug = safeId(id);
    const linkPath = r.repo ? `/business-rules/${safeId(r.repo)}/${slug}` : `/business-rules/${slug}`;
    md += `| [${id}](${linkPath}) | \`${kind}\` | ${confidenceBadge(r.doc)} | ${mdCell(desc)} |\n`;
  }
  return md;
}

// cdr-portal-aggregation Round 1 T3.3 (BG-6, see docs/04-technical-design.md).
function groupBusinessRulesByKind(rules: ParsedDoc[]): Map<string, ParsedDoc[]> {
  const groups = new Map<string, ParsedDoc[]>();
  for (const r of rules) {
    const kind = typeof r.doc.kind === "string" && r.doc.kind ? r.doc.kind : "other";
    const arr = groups.get(kind) || [];
    arr.push(r);
    groups.set(kind, arr);
  }
  return groups;
}

function generateBusinessRulesByKindIndex(rules: ParsedDoc[]): string {
  let md = `---
title: Business Rules by Kind
---

# Business Rules by Kind

> Cross-cut view: business rules grouped by their semantic kind (invariant / constraint / authorization / sla / compensation).

`;
  const groups = groupBusinessRulesByKind(rules);
  if (groups.size === 0) {
    md += "*No business rule documents found.*\n";
    return md;
  }
  md += "| Kind | Rule count |\n";
  md += "|------|-----------|\n";
  const kinds = [...groups.keys()].sort();
  for (const k of kinds) {
    md += `| [${mdCell(k)}](/business-rules/by-kind/${safeId(k)}) | ${groups.get(k)!.length} |\n`;
  }
  return md;
}

function generateBusinessRulesByKindPage(kind: string, rules: ParsedDoc[]): string {
  let md = `---
title: "Business Rules — kind: ${kind}"
---

# Business Rules — kind: \`${kind}\`

> Back to [Business Rules by Kind index](/business-rules/by-kind/) · [All business rules](/business-rules/)

`;
  if (rules.length === 0) {
    md += "*No rules of this kind.*\n";
    return md;
  }
  md += "| Rule | Repo | Applies to | Derived from | Description |\n";
  md += "|------|------|-----------|--------------|-------------|\n";
  for (const r of rules) {
    const id = String(r.doc.id || basename(r.file, ".yaml"));
    const repo = String(r.doc.repo || "—");
    const appliesTo = Array.isArray(r.doc.applies_to) ? (r.doc.applies_to as unknown[]).map((x) => String(x)).join(", ") : "—";
    const derivedFrom = Array.isArray(r.doc.derived_from) ? (r.doc.derived_from as unknown[]).map((x) => String(x)).join(", ") : "—";
    const desc = String(r.doc.description || r.doc.expr || "—");
    const linkPath = repo !== "—"
      ? `/business-rules/${safeId(repo)}/${safeId(id)}`
      : `/business-rules/${safeId(id)}`;
    md += `| [${mdCell(id)}](${linkPath}) | ${mdCell(repo)} | ${mdCell(appliesTo)} | ${mdCell(derivedFrom)} | ${mdCell(desc)} |\n`;
  }
  return md;
}

function generateBusinessRulePage(rule: ParsedDoc, rootDir: string, ctx?: CrossArtifactIndex): string {
  const id = String(rule.doc.id || "unknown");
  const kind = String(rule.doc.kind || "unknown");
  const desc = String(rule.doc.description || "");
  const expr = String(rule.doc.expr || "");

  let md = `---
title: "${id}"
---

# Business Rule: ${id}

- **Kind:** \`${kind}\`
- **Confidence:** ${confidenceBadge(rule.doc)}
- **Repo:** ${String(rule.doc.repo || "—")}
`;
  if (desc) md += `\n${desc}\n`;

  if (expr) {
    md += "\n## Expression\n\n";
    md += "```text\n" + expr + "\n```\n";
  }

  const appliesTo = rule.doc.applies_to as unknown[] | undefined;
  if (Array.isArray(appliesTo) && appliesTo.length > 0) {
    md += "\n## Applies To\n\n";
    for (const a of appliesTo) {
      const name = String(a);
      if (ctx) {
        const matched = ctx.behaviorsById.get(name);
        if (matched) {
          const brepo = String(matched.doc.repo || "—");
          const linkPath = brepo !== "—"
            ? `/behaviors/${safeId(brepo)}/${safeId(name)}`
            : `/behaviors/${safeId(name)}`;
          md += `- [${mdCell(name)}](${linkPath})\n`;
          continue;
        }
      }
      md += `- \`${mdCell(name)}\`\n`;
    }
  }

  const derivedFrom = rule.doc.derived_from as string[] | undefined;
  if (Array.isArray(derivedFrom) && derivedFrom.length > 0) {
    md += "\n## Derived From\n\n";
    for (const d of derivedFrom) {
      const name = String(d);
      if (ctx) {
        const matched = ctx.domainsByName.get(name);
        if (matched) {
          const drepo = String(matched.doc.repo || "—");
          const linkPath = drepo !== "—"
            ? `/domains/${safeId(drepo)}/${safeId(name)}`
            : `/domains/${safeId(name)}`;
          md += `- [${mdCell(name)}](${linkPath})\n`;
          continue;
        }
      }
      md += `- \`${mdCell(name)}\`\n`;
    }
  }

  md += sourcesSection(rule.doc, rootDir);
  return md;
}

// cdr-portal-aggregation Round 1 T4.1 (BG-8, D3, see docs/04-technical-design.md).
function detectExistingPortalSections(portalDir: string): { l1: boolean; crossRepo: boolean; businessModules: boolean } {
  return {
    l1: existsSync(join(portalDir, "l1", "index.md")),
    crossRepo: existsSync(join(portalDir, "cross-repo", "index.md")),
    businessModules: existsSync(join(portalDir, "business-modules", "index.md"))
  };
}

function generateVitepressConfig(
  productName: string,
  sidebarConfig: Record<string, Array<{ text: string; link: string; items: Array<{ text: string; link?: string; items?: Array<{ text: string; link: string }> }> }>>,
  allPages: string[],
  nav?: Array<{ text: string; link: string }>
): string {
  // v0.4 — VitePress only builds HTML for pages it can discover. The sidebar
  // config works for top-level and per-repo pages that are reachable from
  // a nested sidebar structure, but in practice the nested structure is
  // fragile across VitePress versions. The most reliable approach is to
  // register every page in the `pages` config (a flat list of source
  // paths) — VitePress builds HTML for each one regardless of sidebar.
  const pagesJson = JSON.stringify(allPages, null, 6);
  const navJson = JSON.stringify(
    nav || [
      { text: 'Home', link: '/' },
      { text: 'Capabilities', link: '/capabilities/' },
      { text: 'Domains', link: '/domains/' },
      { text: 'Behaviors', link: '/behaviors/' },
      { text: 'States', link: '/states/' },
      { text: 'Business Rules', link: '/business-rules/' },
      { text: 'Profiles', link: '/profiles/' }
    ],
    null,
    6
  );
  return `import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '${productName} - Knowledge Portal',
  description: 'Auto-generated living documentation from code analysis',
  pages: ${pagesJson},
  themeConfig: {
    nav: ${navJson},
    sidebar: ${JSON.stringify(sidebarConfig, null, 6)},
    search: { provider: 'local' }
  }
})
`;
}

function generatePortalPackageJson(): string {
  return `{
  "name": "dapei-docs-portal",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vitepress dev",
    "build": "vitepress build",
    "preview": "vitepress preview"
  },
  "devDependencies": {
    "vitepress": "^1.6.0",
    "vue": "^3.5.0"
  }
}
`;
}

function copyThemeTemplates(portalDir: string): { themeFile: string; componentFiles: string[] } {
  const ownDir = (import.meta as { dirname?: string }).dirname || new URL(".", import.meta.url).pathname;
  const templatesDir = join(ownDir, "..", "templates");
  const themeDir = join(portalDir, ".vitepress", "theme");
  const componentsDir = join(themeDir, "components");
  ensureDir(themeDir);
  ensureDir(componentsDir);

  const themeFile = join(themeDir, "index.ts");
  const srcTheme = join(templatesDir, "theme", "index.ts");
  if (existsSync(srcTheme)) {
    write(themeFile, read(srcTheme));
  }

  const componentFiles: string[] = [];
  const srcComponentsDir = join(templatesDir, "components");
  if (existsSync(srcComponentsDir)) {
    for (const f of readdirSync(srcComponentsDir)) {
      if (!f.endsWith(".vue")) continue;
      const src = join(srcComponentsDir, f);
      const dst = join(componentsDir, f);
      write(dst, read(src));
      componentFiles.push(dst);
    }
  }
  return { themeFile, componentFiles };
}

// ---------------------------------------------------------------------------
// Capability: cdr.doc.generate
// ---------------------------------------------------------------------------

export const docGenerate: AnyCap = {
  id: "cdr.doc.generate",
  version: "1.1.0",
  inputSchema: {
    properties: {
      output_dir: { type: "string" },
      fold_v08_sections: { type: "boolean" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const outputDirRel = input.output_dir ? String(input.output_dir) : ".dapei/docs-portal";
    const p = workspacePaths(ctx.rootDir);
    const cp = cognitivePaths(ctx.rootDir);
    const outputDir = join(p.rootDir, outputDirRel);

    // Ensure output directories
    const subDirs = ["capabilities", "domains", "behaviors", "states", "profiles", "business-rules", "business-modules", ".vitepress"];
    for (const sub of subDirs) {
      ensureDir(join(outputDir, sub));
    }

    // Load cognitive index
    const index = loadCognitiveIndex(ctx.rootDir);

    // Derive product name from workspace
    const workspaceFile = join(p.dapeiDir, "workspace.yaml");
    let productName = p.workspaceName;
    if (existsSync(workspaceFile)) {
      try {
        const wsDoc = parseYamlDocument(read(workspaceFile));
        const ws = wsDoc.workspace as Record<string, unknown> | undefined;
        if (ws?.name) productName = String(ws.name);
      } catch {
        // fallback to directory name
      }
    }

    // Load all YAML source documents
    const capDocs = loadYamlDir(join(p.docsDir, "as-is", "capabilities"));
    const domainDocs = loadYamlDir(cp.domainDir);
    const behaviorDocs = loadYamlDir(cp.behaviorDir);
    const stateDocs = loadYamlDir(cp.stateMachineDir);
    const profileDocs = loadYamlDir(join(p.docsDir, "as-is", "profiles"));
    const entryDocs = loadYamlDir(join(p.docsDir, "as-is", "entries"));
    const businessRuleDocs = loadYamlDir(cp.businessRulesDir);

    // cdr-portal-aggregation Round 1 — build cross-artifact index (T1.1).
    const crossArtifactIndex = buildCrossArtifactIndex(
      behaviorDocs,
      domainDocs,
      stateDocs,
      businessRuleDocs,
      capDocs,
      entryDocs
    );

    // Track page counts
    let totalPages = 0;
    const sections = {
      capabilities: 0,
      domains: 0,
      behaviors: 0,
      states: 0,
      profiles: 0,
      business_rules: 0
    };

    // Build sidebar configuration
    const sidebarConfig: Record<string, Array<{ text: string; link: string; items: Array<{ text: string; link?: string; items?: Array<{ text: string; link: string }> }> }>> = {};

    // --- Capabilities ---
    write(join(outputDir, "capabilities", "index.md"), generateCapabilityIndex(capDocs));
    totalPages++;
    const capItems: Array<{ text: string; link: string }> = [];
    for (const cap of capDocs) {
      const id = String(cap.doc.id || cap.doc.name || basename(cap.file, ".yaml"));
      const slug = safeId(id);
      write(join(outputDir, "capabilities", `${slug}.md`), generateCapabilityPage(cap, p.rootDir, crossArtifactIndex));
      capItems.push({ text: id, link: `/capabilities/${slug}` });
      totalPages++;
      sections.capabilities++;
    }
    sidebarConfig["/capabilities/"] = [{ text: "Capabilities", link: "/capabilities/", items: [{ text: "Overview", link: "/capabilities/" }, ...capItems] }];

    // --- Domains ---
    write(join(outputDir, "domains", "index.md"), generateDomainIndex(domainDocs));
    totalPages++;
    const domainItems: Array<{ text: string; link: string }> = [];
    for (const d of domainDocs) {
      const name = String(d.doc.name || d.doc.domain || basename(d.file, ".yaml"));
      const slug = safeId(name);
      // v0.4 — per-repo namespace: pages live at /domains/<repo>/<slug>
      // when the source file is under <repo>/ subdir. Legacy global files
      // (no repo in path) keep the flat /domains/<slug> URL.
      const urlPath = d.repo ? `/domains/${safeId(d.repo)}/${slug}` : `/domains/${slug}`;
      const pagePath = d.repo
        ? join(outputDir, "domains", safeId(d.repo), `${slug}.md`)
        : join(outputDir, "domains", `${slug}.md`);
      write(pagePath, generateDomainPage(d, p.rootDir, crossArtifactIndex));
      domainItems.push({ text: d.repo ? `${name} (${d.repo})` : name, link: urlPath });
      totalPages++;
      sections.domains++;
    }
    sidebarConfig["/domains/"] = [{ text: "Domains", link: "/domains/", items: [{ text: "Overview", link: "/domains/" }, ...domainItems] }];

    // --- Behaviors ---
    write(join(outputDir, "behaviors", "index.md"), generateBehaviorIndex(behaviorDocs));
    totalPages++;

    // cdr-portal-aggregation Round 1 T3.2 — group behaviors by entry.type.
    // Only render entry-type pages that have at least one behavior.
    ensureDir(join(outputDir, "behaviors", "by-entry-type"));
    write(join(outputDir, "behaviors", "by-entry-type", "index.md"), generateBehaviorByEntryTypeIndex(behaviorDocs));
    totalPages++;
    {
      const groups = groupBehaviorsByEntryType(behaviorDocs);
      for (const [type, bs] of groups) {
        write(join(outputDir, "behaviors", "by-entry-type", `${safeId(type)}.md`), generateBehaviorByEntryTypePage(type, bs));
        totalPages++;
      }
    }
    // v0.4 — group behavior sidebar items by repo. VitePress only
    // builds pages that are reachable from the sidebar (or pages
    // config), and nested directory pages need a nested sidebar
    // structure. Flat per-repo links at the top level are ignored.
    const behaviorGroups: Record<string, Array<{ text: string; link: string }>> = {};
    for (const b of behaviorDocs) {
      const id = String(b.doc.id || basename(b.file, ".yaml"));
      const slug = safeId(id);
      const urlPath = b.repo ? `/behaviors/${safeId(b.repo)}/${slug}` : `/behaviors/${slug}`;
      const pagePath = b.repo
        ? join(outputDir, "behaviors", safeId(b.repo), `${slug}.md`)
        : join(outputDir, "behaviors", `${slug}.md`);
      write(pagePath, generateBehaviorPage(b, p.rootDir, crossArtifactIndex));
      const repoKey = b.repo ? safeId(b.repo) : "_norepo";
      (behaviorGroups[repoKey] ||= []).push({ text: id, link: urlPath });
      totalPages++;
      sections.behaviors++;
    }
    const behaviorSidebarItems: Array<{ text: string; link?: string; items?: Array<{ text: string; link: string }> }> = [
      { text: "Overview", link: "/behaviors/" }
    ];
    for (const [repoKey, items] of Object.entries(behaviorGroups)) {
      if (repoKey === "_norepo") {
        behaviorSidebarItems.push(...items);
      } else {
        behaviorSidebarItems.push({ text: repoKey, items });
      }
    }
    sidebarConfig["/behaviors/"] = [{ text: "Behaviors", link: "/behaviors/", items: behaviorSidebarItems }];

    // --- State Machines ---
    write(join(outputDir, "states", "index.md"), generateStateIndex(stateDocs));
    totalPages++;
    const stateGroups: Record<string, Array<{ text: string; link: string }>> = {};
    for (const s of stateDocs) {
      const entity = String(s.doc.entity || basename(s.file, ".yaml"));
      const slug = safeId(entity);
      const urlPath = s.repo ? `/states/${safeId(s.repo)}/${slug}` : `/states/${slug}`;
      const pagePath = s.repo
        ? join(outputDir, "states", safeId(s.repo), `${slug}.md`)
        : join(outputDir, "states", `${slug}.md`);
      write(pagePath, generateStatePage(s, p.rootDir, crossArtifactIndex));
      const repoKey = s.repo ? safeId(s.repo) : "_norepo";
      (stateGroups[repoKey] ||= []).push({ text: entity, link: urlPath });
      totalPages++;
      sections.states++;
    }
    const stateSidebarItems: Array<{ text: string; link?: string; items?: Array<{ text: string; link: string }> }> = [
      { text: "Overview", link: "/states/" }
    ];
    for (const [repoKey, items] of Object.entries(stateGroups)) {
      if (repoKey === "_norepo") {
        stateSidebarItems.push(...items);
      } else {
        stateSidebarItems.push({ text: repoKey, items });
      }
    }
    sidebarConfig["/states/"] = [{ text: "State Machines", link: "/states/", items: stateSidebarItems }];

    // --- Profiles ---
    write(join(outputDir, "profiles", "index.md"), generateProfileIndex(profileDocs));
    totalPages++;
    const profileItems: Array<{ text: string; link: string }> = [];
    for (const pr of profileDocs) {
      const repo = String(pr.doc.repo || pr.doc.name || basename(pr.file, ".yaml"));
      const slug = safeId(repo);
      write(join(outputDir, "profiles", `${slug}.md`), generateProfilePage(pr, p.rootDir));
      profileItems.push({ text: repo, link: `/profiles/${slug}` });
      totalPages++;
      sections.profiles++;
    }
    sidebarConfig["/profiles/"] = [{ text: "Profiles", link: "/profiles/", items: [{ text: "Overview", link: "/profiles/" }, ...profileItems] }];

    // --- Business Rules ---
    write(join(outputDir, "business-rules", "index.md"), generateBusinessRuleIndex(businessRuleDocs));
    totalPages++;
    // cdr-portal-aggregation Round 1 T3.3 — group business rules by kind.
    // Only render kind pages that have at least one rule.
    ensureDir(join(outputDir, "business-rules", "by-kind"));
    write(join(outputDir, "business-rules", "by-kind", "index.md"), generateBusinessRulesByKindIndex(businessRuleDocs));
    totalPages++;
    {
      const kindGroups = groupBusinessRulesByKind(businessRuleDocs);
      for (const [kind, rs] of kindGroups) {
        write(join(outputDir, "business-rules", "by-kind", `${safeId(kind)}.md`), generateBusinessRulesByKindPage(kind, rs));
        totalPages++;
      }
    }
    const ruleItems: Array<{ text: string; link: string }> = [];
    for (const r of businessRuleDocs) {
      const id = String(r.doc.id || basename(r.file, ".yaml"));
      const slug = safeId(id);
      const urlPath = r.repo ? `/business-rules/${safeId(r.repo)}/${slug}` : `/business-rules/${slug}`;
      const pagePath = r.repo
        ? join(outputDir, "business-rules", safeId(r.repo), `${slug}.md`)
        : join(outputDir, "business-rules", `${slug}.md`);
      write(pagePath, generateBusinessRulePage(r, p.rootDir, crossArtifactIndex));
      ruleItems.push({ text: r.repo ? `${id} (${r.repo})` : id, link: urlPath });
      totalPages++;
      sections.business_rules++;
    }
    sidebarConfig["/business-rules/"] = [{ text: "Business Rules", link: "/business-rules/", items: [{ text: "Overview", link: "/business-rules/" }, ...ruleItems] }];

    // --- Business Modules (T3.1) ---
    write(join(outputDir, "business-modules", "index.md"), generateBusinessModulesPage(domainDocs, crossArtifactIndex));
    totalPages++;

    // cdr-portal-aggregation Round 1 T3.4 (BG-9) — /entries/<repo>/index.md per repo.
    if (entryDocs.length > 0) {
      ensureDir(join(outputDir, "entries"));
      for (const entryDoc of entryDocs) {
        const repo = String(entryDoc.doc.repo || entryDoc.repo || basename(entryDoc.file, ".yaml"));
        write(join(outputDir, "entries", `${safeId(repo)}.md`), generateEntriesPage(entryDoc));
        totalPages++;
      }
    }

    // --- Homepage ---
    write(join(outputDir, "index.md"), generateHomepage(productName, index, sections));
    totalPages++;

    // --- VitePress config + custom theme (Vue components: BehaviorFlow / StateMachine / CodeLink) ---
    write(join(outputDir, "package.json"), generatePortalPackageJson());
    // cdr-portal-aggregation Round 1 T1.2 — replace hand-written page list
    // (root cause of BG-8, see docs/02-gap-analysis.md). Enumerate .md on disk
    // so /l1/ and /cross-repo/ are auto-registered alongside main sections.
    const allPages: string[] = listFilesRecursively(outputDir, [".md"], 500)
      .map((abs) => "/" + relative(outputDir, abs).split(join("\\")).join("/"))
      .filter((p) => p !== "/.vitepress/dist")
      .sort();

    // cdr-portal-aggregation Round 1 T4.1 (BG-8, D3, see docs/04-technical-design.md).
    const foldV08 = input.fold_v08_sections === undefined ? true : Boolean(input.fold_v08_sections);
    const detected = foldV08 ? detectExistingPortalSections(outputDir) : { l1: false, crossRepo: false, businessModules: false };

    if (detected.l1) {
      const l1Pages = listFilesRecursively(join(outputDir, "l1"), [".md"], 50)
        .map((abs) => "/" + relative(outputDir, abs).split(join("\\")).join("/"))
        .sort();
      sidebarConfig["/l1/"] = [{
        text: "L1 Map",
        link: "/l1/",
        items: l1Pages.map((p) => ({ text: p.replace(/^\/l1\//, "").replace(/\.md$/, "") || "Overview", link: p }))
      }];
    }
    if (detected.crossRepo) {
      const crPages = listFilesRecursively(join(outputDir, "cross-repo"), [".md"], 50)
        .map((abs) => "/" + relative(outputDir, abs).split(join("\\")).join("/"))
        .sort();
      sidebarConfig["/cross-repo/"] = [{
        text: "Cross-repo",
        link: "/cross-repo/",
        items: crPages.map((p) => ({ text: p.replace(/^\/cross-repo\//, "").replace(/\.md$/, "") || "Overview", link: p }))
      }];
    }
    if (detected.businessModules) {
      sidebarConfig["/business-modules/"] = [{ text: "Business Modules", link: "/business-modules/", items: [{ text: "Overview", link: "/business-modules/" }] }];
    }

    const nav: Array<{ text: string; link: string }> = [
      { text: 'Home', link: '/' },
      { text: 'Capabilities', link: '/capabilities/' },
      { text: 'Domains', link: '/domains/' },
      { text: 'Behaviors', link: '/behaviors/' },
      { text: 'States', link: '/states/' },
      { text: 'Business Rules', link: '/business-rules/' },
      { text: 'Profiles', link: '/profiles/' }
    ];
    if (detected.l1) nav.push({ text: 'L1 Map', link: '/l1/' });
    if (detected.crossRepo) nav.push({ text: 'Cross-repo', link: '/cross-repo/' });

    write(join(outputDir, ".vitepress", "config.mts"), generateVitepressConfig(productName, sidebarConfig, allPages, nav));
    copyThemeTemplates(outputDir);
    sanitizePortalDir(outputDir);

    return {
      ok: true,
      data: {
        output_dir: outputDirRel,
        pages_generated: totalPages,
        sections
      },
      sideEffects: ["documentation portal generated"],
      reportFragments: [`generated ${totalPages} pages in ${outputDirRel}`]
    };
  }
};
