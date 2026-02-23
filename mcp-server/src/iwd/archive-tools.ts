/**
 * @file iwd/archive-tools.ts
 * Archive IWD tools: iwd_pack, iwd_sync, iwd_extract
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "node:path";
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

/**
 * Registers archive IWD tools on the given MCP server instance.
 */
export function registerArchiveTools(server: McpServer): void {
  // --- Tool: iwd_extract ---
  server.registerTool(
    "iwd_extract",
    {
      title: "Extract Archive Entries",
      description:
        "Extract entries from an IWD archive to a directory on disk. " +
        "Once extracted, standard shell tools (rg, fd, bat) work natively. " +
        "Use entry_glob to extract only a subset of files. " +
        "Returns the destination path and list of extracted files.",
      inputSchema: {
        path: z.string().describe("Absolute or relative path to the IWD file"),
        dest: z
          .string()
          .describe(
            "Destination directory path. Created if it does not exist.",
          ),
        entry_glob: z
          .string()
          .optional()
          .describe(
            "Optional glob to extract only matching entries (e.g. '*.gsc', 'maps/**/*.gsc')",
          ),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, lists what would be extracted without writing any files",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ path: iwdPath, dest, entry_glob, dry_run }) => {
      const resolved = resolveIwdPath(iwdPath);
      const resolvedDest = path.resolve(dest);
      const opened = openIwd(resolved);
      if (!opened.ok) return errResult(opened.error);
      const { value: zip } = opened;

      const globRe = entry_glob ? globToRegex(entry_glob) : null;
      const entries = zip
        .getEntries()
        .filter((e) => !e.isDirectory && (!globRe || globRe.test(e.entryName)));

      if (entries.length === 0) {
        return okResult(
          entry_glob
            ? `No entries match glob '${entry_glob}' in ${resolved}.\nTip: use iwd_list to see all entries.`
            : `No entries found in ${resolved}.`,
        );
      }

      if (dry_run) {
        const names = entries.map((e) => e.entryName);
        return okResult(
          `[dry_run] Would extract ${entries.length} file(s) to ${resolvedDest}:\n\n` +
            names.join("\n"),
        );
      }

      const { mkdir, writeFile } = await import("node:fs/promises");
      const extracted: string[] = [];
      const skipped: string[] = [];

      for (const e of entries) {
        // Validate entry path for security (prevent path traversal)
        if (!isSafeEntryPath(e.entryName)) {
          skipped.push(e.entryName);
          continue;
        }
        
        const outPath = path.resolve(resolvedDest, e.entryName);
        
        // Double-check that the resolved path is still within the destination
        // This catches edge cases like absolute paths that might slip through
        if (!outPath.startsWith(resolvedDest + path.sep) && outPath !== resolvedDest) {
          skipped.push(e.entryName);
          continue;
        }
        
        const outDir = path.dirname(outPath);
        await mkdir(outDir, { recursive: true });
        const buf = zip.readFile(e);
        if (buf) {
          await writeFile(outPath, buf);
          extracted.push(e.entryName);
        }
      }

      let resultMsg = `Extracted ${extracted.length} file(s) to ${resolvedDest}`;
      if (extracted.length > 0) {
        resultMsg += `:\n\n` + extracted.join("\n");
      }
      if (skipped.length > 0) {
        resultMsg += `\n\n⚠️ Skipped ${skipped.length} unsafe entry path(s): ${skipped.join(", ")}`;
      }
      return okResult(resultMsg);
    },
  );

  // --- Tool: iwd_pack ---
  server.registerTool(
    "iwd_pack",
    {
      title: "Pack Workspace to Archive (Full Rebuild)",
      description:
        "Zips the entire contents of a workspace directory into a BRAND NEW IWD archive. " +
        "WARNING: If the destination file already exists, it is completely overwritten and replaced. " +
        "If you want to inject a few changed files into an existing archive without deleting everything else, use iwd_sync instead.",
      inputSchema: {
        source_dir: z
          .string()
          .describe("The folder containing loose files to pack"),
        dest_path: z.string().describe("The .iwd file to create/overwrite"),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, validates without writing the archive"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ source_dir, dest_path, dry_run }) => {
      // Rate limit check
      const rateCheck = checkRateLimit("iwd_pack");
      if (!rateCheck.allowed) {
        return errResult(
          `Rate limit exceeded for iwd_pack. Try again in ${rateCheck.resetIn} seconds.`
        );
      }

      const resolvedSrc = path.resolve(source_dir);
      const fs = await import("node:fs/promises");

      try {
        const stat = await fs.stat(resolvedSrc);
        if (!stat.isDirectory()) {
          return errResult(
            `Error: source_dir is not a directory: ${resolvedSrc}`,
          );
        }
      } catch {
        return errResult(`Error: source_dir does not exist: ${resolvedSrc}`);
      }

      const resolvedDst = resolveIwdPath(dest_path);

      if (dry_run) {
        return okResult(
          `[dry_run] Would pack directory ${resolvedSrc} into new archive ${resolvedDst}`,
        );
      }

      const { existsSync } = await import("node:fs");
      if (existsSync(resolvedDst)) {
        await ensureBackup(resolvedDst);
      }

      const { default: AdmZip } = await import("adm-zip");
      const zip = new AdmZip();
      zip.addLocalFolder(resolvedSrc, "");

      await atomicWrite(zip, resolvedDst);
      invalidateIwdCache(resolvedDst);

      return okResult(`Packed ${resolvedSrc}\n    → ${resolvedDst}`);
    },
  );

  // --- Tool: iwd_sync ---
  server.registerTool(
    "iwd_sync",
    {
      title: "Sync Workspace to Existing Archive (Partial Update)",
      description:
        "Injects or overwrites specific files from a workspace directory into an EXISTING IWD archive. " +
        "crucial: It leaves all other files in the archive untouched. " +
        "Use this (instead of iwd_pack) when you've extracted a mod, edited a few files, and want to put just those files back into the original archive.",
      inputSchema: {
        source_dir: z.string().describe("Folder with modified loose files"),
        dest_path: z.string().describe("The existing .iwd file to update"),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, validates without modifying the archive"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ source_dir, dest_path, dry_run }) => {
      const resolvedSrc = path.resolve(source_dir);
      const fs = await import("node:fs/promises");

      try {
        const stat = await fs.stat(resolvedSrc);
        if (!stat.isDirectory()) {
          return errResult(
            `Error: source_dir is not a directory: ${resolvedSrc}`,
          );
        }
      } catch {
        return errResult(`Error: source_dir does not exist: ${resolvedSrc}`);
      }

      const resolvedDst = resolveIwdPath(dest_path);
      const opened = openIwd(resolvedDst);
      if (!opened.ok) return errResult(opened.error);
      const { value: zip } = opened;

      if (dry_run) {
        return okResult(
          `[dry_run] Would sync files from ${resolvedSrc} into existing archive ${resolvedDst}`,
        );
      }

      await ensureBackup(resolvedDst);
      zip.addLocalFolder(resolvedSrc, "");

      await atomicWrite(zip, resolvedDst);
      invalidateIwdCache(resolvedDst);

      return okResult(`Synced files from ${resolvedSrc}\n    → ${resolvedDst}`);
    },
  );
}
