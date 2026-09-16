/**
 * @file gsc/orphans.ts
 * Orphaned-call analysis: find function calls in a GSC file that no local
 * definition, #include, builtin, or indexed symbol resolves.
 */

import { outline, type IncludeDef } from "./outline.js";
import { getKnownBuiltins } from "./builtins.js";
import { getStats, resolveInclude, hasSymbol } from "./symbols.js";
import { tokenize, TokenType } from "./tokenizer.js";

export interface CallSite { name: string; line: number }

type Tokens = ReturnType<typeof tokenize>["tokens"];
const NON_CODE_TOKENS = new Set([TokenType.COMMENT, TokenType.BLOCK_COMMENT, TokenType.EOF]);

/** Index of the next non-comment token at or after `from`, or -1. */
function nextRealToken(tokens: Tokens, from: number): number {
  for (let k = from; k < tokens.length; k++) {
    if (!NON_CODE_TOKENS.has(tokens[k].type)) return k;
  }
  return -1;
}

/** True if the `(` at `parenIndex` belongs to a function definition (closes into a `{`). */
function isFunctionDefParen(tokens: Tokens, parenIndex: number): boolean {
  let j = parenIndex + 1;
  let depth = 1;
  while (j < tokens.length && depth > 0) {
    if (tokens[j].type === TokenType.LEFT_PAREN) depth++;
    else if (tokens[j].type === TokenType.RIGHT_PAREN) depth--;
    j++;
  }
  const afterParen = nextRealToken(tokens, j);
  return afterParen !== -1 && tokens[afterParen].type === TokenType.LEFT_BRACE;
}

function isDoubleBracket(tokens: Tokens, i: number): boolean {
  return tokens[i].type === TokenType.RIGHT_BRACKET && tokens[i + 1]?.type === TokenType.RIGHT_BRACKET;
}

/** Skip a `[[ptr]]` function-pointer expression; returns the index of its final `]`. */
function skipPointerCall(tokens: Tokens, i: number): number {
  while (i < tokens.length - 1 && !isDoubleBracket(tokens, i)) i++;
  return i + 1; // land on the second ]
}

/** The call site at `i` (IDENTIFIER followed by `(`), excluding top-level function defs, or null. */
function callSiteAt(tokens: Tokens, i: number, braceDepth: number): CallSite | null {
  if (tokens[i].type !== TokenType.IDENTIFIER) return null;
  const nxt = nextRealToken(tokens, i + 1);
  if (nxt === -1 || tokens[nxt].type !== TokenType.LEFT_PAREN) return null;
  // At depth 0 a def is `name(...) {` — skip those; calls live deeper or lack the brace.
  if (braceDepth === 0 && isFunctionDefParen(tokens, nxt)) return null;
  return { name: tokens[i].value, line: tokens[i].line };
}

/**
 * Find every function call site via the tokenizer.
 * A call site is an IDENTIFIER followed by LEFT_PAREN, excluding function
 * definitions (IDENTIFIER ( ... ) { at brace depth 0) and [[ptr]]() pointer
 * calls, which are not statically resolvable.
 */
export function collectCallSites(tokens: Tokens): { callSites: CallSite[]; ptrCallCount: number } {
  const callSites: CallSite[] = [];
  let ptrCallCount = 0;
  let braceDepth = 0;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok.type === TokenType.LEFT_BRACE) { braceDepth++; continue; }
    if (tok.type === TokenType.RIGHT_BRACE) { braceDepth = Math.max(0, braceDepth - 1); continue; }

    // Skip [[ptr]]() patterns — not statically resolvable.
    if (tok.type === TokenType.LEFT_BRACKET && tokens[i + 1]?.type === TokenType.LEFT_BRACKET) {
      ptrCallCount++;
      i = skipPointerCall(tokens, i);
      continue;
    }

    const call = callSiteAt(tokens, i, braceDepth);
    if (call) callSites.push(call);
  }

  return { callSites, ptrCallCount };
}

/** Resolve every #include into known symbols, collecting any that can't be resolved. */
function resolveIncludedSymbols(
  includes: IncludeDef[], hintDir: string | undefined,
): { included: Set<string>; unresolved: string[] } {
  const included = new Set<string>();
  const unresolved: string[] = [];
  for (const inc of includes) {
    const resolved = resolveInclude(inc.path, hintDir);
    if (resolved.source === "unresolved") unresolved.push(inc.path);
    else for (const sym of resolved.symbols) included.add(sym);
  }
  return { included, unresolved };
}

export interface OrphanAnalysis {
  orphans: CallSite[];
  unresolvedIncludes: string[];
  ptrCallCount: number;
  indexStats: ReturnType<typeof getStats>;
}

/** Analyse `source` for calls nothing resolves. `hintDir` lets #includes resolve from disk. */
export async function findOrphans(source: string, hintDir?: string): Promise<OrphanAnalysis> {
  const outlineResult = outline(source);
  const local = new Set(outlineResult.functions.map(f => f.name.toLowerCase()));
  const { included, unresolved } = resolveIncludedSymbols(outlineResult.includes, hintDir);
  const builtins = await getKnownBuiltins();

  const { callSites, ptrCallCount } = collectCallSites(tokenize(source).tokens);
  const orphans = callSites.filter((c) => {
    const lower = c.name.toLowerCase();
    return !local.has(lower) && !included.has(lower) && !builtins.has(lower) && !hasSymbol(lower);
  });
  return { orphans, unresolvedIncludes: unresolved, ptrCallCount, indexStats: getStats() };
}

/** Header + per-call listing for a non-empty orphan set. */
function formatOrphanList(orphans: CallSite[], fileName: string, indexStats: ReturnType<typeof getStats>): string {
  const uniqueOrphans = new Set(orphans.map(o => o.name.toLowerCase())).size;
  let out = `Found ${orphans.length} orphaned call(s) (${uniqueOrphans} unique) in ${fileName}\n`;
  out += indexStats.symbols === 0
    ? `⚠️  Symbol index is empty — run iwd_index_symbols first to reduce false positives.\n`
    : `Symbol index: ${indexStats.symbols} symbols — indexed at ${indexStats.indexedAt?.toLocaleTimeString() ?? "unknown"}\n`;
  out += "\n";

  const seen = new Set<string>();
  for (const o of orphans) {
    const isDup = seen.has(o.name.toLowerCase());
    seen.add(o.name.toLowerCase());
    out += `  Line ${String(o.line).padStart(4)}  ${o.name}()${isDup ? "  (duplicate)" : ""}\n`;
  }
  return out;
}

/** Trailing notes about unresolved includes and skipped pointer calls. */
function formatOrphanFooter(unresolvedIncludes: string[], ptrCallCount: number): string {
  let out = "";
  if (unresolvedIncludes.length > 0) {
    out += `\nUnresolved includes (symbols unknown — not on disk, not in index):\n`;
    for (const inc of unresolvedIncludes) out += `  ${inc}\n`;
  }
  if (ptrCallCount > 0) {
    out += `\nNote: ${ptrCallCount} function pointer call(s) [[ptr]]() skipped — not statically resolvable.\n`;
  }
  return out;
}

/** Render the orphan report text. */
export function formatOrphanReport(a: OrphanAnalysis, fileName: string): string {
  const body = a.orphans.length === 0
    ? `✅ 0 orphaned calls in ${fileName}.\nAll function calls are resolved (local, includes, builtins, or symbol index).`
    : formatOrphanList(a.orphans, fileName, a.indexStats);
  return body + formatOrphanFooter(a.unresolvedIncludes, a.ptrCallCount);
}
