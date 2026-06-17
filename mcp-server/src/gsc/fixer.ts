/**
 * @file gsc/fixer.ts
 * Best-effort auto-fixer for common GSC syntax mistakes (unterminated strings,
 * missing closing braces). Bracket counting ignores strings and comments.
 */

/** Auto-fix result. */
export interface FixResult {
  fixed: boolean;
  original: string;
  fixedCode: string;
  fixesApplied: string[];
}

/** A quote char (`"` or `'`) that is not backslash-escaped. */
function isUnescapedQuote(char: string, prev: string | undefined): boolean {
  return (char === '"' || char === "'") && prev !== "\\";
}

/**
 * Attempt to auto-fix common GSC syntax errors. Returns the fixed code and a
 * list of human-readable fixes applied. `fixed` is true only when the source
 * was actually changed (closing braces / quotes added) — unmatched parens or
 * brackets are reported as warnings without modifying the code.
 */
export function fix(source: string): FixResult {
  const strFix = closeUnterminatedStrings(source);
  const braceFix = closeUnmatchedBraces(strFix.code);
  return {
    fixed: strFix.changed || braceFix.changed,
    original: source,
    fixedCode: braceFix.code,
    fixesApplied: [...strFix.fixes, ...braceFix.fixes],
  };
}

/** Outcome of one fix pass: the (possibly) edited code, what changed, and notes. */
interface FixPass { code: string; changed: boolean; fixes: string[]; }

interface QuoteState { inString: boolean; stringChar: string; }

/** Toggle `state` across the quotes in one line (carries across lines). */
function scanQuotes(line: string, state: QuoteState): void {
  for (let j = 0; j < line.length; j++) {
    if (!isUnescapedQuote(line[j], j === 0 ? undefined : line[j - 1])) continue;
    if (!state.inString) {
      state.inString = true;
      state.stringChar = line[j];
    } else if (line[j] === state.stringChar) {
      state.inString = false;
    }
  }
}

/** Append a closing quote to any line left inside an unterminated string. */
function closeUnterminatedStrings(source: string): FixPass {
  const lines = source.split("\n");
  const state: QuoteState = { inString: false, stringChar: "" };
  const fixes: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    scanQuotes(lines[i], state);
    if (state.inString) {
      lines[i] += state.stringChar;
      fixes.push(`Line ${i + 1}: Added missing closing '${state.stringChar}'`);
    }
  }

  const changed = fixes.length > 0;
  return { code: changed ? lines.join("\n") : source, changed, fixes };
}

/** Append missing closing braces; warn (without editing) on unmatched parens/brackets. */
function closeUnmatchedBraces(code: string): FixPass {
  const counts = countBrackets(code);
  const fixes: string[] = [];
  let changed = false;

  if (counts.unmatchedBraces > 0) {
    code += "\n}".repeat(counts.unmatchedBraces);
    fixes.push(`Added ${counts.unmatchedBraces} missing closing brace(s)`);
    changed = true; // only brace insertion edits the code
  }
  if (counts.unmatchedParens > 0) {
    fixes.push(`Warning: ${counts.unmatchedParens} unmatched parenthesis(es) - manual fix required`);
  }
  if (counts.unmatchedBrackets > 0) {
    fixes.push(`Warning: ${counts.unmatchedBrackets} unmatched bracket(s) - manual fix required`);
  }

  return { code, changed, fixes };
}

// Per-bracket signed deltas, keyed by character: [braces, parens, brackets].
const BRACKET_DELTA: Record<string, readonly [number, number, number]> = {
  "{": [1, 0, 0], "}": [-1, 0, 0],
  "(": [0, 1, 0], ")": [0, -1, 0],
  "[": [0, 0, 1], "]": [0, 0, -1],
};

/** Count unmatched brackets in code, ignoring strings and comments. */
function countBrackets(code: string): {
  unmatchedBraces: number;
  unmatchedParens: number;
  unmatchedBrackets: number;
} {
  let braces = 0;
  let parens = 0;
  let brackets = 0;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < code.length; i++) {
    const char = code[i];

    if (isUnescapedQuote(char, code[i - 1])) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }
    if (inString) continue;

    const afterComment = skipCommentAt(code, i);
    if (afterComment !== i) {
      i = afterComment;
      continue;
    }

    const delta = BRACKET_DELTA[char];
    if (delta) {
      braces += delta[0];
      parens += delta[1];
      brackets += delta[2];
    }
  }

  return {
    unmatchedBraces: Math.max(0, braces),
    unmatchedParens: Math.max(0, parens),
    unmatchedBrackets: Math.max(0, brackets),
  };
}

/**
 * If a comment begins at `code[i]`, return the index `i` should hold right
 * before the caller's loop runs `i++` (i.e. resume just past the comment);
 * otherwise return `i` unchanged. Preserves the original scanner's behaviour,
 * including resuming one char after a closing block comment.
 */
function skipCommentAt(code: string, i: number): number {
  if (code[i] !== "/" || i + 1 >= code.length) return i;
  if (code[i + 1] === "/") return endOfLineComment(code, i);
  if (code[i + 1] === "*") return endOfBlockComment(code, i);
  return i;
}

function endOfLineComment(code: string, i: number): number {
  let j = i;
  while (j < code.length && code[j] !== "\n") j++;
  return j;
}

function endOfBlockComment(code: string, start: number): number {
  for (let j = start + 2; j < code.length - 1; j++) {
    if (code[j] === "*" && code[j + 1] === "/") return j + 2;
  }
  return code.length - 1;
}
