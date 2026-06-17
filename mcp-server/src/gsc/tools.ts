/**
 * @file gsc/tools.ts
 * Registers GSC tooling on the MCP server.
 * - gsc_lint: Lint GSC code for errors and warnings
 * - gsc_lookup: Search GSC built-in functions
 * - gsc_template: Generate code from templates
 */

import { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { lint, fix, LintResult, LintError, LintOptions, getKnownBuiltins, getKnownDvars } from "./linter.js";
import { outline, formatOutline, IncludeDef } from "./outline.js";
import { getKnowledgeDir, openIwd, errResult, okResult, buildDiffSnippet } from "../utils.js";
import { format } from "./formatter.js";
import { buildIndex, getStats, resolveInclude, hasSymbol } from "./symbols.js";
import { tokenize, TokenType } from "./tokenizer.js";

/** Shape every tool handler returns (mirrors utils.McpResult). */
type ToolResult = { content: { type: "text"; text: string }[]; isError?: true };

/**
 * GSC builtin function metadata
 */
interface GscBuiltin {
  name: string;
  description?: string;
  category?: string;
  parameters?: { name: string; type: string; optional?: boolean }[];
  returnType?: string;
  engines?: string[];
}

/**
 * GSC template metadata
 */
interface GscTemplate {
  code: string;
  description?: string;
  category?: string;
  variables?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Module-level caches for knowledge base data
// ---------------------------------------------------------------------------

let gscBuiltinsCache: Map<string, GscBuiltin> | null = null;
let templatesCache: Record<string, GscTemplate> | null = null;

/**
 * IW4 GSC anti-pattern entry
 */
interface AntiPattern {
  id: string;
  category: string;
  title: string;
  wrong: string;
  right: string;
  explanation: string;
}

let antiPatternsCache: AntiPattern[] | null = null;

function loadAntiPatterns(): AntiPattern[] {
  if (antiPatternsCache) return antiPatternsCache;

  const filePath = getKnowledgeDir("gsc-anti-patterns.json");
  if (!filePath) {
    antiPatternsCache = [];
    return antiPatternsCache;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    antiPatternsCache = data.patterns ?? [];
    return antiPatternsCache!;
  } catch {
    antiPatternsCache = [];
    return antiPatternsCache;
  }
}

/**
 * Load GSC builtins from knowledge base (cached after first load)
 */
function loadGscBuiltins(): Map<string, GscBuiltin> {
  if (gscBuiltinsCache) return gscBuiltinsCache;

  const filePath = getKnowledgeDir("gsc-builtins.json");
  if (!filePath) {
    gscBuiltinsCache = new Map();
    return gscBuiltinsCache;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    const funcs = new Map<string, GscBuiltin>();

    if (data.functions) {
      for (const func of data.functions) {
        funcs.set(func.name, func);
      }
    }
    gscBuiltinsCache = funcs;
    return gscBuiltinsCache;
  } catch {
    gscBuiltinsCache = new Map();
    return gscBuiltinsCache;
  }
}

/**
 * Load templates from knowledge base (cached after first load)
 */
function loadTemplates(): Record<string, GscTemplate> {
  if (templatesCache) return templatesCache;

  const filePath = getKnowledgeDir("templates.json");
  if (!filePath) {
    templatesCache = {};
    return templatesCache;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    templatesCache = JSON.parse(raw);
    return templatesCache!;
  } catch {
    templatesCache = {};
    return templatesCache;
  }
}

/**
 * Read source from a file path or fall back to inline content.
 * Shared by handlers whose error strings are identical (gsc_fix, gsc_outline).
 */
function loadFromPathOrContent(
  filePath: string | undefined,
  content: string | undefined,
): { source: string } | { error: ToolResult } {
  if (filePath) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      return { error: { content: [{ type: "text", text: `❌ File not found: ${resolved}` }] } };
    }
    try {
      return { source: fs.readFileSync(resolved, "utf-8") };
    } catch (e) {
      return { error: { content: [{ type: "text", text: `❌ Error reading file: ${e}` }] } };
    }
  }
  if (content) return { source: content };
  return { error: { content: [{ type: "text", text: "❌ Either path or content must be provided" }] } };
}

/** Render one "Line N: message" block under a heading, or "" if empty. */
function formatErrorGroup(heading: string, errors: LintError[], trailingBlank: boolean): string {
  if (errors.length === 0) return "";
  let out = `${heading}\n`;
  for (const err of errors) out += `  Line ${err.line}: ${err.message}\n`;
  return trailingBlank ? out + "\n" : out;
}

