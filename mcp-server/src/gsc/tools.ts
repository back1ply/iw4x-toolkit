/**
 * @file gsc/tools.ts
 * GSC commands: gsc_lint, gsc_lookup, gsc_template, gsc_fix, gsc_outline,
 * gsc_anti_patterns, iwd_index_symbols, gsc_find_orphans, dvar_integrity_check, gsc_format
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { lint, fix, type LintResult, type LintError, getKnownDvars } from "./linter.js";
import { outline, formatOutline, type OutlineResult } from "./outline.js";
import {
  getKnowledgeDir, buildDiffSnippet, ensureBackup,
  CommandError, requireIwd, requireSafeEntry, saveIwd,
} from "../utils.js";
import { format } from "./formatter.js";
import { buildIndex, getStats, type BuildIndexResult } from "./symbols.js";
import { tokenize } from "./tokenizer.js";
import { findOrphans, formatOrphanReport, type OrphanAnalysis } from "./orphans.js";
import { command, registerCommands, type AnyCommand } from "../command.js";

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

// ---------------------------------------------------------------------------
// Module-level caches for knowledge base data
// ---------------------------------------------------------------------------

let gscBuiltinsCache: Map<string, GscBuiltin> | null = null;
let templatesCache: Record<string, GscTemplate> | null = null;
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

/** Read source from a file path or inline content; throws `CommandError` when neither works. */
function requireSource(filePath: string | undefined, content: string | undefined): string {
  if (filePath) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) throw new CommandError(`❌ File not found: ${resolved}`);
    try {
      return fs.readFileSync(resolved, "utf-8");
    } catch (e) {
      throw new CommandError(`❌ Error reading file: ${e}`);
    }
  }
  if (content) return content;
  throw new CommandError("❌ Either path or content must be provided");
}

/** "<file>" for path input, "<inline>" otherwise — used in report headers. */
const displayName = (filePath: string | undefined): string => (filePath ? path.basename(filePath) : "<inline>");

// ---------------------------------------------------------------------------
// gsc_lint
// ---------------------------------------------------------------------------

/** Render one "Line N: message" block under a heading, or "" if empty. */
function formatErrorGroup(heading: string, errors: LintError[], trailingBlank: boolean): string {
  if (errors.length === 0) return "";
  let out = `${heading}\n`;
  for (const err of errors) out += `  Line ${err.line}: ${err.message}\n`;
  return trailingBlank ? out + "\n" : out;
}

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

/** gsc_lint reports input problems as plain (non-error) notices. */
type LintData = { notice: string } | LintResult;

async function lintInput(filePath: string | undefined, content: string | undefined): Promise<{ source: string } | { notice: string }> {
  if (!filePath) return content ? { source: content } : { notice: "❌ Either path or content must be provided" };
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return { notice: `❌ File not found: ${resolved}` };
  const lower = resolved.toLowerCase();
  if (!lower.endsWith(".gsc") && !lower.endsWith(".gsh")) {
    return { notice: `⚠️ Warning: File doesn't appear to be a GSC file (.gsc or .gsh)` };
  }
  try {
    return { source: fs.readFileSync(resolved, "utf-8") };
  } catch (e) {
    return { notice: `❌ Error reading file: ${e}` };
  }
}

