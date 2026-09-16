/**
 * @file iwd/diff-tools.ts
 * Diff/copy IWD archive commands: iwd_diff, iwd_rename, iwd_copy
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "node:path";
import type AdmZip from "adm-zip";
import {
  resolveIwdPath,
  openIwd,
  normalizeEntry,
  isBinaryEntry,
  globToRegex,
  buildDiffSnippet,
  buildSideBySideDiff,
  CommandError,
  requireIwd,
  requireSafeEntry,
  saveIwd,
} from "../utils.js";
import { command, registerCommands, type AnyCommand } from "../command.js";

const entryNotFound = (normalized: string) =>
  `Error: Entry not found: ${normalized}\n` +
  `Tip: use iwd_list to verify the exact entry path (forward slashes, case-sensitive).`;

// ---------------------------------------------------------------------------
// iwd_diff
// ---------------------------------------------------------------------------

export interface ArchiveDiff {
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
export function computeArchiveDiff(map1: Map<string, number>, map2: Map<string, number>): ArchiveDiff {
  const namesB = [...map2.keys()];
  const added = namesB.filter((n) => !map1.has(n));
  const removed = [...map1.keys()].filter((n) => !map2.has(n));
  const common = namesB.filter((n) => map1.has(n));
  const modified = common.filter((n) => map1.get(n) !== map2.get(n));
  return { added, removed, modified, identical: common.length - modified.length };
}

type EntryDiff =
  | { entry: string; binary: true; sizeA: number; sizeB: number }
  | { entry: string; binary: false; format: "side-by-side"; view: string }
  | { entry: string; binary: false; format: "unified"; snippet: string; changedLine: number };

function diffEntry(zip1: AdmZip, zip2: AdmZip, name: string, diffFormat: string): EntryDiff | null {
  const e1 = zip1.getEntry(name);
  const e2 = zip2.getEntry(name);
  if (!e1 || !e2) return null;
  if (isBinaryEntry(name)) return { entry: name, binary: true, sizeA: e1.header.size, sizeB: e2.header.size };
  const t1 = zip1.readAsText(e1);
  const t2 = zip2.readAsText(e2);
  if (diffFormat === "side-by-side") {
    return { entry: name, binary: false, format: "side-by-side", view: buildSideBySideDiff(t1, t2) };
  }
  return { entry: name, binary: false, format: "unified", ...buildDiffSnippet(t1, t2) };
}

/** Append a "heading + prefixed list" block when the list is non-empty. */
function appendEntryList(lines: string[], items: string[], heading: string, prefix: string): void {
  if (items.length === 0) return;
  lines.push(``, heading);
  items.forEach((n) => lines.push(`  ${prefix} ${n}`));
}

function renderEntryDiff(d: EntryDiff): string[] {
  if (d.binary) return [``, `[binary] ${d.entry}: ${d.sizeA} → ${d.sizeB} bytes`];
  if (d.format === "side-by-side") return [``, `[diff] ${d.entry}:`, d.view];
  return [``, `[diff] ${d.entry} (first change at line ${d.changedLine + 1}):`, d.snippet];
}

interface DiffData extends ArchiveDiff {
  archiveA: string; archiveB: string; filesA: number; filesB: number;
  /** Present when content_diff=true and something was modified. */
  contentDiffs?: EntryDiff[];
}

