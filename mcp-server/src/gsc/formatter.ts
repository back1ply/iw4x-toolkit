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

function needsSpaceBefore(prev: Token, cur: Token): boolean {
  // Space before binary operators
  if (BINARY_OP_TYPES.has(cur.type)) return true;
  // Space after binary operators
  if (BINARY_OP_TYPES.has(prev.type)) return true;
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

  const flushLine = () => {
    const content = currentLine.join("").trimEnd();
    if (content.length > 0) {
      lines.push(" ".repeat(indentSize * indentLevel) + content);
    }
    currentLine = [];
  };

  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];

    // Newlines — flush current line
    if (tok.type === TokenType.NEWLINE) {
      flushLine();
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
      prevTok = tok;
      continue;
    }

    // Semicolon — end of statement, flush line
    if (tok.type === TokenType.SEMICOLON) {
      currentLine.push(";");
      flushLine();
      prevTok = tok;
      continue;
    }

    // Insert space between tokens where needed
    if (prevTok !== null && currentLine.length > 0 && needsSpaceBefore(prevTok, tok)) {
      currentLine.push(" ");
    }

    currentLine.push(tok.value);
    prevTok = tok;
  }

  // Flush remaining content
  if (currentLine.length > 0) flushLine();

  // Strip trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  return lines.join("\n");
}
