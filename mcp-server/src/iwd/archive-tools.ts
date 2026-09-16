/**
 * @file iwd/archive-tools.ts
 * Archive IWD commands: iwd_extract, iwd_pack, iwd_sync
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "node:path";
import type AdmZip from "adm-zip";
import {
  resolveIwdPath,
  invalidateIwdCache,
  isSafeEntryPath,
  ensureBackup,
  atomicWrite,
  globToRegex,
  CommandError,
  requireIwd,
  saveIwd,
} from "../utils.js";
import { command, registerCommands, type AnyCommand } from "../command.js";

type ZipEntry = ReturnType<AdmZip["getEntries"]>[number];

/** Resolve a source directory, throwing `CommandError` unless it exists and is a directory. */
export async function requireSourceDir(sourceDir: string): Promise<string> {
  const resolved = path.resolve(sourceDir);
  const fs = await import("node:fs/promises");
  let isDir: boolean;
  try {
    isDir = (await fs.stat(resolved)).isDirectory();
  } catch {
    throw new CommandError(`Error: source_dir does not exist: ${resolved}`);
  }
  if (!isDir) throw new CommandError(`Error: source_dir is not a directory: ${resolved}`);
  return resolved;
}

// ---------------------------------------------------------------------------
// iwd_extract
// ---------------------------------------------------------------------------

function isExtractableEntry(e: ZipEntry, globRe: RegExp | null): boolean {
  if (e.isDirectory) return false;
  return !globRe || globRe.test(e.entryName);
}

/** Resolve the safe on-disk path for an entry, or null if it escapes the destination. */
function resolveSafeOutPath(entryName: string, resolvedDest: string): string | null {
  if (!isSafeEntryPath(entryName)) return null;
  const outPath = path.resolve(resolvedDest, entryName);
  // Double-check the resolved path stays within the destination (catches odd absolute paths).
  if (!outPath.startsWith(resolvedDest + path.sep) && outPath !== resolvedDest) return null;
  return outPath;
}

export async function extractEntries(zip: AdmZip, entries: ZipEntry[], resolvedDest: string): Promise<{ extracted: string[]; skipped: string[] }> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const extracted: string[] = [];
  const skipped: string[] = [];

  for (const e of entries) {
    const outPath = resolveSafeOutPath(e.entryName, resolvedDest);
    if (!outPath) {
      skipped.push(e.entryName);
      continue;
    }
    await mkdir(path.dirname(outPath), { recursive: true });
    const buf = zip.readFile(e);
    if (buf) {
      await writeFile(outPath, buf);
      extracted.push(e.entryName);
    }
  }
  return { extracted, skipped };
}

interface ExtractData {
  archive: string; dest: string; dryRun: boolean;
  /** Entries selected by the glob (what dry_run lists). */
  selected: string[];
  extracted: string[]; skipped: string[];
}