const iwdDiff = command({
  name: "iwd_diff",
  title: "Diff Two Archives",
  description:
    "Compare two IWD files and report added, removed, modified (CRC mismatch), and identical entries. " +
    "Use entry_glob to limit comparison to a specific subset of files. " +
    "Set content_diff=true to include diffs for modified text entries. " +
    "Use diff_format='side-by-side' for a visual two-column view.",
  input: {
    path1: z.string().describe("Path to the first (base) IWD file"),
    path2: z.string().describe("Path to the second (modified) IWD file"),
    entry_glob: z.string().optional().describe("Optional glob to limit comparison to matching entries (e.g. '*.gsc', 'maps/**/*.gsc')"),
    content_diff: z.boolean().optional().default(false).describe("If true, includes diffs for modified text entries"),
    diff_format: z.enum(["unified", "side-by-side"]).optional().default("unified").describe("Format for content diffs: 'unified' (default) or 'side-by-side' for visual comparison"),
  },
  annotations: { readOnlyHint: true },
  run({ path1, path2, entry_glob, content_diff, diff_format }): DiffData {
    const a = requireIwd(path1);
    const b = requireIwd(path2);
    const globRe = entry_glob ? globToRegex(entry_glob) : null;
    const map1 = buildEntryCrcMap(a.zip, globRe);
    const map2 = buildEntryCrcMap(b.zip, globRe);
    const diff = computeArchiveDiff(map1, map2);
    const data: DiffData = { archiveA: a.resolved, archiveB: b.resolved, filesA: map1.size, filesB: map2.size, ...diff };
    if (diff.modified.length > 0 && content_diff) {
      data.contentDiffs = diff.modified
        .map((name) => diffEntry(a.zip, b.zip, name, diff_format))
        .filter((d): d is EntryDiff => d !== null);
    }
    return data;
  },
  render(d, { entry_glob, diff_format }) {
    const globNote = entry_glob ? ` [filter: ${entry_glob}]` : "";
    const lines: string[] = [
      `Comparing${globNote}:`,
      `  A: ${d.archiveA} (${d.filesA} files)`,
      `  B: ${d.archiveB} (${d.filesB} files)`,
      ``,
      `Summary: ${d.added.length} added, ${d.removed.length} removed, ${d.modified.length} modified, ${d.identical} identical`,
    ];
    appendEntryList(lines, d.added, `Added (in B, not in A):`, "+");
    appendEntryList(lines, d.removed, `Removed (in A, not in B):`, "-");
    appendEntryList(lines, d.modified, `Modified (CRC differs):`, "~");
    if (d.contentDiffs) {
      const formatNote = diff_format === "side-by-side" ? " (side-by-side view)" : "";
      lines.push(``, `--- Content diffs for modified text entries${formatNote} ---`);
      for (const entryDiff of d.contentDiffs) lines.push(...renderEntryDiff(entryDiff));
    }
    return lines.join("\n");
  },
});

// ---------------------------------------------------------------------------
// iwd_rename
// ---------------------------------------------------------------------------

interface RenameData { archive: string; from: string; to: string; dryRun: boolean; }

