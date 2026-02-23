/**
 * @file iwd/diff-tools.ts
 * Diff/copy IWD archive tools: iwd_diff, iwd_copy, iwd_rename
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "node:path";
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
  errResult,
  okResult,
  entryNotFoundErr,
} from "../utils.js";

/**
 * Registers diff/copy IWD archive tools on the given MCP server instance.
 */
export function registerDiffTools(server: McpServer): void {
  // --- Tool: iwd_diff ---
  server.registerTool(
    "iwd_diff",
    {
      title: "Diff Two Archives",
      description:
        "Compare two IWD files and report added, removed, modified (CRC mismatch), and identical entries. " +
        "Use entry_glob to limit comparison to a specific subset of files. " +
        "Set content_diff=true to include unified diffs for modified text entries.",
      inputSchema: {
        path1: z.string().describe("Path to the first (base) IWD file"),
        path2: z.string().describe("Path to the second (modified) IWD file"),
        entry_glob: z
          .string()
          .optional()
          .describe(
            "Optional glob to limit comparison to matching entries (e.g. '*.gsc', 'maps/**/*.gsc')",
          ),
        content_diff: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, includes a ±3-line diff for each modified text entry (may be verbose)",
          ),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ path1, path2, entry_glob, content_diff }) => {
      const r1 = resolveIwdPath(path1);
      const r2 = resolveIwdPath(path2);

      const o1 = openIwd(r1);
      if (!o1.ok) return errResult(o1.error);
      const o2 = openIwd(r2);
      if (!o2.ok) return errResult(o2.error);

      const { value: zip1 } = o1;
      const { value: zip2 } = o2;

      const globRe = entry_glob ? globToRegex(entry_glob) : null;

      const map1 = new Map<string, number>();
      for (const e of zip1.getEntries()) {
        if (!e.isDirectory && (!globRe || globRe.test(e.entryName))) {
          map1.set(e.entryName, e.header.crc);
        }
      }
      const map2 = new Map<string, number>();
      for (const e of zip2.getEntries()) {
        if (!e.isDirectory && (!globRe || globRe.test(e.entryName))) {
          map2.set(e.entryName, e.header.crc);
        }
      }

      const added: string[] = [];
      const removed: string[] = [];
      const modified: string[] = [];
      let identical = 0;

      for (const [name, crc2] of map2) {
        const crc1 = map1.get(name);
        if (crc1 === undefined) {
          added.push(name);
        } else if (crc1 !== crc2) {
          modified.push(name);
        } else {
          identical++;
        }
      }
      for (const name of map1.keys()) {
        if (!map2.has(name)) removed.push(name);
      }

      const globNote = entry_glob ? ` [filter: ${entry_glob}]` : "";
      const lines: string[] = [
        `Comparing${globNote}:`,
        `  A: ${r1} (${map1.size} files)`,
        `  B: ${r2} (${map2.size} files)`,
        ``,
        `Summary: ${added.length} added, ${removed.length} removed, ${modified.length} modified, ${identical} identical`,
      ];

      if (added.length > 0) {
        lines.push(``, `Added (in B, not in A):`);
        added.forEach((n) => lines.push(`  + ${n}`));
      }
      if (removed.length > 0) {
        lines.push(``, `Removed (in A, not in B):`);
        removed.forEach((n) => lines.push(`  - ${n}`));
      }
      if (modified.length > 0) {
        lines.push(``, `Modified (CRC differs):`);
        modified.forEach((n) => lines.push(`  ~ ${n}`));

        if (content_diff) {
          lines.push(``, `--- Content diffs for modified text entries ---`);
          for (const name of modified) {
            if (isBinaryEntry(name)) {
              const e1 = zip1.getEntry(name);
              const e2 = zip2.getEntry(name);
              if (e1 && e2) {
                lines.push(
                  ``,
                  `[binary] ${name}: ${e1.header.size} → ${e2.header.size} bytes`,
                );
              }
              continue;
            }
            const e1 = zip1.getEntry(name);
            const e2 = zip2.getEntry(name);
            if (!e1 || !e2) continue;
            const t1 = zip1.readAsText(e1);
            const t2 = zip2.readAsText(e2);
            const { snippet, changedLine } = buildDiffSnippet(t1, t2);
            lines.push(
              ``,
              `[diff] ${name} (first change at line ${changedLine + 1}):`,
              snippet,
            );
          }
        }
      }

      return okResult(lines.join("\n"));
    },
  );

  // --- Tool: iwd_rename ---
  server.registerTool(
    "iwd_rename",
    {
      title: "Rename Archive Entry",
      description:
        "Rename or move an entry within an IWD archive in a single operation. " +
        "Equivalent to iwd_read + iwd_write + iwd_remove, but faster and atomic. " +
        "Set dry_run=true to validate without modifying the archive.",
      inputSchema: {
        path: z.string().describe("Absolute or relative path to the IWD file"),
        entry: z
          .string()
          .describe(
            "Current path of the entry inside the IWD. Use iwd_list to find exact path.",
          ),
        new_entry: z
          .string()
          .describe(
            "New path for the entry inside the IWD (e.g. 'scripts/renamed.gsc')",
          ),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, validates the rename without modifying the archive",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ path: iwdPath, entry, new_entry, dry_run }) => {
      const resolved = resolveIwdPath(iwdPath);
      const opened = openIwd(resolved);
      if (!opened.ok) return errResult(opened.error);
      const { value: zip } = opened;

      const normalized = normalizeEntry(entry);
      const normalizedNew = normalizeEntry(new_entry);

      if (!normalized) return errResult("Error: entry path cannot be empty.");
      if (!normalizedNew)
        return errResult("Error: new_entry path cannot be empty.");

      if (normalized === normalizedNew) {
        return errResult(
          `Error: Source and destination are the same path: ${normalized}\n` +
            `Tip: choose a different new_entry path.`,
        );
      }

      const zipEntry = zip.getEntry(normalized);
      if (!zipEntry) return entryNotFoundErr(normalized);

      const existingNew = zip.getEntry(normalizedNew);
      if (existingNew) {
        return errResult(
          `Error: An entry already exists at the new path: ${normalizedNew}\n` +
            `Tip: remove it first with iwd_remove, or choose a different new_entry path.`,
        );
      }

      if (dry_run) {
        return okResult(
          `[dry_run] Would rename ${normalized} → ${normalizedNew} in ${resolved}`,
        );
      }

      await ensureBackup(resolved);
      const buf = zip.readFile(zipEntry);
      if (!buf) {
        return errResult(
          `Error: Failed to read entry content: ${normalized}\nTip: the file may be corrupt.`,
        );
      }
      zip.deleteFile(normalized);
      zip.addFile(normalizedNew, buf);
      await atomicWrite(zip, resolved);
      invalidateIwdCache(resolved);

      return okResult(
        `Renamed ${normalized} → ${normalizedNew} in ${resolved}`,
      );
    },
  );

  // --- Tool: iwd_copy ---
  server.registerTool(
    "iwd_copy",
    {
      title: "Copy Archive Entry",
      description:
        "Copy an entry from one IWD archive to another (or within the same archive). " +
        "Useful for duplicating entries or moving files between mod packages. " +
        "Set dry_run=true to validate without modifying anything.",
      inputSchema: {
        src_path: z.string().describe("Path to the source IWD file"),
        src_entry: z
          .string()
          .describe(
            "Entry path inside the source IWD. Use iwd_list to find exact path.",
          ),
        dst_path: z
          .string()
          .describe(
            "Path to the destination IWD file (can be the same as src_path)",
          ),
        dst_entry: z
          .string()
          .describe("Entry path to write in the destination IWD"),
        overwrite: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, overwrites an existing entry at dst_entry. Defaults to false (errors if destination entry exists).",
          ),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, validates the copy without modifying any file"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({
      src_path,
      src_entry,
      dst_path,
      dst_entry,
      overwrite,
      dry_run,
    }) => {
      const rSrc = resolveIwdPath(src_path);
      const rDst = resolveIwdPath(dst_path);

      const oSrc = openIwd(rSrc);
      if (!oSrc.ok) return errResult(oSrc.error);

      const normSrc = normalizeEntry(src_entry);
      const normDst = normalizeEntry(dst_entry);
      if (!normSrc) return errResult("Error: src_entry path cannot be empty.");
      if (!normDst) return errResult("Error: dst_entry path cannot be empty.");

      const srcZipEntry = oSrc.value.getEntry(normSrc);
      if (!srcZipEntry) return entryNotFoundErr(normSrc);

      const isSameFile = path.resolve(rSrc) === path.resolve(rDst);
      const oDst = isSameFile ? oSrc : openIwd(rDst);
      if (!oDst.ok) return errResult(oDst.error);
      const dstZip = oDst.value;

      const existingDst = dstZip.getEntry(normDst);
      if (existingDst && !overwrite) {
        return errResult(
          `Error: Destination entry already exists: ${normDst} in ${rDst}\n` +
            `Tip: set overwrite=true to replace it.`,
        );
      }

      if (dry_run) {
        return okResult(
          `[dry_run] Would copy ${normSrc} (${rSrc}) → ${normDst} (${rDst})` +
            (existingDst && overwrite ? ` [will overwrite existing]` : ""),
        );
      }

      const buf = oSrc.value.readFile(srcZipEntry);
      if (!buf) {
        return errResult(
          `Error: Failed to read source entry: ${normSrc}\nTip: the file may be corrupt.`,
        );
      }

      await ensureBackup(rDst);
      if (existingDst) {
        dstZip.updateFile(normDst, buf);
      } else {
        dstZip.addFile(normDst, buf);
      }
      await atomicWrite(dstZip, rDst);
      invalidateIwdCache(rDst);

      return okResult(
        `Copied ${normSrc} (${rSrc})\n    → ${normDst} (${rDst})\n` +
          `${srcZipEntry.header.size} bytes${existingDst ? " [overwrote existing]" : ""}`,
      );
    },
  );
}