const iwdExtract = command({
  name: "iwd_extract",
  title: "Extract Archive Entries",
  description:
    "Extract entries from an IWD archive to a directory on disk. " +
    "Once extracted, standard shell tools (rg, fd, bat) work natively. " +
    "Use entry_glob to extract only a subset of files. " +
    "Returns the destination path and list of extracted files.",
  input: {
    path: z.string().describe("Absolute or relative path to the IWD file"),
    dest: z.string().describe("Destination directory path. Created if it does not exist."),
    entry_glob: z.string().optional().describe("Optional glob to extract only matching entries (e.g. '*.gsc', 'maps/**/*.gsc')"),
    dry_run: z.boolean().optional().default(false).describe("If true, lists what would be extracted without writing any files"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  async run({ path: iwdPath, dest, entry_glob, dry_run }): Promise<ExtractData> {
    const resolvedDest = path.resolve(dest);
    const { resolved, zip } = requireIwd(iwdPath);
    const globRe = entry_glob ? globToRegex(entry_glob) : null;
    const entries = zip.getEntries().filter((e) => isExtractableEntry(e, globRe));
    const data: ExtractData = {
      archive: resolved, dest: resolvedDest, dryRun: dry_run,
      selected: entries.map((e) => e.entryName), extracted: [], skipped: [],
    };
    if (entries.length === 0 || dry_run) return data;
    return { ...data, ...(await extractEntries(zip, entries, resolvedDest)) };
  },
  render(d, { entry_glob }) {
    if (d.selected.length === 0) {
      return entry_glob
        ? `No entries match glob '${entry_glob}' in ${d.archive}.\nTip: use iwd_list to see all entries.`
        : `No entries found in ${d.archive}.`;
    }
    if (d.dryRun) {
      return `[dry_run] Would extract ${d.selected.length} file(s) to ${d.dest}:\n\n` + d.selected.join("\n");
    }
    let msg = `Extracted ${d.extracted.length} file(s) to ${d.dest}`;
    if (d.extracted.length > 0) msg += `:\n\n` + d.extracted.join("\n");
    if (d.skipped.length > 0) msg += `\n\n⚠️ Skipped ${d.skipped.length} unsafe entry path(s): ${d.skipped.join(", ")}`;
    return msg;
  },
});

// ---------------------------------------------------------------------------
// iwd_pack
// ---------------------------------------------------------------------------

interface PackData { source: string; archive: string; dryRun: boolean; }

const iwdPack = command({
  name: "iwd_pack",
  title: "Pack Workspace to Archive (Full Rebuild)",
  description:
    "Zips the entire contents of a workspace directory into a BRAND NEW IWD archive. " +
    "WARNING: If the destination file already exists, it is completely overwritten and replaced. " +
    "If you want to inject a few changed files into an existing archive without deleting everything else, use iwd_sync instead.",
  input: {
    source_dir: z.string().describe("The folder containing loose files to pack"),
    dest_path: z.string().describe("The .iwd file to create/overwrite"),
    dry_run: z.boolean().optional().default(false).describe("If true, validates without writing the archive"),
  },
  annotations: { readOnlyHint: false, destructiveHint: true },
  rateLimit: "iwd_pack",
  async run({ source_dir, dest_path, dry_run }): Promise<PackData> {
    const source = await requireSourceDir(source_dir);
    const archive = resolveIwdPath(dest_path);
    if (dry_run) return { source, archive, dryRun: true };

    const { existsSync } = await import("node:fs");
    if (existsSync(archive)) await ensureBackup(archive);
    const { default: AdmZipCtor } = await import("adm-zip");
    const zip = new AdmZipCtor();
    zip.addLocalFolder(source, "");
    await atomicWrite(zip, archive);
    invalidateIwdCache(archive);
    return { source, archive, dryRun: false };
  },
  render(d) {
    return d.dryRun
      ? `[dry_run] Would pack directory ${d.source} into new archive ${d.archive}`
      : `Packed ${d.source}\n    → ${d.archive}`;
  },
});

// ---------------------------------------------------------------------------
// iwd_sync
// ---------------------------------------------------------------------------

const iwdSync = command({
  name: "iwd_sync",
  title: "Sync Workspace to Existing Archive (Partial Update)",
  description:
    "Injects or overwrites specific files from a workspace directory into an EXISTING IWD archive. " +
    "Crucially, it leaves all other files in the archive untouched. " +
    "Use this (instead of iwd_pack) when you've extracted a mod, edited a few files, and want to put just those files back into the original archive.",
  input: {
    source_dir: z.string().describe("Folder with modified loose files"),
    dest_path: z.string().describe("The existing .iwd file to update"),
    dry_run: z.boolean().optional().default(false).describe("If true, validates without modifying the archive"),
  },
  annotations: { readOnlyHint: false, destructiveHint: true },
  async run({ source_dir, dest_path, dry_run }): Promise<PackData> {
    const source = await requireSourceDir(source_dir);
    const { resolved, zip } = requireIwd(dest_path);
    if (!dry_run) await saveIwd(zip, resolved, (z) => z.addLocalFolder(source, ""));
    return { source, archive: resolved, dryRun: dry_run };
  },
  render(d) {
    return d.dryRun
      ? `[dry_run] Would sync files from ${d.source} into existing archive ${d.archive}`
      : `Synced files from ${d.source}\n    → ${d.archive}`;
  },
});

export const ARCHIVE_COMMANDS: AnyCommand[] = [iwdExtract, iwdPack, iwdSync];

/** Registers archive IWD tools on the given MCP server instance. */
export function registerArchiveTools(server: McpServer): void {
  registerCommands(server, ARCHIVE_COMMANDS);
}