/**
 * Format lint errors for output
 */
function formatLintResult(result: LintResult): string {
  const stats = `Stats: ${result.stats.lines} lines, ${result.stats.tokens} tokens`;
  if (result.errors.length === 0) {
    return `✅ No issues found!\n\n${stats}`;
  }

  const errors = result.errors.filter(e => e.type === "error");
  const warnings = result.errors.filter(e => e.type === "warning");
  const infos = result.errors.filter(e => e.type === "info");

  return `📊 Results: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} suggestions\n\n` +
    formatErrorGroup("❌ **Errors:**", errors, true) +
    formatErrorGroup("⚠️  **Warnings:**", warnings, true) +
    formatErrorGroup("💡 **Suggestions:**", infos, false) +
    `\n---\n${stats}`;
}

// ---------------------------------------------------------------------------
// Tool handlers — one named function per tool. registerGscTools (below) only
// wires schemas to these, keeping each unit small and independently testable.
// ---------------------------------------------------------------------------

async function handleGscLint(
  { path: filePath, content, check_undefined, check_patterns }:
    { path?: string; content?: string; check_undefined: boolean; check_patterns: boolean },
): Promise<ToolResult> {
  let source: string;

  if (filePath) {
    // Read from file
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      return { content: [{ type: "text", text: `❌ File not found: ${resolved}` }] };
    }

    // Check it's a GSC file
    if (!resolved.toLowerCase().endsWith(".gsc") && !resolved.toLowerCase().endsWith(".gsh")) {
      return { content: [{ type: "text", text: `⚠️ Warning: File doesn't appear to be a GSC file (.gsc or .gsh)` }] };
    }

    try {
      source = fs.readFileSync(resolved, "utf-8");
    } catch (e) {
      return { content: [{ type: "text", text: `❌ Error reading file: ${e}` }] };
    }
  } else if (content) {
    source = content;
  } else {
    return { content: [{ type: "text", text: "❌ Either path or content must be provided" }] };
  }

  // Run linter with options
  const lintOptions: LintOptions = {
    checkUndefined: check_undefined,
    checkPatterns: check_patterns,
  };
  const result = await lint(source, lintOptions);
  const formatted = formatLintResult(result);

  return { content: [{ type: "text", text: formatted }] };
}

/** True when a builtin matches the query text (name or description) and category filter. */
function matchesBuiltin(name: string, func: GscBuiltin, q: string, cat: string | undefined): boolean {
  const nameMatch = name.toLowerCase().includes(q);
  const descMatch = func.description?.toLowerCase().includes(q) ?? false;
  const catMatch = cat ? func.category?.toLowerCase() === cat : true;
  return (nameMatch || descMatch) && catMatch;
}

/** Render one builtin reference entry. */
function formatBuiltinEntry(func: GscBuiltin): string {
  let s = `**${func.name}**`;
  if (func.category) s += ` [${func.category}]`;
  s += "\n";
  if (func.description) s += `  ${func.description}\n`;
  if (func.parameters) s += `  Params: ${func.parameters.map(p => `${p.name}: ${p.type}${p.optional ? "?" : ""}`).join(", ")}\n`;
  if (func.returnType) s += `  Returns: ${func.returnType}\n`;
  s += "\n";
  return s;
}

async function handleGscLookup(
  { query, category }: { query: string; category?: string },
): Promise<ToolResult> {
  const builtins = loadGscBuiltins();
  const q = query.toLowerCase();
  const cat = category?.toLowerCase();

  const matches: GscBuiltin[] = [];
  for (const [name, func] of builtins) {
    if (matchesBuiltin(name, func, q, cat)) matches.push(func);
  }

  if (matches.length === 0) {
    return { content: [{ type: "text", text: `No functions found matching '${query}'${cat ? ` in category '${cat}'` : ""}` }] };
  }

  let output = `Found ${matches.length} functions:\n\n`;
  for (const func of matches.slice(0, 20)) output += formatBuiltinEntry(func);

  if (matches.length > 20) {
    output += `\n...and ${matches.length - 20} more.`;
  }

  return { content: [{ type: "text", text: output }] };
}

