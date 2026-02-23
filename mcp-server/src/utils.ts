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

/** Chars per line threshold to detect minified files */
export const MINIFIED_FILE_CHARS_PER_LINE = 200;

/** Maximum line length before style warning */
export const MAX_LINE_LENGTH_WARNING = 200;

// ---------------------------------------------------------------------------
// Regex cache for grep operations
// ---------------------------------------------------------------------------

/** Simple LRU cache for compiled regex patterns. */
const regexCache = new Map<string, RegExp>();
const REGEX_CACHE_MAX = 50;

/**
 * Gets or creates a cached RegExp from a pattern and flags.
 * Caching avoids re-compiling the same regex on every grep call.
 */
export function getCachedRegex(pattern: string, flags: string): RegExp {
  const key = `${pattern}:${flags}`;
  let re = regexCache.get(key);
  if (!re) {
    // Evict oldest if at capacity
    if (regexCache.size >= REGEX_CACHE_MAX) {
      const firstKey = regexCache.keys().next().value;
      if (firstKey) regexCache.delete(firstKey);
    }
    re = new RegExp(pattern, flags);
    regexCache.set(key, re);
  }
  return re;
}

// ---------------------------------------------------------------------------
// Rate limiting for expensive operations
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

/** Threshold at which expired rate limit entries are cleaned up. */
const RATE_LIMIT_CLEANUP_THRESHOLD = 1000;

/**
 * Removes expired entries from the rate limit map.
 * Called automatically when the map exceeds the cleanup threshold.
 */
function cleanupExpiredRateLimits(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}

/**
 * Rate limit configuration per operation type.
 */
export const RATE_LIMITS = {
  iwd_grep: { maxRequests: 100, windowMs: 60000 },    // 100 per minute
  iwd_pack: { maxRequests: 20, windowMs: 60000 },     // 20 per minute
  iwd_sync: { maxRequests: 30, windowMs: 60000 },     // 30 per minute
  default: { maxRequests: 200, windowMs: 60000 },     // 200 per minute default
} as const;

/**
 * Checks if an operation is rate limited.
 * Returns true if the operation should be allowed, false if rate limited.
 */
export function checkRateLimit(
  operation: string,
  clientId: string = "default"
): { allowed: boolean; remaining: number; resetIn: number } {
  const limit = RATE_LIMITS[operation as keyof typeof RATE_LIMITS] ?? RATE_LIMITS.default;
  const key = `${operation}:${clientId}`;
  const now = Date.now();
  
  // Periodic cleanup of expired entries to prevent memory leaks
  if (rateLimitMap.size > RATE_LIMIT_CLEANUP_THRESHOLD) {
    cleanupExpiredRateLimits();
  }
  
  let entry = rateLimitMap.get(key);
  
  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + limit.windowMs };
    rateLimitMap.set(key, entry);
  }
  
  if (entry.count >= limit.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: Math.ceil((entry.resetTime - now) / 1000),
    };
  }
  
  entry.count++;
  
  return {
    allowed: true,
    remaining: limit.maxRequests - entry.count,
    resetIn: Math.ceil((entry.resetTime - now) / 1000),
  };
}

// ---------------------------------------------------------------------------
// Path resolution utilities
// ---------------------------------------------------------------------------

/**
 * Resolves the path to a knowledge file, trying multiple candidate locations.
 * Candidates cover:
 *  - src/knowledge/ (vitest runs source files directly): ../../.. = iw4x-toolkit root
 *  - dist/          (esbuild bundle, flat output):       ../..    = mcp-server dir
 *  - src/           (alternate source layout):           ../..    = mcp-server dir
 * 
 * @param filename - The name of the knowledge file to resolve (e.g., "dvars.json")
 * @returns The resolved absolute path, or null if not found
 */
