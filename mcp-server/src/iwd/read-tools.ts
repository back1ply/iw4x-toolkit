/**
 * @file iwd/read-tools.ts
 * Read-only IWD archive tools: iwd_list, iwd_read, iwd_info, iwd_grep
 */

import { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "node:path";
import type AdmZip from "adm-zip";
import {
  resolveIwdPath,
  openIwd,
  normalizeEntry,
  isBinaryEntry,
  globToRegex,
  errResult,
  okResult,
  entryNotFoundErr,
  GREP_MAX_MATCHES_DEFAULT,
  MINIFIED_FILE_CHARS_PER_LINE,
  getCachedRegex,
  checkRateLimit,
} from "../utils.js";

type ToolResult = ReturnType<typeof okResult>;
type ZipEntry = ReturnType<AdmZip["getEntries"]>[number];

// ---------------------------------------------------------------------------
// iwd_list
// ---------------------------------------------------------------------------

interface EntryRow { name: string; size: number; compressedSize: number; }

function listEntryRows(zip: AdmZip): EntryRow[] {
  return zip.getEntries()
    .filter((e) => !e.isDirectory)
    .map((e) => ({ name: e.entryName, size: e.header.size, compressedSize: e.header.compressedSize }));
}

/** One-line breakdown of entry counts by type (extension / binary). */
function summarizeByType(rows: EntryRow[], resolved: string, total: number): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const ext = isBinaryEntry(row.name) ? "binary" : path.extname(row.name).toLowerCase() || "(no ext)";
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([ext, n]) => `${n} ${ext}`);
  return `${resolved}\n${total} entries: ${parts.join(", ")}`;
}

function formatListBody(rows: EntryRow[], namesOnly: boolean): string {
  return namesOnly
    ? rows.map((r) => r.name).join("\n")
    : rows.map((r) => `${r.name}  (${r.size} → ${r.compressedSize} bytes)`).join("\n");
}

interface ListArgs {
  path: string; pattern?: string; summary_only: boolean; names_only: boolean; limit?: number;
}

async function handleIwdList({ path: iwdPath, pattern, summary_only, names_only, limit }: ListArgs): Promise<ToolResult> {
  const resolved = resolveIwdPath(iwdPath);
  const opened = openIwd(resolved);
  if (!opened.ok) return errResult(opened.error);

  let rows = listEntryRows(opened.value);
  const total = rows.length;
  if (summary_only) return okResult(summarizeByType(rows, resolved, total));

  if (pattern) {
    const regex = globToRegex(pattern);
    rows = rows.filter((r) => regex.test(r.name));
  }
  if (rows.length === 0) {
    return okResult(pattern
      ? `No entries match pattern '${pattern}' in ${resolved} (${total} total entries).\nTip: use iwd_list without a pattern to see all entries.`
      : `No entries found in ${resolved}.`);
  }

  const matchedCount = rows.length;
  const truncated = limit !== undefined && matchedCount > limit;
  if (truncated) rows = rows.slice(0, limit);

  const header = `${resolved}${pattern ? ` [filter: ${pattern}]` : ""}\n${matchedCount} of ${total} entries${truncated ? ` (showing first ${limit})` : ""}:`;
  const footer = truncated ? `\n... truncated. Use pattern or increase limit to see more.` : "";
  return okResult(`${header}\n\n${formatListBody(rows, names_only)}${footer}`);
}

// ---------------------------------------------------------------------------
// iwd_read
// ---------------------------------------------------------------------------

function readBinaryEntry(zip: AdmZip, zipEntry: ZipEntry, normalized: string): ToolResult {
  const buf = zip.readFile(zipEntry);
  if (!buf) {
    return errResult(`Error: Failed to read binary entry: ${normalized}\nTip: the file may be corrupt.`);
  }
  return {
    content: [
      { type: "text" as const, text: `[binary: ${normalized}, ${buf.length} bytes, base64-encoded below]` },
      { type: "text" as const, text: buf.toString("base64") },
    ],
  };
}

