/**
 * @file utils.ts
 * Shared utilities, types, and caches for the iw4x-toolkit MCP server.
 * No MCP SDK imports — importable by both tools modules and tests.
 */

import AdmZip from "adm-zip";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** File extensions treated as binary (not readable as UTF-8 text). */
export const BINARY_EXTENSIONS = new Set([
  ".iwi",
  ".d3dbsp",
  ".xmodel_export",
  ".xanim_export",
  ".mp3",
  ".wav",
  ".flac",
  ".bik",
  ".roq",
  ".dds",
  ".tga",
  ".jpg",
  ".jpeg",
  ".png",
  ".bmp",
  ".pcx",
  ".xmodel_bin",
  ".xanim_bin",
  ".col_map_sp",
  ".col_map_mp",
  ".gfx_map",
  ".fx",
]);

/** Default maximum matches returned by iwd_grep before truncating. */
export const GREP_MAX_MATCHES_DEFAULT = 50;

// ---------------------------------------------------------------------------
// Session-level backup tracker
// ---------------------------------------------------------------------------

/**
 * Tracks which IWD paths have already had a .bak created this session.
 * Prevents overwriting an existing backup with a later (already-modified) version.
 */
export const backedUp = new Set<string>();

// ---------------------------------------------------------------------------
// IWD cache
// ---------------------------------------------------------------------------

interface IwdCacheEntry {
  zip: AdmZip;
  mtime: number;
}

/** In-memory cache of parsed IWD zip files, keyed by resolved absolute path. */
const iwdCache = new Map<string, IwdCacheEntry>();

/** Maximum number of IWD zips to keep open in memory simultaneously. changed to 3 to lower RAM usage */
const IWD_CACHE_MAX = 3;

/**
 * Evict the cache entry for the given resolved IWD path.
 * Must be called by every write tool after `atomicWrite()` so that the next
 * read reflects the freshly written file rather than the stale in-memory zip.
 */
export function invalidateIwdCache(resolved: string): void {
  iwdCache.delete(resolved);
}

// ---------------------------------------------------------------------------
// Helper: extract a readable message from an unknown catch value
// ---------------------------------------------------------------------------

/**
 * Safely extract a string message from an unknown thrown value.
 * Avoids the unsafe `(e as Error).message` cast pattern.
 */
export function getErrMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// ---------------------------------------------------------------------------
// Pure utility functions
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the entry's file extension indicates binary content
 * that should not be decoded as UTF-8 text.
 */
