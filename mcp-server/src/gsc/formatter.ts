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
export function format(tokens: Token[], opts?: FormatOptions): string {
  const indentSize = opts?.indentSize ?? 4;
  void indentSize; // used in full implementation

  // Filter out EOF token
  const toks = tokens.filter(t => t.type !== TokenType.EOF);
  if (toks.length === 0) return "";

  // Placeholder: join token values for now
  return toks.map(t => t.value).join(" ");
}
