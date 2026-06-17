/**
 * @file iwd/write-tools.ts
 * Write IWD archive tools: iwd_write, iwd_patch, iwd_remove
 */

import { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type AdmZip from "adm-zip";
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

type ToolResult = ReturnType<typeof okResult>;
type ZipEntry = ReturnType<AdmZip["getEntries"]>[number];

/** Resolve + open the IWD and validate the entry path, shared by every write tool. */
function resolveWriteTarget(
  iwdPath: string, entry: string,
): { zip: AdmZip; resolved: string; normalized: string } | { error: ToolResult } {
  const resolved = resolveIwdPath(iwdPath);
  const opened = openIwd(resolved);
  if (!opened.ok) return { error: errResult(opened.error) };

  const normalized = normalizeEntry(entry);
  if (!normalized) return { error: errResult("Error: entry path cannot be empty.") };
  if (!isSafeEntryPath(normalized)) {
    return { error: errResult("Error: entry path is invalid or contains path traversal sequences (not allowed).") };
  }
  return { zip: opened.value, resolved, normalized };
}

// ---------------------------------------------------------------------------
// iwd_write
// ---------------------------------------------------------------------------

/** Diff block shown when replacing an existing text entry (empty for binary / no change). */
function writeDiffSection(zip: AdmZip, existing: ZipEntry, normalized: string, content: string): string {
  if (isBinaryEntry(normalized)) return "";
  const { snippet, changedLine } = buildDiffSnippet(zip.readAsText(existing), content);
  return snippet ? `\n\n--- Diff (first change at line ${changedLine + 1}) ---\n${snippet}` : "";
}

interface WriteArgs { path: string; entry: string; content: string; dry_run: boolean; }

async function handleIwdWrite({ path: iwdPath, entry, content, dry_run }: WriteArgs): Promise<ToolResult> {
  const target = resolveWriteTarget(iwdPath, entry);
  if ("error" in target) return target.error;
  const { zip, resolved, normalized } = target;

  const existing = zip.getEntry(normalized);
  const lineCount = content.split("\n").length;
  const action = existing ? "Updated" : "Added";

  if (dry_run) {
    return okResult(
      `[dry_run] Would ${action.toLowerCase()} ${normalized} in ${resolved}\n` +
      `Content: ${lineCount} lines, ${content.length} chars`,
    );
  }

  const diffSection = existing ? writeDiffSection(zip, existing, normalized, content) : "";
  await ensureBackup(resolved);
  const buf = Buffer.from(content, "utf-8");
  if (existing) zip.updateFile(normalized, buf);
  else zip.addFile(normalized, buf);
  await atomicWrite(zip, resolved);
  invalidateIwdCache(resolved);

  return okResult(`${action} ${normalized} in ${resolved} (${lineCount} lines, ${content.length} chars)${diffSection}`);
}

// ---------------------------------------------------------------------------
// iwd_patch
// ---------------------------------------------------------------------------

/** Replace up to `count` occurrences (count=-1 → all) of `oldStr` with `newStr`. */
function applyReplacement(original: string, oldStr: string, newStr: string, count: number): { patched: string; replaced: number; occurrences: number } {
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

/** Validate the target entry is a patchable text file holding `oldStr`; returns its text or an error. */
function loadPatchTarget(zip: AdmZip, normalized: string, oldStr: string): { text: string } | { error: ToolResult } {
  const zipEntry = zip.getEntry(normalized);
  if (!zipEntry) {
    return { error: errResult(`Error: Entry not found in archive: ${normalized}\n` + `Tip: use iwd_list to check the exact entry path.`) };
  }
  if (isBinaryEntry(normalized)) {
    return { error: errResult(`Error: Cannot patch binary entry: ${normalized}\n` + `Only text files (.gsc, .menu, .cfg, .csv, etc.) can be patched.`) };
  }
  const text = zip.readAsText(zipEntry);
  if (!text.includes(oldStr)) {
    return { error: errResult(`Error: Search string not found in ${normalized}\n` + `The 'old' string must match exactly (case-sensitive, including whitespace and line endings).`) };
  }
  return { text };
}

interface PatchArgs { path: string; entry: string; old: string; new: string; count: number; dry_run: boolean; }

async function handleIwdPatch({ path: iwdPath, entry, old: oldStr, new: newStr, count, dry_run }: PatchArgs): Promise<ToolResult> {
  const target = resolveWriteTarget(iwdPath, entry);
  if ("error" in target) return target.error;
  const { zip, resolved, normalized } = target;

  const loaded = loadPatchTarget(zip, normalized, oldStr);
  if ("error" in loaded) return loaded.error;
  if (count === 0) return errResult("Error: count must be at least 1 or -1 for all occurrences.");

  const original = loaded.text;
  const hintLine = original.slice(0, original.indexOf(oldStr)).split(/\r?\n/).length - 1;
  const { patched, replaced, occurrences } = applyReplacement(original, oldStr, newStr, count);
  const { snippet, changedLine } = buildDiffSnippet(original, patched, 3, hintLine);
  const summary = patchSummary(replaced, occurrences);
  const diffBlock = `--- Context around change (line ${changedLine + 1}) ---\n${snippet}`;

  if (dry_run) {
    return okResult(`[dry_run] ${normalized}: ${summary} (no changes written)\n\n${diffBlock}`);
  }
  await ensureBackup(resolved);
  zip.updateFile(normalized, Buffer.from(patched, "utf-8"));
  await atomicWrite(zip, resolved);
  invalidateIwdCache(resolved);

  return okResult(`Patched: ${normalized}\n${summary}\n\n${diffBlock}`);
}

// ---------------------------------------------------------------------------
// iwd_remove
// ---------------------------------------------------------------------------

interface RemoveArgs { path: string; entry: string; dry_run: boolean; }

async function handleIwdRemove({ path: iwdPath, entry, dry_run }: RemoveArgs): Promise<ToolResult> {
  const target = resolveWriteTarget(iwdPath, entry);
  if ("error" in target) return target.error;
  const { zip, resolved, normalized } = target;

  const existing = zip.getEntry(normalized);
  if (!existing) return entryNotFoundErr(normalized);

  const size = existing.header.size;
  const crc = existing.header.crc.toString(16).toUpperCase();

  if (dry_run) {
    return okResult(`[dry_run] Would remove ${normalized} from ${resolved}\nEntry: ${size} bytes, CRC: ${crc}`);
  }
  await ensureBackup(resolved);
  zip.deleteFile(normalized);
  await atomicWrite(zip, resolved);
  invalidateIwdCache(resolved);

  return okResult(`Removed ${normalized} from ${resolved}\nEntry was: ${size} bytes, CRC: ${crc}`);
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
function writeTool<A extends z.ZodRawShape>(
  name: string, config: ToolConfig<A>, handler: ToolCallback<A>,
): (server: McpServer) => void {
  return (server) => { server.registerTool(name, config, handler); };
}

const WRITE_TOOLS: ((server: McpServer) => void)[] = [
  writeTool("iwd_write", {
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
      entry: z.string().describe("Entry path inside the IWD. New entries are created automatically."),
      content: z.string().describe("Full UTF-8 text content to write"),
      dry_run: z.boolean().optional().default(false).describe("If true, validates the write without actually modifying the archive (safe to use first)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, handleIwdWrite),

  writeTool("iwd_patch", {
    title: "Patch Archive Entry (Surgical Fix Only)",
    description:
      "WARNING: For editing multiple files or doing large overhauls, use iwd_extract + workspace tools + iwd_sync instead. " +
      "Perform a surgical string replacement inside a single text entry in an IWD archive. " +
      "Returns a ±3-line diff snippet around the change so you can verify the edit without re-reading the file. " +
      "Only replaces the first occurrence by default — use count=-1 to replace all. " +
      "Set dry_run=true to preview what would change without modifying the archive.",
    inputSchema: {
      path: z.string().describe("Absolute or relative path to the IWD file"),
      entry: z.string().describe("Path of the entry inside the IWD (forward or backslashes accepted)"),
      old: z.string().min(1).describe("Exact string to find and replace (must appear in the file, case-sensitive)"),
      new: z.string().describe("Replacement string"),
      count: z.number().int().min(-1).optional().default(1).describe("Number of occurrences to replace. 1 = first only (default), -1 = all occurrences"),
      dry_run: z.boolean().optional().default(false).describe("If true, returns the diff preview without modifying the archive"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, handleIwdPatch),

  writeTool("iwd_remove", {
    title: "Remove Archive Entry",
    description:
      "Remove an entry from an IWD archive. Creates a .bak backup on first modification per session. " +
      "Set dry_run=true to validate without actually removing the entry.",
    inputSchema: {
      path: z.string().describe("Absolute or relative path to the IWD file"),
      entry: z.string().describe("Path of the entry to remove. Use iwd_list to find the exact path."),
      dry_run: z.boolean().optional().default(false).describe("If true, validates the operation without modifying the archive"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, handleIwdRemove),
];

/**
 * Registers write IWD archive tools on the given MCP server instance.
 */
export function registerWriteTools(server: McpServer): void {
  for (const register of WRITE_TOOLS) register(server);
}
