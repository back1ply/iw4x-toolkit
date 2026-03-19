/**
 * @file gsc/formatter.ts
 * GSC source code formatter operating on a Token[] stream.
 *
 * Pure function — no I/O. Feed it tokens from GSCTokenizer, get formatted source back.
 * Future: replace internals with tree-sitter CST walker (see design spec).
 */

import { Token, TokenType } from "./tokenizer.js";

export interface FormatOptions {
  /** Number of spaces per indent level. Default: 4 */
  indentSize?: number;
  /** Brace style. Only "k&r" supported for now. Reserved for future styles. */
  braceStyle?: "k&r";
}

/**
 * Format a GSC token stream into a consistently styled source string.
 * Rules: 4-space indent, K&R braces, spaces around binary operators,
 * blank line between top-level functions, trailing whitespace stripped.
 */
// Token types that are "word-like" — need a space before the next word-like token
const WORD_TYPES = new Set([
  TokenType.IDENTIFIER,
  TokenType.KEYWORD,
  TokenType.NUMBER,
  TokenType.STRING,
]);

// Token types that are binary operators — need spaces on both sides
const BINARY_OP_TYPES = new Set([
  TokenType.EQUAL,
  TokenType.PLUS,
  TokenType.MINUS,
  TokenType.STAR,
  TokenType.SLASH,
  TokenType.PERCENT,
  TokenType.LESS,
  TokenType.GREATER,
  TokenType.AMPERSAND,
  TokenType.PIPE,
  TokenType.CARET,
  TokenType.EQUAL_EQUAL,
  TokenType.BANG_EQUAL,
  TokenType.LESS_EQUAL,
  TokenType.GREATER_EQUAL,
  TokenType.AMPERSAND_AMPERSAND,
  TokenType.PIPE_PIPE,
  TokenType.PLUS_EQUAL,
  TokenType.MINUS_EQUAL,
  TokenType.STAR_EQUAL,
  TokenType.SLASH_EQUAL,
]);

// Control keywords that require a space before their opening paren: if (x), while (x), etc.
const CONTROL_KEYWORDS = new Set([
  "if", "else", "for", "while", "switch", "foreach", "do",
]);

/** Returns true if a token following `prev` in a unary position (e.g. -1 after =). */
function isUnaryContext(prev: Token | null): boolean {
  if (!prev) return true;
  return [
    TokenType.LEFT_PAREN,
    TokenType.LEFT_BRACKET,
    TokenType.EQUAL,
    TokenType.PLUS_EQUAL,
    TokenType.MINUS_EQUAL,
    TokenType.STAR_EQUAL,
    TokenType.SLASH_EQUAL,
    TokenType.COMMA,
    TokenType.SEMICOLON,
    TokenType.EQUAL_EQUAL,
    TokenType.BANG_EQUAL,
    TokenType.LESS,
    TokenType.GREATER,
    TokenType.LESS_EQUAL,
    TokenType.GREATER_EQUAL,
    TokenType.AMPERSAND_AMPERSAND,
    TokenType.PIPE_PIPE,
    TokenType.BANG,
  ].includes(prev.type);
}

