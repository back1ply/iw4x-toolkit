/**
 * @file iwd/write-tools.ts
 * Write IWD archive commands: iwd_write, iwd_patch, iwd_remove
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  isBinaryEntry,
  buildDiffSnippet,
  CommandError,
  requireIwd,
  requireSafeEntry,
  saveIwd,
} from "../utils.js";
import { command, registerCommands, type AnyCommand } from "../command.js";

const entryNotFoundTip = "Tip: use iwd_list to verify the exact entry path (forward slashes, case-sensitive).";

// ---------------------------------------------------------------------------
// iwd_write
// ---------------------------------------------------------------------------

interface WriteData {
  archive: string; entry: string; added: boolean; lines: number; chars: number;
  dryRun: boolean;
  /** First-change diff when replacing an existing text entry. */
  diff?: { snippet: string; changedLine: number };
}

const iwdWrite = command({
  name: "iwd_write",
  title: "Write Archive Entry (Surgical Fix Only)",
  description:
    "WARNING: For editing multiple files or doing large overhauls, use iwd_extract + workspace tools + iwd_sync instead. " +
    "Write or replace an entire single file inside an IWD archive. " +
    "For targeted edits to a small part of a large file, prefer iwd_patch instead (avoids re-sending full content). " +
    "Creates a .bak backup on first modification per session. Content must be UTF-8 text. " +
    "When replacing an existing text entry, returns a ±3-line diff for verification. " +
    "Set dry_run=true to validate the operation without committing it.",
  input: {
    path: z.string().describe("Absolute or relative path to the IWD file"),
    entry: z.string().describe("Entry path inside the IWD. New entries are created automatically."),
    content: z.string().describe("Full UTF-8 text content to write"),
    dry_run: z.boolean().optional().default(false).describe("If true, validates the write without actually modifying the archive (safe to use first)"),
  },
  annotations: { readOnlyHint: false, destructiveHint: true },
  async run({ path: iwdPath, entry, content, dry_run }): Promise<WriteData> {
    const { resolved, zip } = requireIwd(iwdPath);
    const normalized = requireSafeEntry(entry);
    const existing = zip.getEntry(normalized);
    const data: WriteData = {
      archive: resolved, entry: normalized, added: !existing,
      lines: content.split("\n").length, chars: content.length, dryRun: dry_run,
    };
    if (dry_run) return data;

    if (existing && !isBinaryEntry(normalized)) {
      data.diff = buildDiffSnippet(zip.readAsText(existing), content);
    }
    const buf = Buffer.from(content, "utf-8");
    await saveIwd(zip, resolved, (z) => (existing ? z.updateFile(normalized, buf) : z.addFile(normalized, buf)));
    return data;
  },
  render(d) {
    const action = d.added ? "Added" : "Updated";
    if (d.dryRun) {
      return `[dry_run] Would ${action.toLowerCase()} ${d.entry} in ${d.archive}\n` +
        `Content: ${d.lines} lines, ${d.chars} chars`;
    }
    const diffSection = d.diff?.snippet
      ? `\n\n--- Diff (first change at line ${d.diff.changedLine + 1}) ---\n${d.diff.snippet}`
      : "";
    return `${action} ${d.entry} in ${d.archive} (${d.lines} lines, ${d.chars} chars)${diffSection}`;
  },
});

// ---------------------------------------------------------------------------
// iwd_patch
// ---------------------------------------------------------------------------

/** Replace up to `count` occurrences (count=-1 → all) of `oldStr` with `newStr`. */
export function applyReplacement(original: string, oldStr: string, newStr: string, count: number): { patched: string; replaced: number; occurrences: number } {
  const occurrences = original.split(oldStr).length - 1;
  if (count === -1) {
    return { patched: original.split(oldStr).join(newStr), replaced: occurrences, occurrences };
  }
  let patched = original;
  let replaced = 0;
  for (let i = 0; i < count && patched.includes(oldStr); i++) {
    patched = patched.replace(oldStr, newStr);
    replaced++;
  }
  return { patched, replaced, occurrences };
}

function patchSummary(replaced: number, occurrences: number): string {
  const remaining = occurrences - replaced;
  return remaining === 0
    ? `Replaced ${replaced}/${occurrences} occurrence(s)`
    : `Replaced ${replaced} of ${occurrences} occurrence(s) (${remaining} remaining — use count=-1 to replace all)`;
}

interface PatchData {
  entry: string; replaced: number; occurrences: number; dryRun: boolean;
  snippet: string; changedLine: number;
}

