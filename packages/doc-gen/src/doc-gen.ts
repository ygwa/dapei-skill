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
}

function confidenceBadge(doc: Record<string, unknown>): string {
  const conf = doc.confidence as Record<string, unknown> | undefined;
  const kind = String(conf?.kind || "unknown");
  if (kind === "fact") return "🟢 fact";
  if (kind === "inference") return "🟡 inference";
  return "🔴 unknown";
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
      results.push({ file: f, doc: doc as Record<string, unknown> });
    } catch {
      // skip unparseable files gracefully
    }
  }
  return results;
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

function generateCapabilityPage(cap: ParsedDoc, rootDir: string): string {
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

function generateDomainPage(domain: ParsedDoc, rootDir: string): string {
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
    md += `| [${id}](/behaviors/${safeId(id)}) | ${repo} | ${confidenceBadge(b.doc)} | ${entryStr} |\n`;
  }
  return md;
}

function generateBehaviorPage(behavior: ParsedDoc, rootDir: string): string {
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
    md += `- **Entry:** ${String(entry.type || "")} ${String(entry.method || "")} ${String(entry.path || entry.handler || "")}\n`;
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
      md += `| ${String(wr.target || wr.table || "—")} | ${String(wr.operation || "—")} | ${fields} |\n`;
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

  // Calls
  const calls = behavior.doc.calls as unknown[] | undefined;
  if (Array.isArray(calls) && calls.length > 0) {
    md += "\n## Calls\n\n";
    for (const c of calls) {
      if (typeof c === "string") {
        md += `- \`${c}\`\n`;
      } else {
        const co = c as Record<string, unknown>;
        md += `- **${String(co.target || co.service || "?")}** — ${String(co.method || co.action || "")}\n`;
      }
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
    md += `| [${entity}](/states/${safeId(entity)}) | ${repo} | ${confidenceBadge(s.doc)} | ${stateList} |\n`;
  }
  return md;
}

function generateStatePage(sm: ParsedDoc, rootDir: string): string {
  const entity = String(sm.doc.entity || "unknown");
  let md = `---
title: "${entity}"
---

# State Machine: ${entity}

- **Confidence:** ${confidenceBadge(sm.doc)}
- **Repo:** ${String(sm.doc.repo || "—")}
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
    md += "| From | To | Trigger |\n";
    md += "|------|----|---------|\n";
    for (const t of transitions) {
      const tr = t as Record<string, unknown>;
      md += `| ${String(tr.from || "—")} | ${String(tr.to || "—")} | ${String(tr.trigger || "—")} |\n`;
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
    md += `| [${id}](/business-rules/${safeId(id)}) | \`${kind}\` | ${confidenceBadge(r.doc)} | ${desc} |\n`;
  }
  return md;
}

function generateBusinessRulePage(rule: ParsedDoc, rootDir: string): string {
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
      md += `- \`${String(a)}\`\n`;
    }
  }

  const derivedFrom = rule.doc.derived_from as string[] | undefined;
  if (Array.isArray(derivedFrom) && derivedFrom.length > 0) {
    md += "\n## Derived From\n\n";
    for (const d of derivedFrom) {
      md += `- \`${String(d)}\`\n`;
    }
  }

  md += sourcesSection(rule.doc, rootDir);
  return md;
}