/** Render the "Available templates" listing. */
function listTemplates(templates: Record<string, GscTemplate>): string {
  const names = Object.keys(templates);
  if (names.length === 0) {
    return "No templates available. Templates should be defined in knowledge/templates.json";
  }
  let output = "Available templates:\n\n";
  for (const name of names) {
    const t = templates[name];
    output += `**${name}**\n`;
    if (t.description) output += `  ${t.description}\n`;
    if (t.category) output += `  Category: ${t.category}\n`;
    output += "\n";
  }
  return output;
}

/** Substitute {{var}} placeholders, escaping regex-special chars in keys. */
function renderTemplate(code: string, variables: Record<string, string> | undefined): string {
  if (!variables) return code;
  for (const [key, value] of Object.entries(variables)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    code = code.replace(new RegExp(`{{${escapedKey}}}`, "g"), value);
  }
  return code;
}

async function handleGscTemplate(
  { template, variables, list }: { template?: string; variables?: Record<string, string>; list: boolean },
): Promise<ToolResult> {
  const templates = loadTemplates();

  if (list || !template) {
    return { content: [{ type: "text", text: listTemplates(templates) }] };
  }

  const t = templates[template];
  if (!t) {
    return { content: [{ type: "text", text: `Template '${template}' not found. Use list=true to see available templates.` }] };
  }

  const code = renderTemplate(t.code || "", variables);
  return { content: [{ type: "text", text: `Generated from '${template}':\n\n\`\`\`gsc\n${code}\n\`\`\`` }] };
}

async function handleGscFix(
  { path: filePath, content, write_back }: { path?: string; content?: string; write_back: boolean },
): Promise<ToolResult> {
  const loaded = loadFromPathOrContent(filePath, content);
  if ("error" in loaded) return loaded.error;
  const source = loaded.source;

  const result = fix(source);

  let output: string;
  if (!result.fixed) {
    output = "ℹ️  No auto-fixable issues found.\n\n" +
      "Run gsc_lint for a full diagnostic report.";
  } else {
    output = `✅ Fixed ${result.fixesApplied.length} issue(s):\n`;
    for (const change of result.fixesApplied) {
      output += `  • ${change}\n`;
    }
    output += `\n**Fixed code:**\n\`\`\`gsc\n${result.fixedCode}\n\`\`\``;

    if (write_back && filePath) {
      try {
        fs.writeFileSync(path.resolve(filePath), result.fixedCode, "utf-8");
        output += `\n\n✍️  Written back to: ${filePath}`;
      } catch (e) {
        output += `\n\n❌ Write failed: ${e}`;
      }
    }
  }

  return { content: [{ type: "text", text: output }] };
}

async function handleGscOutline(
  { path: filePath, content }: { path?: string; content?: string },
): Promise<ToolResult> {
  const loaded = loadFromPathOrContent(filePath, content);
  if ("error" in loaded) return loaded.error;
  const source = loaded.source;

  const result = outline(source);
  const formatted = formatOutline(result, source);

  return { content: [{ type: "text", text: formatted }] };
}

/** True when an anti-pattern matches the search term and category filter. */
function matchesAntiPattern(p: AntiPattern, q: string, cat: string | undefined): boolean {
  const inCat = cat ? p.category === cat : true;
  const inSearch = q
    ? p.title.toLowerCase().includes(q) ||
      p.wrong.toLowerCase().includes(q) ||
      p.right.toLowerCase().includes(q) ||
      p.explanation.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    : true;
  return inCat && inSearch;
}

/** Render the category listing shown when no search term is given. */
function formatAntiPatternCategories(patterns: AntiPattern[]): string {
  const counts: Record<string, number> = {};
  for (const p of patterns) {
    counts[p.category] = (counts[p.category] ?? 0) + 1;
  }
  if (Object.keys(counts).length === 0) {
    return "No anti-patterns loaded. Check knowledge/gsc-anti-patterns.json.";
  }
  let out = `📚 Anti-pattern categories (${patterns.length} total):\n\n`;
  for (const [cat, count] of Object.entries(counts).sort()) {
    out += `  **${cat}** — ${count} entries\n`;
  }
  out += "\nUse query='<term>' to search, or category='<name>' to filter.";
  return out;
}

/** Render one wrong→right anti-pattern entry. */
function formatAntiPatternEntry(p: AntiPattern): string {
  return `### ${p.id}: ${p.title} [${p.category}]\n\n` +
    `**Wrong:**\n\`\`\`gsc\n${p.wrong}\n\`\`\`\n\n` +
    `**Right:**\n\`\`\`gsc\n${p.right}\n\`\`\`\n\n` +
    `**Why:** ${p.explanation}\n\n---\n\n`;
}

