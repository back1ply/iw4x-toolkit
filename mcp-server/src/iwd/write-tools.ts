/**
 * @file iwd/write-tools.ts
 * Write IWD archive tools: iwd_write, iwd_patch, iwd_remove
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  resolveIwdPath,
  openIwd,
  invalidateIwdCache,
  normalizeEntry,
  isBinaryEntry,
  isSafeEntryPath,
  ensureBackup,
  atomicWrite,
  buildDiffSnippet,
  errResult,
  okResult,
  entryNotFoundErr,
} from "../utils.js";

/**
 * Registers write IWD archive tools on the given MCP server instance.
 */
export function registerWriteTools(server: McpServer): void {
  // --- Tool: iwd_write ---
  server.registerTool(
    "iwd_write",
    {
      title: "Write Archive Entry (Surgical Fix Only)",
      description:
        "WARNING: For editing multiple files or doing large overhauls, use iwd_extract + workspace tools + iwd_sync instead. " +
        "Write or replace an entire single file inside an IWD archive. " +
        "For targeted edits to a small part of a large file, prefer iwd_patch instead (avoids re-sending full content). " +
        "Creates a .bak backup on first modification per session. Content must be UTF-8 text. " +
        "When replacing an existing text entry, returns a ±3-line diff for verification. " +
        "Set dry_run=true to validate the operation without committing it.",
      inputSchema: {
        path: z.string().describe("Absolute or relative path to the IWD file"),
        entry: z
          .string()
          .describe(
            "Entry path inside the IWD. New entries are created automatically.",
          ),
        content: z.string().describe("Full UTF-8 text content to write"),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, validates the write without actually modifying the archive (safe to use first)",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ path: iwdPath, entry, content, dry_run }) => {
      const resolved = resolveIwdPath(iwdPath);
      const opened = openIwd(resolved);
      if (!opened.ok) return errResult(opened.error);
      const { value: zip } = opened;

      const normalized = normalizeEntry(entry);
      if (!normalized) return errResult("Error: entry path cannot be empty.");
      if (!isSafeEntryPath(normalized)) {
        return errResult("Error: entry path is invalid or contains path traversal sequences (not allowed).");
      }

      const existing = zip.getEntry(normalized);
      const lineCount = content.split("\n").length;
      const action = existing ? "Updated" : "Added";

      if (dry_run) {
        return okResult(
          `[dry_run] Would ${action.toLowerCase()} ${normalized} in ${resolved}\n` +
            `Content: ${lineCount} lines, ${content.length} chars`,
        );
      }

      let diffSection = "";
      if (existing && !isBinaryEntry(normalized)) {
        const oldText = zip.readAsText(existing);
        const { snippet, changedLine } = buildDiffSnippet(oldText, content);
        if (snippet) {
          diffSection = `\n\n--- Diff (first change at line ${changedLine + 1}) ---\n${snippet}`;
        }
      }

      await ensureBackup(resolved);
      if (existing) {
        zip.updateFile(normalized, Buffer.from(content, "utf-8"));
      } else {
        zip.addFile(normalized, Buffer.from(content, "utf-8"));
      }
      await atomicWrite(zip, resolved);
      invalidateIwdCache(resolved);

      return okResult(
        `${action} ${normalized} in ${resolved} (${lineCount} lines, ${content.length} chars)${diffSection}`,
      );
    },
  );

  // --- Tool: iwd_patch ---
  server.registerTool(
    "iwd_patch",
    {
      title: "Patch Archive Entry (Surgical Fix Only)",
      description:
        "WARNING: For editing multiple files or doing large overhauls, use iwd_extract + workspace tools + iwd_sync instead. " +
        "Perform a surgical string replacement inside a single text entry in an IWD archive. " +
        "Returns a ±3-line diff snippet around the change so you can verify the edit without re-reading the file. " +
        "Only replaces the first occurrence by default — use count=-1 to replace all. " +
        "Set dry_run=true to preview what would change without modifying the archive.",
      inputSchema: {
        path: z.string().describe("Absolute or relative path to the IWD file"),
        entry: z
          .string()
          .describe(
            "Path of the entry inside the IWD (forward or backslashes accepted)",
          ),
        old: z
          .string()
          .min(1)
          .describe(
            "Exact string to find and replace (must appear in the file, case-sensitive)",
          ),
        new: z.string().describe("Replacement string"),
        count: z
          .number()
          .int()
          .min(-1)
          .optional()
          .default(1)
          .describe(
            "Number of occurrences to replace. 1 = first only (default), -1 = all occurrences",
          ),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, returns the diff preview without modifying the archive",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({
      path: iwdPath,
      entry,
      old: oldStr,
      new: newStr,
      count,
      dry_run,
    }) => {
      const resolved = resolveIwdPath(iwdPath);
      const opened = openIwd(resolved);
      if (!opened.ok) return errResult(opened.error);
      const { value: zip } = opened;

      const normalized = normalizeEntry(entry);
      if (!normalized) return errResult("Error: entry path cannot be empty.");
      if (!isSafeEntryPath(normalized)) {
        return errResult("Error: entry path is invalid or contains path traversal sequences (not allowed).");
      }

      const zipEntry = zip.getEntry(normalized);
      if (!zipEntry) {
        return errResult(
          `Error: Entry not found in archive: ${normalized}\n` +
            `Tip: use iwd_list to check the exact entry path.`,
        );
      }
      if (isBinaryEntry(normalized)) {
        return errResult(
          `Error: Cannot patch binary entry: ${normalized}\n` +
            `Only text files (.gsc, .menu, .cfg, .csv, etc.) can be patched.`,
        );
      }

      const original = zip.readAsText(zipEntry);
      if (!original.includes(oldStr)) {
        return errResult(
          `Error: Search string not found in ${normalized}\n` +
            `The 'old' string must match exactly (case-sensitive, including whitespace and line endings).`,
        );
      }

      const occurrences = original.split(oldStr).length - 1;
      let patched = original;
      let replaced = 0;
      const firstReplaceOffset = original.indexOf(oldStr);
      const hintLine =
        firstReplaceOffset >= 0
          ? original.slice(0, firstReplaceOffset).split(/\r?\n/).length - 1
          : 0;

      // Validate count is not 0 (would result in no replacements)
      if (count === 0) {
        return errResult("Error: count must be at least 1 or -1 for all occurrences.");
      }

      if (count === -1) {
        patched = original.split(oldStr).join(newStr);
        replaced = occurrences;
      } else {
        for (let i = 0; i < count && patched.includes(oldStr); i++) {
          patched = patched.replace(oldStr, newStr);
          replaced++;
        }
      }

      const { snippet, changedLine } = buildDiffSnippet(
        original,
        patched,
        3,
        hintLine,
      );

      const remaining = occurrences - replaced;
      const summary =
        remaining === 0
          ? `Replaced ${replaced}/${occurrences} occurrence(s)`
          : `Replaced ${replaced} of ${occurrences} occurrence(s) (${remaining} remaining — use count=-1 to replace all)`;

      const diffBlock = `--- Context around change (line ${changedLine + 1}) ---\n${snippet}`;

      if (dry_run) {
        return okResult(
          `[dry_run] ${normalized}: ${summary} (no changes written)\n\n${diffBlock}`,
        );
      }

      await ensureBackup(resolved);
      zip.updateFile(normalized, Buffer.from(patched, "utf-8"));
      await atomicWrite(zip, resolved);
      invalidateIwdCache(resolved);

      return okResult(`Patched: ${normalized}\n${summary}\n\n${diffBlock}`);
    },
  );

  // --- Tool: iwd_remove ---
  server.registerTool(
    "iwd_remove",
    {
      title: "Remove Archive Entry",
      description:
        "Remove an entry from an IWD archive. Creates a .bak backup on first modification per session. " +
        "Set dry_run=true to validate without actually removing the entry.",
      inputSchema: {
        path: z.string().describe("Absolute or relative path to the IWD file"),
        entry: z
          .string()
          .describe(
            "Path of the entry to remove. Use iwd_list to find the exact path.",
          ),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, validates the operation without modifying the archive",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ path: iwdPath, entry, dry_run }) => {
      const resolved = resolveIwdPath(iwdPath);
      const opened = openIwd(resolved);
      if (!opened.ok) return errResult(opened.error);
      const { value: zip } = opened;

      const normalized = normalizeEntry(entry);
      if (!normalized) return errResult("Error: entry path cannot be empty.");
      if (!isSafeEntryPath(normalized)) {
        return errResult("Error: entry path is invalid or contains path traversal sequences (not allowed).");
      }

      const existing = zip.getEntry(normalized);
      if (!existing) return entryNotFoundErr(normalized);

      const size = existing.header.size;
      const crc = existing.header.crc.toString(16).toUpperCase();

      if (dry_run) {
        return okResult(
          `[dry_run] Would remove ${normalized} from ${resolved}\n` +
            `Entry: ${size} bytes, CRC: ${crc}`,
        );
      }

      await ensureBackup(resolved);
      zip.deleteFile(normalized);
      await atomicWrite(zip, resolved);
      invalidateIwdCache(resolved);

      return okResult(
        `Removed ${normalized} from ${resolved}\nEntry was: ${size} bytes, CRC: ${crc}`,
      );
    },
  );
}