function offsetBeyondEndError(start: number, totalLines: number, text: string): ToolResult {
  const isMinified = text.length / totalLines > MINIFIED_FILE_CHARS_PER_LINE;
  const minifiedNote = isMinified
    ? `\nNote: This file averages over ${MINIFIED_FILE_CHARS_PER_LINE} chars per line and is likely minified. Use iwd_grep to search for specific terms if needed.`
    : "";
  return errResult(
    `Error: offset ${start} is beyond end of file (${totalLines} lines).\n` +
    `Tip: use offset values between 0 and ${totalLines - 1}.${minifiedNote}`,
  );
}

function readTextSlice(text: string, normalized: string, offset?: number, limit?: number): ToolResult {
  const lines = text.split(/\r?\n/);
  const totalLines = lines.length;

  if (offset === undefined && limit === undefined) {
    return okResult(`[${normalized}: ${totalLines} lines]\n${text}`);
  }

  const start = offset ?? 0;
  if (start >= totalLines && totalLines > 0) {
    return offsetBeyondEndError(start, totalLines, text);
  }
  const end = limit !== undefined ? start + limit : totalLines;
  const header = `[${normalized}: lines ${start + 1}-${Math.min(end, totalLines)} of ${totalLines}]`;
  return okResult(`${header}\n${lines.slice(start, end).join("\n")}`);
}

interface ReadArgs { path: string; entry: string; limit?: number; offset?: number; }

async function handleIwdRead({ path: iwdPath, entry, limit, offset }: ReadArgs): Promise<ToolResult> {
  const resolved = resolveIwdPath(iwdPath);
  const opened = openIwd(resolved);
  if (!opened.ok) return errResult(opened.error);

  const normalized = normalizeEntry(entry);
  if (!normalized) return errResult("Error: entry path cannot be empty.");

  const zipEntry = opened.value.getEntry(normalized);
  if (!zipEntry) return entryNotFoundErr(normalized);

  if (isBinaryEntry(normalized)) return readBinaryEntry(opened.value, zipEntry, normalized);
  return readTextSlice(opened.value.readAsText(zipEntry), normalized, offset, limit);
}

// ---------------------------------------------------------------------------
// iwd_info
// ---------------------------------------------------------------------------

function readAdviceFor(binary: boolean, size: number): string {
  if (binary) return `Note: Binary file — iwd_read will return base64 (${size} bytes).`;
  if (size > 50_000) return `Note: Large text file (${size} bytes). Use iwd_read with limit/offset to avoid flooding context.`;
  return `Ready to read with iwd_read.`;
}

interface InfoArgs { path: string; entry: string; summary_only: boolean; }

async function handleIwdInfo({ path: iwdPath, entry, summary_only }: InfoArgs): Promise<ToolResult> {
  const resolved = resolveIwdPath(iwdPath);
  const opened = openIwd(resolved);
  if (!opened.ok) return errResult(opened.error);

  const normalized = normalizeEntry(entry);
  if (!normalized) return errResult("Error: entry path cannot be empty.");

  const zipEntry = opened.value.getEntry(normalized);
  if (!zipEntry) return entryNotFoundErr(normalized);

  const binary = isBinaryEntry(normalized);
  const size = zipEntry.header.size;
  if (summary_only) {
    return okResult(`Entry: ${normalized} | Type: ${binary ? "Binary" : "Text"} | Size: ${size} bytes`);
  }

  const crc = zipEntry.header.crc.toString(16).toUpperCase();
  const time = zipEntry.header.time.toISOString();
  return okResult(
    `Entry:     ${normalized}\n` +
    `Size:      ${size} bytes (compressed: ${zipEntry.header.compressedSize})\n` +
    `CRC:       ${crc}\n` +
    `Type:      ${binary ? "Binary" : "Text"}\n` +
    `Modified:  ${time}\n` +
    `${readAdviceFor(binary, size)}`,
  );
}

// ---------------------------------------------------------------------------
// iwd_grep
// ---------------------------------------------------------------------------