function needsSpaceBefore(prev: Token, cur: Token, prevPrev: Token | null = null): boolean {
  // Never space around :: (COLON tokens used as path separator)
  if (cur.type === TokenType.COLON || prev.type === TokenType.COLON) return false;
  // Never space before comma or semicolon
  if (cur.type === TokenType.COMMA || cur.type === TokenType.SEMICOLON) return false;
  // Never space after opening paren/bracket
  if (prev.type === TokenType.LEFT_PAREN || prev.type === TokenType.LEFT_BRACKET) return false;
  // Never space before closing paren/bracket
  if (cur.type === TokenType.RIGHT_PAREN || cur.type === TokenType.RIGHT_BRACKET) return false;
  // No space before opening paren after an identifier (function call)
  if (cur.type === TokenType.LEFT_PAREN && prev.type === TokenType.IDENTIFIER) return false;
  // Space after comma
  if (prev.type === TokenType.COMMA) return true;
  // Space after control keywords before (
  if (
    prev.type === TokenType.KEYWORD &&
    CONTROL_KEYWORDS.has(prev.value) &&
    cur.type === TokenType.LEFT_PAREN
  ) return true;
  // Binary operator spacing
  if (BINARY_OP_TYPES.has(cur.type)) return true;
  if (BINARY_OP_TYPES.has(prev.type)) {
    // No space after a unary minus/plus (e.g. "= -1" should not become "= - 1")
    if ((prev.type === TokenType.MINUS || prev.type === TokenType.PLUS) && isUnaryContext(prevPrev)) return false;
    return true;
  }
  // Space between two word-like tokens
  if (WORD_TYPES.has(prev.type) && WORD_TYPES.has(cur.type)) return true;
  // Space after closing paren/bracket before a word
  if (
    (prev.type === TokenType.RIGHT_PAREN || prev.type === TokenType.RIGHT_BRACKET) &&
    WORD_TYPES.has(cur.type)
  ) return true;
  return false;
}

export function format(tokens: Token[], opts?: FormatOptions): string {
  const indentSize = opts?.indentSize ?? 4;
  const toks = tokens.filter(t => t.type !== TokenType.EOF);
  if (toks.length === 0) return "";

  const lines: string[] = [];
  let currentLine: string[] = [];
  let indentLevel = 0;
  let prevTok: Token | null = null;
  let prevPrevTok: Token | null = null;

  const flushLine = () => {
    const content = currentLine.join("").trimEnd();
    lines.push(content.length > 0 ? " ".repeat(indentSize * indentLevel) + content : "");
    currentLine = [];
  };

  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];

    // Newlines — flush current line
    if (tok.type === TokenType.NEWLINE) {
      flushLine();
      prevPrevTok = null;
      prevTok = null;
      continue;
    }

    // Opening brace — K&R: stays on same line, content after goes to next line
    if (tok.type === TokenType.LEFT_BRACE) {
      if (currentLine.length > 0 && !currentLine[currentLine.length - 1].endsWith(" ")) {
        currentLine.push(" ");
      }
      currentLine.push("{");
      flushLine();
      indentLevel++;
      prevPrevTok = prevTok;
      prevTok = tok;
      continue;
    }

    // Closing brace — dedent before placing }
    if (tok.type === TokenType.RIGHT_BRACE) {
      // Only flush if there's content pending on the current line
      if (currentLine.length > 0) flushLine();
      indentLevel = Math.max(0, indentLevel - 1);
      currentLine.push("}");
      flushLine();
      prevPrevTok = prevTok;
      prevTok = tok;
      continue;
    }

    // Semicolon — end of statement, flush line
    if (tok.type === TokenType.SEMICOLON) {
      currentLine.push(";");
      flushLine();
      prevPrevTok = prevTok;
      prevTok = tok;
      continue;
    }

    // Insert space between tokens where needed
    if (prevTok !== null && currentLine.length > 0 && needsSpaceBefore(prevTok, tok, prevPrevTok)) {
      currentLine.push(" ");
    }

    currentLine.push(tok.value);
    prevPrevTok = prevTok;
    prevTok = tok;
  }

  // Flush remaining content
  if (currentLine.length > 0) flushLine();

  // Post-process: collapse consecutive blank lines, insert blank between top-level functions
  const processed: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = processed[processed.length - 1];

    // Collapse multiple blank lines → max one
    if (line.trim() === "" && (prevLine === undefined || prevLine.trim() === "")) continue;

    // Insert blank line after a top-level closing } if next line starts a new function
    if (prevLine === "}" && line.trim() !== "" && !line.trim().startsWith("}")) {
      processed.push("");
    }

    processed.push(line);
  }

  // Strip trailing empty lines
  while (processed.length > 0 && processed[processed.length - 1].trim() === "") {
    processed.pop();
  }

  return processed.join("\n");
}
