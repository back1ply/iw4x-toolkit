/**
 * @file iwd/read-tools.ts
 * Read-only IWD archive tools: iwd_list, iwd_read, iwd_info, iwd_grep
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "node:path";
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

/**
 * Registers read-only IWD archive tools on the given MCP server instance.
 */
export function registerReadTools(server: McpServer): void {
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
          .describe(
            "If true (default), returns entry names only. Pass false to include file sizes.",
          ),
        limit: z
          .number()
          .int()
          .positive()
          .max(10000)
          .optional()
          .describe("Max number of entries to return. Omit to return all."),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ path: iwdPath, pattern, summary_only, names_only, limit }) => {
      const resolved = resolveIwdPath(iwdPath);
      const opened = openIwd(resolved);
      if (!opened.ok) return errResult(opened.error);
      const { value: zip } = opened;

      let rows = zip
        .getEntries()
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
            : path.extname(row.name).toLowerCase() || "(no ext)";
          counts.set(ext, (counts.get(ext) ?? 0) + 1);
        }
        const parts = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([ext, n]) => `${n} ${ext}`);
        return okResult(
          `${resolved}\n${totalInArchive} entries: ${parts.join(", ")}`,
        );
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

      let truncated = false;
      const matchedCount = rows.length;
      if (limit !== undefined && matchedCount > limit) {
        rows = rows.slice(0, limit);
        truncated = true;
      }

      const header = `${resolved}${pattern ? ` [filter: ${pattern}]` : ""}\n${matchedCount} of ${totalInArchive} entries${truncated ? ` (showing first ${limit})` : ""}:`;
      const body = names_only
        ? rows.map((r) => r.name).join("\n")
        : rows
            .map((r) => `${r.name}  (${r.size} → ${r.compressedSize} bytes)`)
            .join("\n");

      return okResult(
        `${header}\n\n${body}${truncated ? `\n... truncated. Use pattern or increase limit to see more.` : ""}`,
      );
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
          .max(100000)
          .optional()
          .describe(
            "Max lines to return (for text files). Omit to read the whole file.",
          ),
        offset: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            "0-indexed line to start reading from (default: 0). Use with limit to page through large files.",
          ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ path: iwdPath, entry, limit, offset }) => {
      const resolved = resolveIwdPath(iwdPath);
      const opened = openIwd(resolved);
      if (!opened.ok) return errResult(opened.error);
      const { value: zip } = opened;

      const normalized = normalizeEntry(entry);
      if (!normalized) return errResult("Error: entry path cannot be empty.");

      const zipEntry = zip.getEntry(normalized);
      if (!zipEntry) return entryNotFoundErr(normalized);

      if (isBinaryEntry(normalized)) {
        const buf = zip.readFile(zipEntry);
        if (!buf) {
          return errResult(
            `Error: Failed to read binary entry: ${normalized}\nTip: the file may be corrupt.`,
          );
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `[binary: ${normalized}, ${buf.length} bytes, base64-encoded below]`,
            },
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
          const isMinified = text.length / totalLines > MINIFIED_FILE_CHARS_PER_LINE;
          return errResult(
            `Error: offset ${start} is beyond end of file (${totalLines} lines).\n` +
              `Tip: use offset values between 0 and ${totalLines - 1}.${isMinified ? `\nNote: This file averages over ${MINIFIED_FILE_CHARS_PER_LINE} chars per line and is likely minified. Use iwd_grep to search for specific terms if needed.` : ""}`,
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
        entry: z
          .string()
          .describe(
            "Path of the entry inside the IWD. Use iwd_list to find exact paths.",
          ),
        summary_only: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, returns a compact single-line type-and-size string.",
          ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ path: iwdPath, entry, summary_only }) => {
      const resolved = resolveIwdPath(iwdPath);
      const opened = openIwd(resolved);
      if (!opened.ok) return errResult(opened.error);
      const { value: zip } = opened;

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

      if (summary_only) {
        return okResult(
          `Entry: ${normalized} | Type: ${binary ? "Binary" : "Text"} | Size: ${size} bytes`,
        );
      }

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
        pattern: z
          .string()
          .describe(
            "String or regex pattern to search for. Literal string by default; set is_regex=true for regex.",
          ),
        entry_glob: z
          .string()
          .optional()
          .describe(
            "Glob pattern to filter which entries to search (e.g. '*.gsc', 'maps/**/*.gsc')",
          ),
        is_regex: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Treat pattern as a regex (default: false — plain case-insensitive string search)",
          ),
        max_matches: z
          .number()
          .int()
          .positive()
          .max(1000)
          .optional()
          .default(GREP_MAX_MATCHES_DEFAULT)
          .describe(
            `Max total matches to return before truncating (default: ${GREP_MAX_MATCHES_DEFAULT}). Increase if needed.`,
          ),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ path: iwdPath, pattern, entry_glob, is_regex, max_matches }) => {
      // Rate limit check
      const rateCheck = checkRateLimit("iwd_grep");
      if (!rateCheck.allowed) {
        return errResult(
          `Rate limit exceeded for iwd_grep. Try again in ${rateCheck.resetIn} seconds.`
        );
      }

      const resolved = resolveIwdPath(iwdPath);
      const opened = openIwd(resolved);
      if (!opened.ok) return errResult(opened.error);
      const { value: zip } = opened;

      let searchRe: RegExp;
      if (is_regex) {
        try {
          searchRe = getCachedRegex(pattern, "i");
        } catch {
          return errResult(
            `Error: Invalid regex pattern: ${pattern}\nTip: check for unbalanced parentheses or invalid quantifiers. Or set is_regex=false for a literal search.`,
          );
        }
      } else {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        searchRe = getCachedRegex(escaped, "i");
      }

      const globRe = entry_glob ? globToRegex(entry_glob) : null;
      const entries = zip
        .getEntries()
        .filter(
          (e) =>
            !e.isDirectory &&
            !isBinaryEntry(e.entryName) &&
            (!globRe || globRe.test(e.entryName)),
        );

      const resultLines: string[] = [];
      let totalMatches = 0;
      let truncated = false;

      for (const e of entries) {
        if (truncated) break;
        const text = zip.readAsText(e);
        const fileLines = text.split(/\r?\n/);

        for (let i = 0; i < fileLines.length; i++) {
          const line = fileLines[i] ?? "";
          const match = searchRe.exec(line);
          if (match) {
            if (totalMatches >= max_matches) {
              truncated = true;
              break;
            }
            let displayLine = line.trim();
            if (displayLine.length > 200) {
              const matchIdx = match.index;
              const start = Math.max(0, matchIdx - 100);
              const end = Math.min(line.length, matchIdx + 100);
              displayLine =
                (start > 0 ? "... " : "") +
                line.slice(start, end) +
                (end < line.length ? " ..." : "");
            }
            resultLines.push(`${e.entryName}:${i + 1}: ${displayLine}`);
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
}
