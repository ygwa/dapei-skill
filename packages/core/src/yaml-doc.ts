import { CapabilityError } from "./types.ts";

export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

function parseScalar(raw: string): YamlValue {
  const t = raw.trim();
  if (t === "null" || t === "~") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function stripInlineComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (ch === "#" && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

function indentOf(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

function isBlockLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("- ") || t.includes(":");
}

function parseNode(lines: string[], index: number, indent: number): { value: YamlValue; next: number } {
  if (index >= lines.length) return { value: null, next: index };

  const line = stripInlineComment(lines[index]).trimEnd();
  const trimmed = line.trim();
  if (!trimmed) return parseNode(lines, index + 1, indent);

  const currentIndent = indentOf(line);

  if (trimmed.startsWith("- ")) {
    const items: YamlValue[] = [];
    let i = index;
    while (i < lines.length) {
      const raw = stripInlineComment(lines[i]).trimEnd();
      const t = raw.trim();
      if (!t) {
        i++;
        continue;
      }
      if (indentOf(raw) < indent) break;
      if (!t.startsWith("- ")) break;

      const afterDash = t.slice(2);
      if (afterDash.includes(": ")) {
        const obj: Record<string, YamlValue> = {};
        const colonIdx = afterDash.indexOf(": ");
        const firstKey = afterDash.slice(0, colonIdx).trim();
        const firstRest = afterDash.slice(colonIdx + 2).trim();
        if (firstRest) {
          obj[firstKey] = parseScalar(firstRest);
          i++;
        } else {
          const child = parseNode(lines, i + 1, indentOf(raw) + 2);
          obj[firstKey] = child.value;
          i = child.next;
        }
        while (i < lines.length) {
          const nextRaw = stripInlineComment(lines[i]).trimEnd();
          const nextTrim = nextRaw.trim();
          if (!nextTrim) {
            i++;
            continue;
          }
          if (indentOf(nextRaw) <= indentOf(raw)) break;
          if (nextTrim.startsWith("- ")) break;
          const cIdx = nextTrim.indexOf(": ");
          if (cIdx < 0) break;
          const key = nextTrim.slice(0, cIdx).trim();
          const rest = nextTrim.slice(cIdx + 2).trim();
          if (rest) {
            obj[key] = parseScalar(rest);
            i++;
          } else {
            const child = parseNode(lines, i + 1, indentOf(nextRaw) + 2);
            obj[key] = child.value;
            i = child.next;
          }
        }
        items.push(obj);
      } else {
        items.push(parseScalar(afterDash));
        i++;
      }
    }
    return { value: items, next: i };
  }

  const obj: Record<string, YamlValue> = {};
  let i = index;
  while (i < lines.length) {
    const raw = stripInlineComment(lines[i]).trimEnd();
    const t = raw.trim();
    if (!t) {
      i++;
      continue;
    }
    if (indentOf(raw) < indent) break;
    if (indentOf(raw) > indent) break;
    if (t.startsWith("- ")) break;

    const colonIdx = t.indexOf(": ");
    if (colonIdx < 0 && t.endsWith(":")) {
      const key = t.slice(0, -1).trim();
      const child = parseNode(lines, i + 1, indent + 2);
      obj[key] = child.value;
      i = child.next;
      continue;
    }
    if (colonIdx < 0) break;

    const key = t.slice(0, colonIdx).trim();
    const rest = t.slice(colonIdx + 2).trim();
    if (rest) {
      obj[key] = parseScalar(rest);
      i++;
    } else {
      const child = parseNode(lines, i + 1, indent + 2);
      obj[key] = child.value;
      i = child.next;
    }
  }

  if (Object.keys(obj).length === 1 && i === index + 1 && typeof obj[Object.keys(obj)[0]] !== "object") {
    return { value: obj[Object.keys(obj)[0]], next: i };
  }
  return { value: obj, next: i };
}

export function parseYamlDocument(content: string): Record<string, YamlValue> {
  const lines = content.split("\n");
  let start = 0;
  while (start < lines.length && !lines[start].trim()) start++;
  if (start >= lines.length) throw new CapabilityError("INVALID_YAML", "empty yaml document");

  const parsed = parseNode(lines, start, indentOf(lines[start]));
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    throw new CapabilityError("INVALID_YAML", "yaml root must be an object");
  }
  return parsed.value as Record<string, YamlValue>;
}

export function stringifyYamlValue(value: YamlValue, indent = 0): string {
  if (value === undefined) return "null";
  const pad = " ".repeat(indent);
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (/[:#\n]/.test(value) || value === "") return `"${value.replace(/"/g, '\\"')}"`;
    return value;
  }
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return value
      .map((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const entries = Object.entries(item as Record<string, YamlValue>);
          const [firstKey, firstVal] = entries[0];
          const rest = entries.slice(1);
          const firstRendered = typeof firstVal === "object" && firstVal !== null
            ? `\n${stringifyYamlValue(firstVal, indent + 4)}`
            : ` ${stringifyYamlValue(firstVal)}`;
          let block = `${pad}- ${firstKey}:${firstRendered}\n`;
          for (const [k, v] of rest) {
            if (v && typeof v === "object") block += `${stringifyYamlValue(v, indent + 2).replace(/^/gm, `${pad}  ${k}:\n${pad}  `)}\n`;
            else block += `${pad}  ${k}: ${stringifyYamlValue(v)}\n`;
          }
          return block.trimEnd();
        }
        return `${pad}- ${stringifyYamlValue(item)}`;
      })
      .join("\n");
  }
  return Object.entries(value as Record<string, YamlValue>)
    .map(([k, v]) => {
      if (v && typeof v === "object") return `${pad}${k}:\n${stringifyYamlValue(v, indent + 2)}`;
      return `${pad}${k}: ${stringifyYamlValue(v)}`;
    })
    .join("\n");
}

export function stringifyYamlDocument(doc: Record<string, YamlValue>): string {
  return stringifyYamlValue(doc) + "\n";
}
