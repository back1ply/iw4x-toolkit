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

// Token types after which a +/- reads as a unary sign rather than a binary operator.
const UNARY_CONTEXT_TYPES = new Set([
  TokenType.LEFT_PAREN, TokenType.LEFT_BRACKET, TokenType.EQUAL,
  TokenType.PLUS_EQUAL, TokenType.MINUS_EQUAL, TokenType.STAR_EQUAL, TokenType.SLASH_EQUAL,
  TokenType.COMMA, TokenType.SEMICOLON, TokenType.EQUAL_EQUAL, TokenType.BANG_EQUAL,
  TokenType.LESS, TokenType.GREATER, TokenType.LESS_EQUAL, TokenType.GREATER_EQUAL,
  TokenType.AMPERSAND_AMPERSAND, TokenType.PIPE_PIPE, TokenType.BANG,
]);

/** True if a +/- following `prev` is in a unary position (e.g. -1 after =). */
function isUnaryContext(prev: Token | null): boolean {
  return !prev || UNARY_CONTEXT_TYPES.has(prev.type);
}

// ---------------------------------------------------------------------------
// Spacing rules
// ---------------------------------------------------------------------------

/** Cases where two adjacent tokens must NOT be separated by a space. */
function forcesNoSpace(prev: Token, cur: Token): boolean {
  if (cur.type === TokenType.COLON || prev.type === TokenType.COLON) return true;      // :: path sep
  if (cur.type === TokenType.COMMA || cur.type === TokenType.SEMICOLON) return true;   // before , ;
  if (prev.type === TokenType.LEFT_PAREN || prev.type === TokenType.LEFT_BRACKET) return true;   // after ( [
  if (cur.type === TokenType.RIGHT_PAREN || cur.type === TokenType.RIGHT_BRACKET) return true;   // before ) ]
  if (cur.type === TokenType.LEFT_PAREN && prev.type === TokenType.IDENTIFIER) return true;       // call paren
  return false;
}

function isControlKeywordParen(prev: Token, cur: Token): boolean {
  return prev.type === TokenType.KEYWORD && CONTROL_KEYWORDS.has(prev.value) && cur.type === TokenType.LEFT_PAREN;
}

function isUnarySign(prev: Token, prevPrev: Token | null): boolean {
  return (prev.type === TokenType.MINUS || prev.type === TokenType.PLUS) && isUnaryContext(prevPrev);
}

function isCloserBeforeWord(prev: Token, cur: Token): boolean {
  return (prev.type === TokenType.RIGHT_PAREN || prev.type === TokenType.RIGHT_BRACKET) && WORD_TYPES.has(cur.type);
}

/** Cases where two adjacent tokens SHOULD be separated by a space. */
function forcesSpace(prev: Token, cur: Token, prevPrev: Token | null): boolean {
  if (prev.type === TokenType.COMMA) return true;                  // after ,
  if (isControlKeywordParen(prev, cur)) return true;              // if (
  if (BINARY_OP_TYPES.has(cur.type)) return true;                 // before binary op
  if (BINARY_OP_TYPES.has(prev.type)) return !isUnarySign(prev, prevPrev); // after binary op (unless unary +/-)
  if (WORD_TYPES.has(prev.type) && WORD_TYPES.has(cur.type)) return true;  // word word
  if (isCloserBeforeWord(prev, cur)) return true;                // ) word
  return false;
}

function needsSpaceBefore(prev: Token, cur: Token, prevPrev: Token | null = null): boolean {
  if (forcesNoSpace(prev, cur)) return false;
  return forcesSpace(prev, cur, prevPrev);
}

// ---------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------

function isCollapsibleBlank(line: string, prevLine: string | undefined): boolean {
  return line.trim() === "" && (prevLine === undefined || prevLine.trim() === "");
}

function needsBlankBeforeFunction(line: string, prevLine: string | undefined): boolean {
  return prevLine === "}" && line.trim() !== "" && !line.trim().startsWith("}");
}

/** Collapse runs of blank lines, insert a blank between top-level functions, strip trailing blanks. */
function postProcessLines(lines: string[]): string[] {
  const processed: string[] = [];
  for (const line of lines) {
    const prevLine = processed[processed.length - 1];
    if (isCollapsibleBlank(line, prevLine)) continue;
    if (needsBlankBeforeFunction(line, prevLine)) processed.push("");
    processed.push(line);
  }
  while (processed.length > 0 && processed[processed.length - 1].trim() === "") processed.pop();
  return processed;
}

// ---------------------------------------------------------------------------
// Formatter (method-object over the threaded line/indent/prev-token state)
// ---------------------------------------------------------------------------

class GscFormatter {
  private readonly lines: string[] = [];
  private current: string[] = [];
  private indent = 0;
  private prev: Token | null = null;
  private prevPrev: Token | null = null;

  constructor(private readonly indentSize: number) {}

  format(toks: Token[]): string {
    for (const tok of toks) this.handle(tok);
    if (this.current.length > 0) this.flush();
    return postProcessLines(this.lines).join("\n");
  }

  private flush(): void {
    const content = this.current.join("").trimEnd();
    this.lines.push(content.length > 0 ? " ".repeat(this.indentSize * this.indent) + content : "");
    this.current = [];
  }

  private advance(tok: Token): void {
    this.prevPrev = this.prev;
    this.prev = tok;
  }

  private handle(tok: Token): void {
    switch (tok.type) {
      case TokenType.NEWLINE: this.flush(); this.prevPrev = null; this.prev = null; return;
      case TokenType.LEFT_BRACE: this.openBrace(tok); return;
      case TokenType.RIGHT_BRACE: this.closeBrace(tok); return;
      case TokenType.SEMICOLON: this.current.push(";"); this.flush(); this.advance(tok); return;
      case TokenType.COMMENT: this.lineComment(tok); return;
      case TokenType.BLOCK_COMMENT: this.blockComment(tok); return;
      default: this.word(tok);
    }
  }

  // K&R: opening brace stays on the line; content after it goes to the next line.
  private openBrace(tok: Token): void {
    if (this.current.length > 0 && !this.current[this.current.length - 1].endsWith(" ")) {
      this.current.push(" ");
    }
    this.current.push("{");
    this.flush();
    this.indent++;
    this.advance(tok);
  }

  private closeBrace(tok: Token): void {
    if (this.current.length > 0) this.flush();
    this.indent = Math.max(0, this.indent - 1);
    this.current.push("}");
    this.flush();
    this.advance(tok);
  }

  private lineComment(tok: Token): void {
    if (this.current.length > 0) this.current.push(" ");
    this.current.push("//" + tok.value);
    this.flush();
    this.advance(tok);
  }

  private blockComment(tok: Token): void {
    if (this.current.length > 0) this.flush();
    this.current.push("/*" + tok.value + "*/");
    this.flush();
    this.advance(tok);
  }

  private wantsSpaceBefore(tok: Token): boolean {
    return this.prev !== null && this.current.length > 0 && needsSpaceBefore(this.prev, tok, this.prevPrev);
  }

  private word(tok: Token): void {
    if (this.wantsSpaceBefore(tok)) this.current.push(" ");
    this.current.push(tok.value);
    this.advance(tok);
  }
}

/**
 * Format a GSC token stream into a consistently styled source string.
 * Rules: 4-space indent, K&R braces, spaces around binary operators,
 * blank line between top-level functions, trailing whitespace stripped.
 */
export function format(tokens: Token[], opts?: FormatOptions): string {
  const toks = tokens.filter((t) => t.type !== TokenType.EOF);
  if (toks.length === 0) return "";
  return new GscFormatter(opts?.indentSize ?? 4).format(toks);
}
