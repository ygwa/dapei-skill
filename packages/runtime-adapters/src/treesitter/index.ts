/**
 * Tree-sitter as the default finding layer for CDR.
 *
 * Public surface:
 *   - TreeSitterCodeMapAdapter: parse files / directories into CodeMapFile[]
 *   - CodeMapFile / CodeMapSymbol / CodeMapEntryCandidate: typed result shapes
 *   - ParseStatus: 'clean' | 'partial' | 'unsupported' | 'oversized'
 *
 * Design constraints (see docs/decisions/ADR-0006-treesitter-default-finding-layer.md):
 *   - Always available on Node ≥ 22 (built-in, no external CLI)
 *   - parse_status reflects per-file degradation, never "no code_map"
 *   - entry_candidates is a weak structural signal (public method + has decorators);
 *     engine does NOT decide whether a method is a route / entry point
 *   - Decorator attach is per-language (TS sibling, Python preceding, Java child)
 *
 * Failure model:
 *   - 'clean'        — zero ERROR / MISSING nodes, full symbols emitted
 *   - 'partial'      — ERROR nodes present; symbols outside ERROR emitted, intersecting entries marked
 *   - 'unsupported'  — extension not in registry; emit empty code_map
 *   - 'oversized'    — file > 32 MB; emit empty code_map without parsing
 */

import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";
import Python from "tree-sitter-python";
import Java from "tree-sitter-java";
import { readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { listFilesRecursively } from "../system.ts";
import { attachDecoratorsForLanguage } from "./attach/decorators.ts";

export type SupportedLanguage = "typescript" | "javascript" | "python" | "java";

export type ParseStatus = "clean" | "partial" | "unsupported" | "oversized";

export interface CodeMapSymbol {
  kind: "class" | "function" | "method" | "interface" | "module";
  name: string;
  start_line: number;
  end_line: number;
  decorators?: string[];
  parent?: string;
}

export interface CodeMapImport {
  source: string;
  line: number;
}

export interface CodeMapEntryCandidate {
  symbol: string;       // "ClassName#methodName" or "functionName"
  line: number;
  decorators: string[];
}

export interface CodeMapFile {
  relpath: string;
  language: SupportedLanguage | "unsupported";
  parse_status: ParseStatus;
  symbols: CodeMapSymbol[];
  imports: CodeMapImport[];
  entry_candidates?: CodeMapEntryCandidate[];
  parse_diagnostic?: string;
}

export interface TreeSitterDoctor {
  backend: "native";
  languages: SupportedLanguage[];
  files_parsed: number;
  files_partial: number;
  files_unsupported: number;
  files_oversized: number;
  cold_start_ms: number;
}

const SIZE_CAP_BYTES = 32 * 1024 * 1024;  // 32 MB; per Aura / tree-sitter#222

const EXT_TO_LANG: Record<string, SupportedLanguage> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".java": "java",
};

const CODE_EXTS = Object.keys(EXT_TO_LANG);

interface LanguageBinding {
  language: SupportedLanguage;
  // The Parser accepts a Language object. For TypeScript we use .typescript;
  // for TSX files we use .tsx (handled in getLanguageForFile).
  load(): unknown;
  // For typescript we need both .ts and .tsx grammars; helper returns the right one.
  loadForFile?(relpath: string): unknown;
}

let _registry: Map<SupportedLanguage, unknown> | null = null;
let _coldStartMs = 0;

function loadRegistry(): Map<SupportedLanguage, unknown> {
  if (_registry) return _registry;
  const t0 = performance.now();
  _registry = new Map<SupportedLanguage, unknown>([
    ["javascript", JavaScript],
    ["typescript", TypeScript.typescript],
    ["python", Python],
    ["java", Java],
  ]);
  _coldStartMs = Math.round(performance.now() - t0);
  return _registry;
}

function getLanguageForFile(relpath: string): { lang: SupportedLanguage | null; languageObj: unknown } {
  const ext = extname(relpath).toLowerCase();
  const lang = EXT_TO_LANG[ext];
  if (!lang) return { lang: null, languageObj: null };
  const registry = loadRegistry();
  if (lang === "typescript" && (ext === ".tsx" || ext === ".jsx")) {
    return { lang, languageObj: TypeScript.tsx };
  }
  return { lang, languageObj: registry.get(lang) };
}