function generateVitepressConfig(
  productName: string,
  sidebarConfig: Record<string, Array<{ text: string; items?: Array<{ text: string; link: string }> }>>
): string {
  return `import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '${productName} - Knowledge Portal',
  description: 'Auto-generated living documentation from code analysis',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Capabilities', link: '/capabilities/' },
      { text: 'Domains', link: '/domains/' },
      { text: 'Behaviors', link: '/behaviors/' },
      { text: 'States', link: '/states/' },
      { text: 'Business Rules', link: '/business-rules/' },
      { text: 'Profiles', link: '/profiles/' }
    ],
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
  version: "1.0.0",
  inputSchema: {
    properties: {
      output_dir: { type: "string" }
    },
    additionalProperties: false
  },
  async execute(ctx, input) {
    const outputDirRel = input.output_dir ? String(input.output_dir) : ".dapei/docs-portal";
    const p = workspacePaths(ctx.rootDir);
    const cp = cognitivePaths(ctx.rootDir);
    const outputDir = join(p.rootDir, outputDirRel);

    // Ensure output directories
    const subDirs = ["capabilities", "domains", "behaviors", "states", "profiles", "business-rules", ".vitepress"];
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
    const sidebarConfig: Record<string, Array<{ text: string; items: Array<{ text: string; link: string }> }>> = {};

    // --- Capabilities ---
    write(join(outputDir, "capabilities", "index.md"), generateCapabilityIndex(capDocs));
    totalPages++;
    const capItems: Array<{ text: string; link: string }> = [];
    for (const cap of capDocs) {
      const id = String(cap.doc.id || cap.doc.name || basename(cap.file, ".yaml"));
      const slug = safeId(id);
      write(join(outputDir, "capabilities", `${slug}.md`), generateCapabilityPage(cap, p.rootDir));
      capItems.push({ text: id, link: `/capabilities/${slug}` });
      totalPages++;
      sections.capabilities++;
    }
    sidebarConfig["/capabilities/"] = [{ text: "Capabilities", items: [{ text: "Overview", link: "/capabilities/" }, ...capItems] }];

    // --- Domains ---
    write(join(outputDir, "domains", "index.md"), generateDomainIndex(domainDocs));
    totalPages++;
    const domainItems: Array<{ text: string; link: string }> = [];
    for (const d of domainDocs) {
      const name = String(d.doc.name || d.doc.domain || basename(d.file, ".yaml"));
      const slug = safeId(name);
      write(join(outputDir, "domains", `${slug}.md`), generateDomainPage(d, p.rootDir));
      domainItems.push({ text: name, link: `/domains/${slug}` });
      totalPages++;
      sections.domains++;
    }
    sidebarConfig["/domains/"] = [{ text: "Domains", items: [{ text: "Overview", link: "/domains/" }, ...domainItems] }];

    // --- Behaviors ---
    write(join(outputDir, "behaviors", "index.md"), generateBehaviorIndex(behaviorDocs));
    totalPages++;
    const behaviorItems: Array<{ text: string; link: string }> = [];
    for (const b of behaviorDocs) {
      const id = String(b.doc.id || basename(b.file, ".yaml"));
      const slug = safeId(id);
      write(join(outputDir, "behaviors", `${slug}.md`), generateBehaviorPage(b, p.rootDir));
      behaviorItems.push({ text: id, link: `/behaviors/${slug}` });
      totalPages++;
      sections.behaviors++;
    }
    sidebarConfig["/behaviors/"] = [{ text: "Behaviors", items: [{ text: "Overview", link: "/behaviors/" }, ...behaviorItems] }];

    // --- State Machines ---
    write(join(outputDir, "states", "index.md"), generateStateIndex(stateDocs));
    totalPages++;
    const stateItems: Array<{ text: string; link: string }> = [];
    for (const s of stateDocs) {
      const entity = String(s.doc.entity || basename(s.file, ".yaml"));
      const slug = safeId(entity);
      write(join(outputDir, "states", `${slug}.md`), generateStatePage(s, p.rootDir));
      stateItems.push({ text: entity, link: `/states/${slug}` });
      totalPages++;
      sections.states++;
    }
    sidebarConfig["/states/"] = [{ text: "State Machines", items: [{ text: "Overview", link: "/states/" }, ...stateItems] }];

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
    sidebarConfig["/profiles/"] = [{ text: "Profiles", items: [{ text: "Overview", link: "/profiles/" }, ...profileItems] }];

    // --- Business Rules ---
    write(join(outputDir, "business-rules", "index.md"), generateBusinessRuleIndex(businessRuleDocs));
    totalPages++;
    const ruleItems: Array<{ text: string; link: string }> = [];
    for (const r of businessRuleDocs) {
      const id = String(r.doc.id || basename(r.file, ".yaml"));
      const slug = safeId(id);
      write(join(outputDir, "business-rules", `${slug}.md`), generateBusinessRulePage(r, p.rootDir));
      ruleItems.push({ text: id, link: `/business-rules/${slug}` });
      totalPages++;
      sections.business_rules++;
    }
    sidebarConfig["/business-rules/"] = [{ text: "Business Rules", items: [{ text: "Overview", link: "/business-rules/" }, ...ruleItems] }];

    // --- Homepage ---
    write(join(outputDir, "index.md"), generateHomepage(productName, index, sections));
    totalPages++;

    // --- VitePress config + custom theme (Vue components: BehaviorFlow / StateMachine / CodeLink) ---
    write(join(outputDir, "package.json"), generatePortalPackageJson());
    write(join(outputDir, ".vitepress", "config.mts"), generateVitepressConfig(productName, sidebarConfig));
    copyThemeTemplates(outputDir);

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