export function isBinaryEntry(entryName: string): boolean {
  const ext = path.extname(entryName).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Resolves a potentially relative IWD path to an absolute path using
 * the current working directory. Absolute paths are returned unchanged.
 */
export function resolveIwdPath(iwdPath: string): string {
  return path.resolve(iwdPath);
}

/**
 * Creates a `.bak` copy of the given IWD the first time it is modified
 * this session. Subsequent calls for the same path are no-ops, and an
 * already-existing `.bak` is never overwritten (preserving the original).
 */
export async function ensureBackup(iwdPath: string): Promise<void> {
  if (backedUp.has(iwdPath)) return;
  const bakPath = iwdPath + ".bak";
  if (!fs.existsSync(bakPath)) {
    const { copyFile } = await import("node:fs/promises");
    await copyFile(iwdPath, bakPath);
  }
  backedUp.add(iwdPath);
}

/**
 * Writes a zip to disk atomically by writing to a `.tmp` file first,
 * then renaming it over the target. Prevents partial-write corruption.
 */
export async function atomicWrite(
  zip: AdmZip,
  targetPath: string,
): Promise<void> {
  const tmpPath = targetPath + ".tmp";
  zip.writeZip(tmpPath);
  const { rename } = await import("node:fs/promises");
  await rename(tmpPath, targetPath);
}

/**
 * Normalizes an IWD entry path:
 * - Converts backslashes to forward slashes (ZIP spec uses forward slashes)
 * - Strips any leading slashes
 */
export function normalizeEntry(entry: string): string {
  return entry.replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * Converts a glob pattern to a `RegExp`.
 *
 * Supported tokens:
 * - `**\/` — zero or more directory levels
 * - `**`   — matches anything (including slashes)
 * - `*`    — matches any characters within a single directory segment
 * - `?`    — matches a single non-slash character
 *
 * All other characters are treated as literals (regex-escaped).
 */
export function globToRegex(pattern: string): RegExp {
  const tokens = pattern.split(/((?:\*\*\/|\*\*|\*|\?))/);
  const regexStr = tokens
    .map((tok) => {
      if (tok === "**/") return "(.+/)?"; // zero or more directory levels
      if (tok === "**") return ".*"; // match anything
      if (tok === "*") return "[^/]+"; // match within one directory level
      if (tok === "?") return "[^/]"; // single non-slash char
      return tok.replace(/[.+^${}()|[\]\\]/g, "\\$&"); // escape literal
    })
    .join("");
  return new RegExp(`^${regexStr}$`, "i");
}

/**
 * Builds a ±`ctx`-line unified diff snippet around the first changed line
 * between `original` and `patched`.
 *
 * @param original  - The original text
 * @param patched   - The patched text
 * @param ctx       - Number of context lines either side of the change (default 3)
 * @param hintLine  - 0-indexed line to centre the snippet on (overrides auto-scan)
 * @returns `{ snippet, changedLine }` — the diff text and the 0-indexed anchor line
 */
export function buildDiffSnippet(
  original: string,
  patched: string,
  ctx = 3,
  hintLine?: number,
): { snippet: string; changedLine: number } {
  const originalLines = original.split(/\r?\n/);
  const patchedLines = patched.split(/\r?\n/);

  let changedLine = hintLine ?? 0;
  if (hintLine === undefined) {
    for (
      let i = 0;
      i < Math.max(originalLines.length, patchedLines.length);
      i++
    ) {
      if (originalLines[i] !== patchedLines[i]) {
        changedLine = i;
        break;
      }
    }
  }

  const start = Math.max(0, changedLine - ctx);
  const endOrig = Math.min(originalLines.length, changedLine + ctx + 1);
  const endPatched = Math.min(patchedLines.length, changedLine + ctx + 1);

  const before = originalLines.slice(start, endOrig);
  const after = patchedLines.slice(start, endPatched);

  const diffLines: string[] = [];
  const maxLen = Math.max(before.length, after.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < before.length && i < after.length) {
      if (before[i] !== after[i]) {
        diffLines.push(`- ${before[i]}`);
        diffLines.push(`+ ${after[i]}`);
      } else {
        diffLines.push(`  ${before[i]}`);
      }
    } else if (i < before.length) {
      diffLines.push(`- ${before[i]}`);
    } else {
      diffLines.push(`+ ${after[i]}`);
    }
  }

  return { snippet: diffLines.join("\n"), changedLine };
}

// ---------------------------------------------------------------------------
// IWD archive helpers
// ---------------------------------------------------------------------------

/**
 * Opens and validates an IWD (ZIP) file. Returns the cached `AdmZip` instance
 * when the file has not changed since the last open (mtime-keyed). On first
 * access — or when the file has been modified — reads from disk and updates
 * the cache. Evicts the oldest entry when the cache exceeds `IWD_CACHE_MAX`.
 *
 * @returns `{ zip }` on success, `{ error }` on failure (file missing / corrupt)
 */
export function openIwd(resolved: string): { zip: AdmZip } | { error: string } {
  if (!fs.existsSync(resolved)) {
    return {
      error:
        `IWD file not found: ${resolved}\n` +
        `Tip: verify the file path is correct and the file exists.`,
    };
  }

  let mtime: number;
  try {
    mtime = fs.statSync(resolved).mtimeMs;
  } catch (e) {
    return {
      error: `Failed to stat IWD file: ${resolved}\nReason: ${getErrMsg(e)}`,
    };
  }

  const cached = iwdCache.get(resolved);
  if (cached && cached.mtime === mtime) {
    return { zip: cached.zip };
  }

  // Cache miss or file changed — parse from disk
  try {
    const zip = new AdmZip(resolved);

    // Evict oldest when at capacity
    if (iwdCache.size >= IWD_CACHE_MAX) {
      const oldestKey = iwdCache.keys().next().value;
      if (oldestKey !== undefined) {
        iwdCache.delete(oldestKey);
      }
    }

    iwdCache.set(resolved, { zip, mtime });
    return { zip };
  } catch (e) {
    return {
      error:
        `Failed to open IWD archive: ${resolved}\n` +
        `Reason: ${getErrMsg(e)}\n` +
        `Tip: The file may be corrupt or not a valid ZIP/IWD archive.`,
    };
  }
}

// ---------------------------------------------------------------------------
// MCP result builders
// ---------------------------------------------------------------------------

/** Builds an MCP error result content object. */
export function errResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true as const };
}

/** Builds an MCP success result content object. */
export function okResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

/**
 * Standard "entry not found" error, shared across all tools that look up
 * an IWD entry by path. Points the user to `iwd_list` for discovery.
 */
export function entryNotFoundErr(normalized: string) {
  return errResult(
    `Error: Entry not found: ${normalized}\n` +
      `Tip: use iwd_list to verify the exact entry path (forward slashes, case-sensitive).`,
  );
}