/** Render up to 10 matching anti-patterns, with an overflow note. */
function renderAntiPatternMatches(matches: AntiPattern[]): string {
  let out = `Found ${matches.length} pattern(s):\n\n`;
  for (const p of matches.slice(0, 10)) out += formatAntiPatternEntry(p);
  if (matches.length > 10) out += `...and ${matches.length - 10} more. Narrow your query.`;
  return out;
}

async function handleGscAntiPatterns(
  { query, category, list }: { query?: string; category?: string; list: boolean },
): Promise<ToolResult> {
  const patterns = loadAntiPatterns();

  const hasFilter = Boolean(query || category);
  if (list || !hasFilter) {
    return { content: [{ type: "text", text: formatAntiPatternCategories(patterns) }] };
  }

  const cat = category?.toLowerCase();
  const matches = patterns.filter(p => matchesAntiPattern(p, query?.toLowerCase() ?? "", cat));
  if (matches.length === 0) {
    return { content: [{ type: "text", text: `No patterns found for '${query}'${cat ? ` in category '${cat}'` : ""}.\nUse list=true to see all categories.` }] };
  }

  return { content: [{ type: "text", text: renderAntiPatternMatches(matches) }] };
}

const isIwdFile = (p: string): boolean => p.toLowerCase().endsWith(".iwd");
const statOrNull = (p: string): fs.Stats | null => { try { return fs.statSync(p); } catch { return null; } };
const readdirOrNull = (p: string): string[] | null => { try { return fs.readdirSync(p); } catch { return null; } };

/** The .iwd files at one resolved path: the file itself, or .iwd entries if it's a directory. */
function iwdFilesAt(resolved: string): string[] {
  const stat = statOrNull(resolved);
  if (!stat) return []; // missing or unreadable — skip silently
  if (!stat.isDirectory()) return isIwdFile(resolved) ? [resolved] : [];
  return (readdirOrNull(resolved) ?? []).filter(isIwdFile).map(e => path.join(resolved, e));
}

/** Expand a list of file/directory paths into concrete .iwd file paths, skipping unreadable entries. */
function expandIwdPaths(paths: string[]): string[] {
  return paths.flatMap(p => iwdFilesAt(path.resolve(p)));
}

async function handleIwdIndexSymbols(
  { paths, clear }: { paths: string[]; clear: boolean },
): Promise<ToolResult> {
  const iwdPaths = expandIwdPaths(paths);

  const prevStats = getStats();
  const result = buildIndex(iwdPaths, clear);

  // Format output
  let out = `Indexed ${result.stats.symbols} symbols across ${result.stats.files} files in ${result.stats.archives} archive(s)`;
  if (result.perArchive.length === 0) {
    out += ".\nNo valid .iwd archives found in provided paths.";
  } else {
    out += ":\n";
    for (const a of result.perArchive) {
      const name = path.basename(a.archive);
      out += `  ${name.padEnd(40)} — ${a.symbols} symbols (${a.files} files)\n`;
    }
  }

  if (result.stats.symbols === 0) {
    out += "\nTip: verify the paths contain .iwd files with .gsc entries.";
  }

  if (clear || prevStats.symbols > 0) {
    out += `\nReplaced previous index (was ${prevStats.symbols} symbols).`;
  }

  return { content: [{ type: "text", text: out }] };
}

interface CallSite { name: string; line: number }

type OrphanSource = { source: string; hintDir?: string } | { error: ToolResult };

const orphanErr = (text: string): { error: ToolResult } => ({ error: { content: [{ type: "text", text }] } });

/** Read a GSC entry from inside an IWD archive. */
function readOrphanFromIwd(filePath: string, iwd: string): OrphanSource {
  const iwdResult = openIwd(path.resolve(iwd));
  if (!iwdResult.ok) return orphanErr(`❌ ${iwdResult.error}`);
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const entry = iwdResult.value.getEntry(normalized);
  if (!entry) return orphanErr(`❌ Entry not found in archive: ${normalized}`);
  try {
    return { source: entry.getData().toString("utf-8") };
  } catch (e) {
    return orphanErr(`❌ Failed to read entry: ${e}`);
  }
}