const gscLint = command({
  name: "gsc_lint",
  title: "Lint GSC Code",
  description:
    "Lints GSC (Game Script) code for syntax errors, undefined variables, " +
    "bad patterns, and best practice violations. " +
    "Use this to validate GSC scripts before testing in-game. " +
    "Supports vibe coding: the LLM should run this after writing/modifying .gsc files.",
  input: {
    path: z.string().optional().describe("Path to .gsc file to lint. Either this or content must be provided."),
    content: z.string().optional().describe("GSC source code to lint directly. Either this or path must be provided."),
    check_undefined: z.boolean().optional().default(true).describe("Check for undefined variables and functions"),
    check_patterns: z.boolean().optional().default(true).describe("Check for bad patterns and anti-patterns"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run({ path: filePath, content, check_undefined, check_patterns }): Promise<LintData> {
    const input = await lintInput(filePath, content);
    if ("notice" in input) return input;
    return lint(input.source, { checkUndefined: check_undefined, checkPatterns: check_patterns });
  },
  render: (d) => ("notice" in d ? d.notice : formatLintResult(d)),
});

// ---------------------------------------------------------------------------
// gsc_lookup
// ---------------------------------------------------------------------------

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

const gscLookup = command({
  name: "gsc_lookup",
  title: "GSC Function Lookup",
  description:
    "Search the GSC built-in function reference. " +
    "Use this to find correct function signatures and descriptions. " +
    "Helps prevent hallucinated function names in vibe coding.",
  input: {
    query: z.string().describe("Search term (function name or keyword)"),
    category: z.string().optional().describe("Optional category filter"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  run({ query, category }): { total: number; functions: GscBuiltin[] } {
    const q = query.toLowerCase();
    const cat = category?.toLowerCase();
    const matches: GscBuiltin[] = [];
    for (const [name, func] of loadGscBuiltins()) {
      if (matchesBuiltin(name, func, q, cat)) matches.push(func);
    }
    return { total: matches.length, functions: matches.slice(0, 20) };
  },
  render(d, { query, category }) {
    const cat = category?.toLowerCase();
    if (d.total === 0) return `No functions found matching '${query}'${cat ? ` in category '${cat}'` : ""}`;
    let output = `Found ${d.total} functions:\n\n`;
    for (const func of d.functions) output += formatBuiltinEntry(func);
    if (d.total > 20) output += `\n...and ${d.total - 20} more.`;
    return output;
  },
});

// ---------------------------------------------------------------------------
// gsc_template
// ---------------------------------------------------------------------------

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

type TemplateData =
  | { kind: "list"; templates: Record<string, GscTemplate> }
  | { kind: "missing" }
  | { kind: "generated"; code: string };

const gscTemplate = command({
  name: "gsc_template",
  title: "Generate GSC from Template",
  description:
    "Generate GSC code from common templates. " +
    "Use this to quickly scaffold common patterns like callbacks, " +
    "gametypes, menus, etc. Reduces boilerplate errors.",
  input: {
    template: z.string().optional().describe("Template name (e.g., 'player_connect', 'killstreak'). Not required if list=true"),
    variables: z.record(z.string()).optional().describe("Variables to substitute in template (e.g., {player: 'self'})"),
    list: z.boolean().optional().default(false).describe("If true, list available templates instead of generating"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  run({ template, variables, list }): TemplateData {
    const templates = loadTemplates();
    if (list || !template) return { kind: "list", templates };
    const t = templates[template];
    if (!t) return { kind: "missing" };
    return { kind: "generated", code: renderTemplate(t.code || "", variables) };
  },
  render(d, { template }) {
    if (d.kind === "list") return listTemplates(d.templates);
    if (d.kind === "missing") return `Template '${template}' not found. Use list=true to see available templates.`;
    return `Generated from '${template}':\n\n\`\`\`gsc\n${d.code}\n\`\`\``;
  },
});

// ---------------------------------------------------------------------------
// gsc_fix
// ---------------------------------------------------------------------------

interface FixData { fixed: boolean; fixesApplied: string[]; fixedCode: string; writtenTo?: string; }

function formatFix(d: FixData): string {
  if (!d.fixed) return "ℹ️  No auto-fixable issues found.\n\n" + "Run gsc_lint for a full diagnostic report.";
  let output = `✅ Fixed ${d.fixesApplied.length} issue(s):\n`;
  for (const change of d.fixesApplied) output += `  • ${change}\n`;
  output += `\n**Fixed code:**\n\`\`\`gsc\n${d.fixedCode}\n\`\`\``;
  if (d.writtenTo) output += `\n\n✍️  Written back to: ${d.writtenTo}`;
  return output;
}

const gscFix = command({
  name: "gsc_fix",
  title: "Auto-fix GSC Syntax Errors",
  description:
    "Attempts to auto-fix common GSC syntax errors: unmatched braces, " +
    "unterminated strings, and missing closing brackets. " +
    "Returns the fixed code and a list of changes made. " +
    "Use after gsc_lint reports fixable errors. " +
    "Set write_back=true to write the fix directly to a file path.",
  input: {
    path: z.string().optional().describe("Path to .gsc file to fix. Either this or content must be provided."),
    content: z.string().optional().describe("GSC source code to fix directly. Either this or path must be provided."),
    write_back: z.boolean().optional().default(false).describe("If true and path is provided, write the fixed code back to the file."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true },
  async run({ path: filePath, content, write_back }): Promise<FixData> {
    const result = fix(requireSource(filePath, content));
    const data: FixData = { fixed: result.fixed, fixesApplied: result.fixesApplied, fixedCode: result.fixedCode };
    if (!result.fixed || !write_back || !filePath) return data;

    const target = path.resolve(filePath);
    try {
      await ensureBackup(target);
      fs.writeFileSync(target + ".tmp", result.fixedCode, "utf-8");
      fs.renameSync(target + ".tmp", target);
    } catch (e) {
      throw new CommandError(`${formatFix(data)}\n\n❌ Write failed: ${e}`);
    }
    return { ...data, writtenTo: filePath };
  },
  render: formatFix,
});

// ---------------------------------------------------------------------------
// gsc_outline
// ---------------------------------------------------------------------------

const gscOutline = command({
  name: "gsc_outline",
  title: "GSC File Outline",
  description:
    "Parses a GSC file and returns its structural skeleton: " +
    "function definitions (name, params, line), #include directives, " +
    "thread calls, event listeners (waittill/notify/endon), " +
    "and shared-state property assignments (level.x, self.x, game.x). " +
    "Use this BEFORE editing a GSC file to understand its structure " +
    "and avoid accidentally deleting functions or breaking event chains.",
  input: {
    path: z.string().optional().describe("Path to .gsc file to outline. Either this or content must be provided."),
    content: z.string().optional().describe("GSC source code to outline directly. Either this or path must be provided."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  run({ path: filePath, content }): OutlineResult & { lines: number } {
    const source = requireSource(filePath, content);
    return { ...outline(source), lines: source.split("\n").length };
  },
  render: (d) => formatOutline(d, d.lines),
});

// ---------------------------------------------------------------------------
// gsc_anti_patterns
// ---------------------------------------------------------------------------

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

type AntiPatternData = { kind: "categories"; patterns: AntiPattern[] } | { kind: "matches"; matches: AntiPattern[] };

const gscAntiPatterns = command({
  name: "gsc_anti_patterns",
  title: "GSC Anti-Patterns Reference",
  description:
    "Search IW4 GSC anti-patterns: common mistakes from JS/BO3/modern languages " +
    "with correct IW4 equivalents. " +
    "Call this BEFORE writing code to check how to do something correctly in IW4. " +
    "Returns wrong→right pairs with explanations. " +
    "Examples: query='push' for array append, query='null' for null checks, " +
    "query='object' for struct creation, list=true to see all categories.",
  input: {
    query: z.string().optional().describe("Search term (e.g. 'push', 'null', 'object', 'loop', 'event'). Not required if list=true."),
    category: z.string().optional().describe("Filter by category: syntax, arrays, objects, types, loops, events, entities"),
    list: z.boolean().optional().default(false).describe("If true, list all categories with entry counts instead of searching"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  run({ query, category, list }): AntiPatternData {
    const patterns = loadAntiPatterns();
    if (list || !(query || category)) return { kind: "categories", patterns };
    const cat = category?.toLowerCase();
    return { kind: "matches", matches: patterns.filter(p => matchesAntiPattern(p, query?.toLowerCase() ?? "", cat)) };
  },
  render(d, { query, category }) {
    if (d.kind === "categories") return formatAntiPatternCategories(d.patterns);
    const cat = category?.toLowerCase();
    if (d.matches.length === 0) {
      return `No patterns found for '${query}'${cat ? ` in category '${cat}'` : ""}.\nUse list=true to see all categories.`;
    }
    let out = `Found ${d.matches.length} pattern(s):\n\n`;
    for (const p of d.matches.slice(0, 10)) out += formatAntiPatternEntry(p);
    if (d.matches.length > 10) out += `...and ${d.matches.length - 10} more. Narrow your query.`;
    return out;
  },
});

// ---------------------------------------------------------------------------
// iwd_index_symbols
// ---------------------------------------------------------------------------

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

const iwdIndexSymbols = command({
  name: "iwd_index_symbols",
  title: "Index GSC Symbols from IWD Archives",
  description:
    "Scans one or more IWD archives and indexes every GSC function definition " +
    "into an in-memory symbol registry. " +
    "Run this once before gsc_find_orphans to enable cross-archive symbol resolution. " +
    "Accepts .iwd file paths or directories containing .iwd files. " +
    "The index persists for the duration of the MCP server session.",
  input: {
    paths: z.array(z.string()).describe("Paths to .iwd files or directories containing .iwd files to index"),
    clear: z.boolean().optional().default(false).describe("If true, clear the existing index before scanning (default: false — adds to existing)"),
  },
  annotations: { readOnlyHint: true, idempotentHint: false },
  run({ paths, clear }): BuildIndexResult & { previousSymbols: number } {
    const iwdPaths = paths.flatMap(p => iwdFilesAt(path.resolve(p)));
    const previousSymbols = getStats().symbols;
    return { ...buildIndex(iwdPaths, clear), previousSymbols };
  },
  render(d, { clear }) {
    let out = `Indexed ${d.stats.symbols} symbols across ${d.stats.files} files in ${d.stats.archives} archive(s)`;
    if (d.perArchive.length === 0) {
      out += ".\nNo valid .iwd archives found in provided paths.";
    } else {
      out += ":\n";
      for (const a of d.perArchive) {
        out += `  ${path.basename(a.archive).padEnd(40)} — ${a.symbols} symbols (${a.files} files)\n`;
      }
    }
    if (d.stats.symbols === 0) out += "\nTip: verify the paths contain .iwd files with .gsc entries.";
    if (clear || d.previousSymbols > 0) out += `\nReplaced previous index (was ${d.previousSymbols} symbols).`;
    return out;
  },
});

// ---------------------------------------------------------------------------
// gsc_find_orphans
// ---------------------------------------------------------------------------

/** Load orphan-scan source (inline, IWD entry, or disk). Input problems are plain notices, not errors. */
function orphanInput(
  content: string | undefined, filePath: string | undefined, iwd: string | undefined,
): { source: string; hintDir?: string } | { notice: string } {
  if (content) return { source: content };
  if (!filePath) return { notice: "❌ Either content or path must be provided" };
  if (iwd) {
    let zip;
    try {
      zip = requireIwd(iwd).zip;
    } catch (e) {
      return { notice: `❌ ${(e as Error).message}` };
    }
    const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
    const entry = zip.getEntry(normalized);
    if (!entry) return { notice: `❌ Entry not found in archive: ${normalized}` };
    try {
      return { source: entry.getData().toString("utf-8") };
    } catch (e) {
      return { notice: `❌ Failed to read entry: ${e}` };
    }
  }
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return { notice: `❌ File not found: ${resolved}` };
  try {
    return { source: fs.readFileSync(resolved, "utf-8"), hintDir: path.dirname(resolved) };
  } catch (e) {
    return { notice: `❌ Failed to read file: ${e}` };
  }
}

const gscFindOrphans = command({
  name: "gsc_find_orphans",
  title: "Find Orphaned GSC Function Calls",
  description:
    "Statically analyzes a GSC file and reports every function call that cannot be resolved: " +
    "not defined locally, not in any #include, not a known IW4 builtin, " +
    "and not in the symbol index (run iwd_index_symbols first for cross-archive resolution). " +
    "Converts the 'one crash at a time' Promod porting cycle into a single batch fix.",
  input: {
    content: z.string().optional().describe("GSC source code to analyze. Either this or path must be provided."),
    path: z.string().optional().describe("Path to a .gsc file on disk. Either this or content must be provided."),
    iwd: z.string().optional().describe("Path to an IWD archive. If provided, reads the file specified by path from inside this archive."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run({ content, path: filePath, iwd }): Promise<{ notice: string } | OrphanAnalysis> {
    const input = orphanInput(content, filePath, iwd);
    if ("notice" in input) return input;
    return findOrphans(input.source, input.hintDir);
  },
  render: (d, { path: filePath }) => ("notice" in d ? d.notice : formatOrphanReport(d, displayName(filePath))),
});

// ---------------------------------------------------------------------------
// dvar_integrity_check
// ---------------------------------------------------------------------------

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

const dvarIntegrityCheck = command({
  name: "dvar_integrity_check",
  title: "DVAR Integrity Check",
  description:
    "Scans a GSC file for getDvar/setDvar calls and validates the DVAR name string " +
    "literals against the known IW4x/MW2 DVAR database (1900+ entries). " +
    "Reports unknown names that are likely typos or unsupported DVARs. " +
    "Skips dynamic (non-literal) arguments silently. " +
    "Use path or content as input (same as gsc_lint).",
  input: {
    path: z.string().optional().describe("Path to .gsc / .gsh file. Either this or content must be provided."),
    content: z.string().optional().describe("Raw GSC source code. Either this or path must be provided."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run({ path: filePath, content }): Promise<{ known: DvarAccess[]; unknown: DvarAccess[] }> {
    const accesses = extractDvarAccesses(requireSource(filePath, content));
    if (accesses.length === 0) return { known: [], unknown: [] };
    const knownDvars = await getKnownDvars();
    return {
      known: accesses.filter(a => knownDvars.has(a.name.toLowerCase())),
      unknown: accesses.filter(a => !knownDvars.has(a.name.toLowerCase())),
    };
  },
  render(d, { path: filePath }) {
    if (d.known.length + d.unknown.length === 0) return "✅ No DVAR string literal accesses found.";
    return formatDvarReport(displayName(filePath), d.known, d.unknown);
  },
});

// ---------------------------------------------------------------------------
// gsc_format
// ---------------------------------------------------------------------------

/** Format tokenizer warnings as a trailing block, or "" when there are none. */
function formatTokenizerWarnings(tokErrors: { line: number; message: string }[]): string {
  if (tokErrors.length === 0) return "";
  return `\n\n⚠️ Tokenizer warnings (${tokErrors.length}):\n` +
    tokErrors.map(e => `  L${e.line}: ${e.message}`).join("\n");
}

type FormatData =
  | { kind: "formatted"; code: string; warnings: { line: number; message: string }[] }
  | { kind: "written"; entry: string; snippet: string; dryRun: boolean };

const gscFormat = command({
  name: "gsc_format",
  title: "Format GSC Source Code",
  description:
    "Format GSC source code with consistent 4-space indentation, K&R brace style, " +
    "and proper operator spacing. Accepts raw code or an IWD path+entry. " +
    "Use write_back=true to save the formatted result back to the IWD.",
  input: {
    code: z.string().optional().describe("Raw GSC source code to format"),
    iwd_path: z.string().optional().describe("Absolute path to the .iwd archive"),
    entry: z.string().optional().describe("Entry path within the IWD (e.g. maps/mp/gametypes/_mymod.gsc)"),
    write_back: z.boolean().optional().describe("Write formatted result back to IWD entry (default: false)"),
    dry_run: z.boolean().optional().describe("Preview diff without writing when write_back=true (default: false)"),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  async run({ code, iwd_path, entry, write_back, dry_run }): Promise<FormatData> {
    if (!code && !(iwd_path && entry)) {
      throw new CommandError("Provide either 'code', or both 'iwd_path' and 'entry'.");
    }
    const normalized = entry ? requireSafeEntry(entry) : undefined;

    let source = code;
    let target: ReturnType<typeof requireIwd> | undefined;
    if (!source) {
      target = requireIwd(iwd_path!);
      const fileEntry = target.zip.getEntry(normalized!);
      if (!fileEntry) throw new CommandError(`Entry not found: ${normalized}`);
      source = fileEntry.getData().toString("utf-8");
    }

    const { tokens, errors } = tokenize(source);
    const formatted = format(tokens);
    if (!(write_back && iwd_path && entry)) return { kind: "formatted", code: formatted, warnings: errors };

    // A token stream with errors (e.g. an unterminated string) can't be formatted faithfully.
    if (errors.length > 0) {
      throw new CommandError(`Not writing ${normalized}: tokenizer reported errors.` + formatTokenizerWarnings(errors));
    }
    const { resolved, zip } = target ?? requireIwd(iwd_path);
    const { snippet } = buildDiffSnippet(source, formatted);
    if (!dry_run) await saveIwd(zip, resolved, (z) => z.updateFile(normalized!, Buffer.from(formatted, "utf-8")));
    return { kind: "written", entry: normalized!, snippet, dryRun: dry_run ?? false };
  },
  render(d) {
    if (d.kind === "formatted") return "```gsc\n" + d.code + "\n```" + formatTokenizerWarnings(d.warnings);
    return d.dryRun
      ? `[dry_run] Would write formatted ${d.entry}:\n\n${d.snippet}`
      : `Formatted and wrote ${d.entry}:\n\n${d.snippet}`;
  },
});

export const GSC_COMMANDS: AnyCommand[] = [
  gscLint, gscLookup, gscTemplate, gscFix, gscOutline, gscAntiPatterns,
  iwdIndexSymbols, gscFindOrphans, dvarIntegrityCheck, gscFormat,
];

/** Register GSC tools on the MCP server. */
export function registerGscTools(server: McpServer): void {
  registerCommands(server, GSC_COMMANDS);
}