export function getKnowledgeDir(filename: string): string | null {
  let baseDir: string;
  try {
    // Use import.meta.dirname for ESM (Node.js 20+)
    baseDir = import.meta.dirname;
    if (!baseDir) {
      // Fallback to using import.meta.url
      baseDir = path.dirname(new URL(import.meta.url).pathname);
    }
  } catch {
    // Fallback for bundled code
    baseDir = path.dirname(process.execPath);
  }

  const candidates = [
    // From dist/knowledge/ -> project root
    path.resolve(baseDir, "..", "knowledge", filename),
    // From dist/ -> mcp-server/ -> project root
    path.resolve(baseDir, "..", "..", "knowledge", filename),
    // From src/knowledge/ -> project root
    path.resolve(baseDir, "..", "..", "..", "knowledge", filename),
    // Direct from project root (for when running from mcp-server folder)
    path.resolve("knowledge", filename),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

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
  lastAccess: number;
}

/** In-memory cache of parsed IWD zip files, keyed by resolved absolute path. */
const iwdCache = new Map<string, IwdCacheEntry>();

/** Maximum number of IWD zips to keep open in memory simultaneously. */
const IWD_CACHE_MAX = 10;

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
 * Creates a timestamped `.bak` copy of the given IWD before modification.
 * Each modification gets a unique backup with timestamp: file.iwd.20260223_143045.bak
 * This preserves multiple backup versions instead of overwriting a single .bak file.
 */
export async function ensureBackup(iwdPath: string): Promise<void> {
  if (backedUp.has(iwdPath)) return;
  
  // Generate timestamp in format: YYYYMMDD_HHMMSS
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0')
  ].join('');
  
  const bakPath = `${iwdPath}.${timestamp}.bak`;
  
  // Always create a new timestamped backup (never overwrite)
  const { copyFile } = await import("node:fs/promises");
  await copyFile(iwdPath, bakPath);
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
 * Validates that an entry path is safe and doesn't escape its intended directory.
 * Blocks path traversal attempts like:
 * - `../` sequences
 * - Absolute paths (leading `/` or `C:\`)
 * - Null bytes
 * 
 * @param entry - The entry path to validate (should be normalized first)
 * @returns `true` if safe, `false` if potentially malicious
 */
export function isSafeEntryPath(entry: string): boolean {
  // Block empty paths
  if (!entry || entry.length === 0) return false;
  
  // Block null bytes (could be used to bypass checks)
  if (entry.includes("\0")) return false;
  
  // Block absolute paths (Unix or Windows style)
  if (entry.startsWith("/") || /^[A-Za-z]:/.test(entry)) return false;
  
  // Block path traversal sequences (both normalized and unnormalized)
  // Check for ../ and ..\ and any URL-encoded variants
  const normalized = entry.replace(/\\/g, "/");
  if (normalized.includes("../") || normalized.includes("/..") || normalized === "..") return false;
  
  return true;
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
 * Builds a side-by-side diff view with original and modified text displayed in two columns.
 * Each line shows line numbers and the content, with markers for additions/deletions/changes.
 *
 * @param original  - The original text
 * @param patched   - The patched text
 * @param ctx       - Number of context lines around changes (default 3)
 * @returns Formatted side-by-side diff string
 */
export function buildSideBySideDiff(
  original: string,
  patched: string,
  ctx = 3
): string {
  const originalLines = original.split(/\r?\n/);
  const patchedLines = patched.split(/\r?\n/);
  
  // Find all changed lines
  const changes: { origIdx: number; patchIdx: number }[] = [];
  for (let i = 0; i < Math.max(originalLines.length, patchedLines.length); i++) {
    if (originalLines[i] !== patchedLines[i]) {
      changes.push({ origIdx: i, patchIdx: i });
    }
  }
  
  // If no changes, return simple message
  if (changes.length === 0) {
    return "Files are identical (no changes)";
  }
  
  // Group changes into regions
  const regions: { start: number; end: number }[] = [];
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const prevChange = regions.length > 0 ? regions[regions.length - 1] : null;
    
    if (prevChange && change.origIdx - prevChange.end <= ctx * 2) {
      // Extend existing region
      prevChange.end = change.origIdx + ctx;
    } else {
      // Start new region
      regions.push({
        start: Math.max(0, change.origIdx - ctx),
        end: change.origIdx + ctx
      });
    }
  }
  
  const lines: string[] = [];
  
  for (const region of regions) {
    if (regions.indexOf(region) > 0) {
      lines.push("\n... (more changes) ...\n");
    }
    
    const maxLines = Math.max(
      region.end - region.start,
      originalLines.slice(region.start, region.end).length,
      patchedLines.slice(region.start, region.end).length
    );
    
    // Header
    lines.push("┌─────────────────────────────────────────────────────────────────────────────┐");
    lines.push("│ Original (A)                          │ Modified (B)                      │");
    lines.push("├─────────────────────────────────────────────────────────────────────────────┤");
    
    for (let i = 0; i < maxLines; i++) {
      const origLineIdx = region.start + i;
      const patchLineIdx = region.start + i;
      
      const origLine = origLineIdx < originalLines.length ? originalLines[origLineIdx] : "";
      const patchLine = patchLineIdx < patchedLines.length ? patchedLines[patchLineIdx] : "";
      
      // Determine line type
      let marker = " │";
      let origPrefix = "  ";
      let patchPrefix = "  ";
      
      if (origLine !== patchLine) {
        if (origLineIdx >= originalLines.length) {
          // Addition
          marker = " +│";
          patchPrefix = "+ ";
        } else if (patchLineIdx >= patchedLines.length) {
          // Deletion
          marker = " -│";
          origPrefix = "- ";
        } else {
          // Modification
          marker = " ~│";
          origPrefix = "~ ";
          patchPrefix = "~ ";
        }
      }
      
      // Pad line numbers
      const origLineNum = String(origLineIdx + 1).padStart(4, ' ');
      const patchLineNum = String(patchLineIdx + 1).padStart(4, ' ');
      
      // Truncate long lines for display
      const maxColWidth = 40;
      const displayOrig = origLine.length > maxColWidth ? origLine.substring(0, maxColWidth - 3) + "..." : origLine;
      const displayPatch = patchLine.length > maxColWidth ? patchLine.substring(0, maxColWidth - 3) + "..." : patchLine;
      
      lines.push(`${origLineNum}${origPrefix}${displayOrig.padEnd(maxColWidth)}${marker}${patchPrefix}${displayPatch}`);
    }
    
    lines.push("└─────────────────────────────────────────────────────────────────────────────┘");
  }
  
  return lines.join("\n");
}
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
 * the cache. Evicts the least recently used entry when the cache exceeds `IWD_CACHE_MAX`.
 *
 * @returns `Result<AdmZip>` - use `unwrapResult()` for early returns in tool handlers
 */
export function openIwd(resolved: string): Result<AdmZip> {
  if (!fs.existsSync(resolved)) {
    return err(
      `IWD file not found: ${resolved}\n` +
      `Tip: verify the file path is correct and the file exists.`
    );
  }

  let mtime: number;
  try {
    mtime = fs.statSync(resolved).mtimeMs;
  } catch (e) {
    return err(`Failed to stat IWD file: ${resolved}\nReason: ${getErrMsg(e)}`);
  }

  const cached = iwdCache.get(resolved);
  if (cached && cached.mtime === mtime) {
    // Update access time for LRU - this is what makes it "least recently used"
    cached.lastAccess = Date.now();
    return ok(cached.zip);
  }

  // Cache miss or file changed — parse from disk
  try {
    const zip = new AdmZip(resolved);

    // Evict least recently used when at capacity
    if (iwdCache.size >= IWD_CACHE_MAX) {
      let lruKey: string | undefined;
      let lruTime = Infinity;
      
      // Find the least recently used entry by lastAccess time
      for (const [key, entry] of iwdCache.entries()) {
        if (entry.lastAccess < lruTime) {
          lruTime = entry.lastAccess;
          lruKey = key;
        }
      }
      
      if (lruKey !== undefined) {
        iwdCache.delete(lruKey);
      }
    }

    iwdCache.set(resolved, { zip, mtime, lastAccess: Date.now() });
    return ok(zip);
  } catch (e) {
    return err(
      `Failed to open IWD archive: ${resolved}\n` +
      `Reason: ${getErrMsg(e)}\n` +
      `Tip: The file may be corrupt or not a valid ZIP/IWD archive.`
    );
  }
}

/**
 * Async version of openIwd for use in tools that benefit from non-blocking file I/O.
 * Opens and validates an IWD (ZIP) file. Returns the cached `AdmZip` instance
 * when the file has not changed since the last open (mtime-keyed). On first
 * access — or when the file has been modified — reads from disk and updates
 * the cache. Evicts the least recently used entry when the cache exceeds `IWD_CACHE_MAX`.
 *
 * @returns `Result<AdmZip>` - use `unwrapResult()` for early returns in tool handlers
 */
export async function openIwdAsync(resolved: string): Promise<Result<AdmZip>> {
  const fsPromises = await import("node:fs/promises");
  
  try {
    await fsPromises.access(resolved);
  } catch {
    return err(
      `IWD file not found: ${resolved}\n` +
      `Tip: verify the file path is correct and the file exists.`
    );
  }

  let mtime: number;
  try {
    const stats = await fsPromises.stat(resolved);
    mtime = stats.mtimeMs;
  } catch (e) {
    return err(`Failed to stat IWD file: ${resolved}\nReason: ${getErrMsg(e)}`);
  }

  const cached = iwdCache.get(resolved);
  if (cached && cached.mtime === mtime) {
    cached.lastAccess = Date.now();
    return ok(cached.zip);
  }

  try {
    const zip = new AdmZip(resolved);
    
    // LRU eviction
    if (iwdCache.size >= IWD_CACHE_MAX) {
      let lruKey: string | undefined;
      let lruTime = Infinity;
      for (const [key, entry] of iwdCache.entries()) {
        if (entry.lastAccess < lruTime) {
          lruTime = entry.lastAccess;
          lruKey = key;
        }
      }
      if (lruKey) iwdCache.delete(lruKey);
    }

    iwdCache.set(resolved, { zip, mtime, lastAccess: Date.now() });
    return ok(zip);
  } catch (e) {
    return err(
      `Failed to open IWD archive: ${resolved}\n` +
      `Reason: ${getErrMsg(e)}\n` +
      `Tip: The file may be corrupt or not a valid ZIP/IWD archive.`
    );
  }
}

// ---------------------------------------------------------------------------
// Result type for internal operations
// ---------------------------------------------------------------------------

/**
 * Standard Result type for operations that can fail.
 * Use this instead of returning { error: string } or throwing exceptions.
 */
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Helper to create a successful result.
 */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/**
 * Helper to create an error result.
 */
export function err<E = string>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// MCP result builders
// ---------------------------------------------------------------------------

/** MCP text content item */
type McpTextContent = { type: "text"; text: string };

/** MCP tool result shape */
type McpResult = { content: McpTextContent[]; isError?: true };

/** Builds an MCP error result content object. */
export function errResult(text: string): McpResult {
  return { content: [{ type: "text" as const, text }], isError: true as const };
}

/** Builds an MCP success result content object. */
export function okResult(text: string): McpResult {
  return { content: [{ type: "text" as const, text }] };
}

/**
 * Unwraps a Result, returning the value or converting the error to an McpResult.
 * Useful for early returns in tool handlers.
 */
export function unwrapResult<T>(result: Result<T>): T | McpResult {
  if (result.ok) return result.value;
  return errResult(result.error);
}

/**
 * Standard "entry not found" error, shared across all tools that look up
 * an IWD entry by path. Points the user to `iwd_list` for discovery.
 */
export function entryNotFoundErr(normalized: string): McpResult {
  return errResult(
    `Error: Entry not found: ${normalized}\n` +
      `Tip: use iwd_list to verify the exact entry path (forward slashes, case-sensitive).`,
  );
}