/** Build the search regex (literal-escaped or raw regex), or null if the regex is invalid. */
function buildSearchRegex(pattern: string, isRegex: boolean): RegExp | null {
  if (!isRegex) {
    return getCachedRegex(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
  try {
    return getCachedRegex(pattern, "i");
  } catch {
    return null;
  }
}

function isSearchableEntry(e: ZipEntry, globRe: RegExp | null): boolean {
  if (e.isDirectory) return false;
  if (isBinaryEntry(e.entryName)) return false;
  return !globRe || globRe.test(e.entryName);
}

/** Trim a match line, clamping to a window around the match when very long. */
function clampMatchLine(line: string, matchIdx: number): string {
  const trimmed = line.trim();
  if (trimmed.length <= 200) return trimmed;
  const start = Math.max(0, matchIdx - 100);
  const end = Math.min(line.length, matchIdx + 100);
  return (start > 0 ? "... " : "") + line.slice(start, end) + (end < line.length ? " ..." : "");
}

interface GrepResult { lines: string[]; total: number; truncated: boolean; }

function grepEntries(zip: AdmZip, entries: ZipEntry[], searchRe: RegExp, maxMatches: number): GrepResult {
  const lines: string[] = [];
  for (const e of entries) {
    const fileLines = zip.readAsText(e).split(/\r?\n/);
    for (let i = 0; i < fileLines.length; i++) {
      const match = searchRe.exec(fileLines[i] ?? "");
      if (!match) continue;
      if (lines.length >= maxMatches) return { lines, total: lines.length, truncated: true };
      lines.push(`${e.entryName}:${i + 1}: ${clampMatchLine(fileLines[i] ?? "", match.index)}`);
    }
  }
  return { lines, total: lines.length, truncated: false };
}

interface GrepArgs {
  path: string; pattern: string; entry_glob?: string; is_regex: boolean; max_matches: number;
}

async function handleIwdGrep({ path: iwdPath, pattern, entry_glob, is_regex, max_matches }: GrepArgs): Promise<ToolResult> {
  const rateCheck = checkRateLimit("iwd_grep");
  if (!rateCheck.allowed) {
    return errResult(`Rate limit exceeded for iwd_grep. Try again in ${rateCheck.resetIn} seconds.`);
  }

  const resolved = resolveIwdPath(iwdPath);
  const opened = openIwd(resolved);
  if (!opened.ok) return errResult(opened.error);

  const searchRe = buildSearchRegex(pattern, is_regex);
  if (!searchRe) {
    return errResult(`Error: Invalid regex pattern: ${pattern}\nTip: check for unbalanced parentheses or invalid quantifiers. Or set is_regex=false for a literal search.`);
  }

  const globRe = entry_glob ? globToRegex(entry_glob) : null;
  const entries = opened.value.getEntries().filter((e) => isSearchableEntry(e, globRe));
  const { lines, total, truncated } = grepEntries(opened.value, entries, searchRe, max_matches);

  if (total === 0) {
    return okResult(entry_glob
      ? `No text entries match glob '${entry_glob}' in ${resolved}.\nTip: use iwd_list to see all entries.`
      : `No matches for '${pattern}' in ${resolved}`);
  }

  const filterNote = entry_glob ? ` [filter: ${entry_glob}]` : "";
  const footer = truncated
    ? `\n\n... truncated at ${max_matches} matches. Use entry_glob or a more specific pattern to narrow results.`
    : "";
  return okResult(`Found ${total}${truncated ? "+" : ""} match(es) in ${resolved}${filterNote}:\n\n${lines.join("\n")}${footer}`);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

interface ToolConfig<A extends z.ZodRawShape> {
  title: string;
  description: string;
  inputSchema: A;
  annotations?: Record<string, boolean>;
}

/** Defer a single registerTool call, preserving per-tool schema↔handler typing. */
function readTool<A extends z.ZodRawShape>(
  name: string, config: ToolConfig<A>, handler: ToolCallback<A>,
): (server: McpServer) => void {
  return (server) => { server.registerTool(name, config, handler); };
}

const READ_TOOLS: ((server: McpServer) => void)[] = [
  readTool("iwd_list", {
    title: "List Archive Entries",
    description:
      "List entries in an IWD archive. " +
      "Defaults to compact name-only output — efficient for discovery. " +
      "Use summary_only=true for a one-line type breakdown (e.g. '45 .gsc, 12 .menu, 8 binary') — the cheapest first call on any IWD. " +
      "Use pattern to filter by glob (e.g. '*.gsc', 'ui_mp/*.menu'). " +
      "Pass names_only=false only when you need file sizes.",
    inputSchema: {
      path: z.string().describe("Absolute or relative path to the IWD file"),
      pattern: z.string().optional().describe("Optional glob pattern to filter entries (e.g. '*.gsc', 'maps/**/*.gsc', 'ui_mp/*.menu')"),
      summary_only: z.boolean().optional().default(false).describe(
        "If true, returns a single-line breakdown of entry counts by type (e.g. '45 .gsc, 12 .menu, 8 binary'). " +
        "Cheapest possible overview — use this first when exploring an unfamiliar IWD."),
      names_only: z.boolean().optional().default(true).describe("If true (default), returns entry names only. Pass false to include file sizes."),
      limit: z.number().int().positive().max(10000).optional().describe("Max number of entries to return. Omit to return all."),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, handleIwdList),

  readTool("iwd_read", {
    title: "Read Archive Entry",
    description:
      "Read a file from inside an IWD archive. " +
      "Returns UTF-8 text for text files (.gsc, .menu, .cfg, .csv, etc.) and base64 for binary files (.iwi, .d3dbsp, etc.). " +
      "Use limit and offset to read sections of large files without flooding context. " +
      "Use iwd_info first to check file size and type before reading large files.",
    inputSchema: {
      path: z.string().describe("Absolute or relative path to the IWD file"),
      entry: z.string().describe("Path of the entry inside the IWD (e.g. maps/mp/gametypes/_globallogic.gsc). Use iwd_list to find the exact path."),
      limit: z.number().int().positive().max(100000).optional().describe("Max lines to return (for text files). Omit to read the whole file."),
      offset: z.number().int().nonnegative().optional().describe("0-indexed line to start reading from (default: 0). Use with limit to page through large files."),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, handleIwdRead),

  readTool("iwd_info", {
    title: "Get Entry Metadata",
    description:
      "Get metadata for a single entry in an IWD archive without reading its content. " +
      "Use this before iwd_read to check file size and type, avoiding accidental large or binary reads.",
    inputSchema: {
      path: z.string().describe("Absolute or relative path to the IWD file"),
      entry: z.string().describe("Path of the entry inside the IWD. Use iwd_list to find exact paths."),
      summary_only: z.boolean().optional().default(false).describe("If true, returns a compact single-line type-and-size string."),
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, handleIwdInfo),

  readTool("iwd_grep", {
    title: "Search Inside Archive",
    description:
      "Search all text entries (or a filtered subset) inside an IWD for a pattern. " +
      "Returns matching file paths, line numbers, and line content — like ripgrep but inside an IWD. " +
      "Use entry_glob to limit scope (e.g. '*.gsc', 'ui_mp/*.menu'). " +
      "Set is_regex=true for full regex support; default is case-insensitive literal string search. " +
      "Binary entries (.iwi, .d3dbsp, etc.) are automatically skipped. " +
      "Use max_matches to control output size (default: 50).",
    inputSchema: {
      path: z.string().describe("Absolute or relative path to the IWD file"),
      pattern: z.string().describe("String or regex pattern to search for. Literal string by default; set is_regex=true for regex."),
      entry_glob: z.string().optional().describe("Glob pattern to filter which entries to search (e.g. '*.gsc', 'maps/**/*.gsc')"),
      is_regex: z.boolean().optional().default(false).describe("Treat pattern as a regex (default: false — plain case-insensitive string search)"),
      max_matches: z.number().int().positive().max(1000).optional().default(GREP_MAX_MATCHES_DEFAULT).describe(
        `Max total matches to return before truncating (default: ${GREP_MAX_MATCHES_DEFAULT}). Increase if needed.`),
    },
    annotations: { readOnlyHint: true },
  }, handleIwdGrep),
];

/**
 * Registers read-only IWD archive tools on the given MCP server instance.
 */
export function registerReadTools(server: McpServer): void {
  for (const register of READ_TOOLS) register(server);
}
