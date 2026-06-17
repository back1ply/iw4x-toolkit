/**
 * @file gsc/patterns.ts
 * Line-based anti-pattern rules for IW4 GSC, plus a couple of style checks.
 */

import type { LintError } from "./linter.js";
import { getKnownDvars } from "./builtins.js";
import { MAX_LINE_LENGTH_WARNING } from "../utils.js";

/**
 * A single-line anti-pattern rule. `re` is matched against each source line;
 * on a hit, `build` produces the message/column/length for the emitted error.
 * Column defaults to the match index, length to the matched text length.
 */
interface PatternRule {
  code: string;
  type: LintError["type"];
  re: RegExp;
  build: (line: string, m: RegExpMatchArray) => { message: string; column: number; length: number };
}

/** Default column = match index, default length = matched substring length. */
function at(m: RegExpMatchArray, message: string, length?: number) {
  return { message, column: m.index ?? 0, length: length ?? m[0].length };
}

/**
 * IW4-specific anti-patterns (and a few style hints). Evaluated in order, one
 * match per line per rule.
 */
const PATTERN_RULES: PatternRule[] = [
  {
    code: "PAT-001", type: "warning", re: /isDefined\s*\(\s*\)/,
    build: (line) => ({ message: "isDefined() called without checking the result", column: 0, length: line.length }),
  },
  {
    code: "PAT-010", type: "error", re: /\bfunction\s+\w+\s*\(/,
    build: (line) => ({ message: "IW4 GSC does not support the `function` keyword. Write `myFunc() {}` not `function myFunc() {}`", column: 0, length: line.trimStart().length }),
  },
  {
    code: "PAT-011", type: "error", re: /\b(var|let|const)\s+\w/,
    build: (_l, m) => at(m, `IW4 GSC does not support '${m[1]}'. Use plain assignment: x = 5;`, m[1].length),
  },
  {
    code: "PAT-012", type: "error", re: /\.(push|pop|shift|unshift|splice)\s*\(/,
    build: (_l, m) => at(m, `IW4 GSC does not support .${m[1]}(). ${m[1] === "push" ? "use arr[arr.size] = item;" : "no direct equivalent — rethink with indexed loop"}`),
  },
  {
    code: "PAT-013", type: "error", re: /\.length\b/,
    build: (_l, m) => at(m, "IW4 GSC uses .size not .length for array/string length", 7),
  },
  {
    code: "PAT-014", type: "error", re: /===|!==/,
    build: (_l, m) => at(m, "IW4 GSC does not support === or !==. Use == or != instead", 3),
  },
  {
    code: "PAT-015", type: "error", re: /\s\?\s/,
    build: (_l, m) => ({ message: "IW4 GSC does not support the ternary operator (?:). Use if/else instead", column: (m.index ?? 0) + 1, length: 1 }),
  },
  {
    code: "PAT-016", type: "error", re: /=>/,
    build: (_l, m) => at(m, "IW4 GSC does not support arrow functions (=>). Use named functions", 2),
  },
  {
    code: "PAT-017", type: "error", re: /[=(,]\s*\{[^}]*\w+\s*:|\breturn\s+\{[^}]*\w+\s*:/,
    build: (line) => ({ message: "IW4 GSC does not support object literals {key: value}. Use spawnstruct() then assign properties", column: 0, length: line.trimStart().length }),
  },
  {
    code: "PAT-018", type: "error", re: /\bnull\b/,
    build: (_l, m) => at(m, "IW4 GSC does not have 'null'. Use !isDefined(x) to test for undefined variables", 4),
  },
  {
    code: "PAT-019", type: "error", re: /\b(Math\.\w+|parseInt|parseFloat|Number\s*\(|Boolean\s*\(|JSON\.)\s*/,
    build: (_l, m) => {
      const name = m[1].replace(/\s*$/, "");
      const alt = name === "parseInt" ? "int()" :
                  name === "parseFloat" ? "float()" :
                  name.startsWith("Math.floor") ? "int()" :
                  name.startsWith("Math.") ? "a built-in GSC math function (randomint, sin, cos, etc.)" :
                  "GSC equivalent";
      return at(m, `'${name}' is a JavaScript global not available in IW4 GSC. Use ${alt}`, m[0].trimEnd().length);
    },
  },
  {
    code: "PAT-020", type: "error", re: /`/,
    build: (_l, m) => at(m, 'IW4 GSC does not support template literals (`). Use string concatenation: "Hello " + name', 1),
  },
  {
    code: "PAT-021", type: "error", re: /\bnew\s+\w/,
    build: (_l, m) => at(m, "IW4 GSC does not support the `new` keyword. Use spawnstruct() to create objects", 3),
  },
  {
    code: "PAT-022", type: "error", re: /\bthis\./,
    build: (_l, m) => at(m, "IW4 GSC does not have 'this'. Use 'self' for the current entity context", 5),
  },
  {
    code: "PAT-023", type: "error", re: /\bfor\s*\([^)]*\bof\b|\b(forEach|\.map|\.filter|\.reduce)\s*\(/,
    build: (line) => ({ message: "IW4 GSC does not support for...of or .forEach. Use: for(i=0; i<arr.size; i++)", column: 0, length: line.trimStart().length }),
  },
  {
    code: "PAT-024", type: "error", re: /\.(concat|join|slice|indexOf|includes|startsWith|endsWith|split|trim|replace)\s*\(/,
    build: (_l, m) => {
      const alts: Record<string, string> = {
        concat: "use + operator for strings",
        indexOf: "use strtok() or manual loop",
        split: "use strtok()",
        trim: "no equivalent — avoid extra whitespace",
        replace: "no equivalent — rethink approach",
      };
      return at(m, `IW4 GSC does not support .${m[1]}(). ${alts[m[1]] ?? "no direct equivalent in IW4 GSC"}`);
    },
  },
];

/** Apply every regex pattern rule to one line, pushing any matches. */
function applyPatternRules(line: string, lineNum: number, errors: LintError[]): void {
  for (const rule of PATTERN_RULES) {
    const m = line.match(rule.re);
    if (!m) continue;
    const { message, column, length } = rule.build(line, m);
    errors.push({ type: rule.type, code: rule.code, message, line: lineNum, column, length });
  }
}

/** STY-001: warn on lines longer than the configured threshold. */
function checkLineLength(line: string, lineNum: number, errors: LintError[]): void {
  if (line.length <= MAX_LINE_LENGTH_WARNING) return;
  errors.push({
    type: "info", code: "STY-001",
    message: `Line exceeds ${MAX_LINE_LENGTH_WARNING} characters (${line.length})`,
    line: lineNum, column: 0, length: line.length,
  });
}

/** STY-002: suggest a DVAR for ALL_CAPS string literals not already known. */
async function checkHardcodedDvars(line: string, lineNum: number, errors: LintError[]): Promise<void> {
  if (!line.includes('"') || !line.match(/"[^"]*[A-Z_]{4,}[^"]*"/)) return;
  const matches = line.match(/"[A-Z_]+"/g);
  if (!matches) return;
  const dvars = await getKnownDvars();
  for (const m of matches) {
    if (dvars.has(m.replace(/"/g, "").toLowerCase())) continue;
    errors.push({
      type: "info", code: "STY-002",
      message: `Consider using a DVAR instead of hardcoded '${m}'`,
      line: lineNum, column: line.indexOf(m), length: m.length,
    });
  }
}

/** Run all single-line pattern + style checks across the source. */
export async function checkLinePatterns(source: string): Promise<LintError[]> {
  const errors: LintError[] = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    applyPatternRules(lines[i], lineNum, errors);
    checkLineLength(lines[i], lineNum, errors);
    await checkHardcodedDvars(lines[i], lineNum, errors);
  }
  return errors;
}
