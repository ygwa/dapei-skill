// Pure-string extractors used by route input builders. Extracted from
// the monolithic router so they can be unit-tested in isolation and
// reused from the new data-driven route table.
//
// Behavior is preserved verbatim from the original index.ts so existing
// corpus cases pass without semantic drift. Bug fixes live next to the
// affected routes in routes-table.ts (the Chinese `cdr.profile` regex
// was tightened; the Chinese `cdr.crossrepo.doc.generate` pattern was
// reordered ahead of `cdr.doc.generate`).

export function matchAny(text: string, phrases: string[]): boolean {
  return phrases.some((p) => text.includes(p));
}

export function matchAll(text: string, phrases: string[]): boolean {
  return phrases.every((p) => text.includes(p));
}

export function extractFeatureName(t: string): string {
  const patterns = [
    /feature[:\s]+([a-z0-9-]+)/i,
    /([a-z0-9-]+)[\s\n]/,
    /\/([a-z0-9-]+)$/
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return m[1];
  }
  return "";
}

export function extractName(t: string): string {
  const patterns = [
    /(?:name|repo)[:\s]+([a-zA-Z0-9_-]+)/i,
    /add\s+([a-zA-Z0-9_-]+)/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return m[1];
  }
  return "";
}

export function extractUrl(t: string): string {
  const patterns = [
    /https?:\/\/[^\s]+/,
    /git@[^\s]+/
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) return m[0];
  }
  return "";
}

export function extractTarget(t: string): string {
  const m = t.match(/--all|--target\s+([a-zA-Z0-9_-]+)/i);
  if (m && m[1]) return m[1];
  if (t.includes("--all")) return "--all";
  return "";
}

export function extractRepos(t: string): string {
  const patterns = [
    /repos[:\s]+([a-zA-Z0-9_,-]+)/i,
    /--repos\s+([a-zA-Z0-9_,-]+)/i,
    /(?:包含|涉及)\s+([a-zA-Z0-9_,\s-]+?)(?:\s|,|$|\n)/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return m[1].trim().replace(/\s+/g, "");
  }
  return "";
}

export function extractObjective(t: string): string {
  const patterns = [
    /(?:goal|objective|目标|目的)[:\s]+(.+?)(?:\n|$)/i,
    /(?:goal|objective|目标)[:\s]+(.+?)(?:\.|$)/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return m[1].trim();
  }
  return "";
}

export const STAGES = [
  "analyze-current-state",
  "gap-analysis",
  "solution-design",
  "task-breakdown",
  "implementation",
  "local-validation",
  "architecture-review",
  "acceptance"
] as const;

export function extractStage(t: string): string {
  for (const s of STAGES) {
    if (t.includes(s)) return s;
  }
  const stageMatch = t.match(/stage[:\s]+([a-z-]+)/i);
  if (stageMatch) return stageMatch[1];
  return "";
}

export function extractRepoFromBehavior(t: string): string {
  const patterns = [
    /(?:for|repo|target)\s+([a-zA-Z0-9_-]+)/i,
    /behaviors?\s+for\s+([a-zA-Z0-9_-]+)/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1] && m[1] !== "behavior" && m[1] !== "behaviors") return m[1];
  }
  return "";
}

// CDR_NOISE — words that look like repo names but are actually part of
// the route pattern itself. Used by extractCdrRepoName to avoid false
// positives like "domain" or "portal".
export const CDR_NOISE = new Set([
  "repo", "repos", "the", "a", "an", "this", "that", "behavior", "behaviors",
  "state", "states", "entry", "entries", "domain", "product", "map", "maps",
  "documentation", "docs", "doc", "portal", "assets", "asset", "cognitive", "index",
  "all", "with", "using", "and", "or", "from", "to"
]);

export function extractCdrRepoName(t: string): string {
  // Pattern order matters: "in X at end" must come before "for X" so that
  // "for Order in mall-order" surfaces "mall-order", not "Order".
  const patterns = [
    /\bin\s+([a-zA-Z][a-zA-Z0-9_-]+)\s*$/,
    /\brepo\s+([a-zA-Z][a-zA-Z0-9_-]*)/i,
    /\bfor\s+([a-zA-Z][a-zA-Z0-9_-]+)\b/
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1] && !CDR_NOISE.has(m[1].toLowerCase())) return m[1];
  }
  return "";
}

export function extractCdrEntryId(t: string): string {
  const patterns = [
    /\bconfirm\s+entry\s+([a-zA-Z0-9_-]+)/i,
    /\bentry\s+([a-zA-Z0-9_-]+)/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1] && m[1].toLowerCase() !== "in") return m[1];
  }
  return "";
}

export function extractCdrEntityName(t: string): string {
  // Entity names are typically capitalized identifiers (Order, Payment, User)
  const patterns = [
    /\bentity\s+([A-Z][a-zA-Z0-9]*)/,
    /\bfor\s+([A-Z][a-zA-Z0-9]+)\b/,
    /\bof\s+([A-Z][a-zA-Z0-9]+)\b/,
    /\b([A-Z][a-zA-Z]{2,})\s+(?:state|states)\b/
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return m[1];
  }
  return "";
}

export function extractCdrDomainName(t: string): string {
  const patterns = [
    /\bcompose\s+domain\s+([a-zA-Z][a-zA-Z0-9_-]+)/i,
    /\bdomain\s+([a-zA-Z][a-zA-Z0-9_-]+)/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1] && m[1].toLowerCase() !== "from") return m[1];
  }
  return "";
}

export function extractCdrProductName(t: string): string {
  const patterns = [
    /\bcapability\s+map\s+for\s+(.+?)(?:\s+--|\n|$)/i,
    /\bfor\s+([A-Za-z][A-Za-z0-9 _-]+?)(?:\s+--|\n|$)/
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return m[1].trim();
  }
  return "";
}

export function extractCdrDescription(t: string): string {
  const patterns = [
    /(?:description|desc|描述)[:\s]+(.+?)(?:\n|$)/i
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return m[1].trim();
  }
  return "";
}