/**
 * Walk the CST and extract the structural signals we expose to CDR.
 *
 * - imports: top-level import / require / using statements
 * - symbols: class / function / method / interface / module (alias for type aliases)
 * - decorators: per-language attach (see attach/decorators.ts)
 *
 * Returns CodeMapSymbol[] and CodeMapImport[] with 1-based line numbers.
 */
function extractSymbols(rootNode: any, source: string): { symbols: CodeMapSymbol[]; imports: CodeMapImport[] } {
  const symbols: CodeMapSymbol[] = [];
  const imports: CodeMapImport[] = [];

  const collect = (node: any): void => {
    if (!node) return;

    // Imports — language-specific shapes
    if (
      node.type === "import_statement" ||            // TS / JS ESM
      node.type === "import_declaration" ||           // Java
      node.type === "import_from_statement" ||        // Python
      node.type === "expression_statement" &&         // Python `import x` (no from)
        node.namedChild?.type === "call" &&
        (node.namedChild.text?.startsWith("import ") || false)
    ) {
      const src =
        node.childForFieldName?.("source")?.text?.replace(/^['"]|['"]$/g, "") ||
        node.namedChildren?.find?.((c: any) => c.type === "string" || c.type === "string_literal")?.text?.replace(/^['"]|['"]$/g, "") ||
        node.text?.match(/from\s+['"]([^'"]+)['"]/)?.[1] ||
        node.text?.match(/import\s+['"]([^'"]+)['"]/)?.[1] ||
        node.text?.match(/import\s+(\S+)/)?.[1] ||
        "";
      if (src) {
        imports.push({ source: src, line: node.startPosition.row + 1 });
      }
    }

    // Symbols
    const kind = mapNodeKindToSymbolKind(node.type);
    if (kind) {
      let name = "";
      const nameNode = node.childForFieldName?.("name");
      if (nameNode) {
        name = nameNode.text;
      } else if (node.type === "arrow_function" || node.type === "function_expression") {
        // Anonymous function — name comes from the parent variable_declarator
        const parent = node.parent;
        if (parent?.type === "variable_declarator") {
          const varName = parent.childForFieldName?.("name");
          if (varName) name = varName.text;
        }
      } else {
        name = node.namedChildren?.find?.((c: any) => c.type === "identifier" || c.type === "property_identifier" || c.type === "type_identifier")?.text || "";
      }
      if (name) {
        symbols.push({
          kind,
          name,
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
        });
      }
    }

    // Recurse
    for (let i = 0; i < node.childCount; i++) {
      collect(node.child(i));
    }
  };

  collect(rootNode);
  return { symbols, imports };
}

function mapNodeKindToSymbolKind(type: string): CodeMapSymbol["kind"] | null {
  switch (type) {
    case "class_declaration":
    case "class_definition":
    case "record_declaration":
      return "class";
    case "function_declaration":
    case "function_definition":
    case "function":
    case "generator_function_declaration":
      return "function";
    case "method_definition":
    case "method_declaration":
    case "public_method_definition":
      return "method";
    case "interface_declaration":
    case "interface_body":
    case "annotation_type_declaration":  // Java @interface
      return "interface";
    case "type_alias_declaration":
    case "module":
    case "lexical_declaration":
      return "module";
    default:
      return null;
  }
}

/**
 * Parse a single file into a CodeMapFile.
 *
 * Degradation policy:
 *   - File > 32 MB → 'oversized', no parse attempted
 *   - Extension not in registry → 'unsupported'
 *   - Parse with no ERROR nodes → 'clean'
 *   - Parse with ERROR nodes → 'partial', symbols outside ERROR emitted
 *
 * Decorator attach runs after parse and may promote a class/method's
 * `decorators` field. See attach/decorators.ts for per-language logic.
 */
export function parseFile(repoPath: string, relpath: string): CodeMapFile {
  const absPath = join(repoPath, relpath);
  const stat = statSync(absPath);
  if (stat.size > SIZE_CAP_BYTES) {
    return {
      relpath,
      language: "unsupported",
      parse_status: "oversized",
      symbols: [],
      imports: [],
      parse_diagnostic: `file size ${stat.size} exceeds ${SIZE_CAP_BYTES} bytes; skipped before parse`,
    };
  }

  const { lang, languageObj } = getLanguageForFile(relpath);
  if (!lang || !languageObj) {
    return {
      relpath,
      language: "unsupported",
      parse_status: "unsupported",
      symbols: [],
      imports: [],
      parse_diagnostic: `extension ${extname(relpath)} not in tree-sitter registry`,
    };
  }

  const source = readFileSync(absPath, "utf8");

  // node-tree-sitter#222: 32768-byte boundary bug.
  // bufferSize must be at least source.length + 3 slack.
  const bufferSize = Math.max(1024 * 1024, source.length + 3);
  const parser = new Parser();
  parser.setLanguage(languageObj as any);
  let tree: any;
  try {
    tree = parser.parse(source, undefined, { bufferSize } as any);
  } catch (e: any) {
    return {
      relpath,
      language: lang,
      parse_status: "partial",
      symbols: [],
      imports: [],
      parse_diagnostic: `parser.parse threw: ${e?.message ?? String(e)}`,
    };
  }

  const { symbols, imports } = extractSymbols(tree.rootNode, source);

  // Check for ERROR / MISSING nodes anywhere in the tree
  let hasErrors = false;
  const walk = (n: any): void => {
    if (!n) return;
    if (n.type === "ERROR" || n.isMissing) hasErrors = true;
    if (!hasErrors) {
      for (let i = 0; i < n.childCount; i++) walk(n.child(i));
    }
  };
  walk(tree.rootNode);

  // Per-language decorator attach
  const decorated = attachDecoratorsForLanguage(lang, symbols, tree.rootNode, source);

  // Compute entry_candidates: public method/class/function with decorators
  const entry_candidates: CodeMapEntryCandidate[] = [];
  for (const sym of decorated) {
    if (sym.decorators && sym.decorators.length > 0 && (sym.kind === "method" || sym.kind === "function" || sym.kind === "class")) {
      const handle = sym.parent ? `${sym.parent}#${sym.name}` : sym.name;
      entry_candidates.push({ symbol: handle, line: sym.start_line, decorators: sym.decorators });
    }
  }

  const result: CodeMapFile = {
    relpath,
    language: lang,
    parse_status: hasErrors ? "partial" : "clean",
    symbols: decorated,
    imports,
  };
  if (hasErrors) {
    result.parse_diagnostic = "tree contains ERROR or MISSING nodes; partial symbols emitted";
  }
  if (entry_candidates.length > 0) result.entry_candidates = entry_candidates;
  return result;
}

/**
 * Walk a repo directory and parse every supported file. Yields results as it goes.
 */
export function* parseDirectory(repoPath: string, opts: { maxFiles?: number } = {}): Generator<CodeMapFile> {
  const maxFiles = opts.maxFiles ?? 1000;
  const files = listFilesRecursively(repoPath, CODE_EXTS, maxFiles);
  for (const abs of files) {
    const relpath = abs.startsWith(repoPath + "/") ? abs.slice(repoPath.length + 1) : abs;
    yield parseFile(repoPath, relpath);
  }
}

export class TreeSitterCodeMapAdapter {
  private readonly coldStartMs: number;

  constructor() {
    // Force cold start measurement at construction time
    loadRegistry();
    this.coldStartMs = _coldStartMs;
  }

  isAvailable(): boolean {
    return true;
  }

  fullDoctor(): TreeSitterDoctor {
    return {
      backend: "native",
      languages: ["typescript", "javascript", "python", "java"],
      files_parsed: 0,
      files_partial: 0,
      files_unsupported: 0,
      files_oversized: 0,
      cold_start_ms: this.coldStartMs,
    };
  }

  parseFile(repoPath: string, relpath: string): CodeMapFile {
    return parseFile(repoPath, relpath);
  }

  parseDirectory(repoPath: string, opts: { maxFiles?: number } = {}): CodeMapFile[] {
    const out: CodeMapFile[] = [];
    for (const cm of parseDirectory(repoPath, opts)) out.push(cm);
    return out;
  }
}