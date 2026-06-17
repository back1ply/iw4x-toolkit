/**
 * @file iwd/diff-tools.ts
 * Diff/copy IWD archive tools: iwd_diff, iwd_copy, iwd_rename
 */

import { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "node:path";
import type AdmZip from "adm-zip";
import {
  resolveIwdPath,
  openIwd,
  invalidateIwdCache,
  normalizeEntry,
  isBinaryEntry,
  ensureBackup,
  atomicWrite,
  globToRegex,
  buildDiffSnippet,
  buildSideBySideDiff,
  errResult,
  okResult,
  entryNotFoundErr,
} from "../utils.js";

type ToolResult = ReturnType<typeof okResult>;

// ---------------------------------------------------------------------------
// iwd_diff
// ---------------------------------------------------------------------------

interface ArchiveDiff {
  added: string[];
  removed: string[];
  modified: string[];
  identical: number;
}

/** Map of non-directory entry names -> CRC, filtered by an optional glob. */
function buildEntryCrcMap(zip: AdmZip, globRe: RegExp | null): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue;
    if (globRe && !globRe.test(e.entryName)) continue;
    map.set(e.entryName, e.header.crc);
  }
  return map;
}

/** Classify entries as added (in B only), removed (in A only), modified (CRC differs), or identical. */
function computeArchiveDiff(map1: Map<string, number>, map2: Map<string, number>): ArchiveDiff {
  const namesB = [...map2.keys()];
  const added = namesB.filter((n) => !map1.has(n));
  const removed = [...map1.keys()].filter((n) => !map2.has(n));
  const common = namesB.filter((n) => map1.has(n));
  const modified = common.filter((n) => map1.get(n) !== map2.get(n));
  return { added, removed, modified, identical: common.length - modified.length };
}

/** Append a "heading + prefixed list" block when the list is non-empty. */
function appendEntryList(lines: string[], items: string[], heading: string, prefix: string): void {
  if (items.length === 0) return;
  lines.push(``, heading);
  items.forEach((n) => lines.push(`  ${prefix} ${n}`));
}

interface DiffSummaryInput {
  r1: string; r2: string; sizeA: number; sizeB: number;
  diff: ArchiveDiff; entry_glob: string | undefined;
}

function renderDiffSummary({ r1, r2, sizeA, sizeB, diff, entry_glob }: DiffSummaryInput): string[] {
  const globNote = entry_glob ? ` [filter: ${entry_glob}]` : "";
  const lines: string[] = [
    `Comparing${globNote}:`,
    `  A: ${r1} (${sizeA} files)`,
    `  B: ${r2} (${sizeB} files)`,
    ``,
    `Summary: ${diff.added.length} added, ${diff.removed.length} removed, ${diff.modified.length} modified, ${diff.identical} identical`,
  ];
  appendEntryList(lines, diff.added, `Added (in B, not in A):`, "+");
  appendEntryList(lines, diff.removed, `Removed (in A, not in B):`, "-");
  appendEntryList(lines, diff.modified, `Modified (CRC differs):`, "~");
  return lines;
}

/** Content diff lines for one modified entry (binary size note, side-by-side, or unified). */
function renderEntryDiff(zip1: AdmZip, zip2: AdmZip, name: string, diffFormat: string): string[] {
  const e1 = zip1.getEntry(name);
  const e2 = zip2.getEntry(name);
  if (!e1 || !e2) return [];
  if (isBinaryEntry(name)) {
    return [``, `[binary] ${name}: ${e1.header.size} → ${e2.header.size} bytes`];
  }
  const t1 = zip1.readAsText(e1);
  const t2 = zip2.readAsText(e2);
  if (diffFormat === "side-by-side") {
    return [``, `[diff] ${name}:`, buildSideBySideDiff(t1, t2)];
  }
  const { snippet, changedLine } = buildDiffSnippet(t1, t2);
  return [``, `[diff] ${name} (first change at line ${changedLine + 1}):`, snippet];
}

function renderContentDiffs(zip1: AdmZip, zip2: AdmZip, modified: string[], diffFormat: string): string[] {
  const formatNote = diffFormat === "side-by-side" ? " (side-by-side view)" : "";
  const out: string[] = [``, `--- Content diffs for modified text entries${formatNote} ---`];
  for (const name of modified) out.push(...renderEntryDiff(zip1, zip2, name, diffFormat));
  return out;
}

interface DiffArgs {
  path1: string; path2: string; entry_glob?: string;
  content_diff: boolean; diff_format: "unified" | "side-by-side";
}

