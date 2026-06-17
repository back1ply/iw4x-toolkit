/**
 * @file iwd/archive-tools.ts
 * Archive IWD tools: iwd_pack, iwd_sync, iwd_extract
 */

import { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "node:path";
import type AdmZip from "adm-zip";
import {
  resolveIwdPath,
  openIwd,
  invalidateIwdCache,
  isSafeEntryPath,
  ensureBackup,
  atomicWrite,
  globToRegex,
  errResult,
  okResult,
  checkRateLimit,
} from "../utils.js";

type ToolResult = ReturnType<typeof okResult>;
type ZipEntry = ReturnType<AdmZip["getEntries"]>[number];

/** Verify a source directory exists and is a directory; returns an error result or null. */
async function validateSourceDir(resolvedSrc: string): Promise<ToolResult | null> {
  const fs = await import("node:fs/promises");
  try {
    const stat = await fs.stat(resolvedSrc);
    if (!stat.isDirectory()) return errResult(`Error: source_dir is not a directory: ${resolvedSrc}`);
  } catch {
    return errResult(`Error: source_dir does not exist: ${resolvedSrc}`);
  }
  return null;
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

async function extractEntries(zip: AdmZip, entries: ZipEntry[], resolvedDest: string): Promise<{ extracted: string[]; skipped: string[] }> {
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

function formatExtractResult(extracted: string[], skipped: string[], resolvedDest: string): string {
  let msg = `Extracted ${extracted.length} file(s) to ${resolvedDest}`;
  if (extracted.length > 0) msg += `:\n\n` + extracted.join("\n");
  if (skipped.length > 0) msg += `\n\n⚠️ Skipped ${skipped.length} unsafe entry path(s): ${skipped.join(", ")}`;
  return msg;
}

interface ExtractArgs { path: string; dest: string; entry_glob?: string; dry_run: boolean; }

async function handleIwdExtract({ path: iwdPath, dest, entry_glob, dry_run }: ExtractArgs): Promise<ToolResult> {
  const resolved = resolveIwdPath(iwdPath);
  const resolvedDest = path.resolve(dest);
  const opened = openIwd(resolved);
  if (!opened.ok) return errResult(opened.error);

  const globRe = entry_glob ? globToRegex(entry_glob) : null;
  const entries = opened.value.getEntries().filter((e) => isExtractableEntry(e, globRe));
  if (entries.length === 0) {
    return okResult(entry_glob
      ? `No entries match glob '${entry_glob}' in ${resolved}.\nTip: use iwd_list to see all entries.`
      : `No entries found in ${resolved}.`);
  }

  if (dry_run) {
    return okResult(
      `[dry_run] Would extract ${entries.length} file(s) to ${resolvedDest}:\n\n` +
      entries.map((e) => e.entryName).join("\n"),
    );
  }

  const { extracted, skipped } = await extractEntries(opened.value, entries, resolvedDest);
  return okResult(formatExtractResult(extracted, skipped, resolvedDest));
}

// ---------------------------------------------------------------------------
// iwd_pack
// ---------------------------------------------------------------------------

interface PackArgs { source_dir: string; dest_path: string; dry_run: boolean; }

async function handleIwdPack({ source_dir, dest_path, dry_run }: PackArgs): Promise<ToolResult> {
  const rateCheck = checkRateLimit("iwd_pack");
  if (!rateCheck.allowed) {
    return errResult(`Rate limit exceeded for iwd_pack. Try again in ${rateCheck.resetIn} seconds.`);
  }

  const resolvedSrc = path.resolve(source_dir);
  const srcError = await validateSourceDir(resolvedSrc);
  if (srcError) return srcError;

  const resolvedDst = resolveIwdPath(dest_path);
  if (dry_run) {
    return okResult(`[dry_run] Would pack directory ${resolvedSrc} into new archive ${resolvedDst}`);
  }

  const { existsSync } = await import("node:fs");
  if (existsSync(resolvedDst)) await ensureBackup(resolvedDst);

  const { default: AdmZipCtor } = await import("adm-zip");
  const zip = new AdmZipCtor();
  zip.addLocalFolder(resolvedSrc, "");
  await atomicWrite(zip, resolvedDst);
  invalidateIwdCache(resolvedDst);

  return okResult(`Packed ${resolvedSrc}\n    → ${resolvedDst}`);
}

// ---------------------------------------------------------------------------
// iwd_sync
// ---------------------------------------------------------------------------

interface SyncArgs { source_dir: string; dest_path: string; dry_run: boolean; }

async function handleIwdSync({ source_dir, dest_path, dry_run }: SyncArgs): Promise<ToolResult> {
  const resolvedSrc = path.resolve(source_dir);
  const srcError = await validateSourceDir(resolvedSrc);
  if (srcError) return srcError;

  const resolvedDst = resolveIwdPath(dest_path);
  const opened = openIwd(resolvedDst);
  if (!opened.ok) return errResult(opened.error);

  if (dry_run) {
    return okResult(`[dry_run] Would sync files from ${resolvedSrc} into existing archive ${resolvedDst}`);
  }

  await ensureBackup(resolvedDst);
  opened.value.addLocalFolder(resolvedSrc, "");
  await atomicWrite(opened.value, resolvedDst);
  invalidateIwdCache(resolvedDst);

  return okResult(`Synced files from ${resolvedSrc}\n    → ${resolvedDst}`);
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
function archiveTool<A extends z.ZodRawShape>(
  name: string, config: ToolConfig<A>, handler: ToolCallback<A>,
): (server: McpServer) => void {
  return (server) => { server.registerTool(name, config, handler); };
}

const ARCHIVE_TOOLS: ((server: McpServer) => void)[] = [
  archiveTool("iwd_extract", {
    title: "Extract Archive Entries",
    description:
      "Extract entries from an IWD archive to a directory on disk. " +
      "Once extracted, standard shell tools (rg, fd, bat) work natively. " +
      "Use entry_glob to extract only a subset of files. " +
      "Returns the destination path and list of extracted files.",
    inputSchema: {
      path: z.string().describe("Absolute or relative path to the IWD file"),
      dest: z.string().describe("Destination directory path. Created if it does not exist."),
      entry_glob: z.string().optional().describe("Optional glob to extract only matching entries (e.g. '*.gsc', 'maps/**/*.gsc')"),
      dry_run: z.boolean().optional().default(false).describe("If true, lists what would be extracted without writing any files"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, handleIwdExtract),

  archiveTool("iwd_pack", {
    title: "Pack Workspace to Archive (Full Rebuild)",
    description:
      "Zips the entire contents of a workspace directory into a BRAND NEW IWD archive. " +
      "WARNING: If the destination file already exists, it is completely overwritten and replaced. " +
      "If you want to inject a few changed files into an existing archive without deleting everything else, use iwd_sync instead.",
    inputSchema: {
      source_dir: z.string().describe("The folder containing loose files to pack"),
      dest_path: z.string().describe("The .iwd file to create/overwrite"),
      dry_run: z.boolean().optional().default(false).describe("If true, validates without writing the archive"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, handleIwdPack),

  archiveTool("iwd_sync", {
    title: "Sync Workspace to Existing Archive (Partial Update)",
    description:
      "Injects or overwrites specific files from a workspace directory into an EXISTING IWD archive. " +
      "Crucially, it leaves all other files in the archive untouched. " +
      "Use this (instead of iwd_pack) when you've extracted a mod, edited a few files, and want to put just those files back into the original archive.",
    inputSchema: {
      source_dir: z.string().describe("Folder with modified loose files"),
      dest_path: z.string().describe("The existing .iwd file to update"),
      dry_run: z.boolean().optional().default(false).describe("If true, validates without modifying the archive"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, handleIwdSync),
];

/**
 * Registers archive IWD tools on the given MCP server instance.
 */
export function registerArchiveTools(server: McpServer): void {
  for (const register of ARCHIVE_TOOLS) register(server);
}
