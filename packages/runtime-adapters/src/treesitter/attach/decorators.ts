/**
 * Per-language decorator attach.
 *
 * Tree-sitter's CST puts decorator/annotation nodes in different positions
 * depending on the language:
 *
 *   - TypeScript: decorator is a sibling in `class_body`, NOT a child of
 *     `method_definition`. (See tree-sitter-typescript#309 — open issue.)
 *     We walk `class_body` and attach each preceding `(decorator)` to the
 *     next `method_definition` / `public_field_definition`.
 *
 *   - Python: decorator is a preceding sibling of `function_definition` /
 *     `class_definition`. The tag query captures them in order; no attach needed.
 *
 *   - Java: annotation is a CHILD of `method_declaration` / `class_declaration`.
 *     Already correct in CST; we just collect them into the symbol's decorators.
 *
 *   - JavaScript: no first-class decorator support (legacy TS only); adapter
 *     returns symbols unchanged.
 *
 * Decorator capture is a structural signal — the engine does NOT interpret
 * whether `@Get('/foo')` is a route. AI decides that from context.
 */

import type { CodeMapSymbol, SupportedLanguage } from "../index.ts";

interface SyntaxNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childCount: number;
  child(i: number): SyntaxNode | null;
  childForFieldName(name: string): SyntaxNode | null;
  namedChildren: SyntaxNode[];
  parent: SyntaxNode | null;
  nextNamedSibling: SyntaxNode | null;
  previousNamedSibling: SyntaxNode | null;
}

function nodeText(n: SyntaxNode | null | undefined): string {
  return n ? n.text : "";
}

function decoratorName(n: SyntaxNode): string {
  // Common shapes:
  //   @Get        → identifier "Get"
  //   @app.get    → attribute "app.get"
  //   @Component  → identifier "Component"
  //   @RestController → identifier "RestController"
  //   @GetMapping("/orders") → call with function name "GetMapping"
  const fn = n.childForFieldName?.("function") || n.childForFieldName?.("name");
  if (fn) return nodeText(fn);
  if (n.namedChildren && n.namedChildren.length > 0) {
    return nodeText(n.namedChildren[0]);
  }
  return nodeText(n);
}

function lineOf(n: SyntaxNode): number {
  return n.startPosition.row + 1;
}

function attachTypeScript(symbols: CodeMapSymbol[], root: SyntaxNode): CodeMapSymbol[] {
  // TS decorator attach: decorators sit in two positions:
  //   (a) Sibling in `class_body` before `method_definition` / `public_field_definition`
  //   (b) Sibling in `export_statement` / `abstract_class_declaration` / etc. before `class_declaration`
  //
  // Build a map: symbol start_line → set of decorator text
  const byStartLine = new Map<number, string[]>();

  const walk = (node: SyntaxNode): void => {
    if (!node) return;
    if (node.type === "class_body" || node.type === "interface_body") {
      let pendingDecorators: SyntaxNode[] = [];
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (!c) continue;
        if (c.type === "decorator") {
          pendingDecorators.push(c);
        } else if (
          c.type === "method_definition" ||
          c.type === "public_field_definition" ||
          c.type === "method_signature" ||
          c.type === "abstract_method_signature"
        ) {
          if (pendingDecorators.length > 0) {
            const ln = lineOf(c);
            const arr = byStartLine.get(ln) ?? [];
            for (const d of pendingDecorators) arr.push(decoratorName(d));
            byStartLine.set(ln, arr);
            pendingDecorators = [];
          }
        } else {
          pendingDecorators = [];
        }
      }
    }

    // Class-level decorators: check the PARENT of class_declaration for
    // preceding decorator siblings (typical when wrapped in export_statement,
    // abstract_class_declaration, etc.).
    if (node.type === "class_declaration" || node.type === "abstract_class_declaration") {
      const parent = node.parent;
      if (parent) {
        const decs: string[] = [];
        for (let i = 0; i < parent.childCount; i++) {
          const c = parent.child(i);
          if (!c) continue;
          if (c === node) break;
          if (c.type === "decorator") decs.push(decoratorName(c));
        }
        if (decs.length > 0) {
          const ln = lineOf(node);
          const arr = byStartLine.get(ln) ?? [];
          for (const d of decs) arr.push(d);
          byStartLine.set(ln, arr);
        }
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c) walk(c);
    }
  };

  walk(root);

  return symbols.map((s) => {
    const decs = byStartLine.get(s.start_line);
    if (decs && decs.length > 0) {
      return { ...s, decorators: dedup(decs) };
    }
    return s;
  });
}