/** Read a GSC file from disk, recording its directory as an include hint. */
function readOrphanFromDisk(filePath: string): OrphanSource {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return orphanErr(`❌ File not found: ${resolved}`);
  try {
    return { source: fs.readFileSync(resolved, "utf-8"), hintDir: path.dirname(resolved) };
  } catch (e) {
    return orphanErr(`❌ Failed to read file: ${e}`);
  }
}

/** Load orphan-scan source from inline content, an IWD entry, or a disk path. */
function loadOrphanSource(
  content: string | undefined,
  filePath: string | undefined,
  iwd: string | undefined,
): OrphanSource {
  if (content) return { source: content };
  if (filePath && iwd) return readOrphanFromIwd(filePath, iwd);
  if (filePath) return readOrphanFromDisk(filePath);
  return orphanErr("❌ Either content or path must be provided");
}

/**
 * Find every function call site via the tokenizer.
 * A call site is an IDENTIFIER followed by LEFT_PAREN, excluding function
 * definitions (IDENTIFIER ( ... ) { at brace depth 0) and [[ptr]]() pointer
 * calls, which are not statically resolvable.
 */
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

function collectCallSites(tokens: Tokens): { callSites: CallSite[]; ptrCallCount: number } {
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

interface OrphanReport {
  orphans: CallSite[];
  fileName: string;
  indexStats: ReturnType<typeof getStats>;
  unresolvedIncludes: string[];
  ptrCallCount: number;
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
function formatOrphanReport(
  { orphans, fileName, indexStats, unresolvedIncludes, ptrCallCount }: OrphanReport,
): string {
  const body = orphans.length === 0
    ? `✅ 0 orphaned calls in ${fileName}.\nAll function calls are resolved (local, includes, builtins, or symbol index).`
    : formatOrphanList(orphans, fileName, indexStats);
  return body + formatOrphanFooter(unresolvedIncludes, ptrCallCount);
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

/** A call is orphaned when no source (local, include, builtin, or index) resolves it. */
function isUnresolvedCall(name: string, local: Set<string>, included: Set<string>, builtins: Set<string>): boolean {
  const lower = name.toLowerCase();
  return !local.has(lower) && !included.has(lower) && !builtins.has(lower) && !hasSymbol(lower);
}

async function handleGscFindOrphans(
  { content, path: filePath, iwd }: { content?: string; path?: string; iwd?: string },
): Promise<ToolResult> {
  const loaded = loadOrphanSource(content, filePath, iwd);
  if ("error" in loaded) return loaded.error;
  const { source, hintDir } = loaded;

  const outlineResult = outline(source);
  const localFunctions = new Set(outlineResult.functions.map(f => f.name.toLowerCase()));
  const { included, unresolved } = resolveIncludedSymbols(outlineResult.includes, hintDir);
  const builtins = await getKnownBuiltins();

  const { callSites, ptrCallCount } = collectCallSites(tokenize(source).tokens);
  const orphans = callSites.filter(c => isUnresolvedCall(c.name, localFunctions, included, builtins));

  const fileName = filePath ? path.basename(filePath) : "<inline>";
  const out = formatOrphanReport({ orphans, fileName, indexStats: getStats(), unresolvedIncludes: unresolved, ptrCallCount });

  return { content: [{ type: "text", text: out }] };
}

interface DvarAccess {
  fn: string;
  name: string;
  line: number;
}

/**
 * Extract DVAR string-literal accesses via regex. Matches getDvar/getDvarInt/
 * getDvarFloat/getDvarVector/setDvar/setDvarifuninitialized("name", ...).
 */
function extractDvarAccesses(source: string): DvarAccess[] {
  const DVAR_CALL_RE = /\b(getDvar|getDvarInt|getDvarFloat|getDvarVector|setDvar|setDvarifuninitialized)\s*\(\s*"([^"]+)"/gi;
  const lines = source.split("\n");
  const accesses: DvarAccess[] = [];
  for (let i = 0; i < lines.length; i++) {
    let match: RegExpExecArray | null;
    DVAR_CALL_RE.lastIndex = 0;
    while ((match = DVAR_CALL_RE.exec(lines[i])) !== null) {
      accesses.push({ fn: match[1], name: match[2], line: i + 1 });
    }
  }
  return accesses;
}

/** Format the DVAR integrity report from already-classified accesses. */
function formatDvarReport(fileName: string, known: DvarAccess[], unknown: DvarAccess[]): string {
  let out = `DVAR integrity check: ${fileName}\n`;
  out += `Scanned ${known.length + unknown.length} DVAR access(es) — ${known.length} known, ${unknown.length} unknown\n\n`;

  if (unknown.length > 0) {
    out += `⚠️  Unknown DVARs (possible typos or unsupported):\n`;
    for (const a of unknown) out += `  line ${a.line}: ${a.fn}("${a.name}")\n`;
    out += "\n";
  } else {
    out += `✅ All DVAR names are valid.\n\n`;
  }

  if (known.length > 0) {
    const uniqueKnown = [...new Set(known.map(a => a.name))];
    out += `✓ Known DVARs (${known.length}):\n  ${uniqueKnown.join(", ")}\n`;
  }
  return out;
}

async function handleDvarIntegrityCheck(
  { path: filePath, content }: { path?: string; content?: string },
): Promise<ToolResult> {
  const loaded = loadFromPathOrContent(filePath, content);
  if ("error" in loaded) return loaded.error;

  const accesses = extractDvarAccesses(loaded.source);
  if (accesses.length === 0) {
    return { content: [{ type: "text", text: "✅ No DVAR string literal accesses found." }] };
  }

  const knownDvars = await getKnownDvars();
  const known = accesses.filter(a => knownDvars.has(a.name.toLowerCase()));
  const unknown = accesses.filter(a => !knownDvars.has(a.name.toLowerCase()));

  const fileName = filePath ? path.basename(filePath) : "<inline>";
  return { content: [{ type: "text", text: formatDvarReport(fileName, known, unknown) }] };
}

/** Resolve format input: inline code, or an entry read from an IWD archive. */
function loadFormatSource(
  code: string | undefined, iwd_path: string | undefined, entry: string | undefined,
): { source: string } | { error: ToolResult } {
  if (code) return { source: code };

  const iwdResult = openIwd(iwd_path!); // openIwd is synchronous, returns Result<AdmZip>
  if (!iwdResult.ok) return { error: errResult(iwdResult.error) };
  const fileEntry = iwdResult.value.getEntry(entry!);
  if (!fileEntry) return { error: errResult(`Entry not found: ${entry}`) };
  return { source: fileEntry.getData().toString("utf-8") };
}

interface FormatWriteTarget {
  iwd_path: string;
  entry: string;
  source: string;
  formatted: string;
  dry_run: boolean;
}

/** Write formatted code back to the IWD entry (or preview a diff when dry_run). */
function writeFormattedToIwd({ iwd_path, entry, source, formatted, dry_run }: FormatWriteTarget): ToolResult {
  const iwdResult = openIwd(iwd_path);
  if (!iwdResult.ok) return errResult(iwdResult.error);
  const { snippet } = buildDiffSnippet(source, formatted);
  if (dry_run) {
    return okResult(`[dry_run] Would write formatted ${entry}:\n\n${snippet}`);
  }
  iwdResult.value.updateFile(entry, Buffer.from(formatted, "utf-8"));
  iwdResult.value.writeZip(iwd_path);
  return okResult(`Formatted and wrote ${entry}:\n\n${snippet}`);
}

/** Format tokenizer warnings as a trailing block, or "" when there are none. */
function formatTokenizerWarnings(tokErrors: ReturnType<typeof tokenize>["errors"]): string {
  if (tokErrors.length === 0) return "";
  return `\n\n⚠️ Tokenizer warnings (${tokErrors.length}):\n` +
    tokErrors.map(e => `  L${e.line}: ${e.message}`).join("\n");
}

async function handleGscFormat(
  { code, iwd_path, entry, write_back, dry_run }:
    { code?: string; iwd_path?: string; entry?: string; write_back?: boolean; dry_run?: boolean },
): Promise<ToolResult> {
  const hasIwdTarget = Boolean(iwd_path && entry);
  if (!code && !hasIwdTarget) {
    return errResult("Provide either 'code', or both 'iwd_path' and 'entry'.");
  }

  const loaded = loadFormatSource(code, iwd_path, entry);
  if ("error" in loaded) return loaded.error;

  const { tokens, errors: tokErrors } = tokenize(loaded.source);
  const formatted = format(tokens);

  if (write_back && hasIwdTarget) {
    return writeFormattedToIwd({ iwd_path: iwd_path!, entry: entry!, source: loaded.source, formatted, dry_run: dry_run ?? false });
  }

  return okResult("```gsc\n" + formatted + "\n```" + formatTokenizerWarnings(tokErrors));
}

// ---------------------------------------------------------------------------
// Tool registration — definitions live as data; registerGscTools just wires
// each one onto the server. gscTool() preserves per-tool schema↔handler typing.
// ---------------------------------------------------------------------------

const READ_ONLY = { readOnlyHint: true, idempotentHint: true } as const;

interface ToolConfig<A extends z.ZodRawShape> {
  title: string;
  description: string;
  inputSchema: A;
  annotations?: { readOnlyHint?: boolean; idempotentHint?: boolean };
}

/** Defer a single registerTool call, capturing its schema/handler types. */
function gscTool<A extends z.ZodRawShape>(
  name: string,
  config: ToolConfig<A>,
  handler: ToolCallback<A>,
): (server: McpServer) => void {
  return (server) => { server.registerTool(name, config, handler); };
}

const GSC_TOOLS: ((server: McpServer) => void)[] = [
  gscTool("gsc_lint", {
    title: "Lint GSC Code",
    description:
      "Lints GSC (Game Script) code for syntax errors, undefined variables, " +
      "bad patterns, and best practice violations. " +
      "Use this to validate GSC scripts before testing in-game. " +
      "Supports vibe coding: the LLM should run this after writing/modifying .gsc files.",
    inputSchema: {
      path: z.string().optional().describe("Path to .gsc file to lint. Either this or content must be provided."),
      content: z.string().optional().describe("GSC source code to lint directly. Either this or path must be provided."),
      check_undefined: z.boolean().optional().default(true).describe("Check for undefined variables and functions"),
      check_patterns: z.boolean().optional().default(true).describe("Check for bad patterns and anti-patterns"),
    },
    annotations: READ_ONLY,
  }, handleGscLint),

  gscTool("gsc_lookup", {
    title: "GSC Function Lookup",
    description:
      "Search the GSC built-in function reference. " +
      "Use this to find correct function signatures and descriptions. " +
      "Helps prevent hallucinated function names in vibe coding.",
    inputSchema: {
      query: z.string().describe("Search term (function name or keyword)"),
      category: z.string().optional().describe("Optional category filter"),
    },
    annotations: READ_ONLY,
  }, handleGscLookup),

  gscTool("gsc_template", {
    title: "Generate GSC from Template",
    description:
      "Generate GSC code from common templates. " +
      "Use this to quickly scaffold common patterns like callbacks, " +
      "gametypes, menus, etc. Reduces boilerplate errors.",
    inputSchema: {
      template: z.string().optional().describe("Template name (e.g., 'player_connect', 'killstreak'). Not required if list=true"),
      variables: z.record(z.string()).optional().describe("Variables to substitute in template (e.g., {player: 'self'})"),
      list: z.boolean().optional().default(false).describe("If true, list available templates instead of generating"),
    },
    annotations: READ_ONLY,
  }, handleGscTemplate),

  gscTool("gsc_fix", {
    title: "Auto-fix GSC Syntax Errors",
    description:
      "Attempts to auto-fix common GSC syntax errors: unmatched braces, " +
      "unterminated strings, and missing closing brackets. " +
      "Returns the fixed code and a list of changes made. " +
      "Use after gsc_lint reports fixable errors. " +
      "Set write_back=true to write the fix directly to a file path.",
    inputSchema: {
      path: z.string().optional().describe("Path to .gsc file to fix. Either this or content must be provided."),
      content: z.string().optional().describe("GSC source code to fix directly. Either this or path must be provided."),
      write_back: z.boolean().optional().default(false).describe("If true and path is provided, write the fixed code back to the file."),
    },
  }, handleGscFix),

  gscTool("gsc_outline", {
    title: "GSC File Outline",
    description:
      "Parses a GSC file and returns its structural skeleton: " +
      "function definitions (name, params, line), #include directives, " +
      "thread calls, event listeners (waittill/notify/endon), " +
      "and shared-state property assignments (level.x, self.x, game.x). " +
      "Use this BEFORE editing a GSC file to understand its structure " +
      "and avoid accidentally deleting functions or breaking event chains.",
    inputSchema: {
      path: z.string().optional().describe("Path to .gsc file to outline. Either this or content must be provided."),
      content: z.string().optional().describe("GSC source code to outline directly. Either this or path must be provided."),
    },
    annotations: READ_ONLY,
  }, handleGscOutline),

  gscTool("gsc_anti_patterns", {
    title: "GSC Anti-Patterns Reference",
    description:
      "Search IW4 GSC anti-patterns: common mistakes from JS/BO3/modern languages " +
      "with correct IW4 equivalents. " +
      "Call this BEFORE writing code to check how to do something correctly in IW4. " +
      "Returns wrong→right pairs with explanations. " +
      "Examples: query='push' for array append, query='null' for null checks, " +
      "query='object' for struct creation, list=true to see all categories.",
    inputSchema: {
      query: z.string().optional().describe("Search term (e.g. 'push', 'null', 'object', 'loop', 'event'). Not required if list=true."),
      category: z.string().optional().describe("Filter by category: syntax, arrays, objects, types, loops, events, entities"),
      list: z.boolean().optional().default(false).describe("If true, list all categories with entry counts instead of searching"),
    },
    annotations: READ_ONLY,
  }, handleGscAntiPatterns),

  gscTool("iwd_index_symbols", {
    title: "Index GSC Symbols from IWD Archives",
    description:
      "Scans one or more IWD archives and indexes every GSC function definition " +
      "into an in-memory symbol registry. " +
      "Run this once before gsc_find_orphans to enable cross-archive symbol resolution. " +
      "Accepts .iwd file paths or directories containing .iwd files. " +
      "The index persists for the duration of the MCP server session.",
    inputSchema: {
      paths: z.array(z.string()).describe("Paths to .iwd files or directories containing .iwd files to index"),
      clear: z.boolean().optional().default(false).describe("If true, clear the existing index before scanning (default: false — adds to existing)"),
    },
    annotations: { readOnlyHint: true, idempotentHint: false },
  }, handleIwdIndexSymbols),

  gscTool("gsc_find_orphans", {
    title: "Find Orphaned GSC Function Calls",
    description:
      "Statically analyzes a GSC file and reports every function call that cannot be resolved: " +
      "not defined locally, not in any #include, not a known IW4 builtin, " +
      "and not in the symbol index (run iwd_index_symbols first for cross-archive resolution). " +
      "Converts the 'one crash at a time' Promod porting cycle into a single batch fix.",
    inputSchema: {
      content: z.string().optional().describe("GSC source code to analyze. Either this or path must be provided."),
      path: z.string().optional().describe("Path to a .gsc file on disk. Either this or content must be provided."),
      iwd: z.string().optional().describe("Path to an IWD archive. If provided, reads the file specified by path from inside this archive."),
    },
    annotations: READ_ONLY,
  }, handleGscFindOrphans),

  gscTool("dvar_integrity_check", {
    title: "DVAR Integrity Check",
    description:
      "Scans a GSC file for getDvar/setDvar calls and validates the DVAR name string " +
      "literals against the known IW4x/MW2 DVAR database (1900+ entries). " +
      "Reports unknown names that are likely typos or unsupported DVARs. " +
      "Skips dynamic (non-literal) arguments silently. " +
      "Use path or content as input (same as gsc_lint).",
    inputSchema: {
      path: z.string().optional().describe("Path to .gsc / .gsh file. Either this or content must be provided."),
      content: z.string().optional().describe("Raw GSC source code. Either this or path must be provided."),
    },
    annotations: READ_ONLY,
  }, handleDvarIntegrityCheck),

  gscTool("gsc_format", {
    title: "Format GSC Source Code",
    description:
      "Format GSC source code with consistent 4-space indentation, K&R brace style, " +
      "and proper operator spacing. Accepts raw code or an IWD path+entry. " +
      "Use write_back=true to save the formatted result back to the IWD.",
    inputSchema: {
      code: z.string().optional().describe("Raw GSC source code to format"),
      iwd_path: z.string().optional().describe("Absolute path to the .iwd archive"),
      entry: z.string().optional().describe("Entry path within the IWD (e.g. maps/mp/gametypes/_mymod.gsc)"),
      write_back: z.boolean().optional().describe("Write formatted result back to IWD entry (default: false)"),
      dry_run: z.boolean().optional().describe("Preview diff without writing when write_back=true (default: false)"),
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
  }, handleGscFormat),
];

/**
 * Register GSC tools on the MCP server.
 */
export function registerGscTools(server: McpServer): void {
  for (const register of GSC_TOOLS) register(server);
}
