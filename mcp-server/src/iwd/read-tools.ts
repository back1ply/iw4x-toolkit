/**
 * @file iwd/read-tools.ts
 * Read-only IWD archive commands: iwd_list, iwd_read, iwd_info, iwd_grep
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "node:path";
import type AdmZip from "adm-zip";
import {
  isBinaryEntry,
  globToRegex,
  CommandError,
  requireIwd,
  requireEntry,
  GREP_MAX_MATCHES_DEFAULT,
  MINIFIED_FILE_CHARS_PER_LINE,
  getCachedRegex,
} from "../utils.js";
import { command, registerCommands, type AnyCommand } from "../command.js";

type ZipEntry = ReturnType<AdmZip["getEntries"]>[number];

// ---------------------------------------------------------------------------
// iwd_list
// ---------------------------------------------------------------------------

export interface EntryRow { name: string; size: number; compressedSize: number; }

export function listEntryRows(zip: AdmZip): EntryRow[] {
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

interface ListData {
  archive: string;
  /** All file entries in the archive. */
  total: number;
  /** Entries matching `pattern`, before `limit`. */
  matched: number;
  truncated: boolean;
  entries: EntryRow[];
  /** Every entry, kept only for `summary_only`. */
  all?: EntryRow[];
}

const iwdList = command({
  name: "iwd_list",
  title: "List Archive Entries",
  description:
    "List entries in an IWD archive. " +
    "Defaults to compact name-only output — efficient for discovery. " +
    "Use summary_only=true for a one-line type breakdown (e.g. '45 .gsc, 12 .menu, 8 binary') — the cheapest first call on any IWD. " +
    "Use pattern to filter by glob (e.g. '*.gsc', 'ui_mp/*.menu'). " +
    "Pass names_only=false only when you need file sizes.",
  input: {
    path: z.string().describe("Absolute or relative path to the IWD file"),
    pattern: z.string().optional().describe("Optional glob pattern to filter entries (e.g. '*.gsc', 'maps/**/*.gsc', 'ui_mp/*.menu')"),
    summary_only: z.boolean().optional().default(false).describe(
      "If true, returns a single-line breakdown of entry counts by type (e.g. '45 .gsc, 12 .menu, 8 binary'). " +
      "Cheapest possible overview — use this first when exploring an unfamiliar IWD."),
    names_only: z.boolean().optional().default(true).describe("If true (default), returns entry names only. Pass false to include file sizes."),
    limit: z.number().int().positive().max(10000).optional().describe("Max number of entries to return. Omit to return all."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  run({ path: iwdPath, pattern, summary_only, limit }): ListData {
    const { resolved, zip } = requireIwd(iwdPath);
    const all = listEntryRows(zip);
    if (summary_only) return { archive: resolved, total: all.length, matched: all.length, truncated: false, entries: [], all };

    const regex = pattern ? globToRegex(pattern) : null;
    const matchedRows = regex ? all.filter((r) => regex.test(r.name)) : all;
    const truncated = limit !== undefined && matchedRows.length > limit;
    return {
      archive: resolved,
      total: all.length,
      matched: matchedRows.length,
      truncated,
      entries: truncated ? matchedRows.slice(0, limit) : matchedRows,
    };
  },
  render(d, { pattern, summary_only, names_only, limit }) {
    if (summary_only) return summarizeByType(d.all ?? [], d.archive, d.total);
    if (d.matched === 0) {
      return pattern
        ? `No entries match pattern '${pattern}' in ${d.archive} (${d.total} total entries).\nTip: use iwd_list without a pattern to see all entries.`
        : `No entries found in ${d.archive}.`;
    }
    const header = `${d.archive}${pattern ? ` [filter: ${pattern}]` : ""}\n${d.matched} of ${d.total} entries${d.truncated ? ` (showing first ${limit})` : ""}:`;
    const footer = d.truncated ? `\n... truncated. Use pattern or increase limit to see more.` : "";
    return `${header}\n\n${formatListBody(d.entries, names_only)}${footer}`;
  },
});

// ---------------------------------------------------------------------------
// iwd_read
// ---------------------------------------------------------------------------

type ReadData =
  | { entry: string; binary: true; bytes: number; base64: string }
  | { entry: string; binary: false; text: string; totalLines: number; startLine: number; endLine: number; sliced: boolean };

function offsetBeyondEndMessage(start: number, totalLines: number, text: string): string {
  const isMinified = text.length / totalLines > MINIFIED_FILE_CHARS_PER_LINE;
  const minifiedNote = isMinified
    ? `\nNote: This file averages over ${MINIFIED_FILE_CHARS_PER_LINE} chars per line and is likely minified. Use iwd_grep to search for specific terms if needed.`
    : "";
  return `Error: offset ${start} is beyond end of file (${totalLines} lines).\n` +
    `Tip: use offset values between 0 and ${totalLines - 1}.${minifiedNote}`;
}

function readTextSlice(text: string, normalized: string, offset?: number, limit?: number): ReadData {
  const lines = text.split(/\r?\n/);
  const totalLines = lines.length;
  if (offset === undefined && limit === undefined) {
    return { entry: normalized, binary: false, text, totalLines, startLine: 1, endLine: totalLines, sliced: false };
  }
  const start = offset ?? 0;
  if (start >= totalLines && totalLines > 0) throw new CommandError(offsetBeyondEndMessage(start, totalLines, text));
  const end = limit !== undefined ? start + limit : totalLines;
  return {
    entry: normalized, binary: false, text: lines.slice(start, end).join("\n"),
    totalLines, startLine: start + 1, endLine: Math.min(end, totalLines), sliced: true,
  };
}

const iwdRead = command({
  name: "iwd_read",
  title: "Read Archive Entry",
  description:
    "Read a file from inside an IWD archive. " +
    "Returns UTF-8 text for text files (.gsc, .menu, .cfg, .csv, etc.) and base64 for binary files (.iwi, .d3dbsp, etc.). " +
    "Use limit and offset to read sections of large files without flooding context. " +
    "Use iwd_info first to check file size and type before reading large files.",
  input: {
    path: z.string().describe("Absolute or relative path to the IWD file"),
    entry: z.string().describe("Path of the entry inside the IWD (e.g. maps/mp/gametypes/_globallogic.gsc). Use iwd_list to find the exact path."),
    limit: z.number().int().positive().max(100000).optional().describe("Max lines to return (for text files). Omit to read the whole file."),
    offset: z.number().int().nonnegative().optional().describe("0-indexed line to start reading from (default: 0). Use with limit to page through large files."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  run({ path: iwdPath, entry, limit, offset }): ReadData {
    const { zip } = requireIwd(iwdPath);
    const { normalized, zipEntry } = requireEntry(zip, entry);
    if (isBinaryEntry(normalized)) {
      const buf = zip.readFile(zipEntry);
      if (!buf) throw new CommandError(`Error: Failed to read binary entry: ${normalized}\nTip: the file may be corrupt.`);
      return { entry: normalized, binary: true, bytes: buf.length, base64: buf.toString("base64") };
    }
    return readTextSlice(zip.readAsText(zipEntry), normalized, offset, limit);
  },
  render(d) {
    if (d.binary) return [`[binary: ${d.entry}, ${d.bytes} bytes, base64-encoded below]`, d.base64];
    const header = d.sliced
      ? `[${d.entry}: lines ${d.startLine}-${d.endLine} of ${d.totalLines}]`
      : `[${d.entry}: ${d.totalLines} lines]`;
    return `${header}\n${d.text}`;
  },
});

// ---------------------------------------------------------------------------
// iwd_info
// ---------------------------------------------------------------------------

function readAdviceFor(binary: boolean, size: number): string {
  if (binary) return `Note: Binary file — iwd_read will return base64 (${size} bytes).`;
  if (size > 50_000) return `Note: Large text file (${size} bytes). Use iwd_read with limit/offset to avoid flooding context.`;
  return `Ready to read with iwd_read.`;
}

interface InfoData { entry: string; binary: boolean; size: number; compressedSize: number; crc: string; modified: string; }

const iwdInfo = command({
  name: "iwd_info",
  title: "Get Entry Metadata",
  description:
    "Get metadata for a single entry in an IWD archive without reading its content. " +
    "Use this before iwd_read to check file size and type, avoiding accidental large or binary reads.",
  input: {
    path: z.string().describe("Absolute or relative path to the IWD file"),
    entry: z.string().describe("Path of the entry inside the IWD. Use iwd_list to find exact paths."),
    summary_only: z.boolean().optional().default(false).describe("If true, returns a compact single-line type-and-size string."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  run({ path: iwdPath, entry }): InfoData {
    const { zip } = requireIwd(iwdPath);
    const { normalized, zipEntry } = requireEntry(zip, entry);
    return {
      entry: normalized,
      binary: isBinaryEntry(normalized),
      size: zipEntry.header.size,
      compressedSize: zipEntry.header.compressedSize,
      crc: zipEntry.header.crc.toString(16).toUpperCase(),
      modified: zipEntry.header.time.toISOString(),
    };
  },
  render(d, { summary_only }) {
    const type = d.binary ? "Binary" : "Text";
    if (summary_only) return `Entry: ${d.entry} | Type: ${type} | Size: ${d.size} bytes`;
    return (
      `Entry:     ${d.entry}\n` +
      `Size:      ${d.size} bytes (compressed: ${d.compressedSize})\n` +
      `CRC:       ${d.crc}\n` +
      `Type:      ${type}\n` +
      `Modified:  ${d.modified}\n` +
      `${readAdviceFor(d.binary, d.size)}`
    );
  },
});

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

export interface GrepMatch { entry: string; line: number; text: string; }
export interface GrepResult { matches: GrepMatch[]; truncated: boolean; }

export function grepEntries(zip: AdmZip, entries: ZipEntry[], searchRe: RegExp, maxMatches: number): GrepResult {
  const matches: GrepMatch[] = [];
  for (const e of entries) {
    const fileLines = zip.readAsText(e).split(/\r?\n/);
    for (let i = 0; i < fileLines.length; i++) {
      const match = searchRe.exec(fileLines[i] ?? "");
      if (!match) continue;
      if (matches.length >= maxMatches) return { matches, truncated: true };
      matches.push({ entry: e.entryName, line: i + 1, text: clampMatchLine(fileLines[i] ?? "", match.index) });
    }
  }
  return { matches, truncated: false };
}

const iwdGrep = command({
  name: "iwd_grep",
  title: "Search Inside Archive",
  description:
    "Search all text entries (or a filtered subset) inside an IWD for a pattern. " +
    "Returns matching file paths, line numbers, and line content — like ripgrep but inside an IWD. " +
    "Use entry_glob to limit scope (e.g. '*.gsc', 'ui_mp/*.menu'). " +
    "Set is_regex=true for full regex support; default is case-insensitive literal string search. " +
    "Binary entries (.iwi, .d3dbsp, etc.) are automatically skipped. " +
    "Use max_matches to control output size (default: 50).",
  input: {
    path: z.string().describe("Absolute or relative path to the IWD file"),
    pattern: z.string().describe("String or regex pattern to search for. Literal string by default; set is_regex=true for regex."),
    entry_glob: z.string().optional().describe("Glob pattern to filter which entries to search (e.g. '*.gsc', 'maps/**/*.gsc')"),
    is_regex: z.boolean().optional().default(false).describe("Treat pattern as a regex (default: false — plain case-insensitive string search)"),
    max_matches: z.number().int().positive().max(1000).optional().default(GREP_MAX_MATCHES_DEFAULT).describe(
      `Max total matches to return before truncating (default: ${GREP_MAX_MATCHES_DEFAULT}). Increase if needed.`),
  },
  annotations: { readOnlyHint: true },
  rateLimit: "iwd_grep",
  run({ path: iwdPath, pattern, entry_glob, is_regex, max_matches }): GrepResult & { archive: string } {
    const { resolved, zip } = requireIwd(iwdPath);
    const searchRe = buildSearchRegex(pattern, is_regex);
    if (!searchRe) {
      throw new CommandError(`Error: Invalid regex pattern: ${pattern}\nTip: check for unbalanced parentheses or invalid quantifiers. Or set is_regex=false for a literal search.`);
    }
    const globRe = entry_glob ? globToRegex(entry_glob) : null;
    const entries = zip.getEntries().filter((e) => isSearchableEntry(e, globRe));
    return { archive: resolved, ...grepEntries(zip, entries, searchRe, max_matches) };
  },
  render(d, { pattern, entry_glob, max_matches }) {
    const total = d.matches.length;
    if (total === 0) {
      return entry_glob
        ? `No text entries match glob '${entry_glob}' in ${d.archive}.\nTip: use iwd_list to see all entries.`
        : `No matches for '${pattern}' in ${d.archive}`;
    }
    const filterNote = entry_glob ? ` [filter: ${entry_glob}]` : "";
    const footer = d.truncated
      ? `\n\n... truncated at ${max_matches} matches. Use entry_glob or a more specific pattern to narrow results.`
      : "";
    const lines = d.matches.map((m) => `${m.entry}:${m.line}: ${m.text}`);
    return `Found ${total}${d.truncated ? "+" : ""} match(es) in ${d.archive}${filterNote}:\n\n${lines.join("\n")}${footer}`;
  },
});

export const READ_COMMANDS: AnyCommand[] = [iwdList, iwdRead, iwdInfo, iwdGrep];

/** Registers read-only IWD archive tools on the given MCP server instance. */
export function registerReadTools(server: McpServer): void {
  registerCommands(server, READ_COMMANDS);
}