function attachPython(symbols: CodeMapSymbol[], root: SyntaxNode): CodeMapSymbol[] {
  // Python decorators are preceding siblings in module / block; collected
  // by the position of the next function_definition / class_definition.
  const byStartLine = new Map<number, string[]>();

  const walk = (node: SyntaxNode): void => {
    if (!node) return;
    if (node.type === "function_definition" || node.type === "class_definition") {
      // Collect preceding decorator siblings
      const decs: string[] = [];
      let prev = node.previousNamedSibling;
      while (prev && prev.type === "decorator") {
        decs.push(decoratorName(prev));
        prev = prev.previousNamedSibling;
      }
      if (decs.length > 0) {
        byStartLine.set(lineOf(node), decs.reverse());
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c) walk(c);
    }
  };

  walk(root);

  return symbols.map((s) => {
    const decs = byStartLine.get(s.start_line);
    if (decs && decs.length > 0) {
      return { ...s, decorators: dedup(decs) };
    }
    return s;
  });
}

function attachJava(symbols: CodeMapSymbol[], root: SyntaxNode): CodeMapSymbol[] {
  // Java annotations live in `modifiers` (positional child[0]) of method_declaration,
  // class_declaration, interface_declaration, record_declaration, annotation_type_declaration.
  // tree-sitter-java does NOT expose "modifiers" via childForFieldName, so we iterate
  // positional children and look for the first child with type "modifiers".
  const byStartLine = new Map<number, string[]>();

  const collectAnnotations = (modifiersNode: SyntaxNode): string[] => {
    const out: string[] = [];
    if (!modifiersNode || !modifiersNode.namedChildren) return out;
    for (const m of modifiersNode.namedChildren) {
      if (m.type === "annotation" || m.type === "marker_annotation" || m.type === "annotation_type") {
        out.push(annotationName(m));
      }
    }
    return out;
  };

  const walk = (node: SyntaxNode): void => {
    if (!node) return;
    if (
      node.type === "method_declaration" ||
      node.type === "class_declaration" ||
      node.type === "interface_declaration" ||
      node.type === "record_declaration" ||
      node.type === "annotation_type_declaration"
    ) {
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c && c.type === "modifiers") {
          const decs = collectAnnotations(c);
          if (decs.length > 0) {
            byStartLine.set(lineOf(node), decs);
          }
          break;
        }
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c) walk(c);
    }
  };

  walk(root);

  return symbols.map((s) => {
    const decs = byStartLine.get(s.start_line);
    if (decs && decs.length > 0) {
      return { ...s, decorators: dedup(decs) };
    }
    return s;
  });
}

function annotationName(n: SyntaxNode): string {
  // Java annotation shapes:
  //   @Component          → marker_annotation with name "Component"
  //   @GetMapping("/x")   → annotation with name "GetMapping" (call expression)
  //   @Valid              → annotation
  const nameNode = n.childForFieldName?.("name");
  if (nameNode) return nodeText(nameNode);
  // annotation may wrap a scoped_identifier (e.g. @foo.Bar)
  if (n.namedChildren && n.namedChildren.length > 0) {
    return nodeText(n.namedChildren[0]);
  }
  return nodeText(n);
}

function dedup(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

/**
 * Public entry: dispatch on language to the right attach logic.
 */
export function attachDecoratorsForLanguage(
  lang: SupportedLanguage,
  symbols: CodeMapSymbol[],
  root: unknown,
  _source: string
): CodeMapSymbol[] {
  const r = root as SyntaxNode;
  switch (lang) {
    case "typescript":
      return attachTypeScript(symbols, r);
    case "javascript":
      return symbols;  // no first-class decorator support
    case "python":
      return attachPython(symbols, r);
    case "java":
      return attachJava(symbols, r);
  }
}