const iwdPatch = command({
  name: "iwd_patch",
  title: "Patch Archive Entry (Surgical Fix Only)",
  description:
    "WARNING: For editing multiple files or doing large overhauls, use iwd_extract + workspace tools + iwd_sync instead. " +
    "Perform a surgical string replacement inside a single text entry in an IWD archive. " +
    "Returns a ±3-line diff snippet around the change so you can verify the edit without re-reading the file. " +
    "Only replaces the first occurrence by default — use count=-1 to replace all. " +
    "Set dry_run=true to preview what would change without modifying the archive.",
  input: {
    path: z.string().describe("Absolute or relative path to the IWD file"),
    entry: z.string().describe("Path of the entry inside the IWD (forward or backslashes accepted)"),
    old: z.string().min(1).describe("Exact string to find and replace (must appear in the file, case-sensitive)"),
    new: z.string().describe("Replacement string"),
    count: z.number().int().min(-1).optional().default(1).describe("Number of occurrences to replace. 1 = first only (default), -1 = all occurrences"),
    dry_run: z.boolean().optional().default(false).describe("If true, returns the diff preview without modifying the archive"),
  },
  annotations: { readOnlyHint: false, destructiveHint: true },
  async run({ path: iwdPath, entry, old: oldStr, new: newStr, count, dry_run }): Promise<PatchData> {
    const { resolved, zip } = requireIwd(iwdPath);
    const normalized = requireSafeEntry(entry);

    const zipEntry = zip.getEntry(normalized);
    if (!zipEntry) {
      throw new CommandError(`Error: Entry not found in archive: ${normalized}\n` + `Tip: use iwd_list to check the exact entry path.`);
    }
    if (isBinaryEntry(normalized)) {
      throw new CommandError(`Error: Cannot patch binary entry: ${normalized}\n` + `Only text files (.gsc, .menu, .cfg, .csv, etc.) can be patched.`);
    }
    const original = zip.readAsText(zipEntry);
    if (!original.includes(oldStr)) {
      throw new CommandError(`Error: Search string not found in ${normalized}\n` + `The 'old' string must match exactly (case-sensitive, including whitespace and line endings).`);
    }
    if (count === 0) throw new CommandError("Error: count must be at least 1 or -1 for all occurrences.");

    const hintLine = original.slice(0, original.indexOf(oldStr)).split(/\r?\n/).length - 1;
    const { patched, replaced, occurrences } = applyReplacement(original, oldStr, newStr, count);
    const { snippet, changedLine } = buildDiffSnippet(original, patched, 3, hintLine);

    if (!dry_run) await saveIwd(zip, resolved, (z) => z.updateFile(normalized, Buffer.from(patched, "utf-8")));
    return { entry: normalized, replaced, occurrences, dryRun: dry_run, snippet, changedLine };
  },
  render(d) {
    const summary = patchSummary(d.replaced, d.occurrences);
    const diffBlock = `--- Context around change (line ${d.changedLine + 1}) ---\n${d.snippet}`;
    return d.dryRun
      ? `[dry_run] ${d.entry}: ${summary} (no changes written)\n\n${diffBlock}`
      : `Patched: ${d.entry}\n${summary}\n\n${diffBlock}`;
  },
});

// ---------------------------------------------------------------------------
// iwd_remove
// ---------------------------------------------------------------------------

interface RemoveData { archive: string; entry: string; size: number; crc: string; dryRun: boolean; }

const iwdRemove = command({
  name: "iwd_remove",
  title: "Remove Archive Entry",
  description:
    "Remove an entry from an IWD archive. Creates a .bak backup on first modification per session. " +
    "Set dry_run=true to validate without actually removing the entry.",
  input: {
    path: z.string().describe("Absolute or relative path to the IWD file"),
    entry: z.string().describe("Path of the entry to remove. Use iwd_list to find the exact path."),
    dry_run: z.boolean().optional().default(false).describe("If true, validates the operation without modifying the archive"),
  },
  annotations: { readOnlyHint: false, destructiveHint: true },
  async run({ path: iwdPath, entry, dry_run }): Promise<RemoveData> {
    const { resolved, zip } = requireIwd(iwdPath);
    const normalized = requireSafeEntry(entry);
    const existing = zip.getEntry(normalized);
    if (!existing) throw new CommandError(`Error: Entry not found: ${normalized}\n${entryNotFoundTip}`);

    const data: RemoveData = {
      archive: resolved, entry: normalized, dryRun: dry_run,
      size: existing.header.size, crc: existing.header.crc.toString(16).toUpperCase(),
    };
    if (!dry_run) await saveIwd(zip, resolved, (z) => z.deleteFile(normalized));
    return data;
  },
  render(d) {
    return d.dryRun
      ? `[dry_run] Would remove ${d.entry} from ${d.archive}\nEntry: ${d.size} bytes, CRC: ${d.crc}`
      : `Removed ${d.entry} from ${d.archive}\nEntry was: ${d.size} bytes, CRC: ${d.crc}`;
  },
});

export const WRITE_COMMANDS: AnyCommand[] = [iwdWrite, iwdPatch, iwdRemove];

/** Registers write IWD archive tools on the given MCP server instance. */
export function registerWriteTools(server: McpServer): void {
  registerCommands(server, WRITE_COMMANDS);
}