const iwdRename = command({
  name: "iwd_rename",
  title: "Rename Archive Entry",
  description:
    "Rename or move an entry within an IWD archive in a single operation. " +
    "Equivalent to iwd_read + iwd_write + iwd_remove, but faster and atomic. " +
    "Set dry_run=true to validate without modifying the archive.",
  input: {
    path: z.string().describe("Absolute or relative path to the IWD file"),
    entry: z.string().describe("Current path of the entry inside the IWD. Use iwd_list to find exact path."),
    new_entry: z.string().describe("New path for the entry inside the IWD (e.g. 'scripts/renamed.gsc')"),
    dry_run: z.boolean().optional().default(false).describe("If true, validates the rename without modifying the archive"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  async run({ path: iwdPath, entry, new_entry, dry_run }): Promise<RenameData> {
    const { resolved, zip } = requireIwd(iwdPath);
    const from = normalizeEntry(entry);
    if (!from) throw new CommandError("Error: entry path cannot be empty.");
    const to = requireSafeEntry(new_entry, "new_entry");
    if (from === to) {
      throw new CommandError(`Error: Source and destination are the same path: ${from}\nTip: choose a different new_entry path.`);
    }
    const source = zip.getEntry(from);
    if (!source) throw new CommandError(entryNotFound(from));
    if (zip.getEntry(to)) {
      throw new CommandError(
        `Error: An entry already exists at the new path: ${to}\n` +
        `Tip: remove it first with iwd_remove, or choose a different new_entry path.`,
      );
    }
    if (dry_run) return { archive: resolved, from, to, dryRun: true };

    await saveIwd(zip, resolved, (z) => {
      const buf = z.readFile(source);
      if (!buf) throw new CommandError(`Error: Failed to read entry content: ${from}\nTip: the file may be corrupt.`);
      z.deleteFile(from);
      z.addFile(to, buf);
    });
    return { archive: resolved, from, to, dryRun: false };
  },
  render(d) {
    return d.dryRun
      ? `[dry_run] Would rename ${d.from} → ${d.to} in ${d.archive}`
      : `Renamed ${d.from} → ${d.to} in ${d.archive}`;
  },
});

// ---------------------------------------------------------------------------
// iwd_copy
// ---------------------------------------------------------------------------

interface CopyData {
  srcArchive: string; srcEntry: string; dstArchive: string; dstEntry: string;
  bytes: number; overwrote: boolean; dryRun: boolean;
}

const iwdCopy = command({
  name: "iwd_copy",
  title: "Copy Archive Entry",
  description:
    "Copy an entry from one IWD archive to another (or within the same archive). " +
    "Useful for duplicating entries or moving files between mod packages. " +
    "Set dry_run=true to validate without modifying anything.",
  input: {
    src_path: z.string().describe("Path to the source IWD file"),
    src_entry: z.string().describe("Entry path inside the source IWD. Use iwd_list to find exact path."),
    dst_path: z.string().describe("Path to the destination IWD file (can be the same as src_path)"),
    dst_entry: z.string().describe("Entry path to write in the destination IWD"),
    overwrite: z.boolean().optional().default(false).describe("If true, overwrites an existing entry at dst_entry. Defaults to false (errors if destination entry exists)."),
    dry_run: z.boolean().optional().default(false).describe("If true, validates the copy without modifying any file"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  async run(args): Promise<CopyData> {
    const rSrc = resolveIwdPath(args.src_path);
    const rDst = resolveIwdPath(args.dst_path);
    const { zip: srcZip } = requireIwd(rSrc);

    const srcEntry = normalizeEntry(args.src_entry);
    if (!srcEntry) throw new CommandError("Error: src_entry path cannot be empty.");
    const dstEntry = requireSafeEntry(args.dst_entry, "dst_entry");
    const source = srcZip.getEntry(srcEntry);
    if (!source) throw new CommandError(entryNotFound(srcEntry));

    let dstZip = srcZip;
    if (path.resolve(rSrc) !== path.resolve(rDst)) {
      const opened = openIwd(rDst);
      if (!opened.ok) throw new CommandError(opened.error);
      dstZip = opened.value;
    }
    const existingDst = dstZip.getEntry(dstEntry) !== null;
    if (existingDst && !args.overwrite) {
      throw new CommandError(`Error: Destination entry already exists: ${dstEntry} in ${rDst}\nTip: set overwrite=true to replace it.`);
    }

    const data: CopyData = {
      srcArchive: rSrc, srcEntry, dstArchive: rDst, dstEntry,
      bytes: source.header.size, overwrote: existingDst, dryRun: args.dry_run,
    };
    if (args.dry_run) return data;

    const buf = srcZip.readFile(source);
    if (!buf) throw new CommandError(`Error: Failed to read source entry: ${srcEntry}\nTip: the file may be corrupt.`);
    await saveIwd(dstZip, rDst, (z) => (existingDst ? z.updateFile(dstEntry, buf) : z.addFile(dstEntry, buf)));
    return data;
  },
  render(d, { overwrite }) {
    if (d.dryRun) {
      const note = d.overwrote && overwrite ? ` [will overwrite existing]` : "";
      return `[dry_run] Would copy ${d.srcEntry} (${d.srcArchive}) → ${d.dstEntry} (${d.dstArchive})${note}`;
    }
    return `Copied ${d.srcEntry} (${d.srcArchive})\n    → ${d.dstEntry} (${d.dstArchive})\n` +
      `${d.bytes} bytes${d.overwrote ? " [overwrote existing]" : ""}`;
  },
});

export const DIFF_COMMANDS: AnyCommand[] = [iwdDiff, iwdRename, iwdCopy];

/** Registers diff/copy IWD archive tools on the given MCP server instance. */
export function registerDiffTools(server: McpServer): void {
  registerCommands(server, DIFF_COMMANDS);
}
