/**
 * @file iwd/tools.ts
 * Registers all 11 IWD archive tools on the MCP server.
 * Uses `registerTool` (MCP spec 2025-11-25) with title, description,
 * inputSchema, and annotations fields.
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
  GREP_MAX_MATCHES_DEFAULT,
} from "../utils.js";

/**
 * Registers all IWD archive tools on the given MCP server instance.
 * Call this once during server bootstrap.
 */
export function registerIwdTools(server: McpServer): void {

  // --- Tool: iwd_list ---
  server.registerTool(
    "iwd_list",
    {
      title: "List Archive Entries",
      description:
        "List entries in an IWD archive. " +
        "Defaults to compact name-only output — efficient for discovery. " +
        "Use summary_only=true for a one-line type breakdown (e.g. '45 .gsc, 12 .menu, 8 binary') — the cheapest first call on any IWD. " +
        "Use pattern to filter by glob (e.g. '*.gsc', 'ui_mp/*.menu'). " +
        "Pass names_only=false only when you need file sizes.",
      inputSchema: {
        path: z.string().describe("Absolute or relative path to the IWD file"),
        pattern: z
          .string()
          .optional()
          .describe(
            "Optional glob pattern to filter entries (e.g. '*.gsc', 'maps/**/*.gsc', 'ui_mp/*.menu')",
          ),
        summary_only: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, returns a single-line breakdown of entry counts by type (e.g. '45 .gsc, 12 .menu, 8 binary'). " +
            "Cheapest possible overview — use this first when exploring an unfamiliar IWD.",
          ),
        names_only: z
          .boolean()
          .optional()
          .default(true)
          .describe("If true (default), returns entry names only. Pass false to include file sizes."),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ path: iwdPath, pattern, summary_only, names_only }) => {
      const resolved = resolveIwdPath(iwdPath);
      const opened = openIwd(resolved);
      if ("error" in opened) return errResult(`Error: ${opened.error}`);
      const { zip } = opened;

      let rows = zip.getEntries()
        .filter((e) => !e.isDirectory)
        .map((e) => ({
          name: e.entryName,
          size: e.header.size,
          compressedSize: e.header.compressedSize,
        }));

      const totalInArchive = rows.length;

      if (summary_only) {
        const counts = new Map<string, number>();
        for (const row of rows) {
          const ext = isBinaryEntry(row.name)
            ? "binary"
            : (path.extname(row.name).toLowerCase() || "(no ext)");
          counts.set(ext, (counts.get(ext) ?? 0) + 1);
        }
        const parts = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([ext, n]) => `${n} ${ext}`);
        return okResult(`${resolved}\n${totalInArchive} entries: ${parts.join(", ")}`);
      }

      if (pattern) {
        const regex = globToRegex(pattern);
        rows = rows.filter((r) => regex.test(r.name));
      }

      if (rows.length === 0) {
        return okResult(
          pattern
            ? `No entries match pattern '${pattern}' in ${resolved} (${totalInArchive} total entries).\nTip: use iwd_list without a pattern to see all entries.`
            : `No entries found in ${resolved}.`,
        );
      }

      const header = `${resolved}${pattern ? ` [filter: ${pattern}]` : ""}\n${rows.length} of ${totalInArchive} entries:`;
      const body = names_only
        ? rows.map((r) => r.name).join("\n")
        : rows.map((r) => `${r.name}  (${r.size} → ${r.compressedSize} bytes)`).join("\n");

      return okResult(`${header}\n\n${body}`);
    },
  );

  // --- Tool: iwd_read ---
  server.registerTool(
    "iwd_read",
    {
      title: "Read Archive Entry",
      description:
        "Read a file from inside an IWD archive. " +
        "Returns UTF-8 text for text files (.gsc, .menu, .cfg, .csv, etc.) and base64 for binary files (.iwi, .d3dbsp, etc.). " +
        "Use limit and offset to read sections of large files without flooding context. " +
        "Use iwd_info first to check file size and type before reading large files.",
      inputSchema: {
        path: z.string().describe("Absolute or relative path to the IWD file"),
        entry: z
          .string()
          .describe(
            "Path of the entry inside the IWD (e.g. maps/mp/gametypes/_globallogic.gsc). Use iwd_list to find the exact path.",
          ),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Max lines to return (for text files). Omit to read the whole file."),
        offset: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("0-indexed line to start reading from (default: 0). Use with limit to page through large files."),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ path: iwdPath, entry, limit, offset }) => {
      const resolved = resolveIwdPath(iwdPath);
      const opened = openIwd(resolved);
      if ("error" in opened) return errResult(`Error: ${opened.error}`);
      const { zip } = opened;

      const normalized = normalizeEntry(entry);
      if (!normalized) return errResult("Error: entry path cannot be empty.");

      const zipEntry = zip.getEntry(normalized);
      if (!zipEntry) return entryNotFoundErr(normalized);

      if (isBinaryEntry(normalized)) {
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

      const text = zip.readAsText(zipEntry);
      const lines = text.split(/\r?\n/);
      const totalLines = lines.length;

      if (offset !== undefined || limit !== undefined) {
        const start = offset ?? 0;
        if (start >= totalLines && totalLines > 0) {
          return errResult(
            `Error: offset ${start} is beyond end of file (${totalLines} lines).\n` +
            `Tip: use offset values between 0 and ${totalLines - 1}.`,
          );
        }
        const end = limit !== undefined ? start + limit : totalLines;
        const slice = lines.slice(start, end);
        const header = `[${normalized}: lines ${start + 1}-${Math.min(end, totalLines)} of ${totalLines}]`;
        return okResult(`${header}\n${slice.join("\n")}`);
      }

      return okResult(`[${normalized}: ${totalLines} lines]\n${text}`);
    },
  );

  // --- Tool: iwd_info ---
  server.registerTool(
    "iwd_info",
    {
      title: "Get Entry Metadata",
      description:
        "Get metadata for a single entry in an IWD archive without reading its content. " +
        "Use this before iwd_read to check file size and type, avoiding accidental large or binary reads.",
      inputSchema: {
        path: z.string().describe("Absolute or relative path to the IWD file"),
        entry: z.string().describe("Path of the entry inside the IWD. Use iwd_list to find exact paths."),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ path: iwdPath, entry }) => {
      const resolved = resolveIwdPath(iwdPath);
      const opened = openIwd(resolved);
      if ("error" in opened) return errResult(`Error: ${opened.error}`);
      const { zip } = opened;

      const normalized = normalizeEntry(entry);
      if (!normalized) return errResult("Error: entry path cannot be empty.");

      const zipEntry = zip.getEntry(normalized);
      if (!zipEntry) return entryNotFoundErr(normalized);

      const binary = isBinaryEntry(normalized);
      const size = zipEntry.header.size;
      const compressedSize = zipEntry.header.compressedSize;
      const crc = zipEntry.header.crc.toString(16).toUpperCase();
      const time = zipEntry.header.time.toISOString();

      const readAdvice = binary
        ? `Note: Binary file — iwd_read will return base64 (${size} bytes).`
        : size > 50_000
        ? `Note: Large text file (${size} bytes). Use iwd_read with limit/offset to avoid flooding context.`
        : `Ready to read with iwd_read.`;

      return okResult(
        `Entry:     ${normalized}\n` +
        `Size:      ${size} bytes (compressed: ${compressedSize})\n` +
        `CRC:       ${crc}\n` +
        `Type:      ${binary ? "Binary" : "Text"}\n` +
        `Modified:  ${time}\n` +
        `${readAdvice}`,
      );
    },
  );

  // --- Tool: iwd_write ---
  server.registerTool(
    "iwd_write",
    {
      title: "Write Archive Entry",
      description:
        "Write or replace an entire file inside an IWD archive. " +
        "For targeted edits to a small part of a large file, prefer iwd_patch instead (avoids re-sending full content). " +
        "Creates a .bak backup on first modification per session. Content must be UTF-8 text. " +
        "When replacing an existing text entry, returns a ±3-line diff for verification. " +
        "Set dry_run=true to validate the operation without committing it.",
      inputSchema: {
        path: z.string().describe("Absolute or relative path to the IWD file"),
        entry: z.string().describe("Entry path inside the IWD. New entries are created automatically."),
        content: z.string().describe("Full UTF-8 text content to write"),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, validates the write without actually modifying the archive (safe to use first)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ path: iwdPath, entry, content, dry_run }) => {
      const resolved = resolveIwdPath(iwdPath);
      const opened = openIwd(resolved);
      if ("error" in opened) return errResult(`Error: ${opened.error}`);
      const { zip } = opened;

      const normalized = normalizeEntry(entry);
      if (!normalized) return errResult("Error: entry path cannot be empty.");

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

      ensureBackup(resolved);
      if (existing) {
        zip.updateFile(normalized, Buffer.from(content, "utf-8"));
      } else {
        zip.addFile(normalized, Buffer.from(content, "utf-8"));
      }
      atomicWrite(zip, resolved);
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
      title: "Patch Archive Entry",
      description:
        "Perform a surgical string replacement inside a text entry in an IWD archive. " +
        "Returns a ±3-line diff snippet around the change so you can verify the edit without re-reading the file. " +
        "Only replaces the first occurrence by default — use count=-1 to replace all. " +
        "Prefer this over iwd_write when changing a small part of a large file. " +
        "Set dry_run=true to preview what would change without modifying the archive.",
      inputSchema: {
        path: z.string().describe("Absolute or relative path to the IWD file"),
        entry: z.string().describe("Path of the entry inside the IWD (forward or backslashes accepted)"),
        old: z.string().min(1).describe("Exact string to find and replace (must appear in the file, case-sensitive)"),
        new: z.string().describe("Replacement string"),
        count: z
          .number()
          .optional()
          .default(1)
          .describe("Number of occurrences to replace. 1 = first only (default), -1 = all occurrences"),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, returns the diff preview without modifying the archive"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ path: iwdPath, entry, old: oldStr, new: newStr, count, dry_run }) => {
      const resolved = resolveIwdPath(iwdPath);
      const opened = openIwd(resolved);
      if ("error" in opened) return errResult(`Error: ${opened.error}`);
      const { zip } = opened;

      const normalized = normalizeEntry(entry);
      if (!normalized) return errResult("Error: entry path cannot be empty.");

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
      const hintLine = firstReplaceOffset >= 0
        ? original.slice(0, firstReplaceOffset).split(/\r?\n/).length - 1
        : 0;

      if (count === -1) {
        patched = original.split(oldStr).join(newStr);
        replaced = occurrences;
      } else {
        for (let i = 0; i < count && patched.includes(oldStr); i++) {
          patched = patched.replace(oldStr, newStr);
          replaced++;
        }
      }

      const { snippet, changedLine } = buildDiffSnippet(original, patched, 3, hintLine);

      const remaining = occurrences - replaced;
      const summary =
        remaining === 0
          ? `Replaced ${replaced}/${occurrences} occurrence(s)`
          : `Replaced ${replaced} of ${occurrences} occurrence(s) (${remaining} remaining — use count=-1 to replace all)`;

      const diffBlock = `--- Context around change (line ${changedLine + 1}) ---\n${snippet}`;

      if (dry_run) {
        return okResult(`[dry_run] ${normalized}: ${summary} (no changes written)\n\n${diffBlock}`);
      }

      ensureBackup(resolved);
      zip.updateFile(normalized, Buffer.from(patched, "utf-8"));
      atomicWrite(zip, resolved);
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
        entry: z.string().describe("Path of the entry to remove. Use iwd_list to find the exact path."),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, validates the operation without modifying the archive"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ path: iwdPath, entry, dry_run }) => {
      const resolved = resolveIwdPath(iwdPath);
      const opened = openIwd(resolved);
      if ("error" in opened) return errResult(`Error: ${opened.error}`);
      const { zip } = opened;

      const normalized = normalizeEntry(entry);
      if (!normalized) return errResult("Error: entry path cannot be empty.");

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

      ensureBackup(resolved);
      zip.deleteFile(normalized);
      atomicWrite(zip, resolved);
      invalidateIwdCache(resolved);

      return okResult(`Removed ${normalized} from ${resolved}\nEntry was: ${size} bytes, CRC: ${crc}`);
    },
  );

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
          .describe("Optional glob to limit comparison to matching entries (e.g. '*.gsc', 'maps/**/*.gsc')"),
        content_diff: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, includes a ±3-line diff for each modified text entry (may be verbose)"),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ path1, path2, entry_glob, content_diff }) => {
      const r1 = resolveIwdPath(path1);
      const r2 = resolveIwdPath(path2);

      const o1 = openIwd(r1);
      if ("error" in o1) return errResult(`Error: ${o1.error}`);
      const o2 = openIwd(r2);
      if ("error" in o2) return errResult(`Error: ${o2.error}`);

      const { zip: zip1 } = o1;
      const { zip: zip2 } = o2;

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
                lines.push(``, `[binary] ${name}: ${e1.header.size} → ${e2.header.size} bytes`);
              }
              continue;
            }
            const e1 = zip1.getEntry(name);
            const e2 = zip2.getEntry(name);
            if (!e1 || !e2) continue;
            const t1 = zip1.readAsText(e1);
            const t2 = zip2.readAsText(e2);
            const { snippet, changedLine } = buildDiffSnippet(t1, t2);
            lines.push(``, `[diff] ${name} (first change at line ${changedLine + 1}):`, snippet);
          }
        }
      }

      return okResult(lines.join("\n"));
    },
  );

  // --- Tool: iwd_grep ---
  server.registerTool(
    "iwd_grep",
    {
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
        pattern: z.string().describe(
          "String or regex pattern to search for. Literal string by default; set is_regex=true for regex.",
        ),
        entry_glob: z
          .string()
          .optional()
          .describe("Glob pattern to filter which entries to search (e.g. '*.gsc', 'maps/**/*.gsc')"),
        is_regex: z
          .boolean()
          .optional()
          .default(false)
          .describe("Treat pattern as a regex (default: false — plain case-insensitive string search)"),
        max_matches: z
          .number()
          .int()
          .positive()
          .optional()
          .default(GREP_MAX_MATCHES_DEFAULT)
          .describe(`Max total matches to return before truncating (default: ${GREP_MAX_MATCHES_DEFAULT}). Increase if needed.`),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ path: iwdPath, pattern, entry_glob, is_regex, max_matches }) => {
      const resolved = resolveIwdPath(iwdPath);
      const opened = openIwd(resolved);
      if ("error" in opened) return errResult(`Error: ${opened.error}`);
      const { zip } = opened;

      let searchRe: RegExp;
      if (is_regex) {
        try {
          searchRe = new RegExp(pattern, "i");
        } catch {
          return errResult(`Error: Invalid regex pattern: ${pattern}\nTip: check for unbalanced parentheses or invalid quantifiers. Or set is_regex=false for a literal search.`);
        }
      } else {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        searchRe = new RegExp(escaped, "i");
      }

      const globRe = entry_glob ? globToRegex(entry_glob) : null;
      const entries = zip.getEntries().filter(
        (e) => !e.isDirectory && !isBinaryEntry(e.entryName) && (!globRe || globRe.test(e.entryName)),
      );

      const resultLines: string[] = [];
      let totalMatches = 0;
      let truncated = false;

      for (const e of entries) {
        if (truncated) break;
        const text = zip.readAsText(e);
        const fileLines = text.split(/\r?\n/);

        for (let i = 0; i < fileLines.length; i++) {
          if (searchRe.test(fileLines[i] ?? "")) {
            if (totalMatches >= max_matches) {
              truncated = true;
              break;
            }
            resultLines.push(`${e.entryName}:${i + 1}: ${(fileLines[i] ?? "").trim()}`);
            totalMatches++;
          }
        }
      }

      if (totalMatches === 0) {
        const globNoMatchMsg = entry_glob
          ? `No text entries match glob '${entry_glob}' in ${resolved}.\nTip: use iwd_list to see all entries.`
          : `No matches for '${pattern}' in ${resolved}`;
        return okResult(globNoMatchMsg);
      }

      const footer = truncated
        ? `\n\n... truncated at ${max_matches} matches. Use entry_glob or a more specific pattern to narrow results.`
        : "";

      return okResult(
        `Found ${totalMatches}${truncated ? "+" : ""} match(es) in ${resolved}` +
        (entry_glob ? ` [filter: ${entry_glob}]` : "") +
        `:\n\n` +
        resultLines.join("\n") +
        footer,
      );
    },
  );

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
        dest: z.string().describe("Destination directory path. Created if it does not exist."),
        entry_glob: z
          .string()
          .optional()
          .describe("Optional glob to extract only matching entries (e.g. '*.gsc', 'maps/**/*.gsc')"),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, lists what would be extracted without writing any files"),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ path: iwdPath, dest, entry_glob, dry_run }) => {
      const resolved = resolveIwdPath(iwdPath);
      const resolvedDest = path.resolve(dest);
      const opened = openIwd(resolved);
      if ("error" in opened) return errResult(`Error: ${opened.error}`);
      const { zip } = opened;

      const globRe = entry_glob ? globToRegex(entry_glob) : null;
      const entries = zip.getEntries().filter(
        (e) => !e.isDirectory && (!globRe || globRe.test(e.entryName)),
      );

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

      const { mkdirSync, writeFileSync } = await import("node:fs");
      const extracted: string[] = [];

      for (const e of entries) {
        const outPath = path.join(resolvedDest, e.entryName);
        const outDir = path.dirname(outPath);
        mkdirSync(outDir, { recursive: true });
        const buf = zip.readFile(e);
        if (buf) {
          writeFileSync(outPath, buf);
          extracted.push(e.entryName);
        }
      }

      return okResult(
        `Extracted ${extracted.length} file(s) to ${resolvedDest}:\n\n` +
        extracted.join("\n"),
      );
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
        entry: z.string().describe("Current path of the entry inside the IWD. Use iwd_list to find exact path."),
        new_entry: z.string().describe("New path for the entry inside the IWD (e.g. 'scripts/renamed.gsc')"),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, validates the rename without modifying the archive"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ path: iwdPath, entry, new_entry, dry_run }) => {
      const resolved = resolveIwdPath(iwdPath);
      const opened = openIwd(resolved);
      if ("error" in opened) return errResult(`Error: ${opened.error}`);
      const { zip } = opened;

      const normalized = normalizeEntry(entry);
      const normalizedNew = normalizeEntry(new_entry);

      if (!normalized) return errResult("Error: entry path cannot be empty.");
      if (!normalizedNew) return errResult("Error: new_entry path cannot be empty.");

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
        return okResult(`[dry_run] Would rename ${normalized} → ${normalizedNew} in ${resolved}`);
      }

      ensureBackup(resolved);
      const buf = zip.readFile(zipEntry);
      if (!buf) {
        return errResult(`Error: Failed to read entry content: ${normalized}\nTip: the file may be corrupt.`);
      }
      zip.deleteFile(normalized);
      zip.addFile(normalizedNew, buf);
      atomicWrite(zip, resolved);
      invalidateIwdCache(resolved);

      return okResult(`Renamed ${normalized} → ${normalizedNew} in ${resolved}`);
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
        src_entry: z.string().describe("Entry path inside the source IWD. Use iwd_list to find exact path."),
        dst_path: z.string().describe("Path to the destination IWD file (can be the same as src_path)"),
        dst_entry: z.string().describe("Entry path to write in the destination IWD"),
        overwrite: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, overwrites an existing entry at dst_entry. Defaults to false (errors if destination entry exists)."),
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
    async ({ src_path, src_entry, dst_path, dst_entry, overwrite, dry_run }) => {
      const rSrc = resolveIwdPath(src_path);
      const rDst = resolveIwdPath(dst_path);

      const oSrc = openIwd(rSrc);
      if ("error" in oSrc) return errResult(`Error: ${oSrc.error}`);

      const normSrc = normalizeEntry(src_entry);
      const normDst = normalizeEntry(dst_entry);
      if (!normSrc) return errResult("Error: src_entry path cannot be empty.");
      if (!normDst) return errResult("Error: dst_entry path cannot be empty.");

      const srcZipEntry = oSrc.zip.getEntry(normSrc);
      if (!srcZipEntry) return entryNotFoundErr(normSrc);

      const isSameFile = path.resolve(rSrc) === path.resolve(rDst);
      const oDst = isSameFile ? oSrc : openIwd(rDst);
      if ("error" in oDst) return errResult(`Error: ${oDst.error}`);
      const dstZip = oDst.zip;

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

      const buf = oSrc.zip.readFile(srcZipEntry);
      if (!buf) {
        return errResult(`Error: Failed to read source entry: ${normSrc}\nTip: the file may be corrupt.`);
      }

      ensureBackup(rDst);
      if (existingDst) {
        dstZip.updateFile(normDst, buf);
      } else {
        dstZip.addFile(normDst, buf);
      }
      atomicWrite(dstZip, rDst);
      invalidateIwdCache(rDst);

      return okResult(
        `Copied ${normSrc} (${rSrc})\n    → ${normDst} (${rDst})\n` +
        `${srcZipEntry.header.size} bytes${existingDst ? " [overwrote existing]" : ""}`,
      );
    },
  );

} // end registerIwdTools