async function handleIwdDiff({ path1, path2, entry_glob, content_diff, diff_format }: DiffArgs): Promise<ToolResult> {
  const r1 = resolveIwdPath(path1);
  const r2 = resolveIwdPath(path2);
  const o1 = openIwd(r1);
  if (!o1.ok) return errResult(o1.error);
  const o2 = openIwd(r2);
  if (!o2.ok) return errResult(o2.error);

  const globRe = entry_glob ? globToRegex(entry_glob) : null;
  const map1 = buildEntryCrcMap(o1.value, globRe);
  const map2 = buildEntryCrcMap(o2.value, globRe);
  const diff = computeArchiveDiff(map1, map2);

  const lines = renderDiffSummary({ r1, r2, sizeA: map1.size, sizeB: map2.size, diff, entry_glob });
  if (diff.modified.length > 0 && content_diff) {
    lines.push(...renderContentDiffs(o1.value, o2.value, diff.modified, diff_format));
  }
  return okResult(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// iwd_rename
// ---------------------------------------------------------------------------

interface RenameArgs { path: string; entry: string; new_entry: string; dry_run: boolean; }

/** Validate a rename, returning an error result or null if it's safe to proceed. */
function validateRename(zip: AdmZip, normalized: string, normalizedNew: string): ToolResult | null {
  if (!normalized) return errResult("Error: entry path cannot be empty.");
  if (!normalizedNew) return errResult("Error: new_entry path cannot be empty.");
  if (normalized === normalizedNew) {
    return errResult(
      `Error: Source and destination are the same path: ${normalized}\n` +
      `Tip: choose a different new_entry path.`,
    );
  }
  if (!zip.getEntry(normalized)) return entryNotFoundErr(normalized);
  if (zip.getEntry(normalizedNew)) {
    return errResult(
      `Error: An entry already exists at the new path: ${normalizedNew}\n` +
      `Tip: remove it first with iwd_remove, or choose a different new_entry path.`,
    );
  }
  return null;
}

async function executeRename(zip: AdmZip, resolved: string, normalized: string, normalizedNew: string): Promise<ToolResult> {
  await ensureBackup(resolved);
  const buf = zip.readFile(zip.getEntry(normalized)!);
  if (!buf) {
    return errResult(`Error: Failed to read entry content: ${normalized}\nTip: the file may be corrupt.`);
  }
  zip.deleteFile(normalized);
  zip.addFile(normalizedNew, buf);
  await atomicWrite(zip, resolved);
  invalidateIwdCache(resolved);
  return okResult(`Renamed ${normalized} → ${normalizedNew} in ${resolved}`);
}

async function handleIwdRename({ path: iwdPath, entry, new_entry, dry_run }: RenameArgs): Promise<ToolResult> {
  const resolved = resolveIwdPath(iwdPath);
  const opened = openIwd(resolved);
  if (!opened.ok) return errResult(opened.error);

  const normalized = normalizeEntry(entry);
  const normalizedNew = normalizeEntry(new_entry);
  const invalid = validateRename(opened.value, normalized, normalizedNew);
  if (invalid) return invalid;

  if (dry_run) {
    return okResult(`[dry_run] Would rename ${normalized} → ${normalizedNew} in ${resolved}`);
  }
  return executeRename(opened.value, resolved, normalized, normalizedNew);
}

// ---------------------------------------------------------------------------
// iwd_copy
// ---------------------------------------------------------------------------

interface CopyArgs {
  src_path: string; src_entry: string; dst_path: string; dst_entry: string;
  overwrite: boolean; dry_run: boolean;
}

interface CopyPlan {
  srcZip: AdmZip; dstZip: AdmZip;
  normSrc: string; normDst: string; rSrc: string; rDst: string;
  existingDst: boolean;
}

/** Normalize the src/dst entry names, erroring if either is empty. */
function normalizeCopyEntries(srcEntry: string, dstEntry: string): { normSrc: string; normDst: string } | { error: ToolResult } {
  const normSrc = normalizeEntry(srcEntry);
  const normDst = normalizeEntry(dstEntry);
  if (!normSrc) return { error: errResult("Error: src_entry path cannot be empty.") };
  if (!normDst) return { error: errResult("Error: dst_entry path cannot be empty.") };
  return { normSrc, normDst };
}

/** Resolve and validate a copy, returning either a ready plan or an error result. */
function planCopy(args: CopyArgs): CopyPlan | { error: ToolResult } {
  const rSrc = resolveIwdPath(args.src_path);
  const rDst = resolveIwdPath(args.dst_path);
  const oSrc = openIwd(rSrc);
  if (!oSrc.ok) return { error: errResult(oSrc.error) };

  const entries = normalizeCopyEntries(args.src_entry, args.dst_entry);
  if ("error" in entries) return entries;
  const { normSrc, normDst } = entries;
  if (!oSrc.value.getEntry(normSrc)) return { error: entryNotFoundErr(normSrc) };

  const oDst = path.resolve(rSrc) === path.resolve(rDst) ? oSrc : openIwd(rDst);
  if (!oDst.ok) return { error: errResult(oDst.error) };

  const existingDst = oDst.value.getEntry(normDst) !== null;
  if (existingDst && !args.overwrite) {
    return {
      error: errResult(
        `Error: Destination entry already exists: ${normDst} in ${rDst}\n` +
        `Tip: set overwrite=true to replace it.`,
      ),
    };
  }
  return { srcZip: oSrc.value, dstZip: oDst.value, normSrc, normDst, rSrc, rDst, existingDst };
}

async function executeCopy(plan: CopyPlan): Promise<ToolResult> {
  const srcZipEntry = plan.srcZip.getEntry(plan.normSrc)!;
  const buf = plan.srcZip.readFile(srcZipEntry);
  if (!buf) {
    return errResult(`Error: Failed to read source entry: ${plan.normSrc}\nTip: the file may be corrupt.`);
  }
  await ensureBackup(plan.rDst);
  if (plan.existingDst) plan.dstZip.updateFile(plan.normDst, buf);
  else plan.dstZip.addFile(plan.normDst, buf);
  await atomicWrite(plan.dstZip, plan.rDst);
  invalidateIwdCache(plan.rDst);
  return okResult(
    `Copied ${plan.normSrc} (${plan.rSrc})\n    → ${plan.normDst} (${plan.rDst})\n` +
    `${srcZipEntry.header.size} bytes${plan.existingDst ? " [overwrote existing]" : ""}`,
  );
}

async function handleIwdCopy(args: CopyArgs): Promise<ToolResult> {
  const plan = planCopy(args);
  if ("error" in plan) return plan.error;

  if (args.dry_run) {
    const note = plan.existingDst && args.overwrite ? ` [will overwrite existing]` : "";
    return okResult(`[dry_run] Would copy ${plan.normSrc} (${plan.rSrc}) → ${plan.normDst} (${plan.rDst})${note}`);
  }
  return executeCopy(plan);
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
function diffTool<A extends z.ZodRawShape>(
  name: string, config: ToolConfig<A>, handler: ToolCallback<A>,
): (server: McpServer) => void {
  return (server) => { server.registerTool(name, config, handler); };
}

const DIFF_TOOLS: ((server: McpServer) => void)[] = [
  diffTool("iwd_diff", {
    title: "Diff Two Archives",
    description:
      "Compare two IWD files and report added, removed, modified (CRC mismatch), and identical entries. " +
      "Use entry_glob to limit comparison to a specific subset of files. " +
      "Set content_diff=true to include diffs for modified text entries. " +
      "Use diff_format='side-by-side' for a visual two-column view.",
    inputSchema: {
      path1: z.string().describe("Path to the first (base) IWD file"),
      path2: z.string().describe("Path to the second (modified) IWD file"),
      entry_glob: z.string().optional().describe("Optional glob to limit comparison to matching entries (e.g. '*.gsc', 'maps/**/*.gsc')"),
      content_diff: z.boolean().optional().default(false).describe("If true, includes diffs for modified text entries"),
      diff_format: z.enum(["unified", "side-by-side"]).optional().default("unified").describe("Format for content diffs: 'unified' (default) or 'side-by-side' for visual comparison"),
    },
    annotations: { readOnlyHint: true },
  }, handleIwdDiff),

  diffTool("iwd_rename", {
    title: "Rename Archive Entry",
    description:
      "Rename or move an entry within an IWD archive in a single operation. " +
      "Equivalent to iwd_read + iwd_write + iwd_remove, but faster and atomic. " +
      "Set dry_run=true to validate without modifying the archive.",
    inputSchema: {
      path: z.string().describe("Absolute or relative path to the IWD file"),
      entry: z.string().describe("Current path of the entry inside the IWD. Use iwd_list to find exact path."),
      new_entry: z.string().describe("New path for the entry inside the IWD (e.g. 'scripts/renamed.gsc')"),
      dry_run: z.boolean().optional().default(false).describe("If true, validates the rename without modifying the archive"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, handleIwdRename),

  diffTool("iwd_copy", {
    title: "Copy Archive Entry",
    description:
      "Copy an entry from one IWD archive to another (or within the same archive). " +
      "Useful for duplicating entries or moving files between mod packages. " +
      "Set dry_run=true to validate without modifying anything.",
    inputSchema: {
      src_path: z.string().describe("Path to the source IWD file"),
      src_entry: z.string().describe("Entry path inside the source IWD. Use iwd_list to find exact path."),
      dst_path: z.string().describe("Path to the destination IWD file (can be the same as src_path)"),
      dst_entry: z.string().describe("Entry path to write in the destination IWD"),
      overwrite: z.boolean().optional().default(false).describe("If true, overwrites an existing entry at dst_entry. Defaults to false (errors if destination entry exists)."),
      dry_run: z.boolean().optional().default(false).describe("If true, validates the copy without modifying any file"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, handleIwdCopy),
];

/**
 * Registers diff/copy IWD archive tools on the given MCP server instance.
 */
export function registerDiffTools(server: McpServer): void {
  for (const register of DIFF_TOOLS) register(server);
}
