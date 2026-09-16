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

export const rateLimitMap = new Map<string, RateLimitEntry>();

/** Threshold at which expired rate limit entries are cleaned up. */
const RATE_LIMIT_CLEANUP_THRESHOLD = 1000;

/** Hard cap on rateLimitMap size. Oldest entry is evicted when this is reached. */
export const RATE_LIMIT_MAX_SIZE = 500;

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
    if (rateLimitMap.size >= RATE_LIMIT_MAX_SIZE) {
      const firstKey = rateLimitMap.keys().next().value;
      if (firstKey) rateLimitMap.delete(firstKey);
    }
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
  let baseDir: string | undefined;
  try {
    baseDir = import.meta.dirname || path.dirname(new URL(import.meta.url).pathname);
  } catch { /* baseDir remains undefined */ }

  const candidates = [
    ...(baseDir ? [
      // From dist/knowledge/ -> project root
      path.resolve(baseDir, "..", "knowledge", filename),
      // From dist/ -> mcp-server/ -> project root
      path.resolve(baseDir, "..", "..", "knowledge", filename),
      // From src/knowledge/ -> project root
      path.resolve(baseDir, "..", "..", "..", "knowledge", filename),
    ] : []),
    // Direct from project root (for when running from mcp-server folder)
    path.resolve("knowledge", filename),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  console.error(`[iw4x-toolkit] Could not locate knowledge file: ${filename} — searched: ${candidates.join(", ")}`);
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

/**
 * Tracks directories where atomicWrite has written .tmp files.
 * Used by cleanupOrphanedTempFiles to scan the correct locations.
 */
export const atomicWriteDirs = new Set<string>();

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
  atomicWriteDirs.add(path.dirname(targetPath));
  const tmpPath = targetPath + ".tmp";
  const { writeFile, rename, rm } = await import("node:fs/promises");
  try {
    // Not zip.writeZip(): it returns silently on failure, and the rename below
    // would then move whatever sits at tmpPath over the real archive.
    await writeFile(tmpPath, zip.toBuffer());
    await rename(tmpPath, targetPath);
  } catch (e) {
    // Callers edit the cached zip before writing; drop it so later reads see what's really on disk.
    invalidateIwdCache(targetPath);
    await rm(tmpPath, { force: true }).catch(() => {});
    throw e;
  }
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
/** Absolute path, Unix (`/foo`) or Windows (`C:\…`) style. */
function isAbsolutePath(entry: string): boolean {
  return entry.startsWith("/") || /^[A-Za-z]:/.test(entry);
}

/** Contains a `..` path-traversal segment (normalizing `\` to `/`). */
function hasPathTraversal(entry: string): boolean {
  const normalized = entry.replace(/\\/g, "/");
  if (normalized === "..") return true;
  return normalized.includes("../") || normalized.includes("/..");
}

export function isSafeEntryPath(entry: string): boolean {
  if (!entry) return false;                 // empty path
  if (entry.includes("\0")) return false;   // null byte (bypass attempt)
  if (isAbsolutePath(entry)) return false;
  return !hasPathTraversal(entry);
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
const DIFF_COL_WIDTH = 40;
const DIFF_BOX_TOP = "┌─────────────────────────────────────────────────────────────────────────────┐";
const DIFF_BOX_HEADER = "│ Original (A)                          │ Modified (B)                      │";
const DIFF_BOX_SEP = "├─────────────────────────────────────────────────────────────────────────────┤";
const DIFF_BOX_BOTTOM = "└─────────────────────────────────────────────────────────────────────────────┘";

/** Indices where the two line arrays differ. */
function findChangedIndices(a: string[], b: string[]): number[] {
  const changes: number[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) changes.push(i);
  }
  return changes;
}

/** Collapse changed indices into context regions, merging ones within 2*ctx. */
function groupIntoRegions(changes: number[], ctx: number): { start: number; end: number }[] {
  const regions: { start: number; end: number }[] = [];
  for (const idx of changes) {
    const prev = regions[regions.length - 1];
    if (prev && idx - prev.end <= ctx * 2) {
      prev.end = idx + ctx;
    } else {
      regions.push({ start: Math.max(0, idx - ctx), end: idx + ctx });
    }
  }
  return regions;
}

/** Marker + per-column prefixes for one diff row. */
function diffRowMarkers(origLine: string, patchLine: string, idx: number, origLen: number, patchLen: number) {
  if (origLine === patchLine) return { marker: " │", origPrefix: "  ", patchPrefix: "  " };
  if (idx >= origLen) return { marker: " +│", origPrefix: "  ", patchPrefix: "+ " };  // addition
  if (idx >= patchLen) return { marker: " -│", origPrefix: "- ", patchPrefix: "  " };  // deletion
  return { marker: " ~│", origPrefix: "~ ", patchPrefix: "~ " };                        // modification
}

function truncateForColumn(line: string): string {
  return line.length > DIFF_COL_WIDTH ? line.substring(0, DIFF_COL_WIDTH - 3) + "..." : line;
}

function renderDiffRow(idx: number, originalLines: string[], patchedLines: string[]): string {
  const origLine = idx < originalLines.length ? originalLines[idx] : "";
  const patchLine = idx < patchedLines.length ? patchedLines[idx] : "";
  const { marker, origPrefix, patchPrefix } = diffRowMarkers(origLine, patchLine, idx, originalLines.length, patchedLines.length);
  const lineNum = String(idx + 1).padStart(4, " ");
  const displayOrig = truncateForColumn(origLine).padEnd(DIFF_COL_WIDTH);
  return `${lineNum}${origPrefix}${displayOrig}${marker}${patchPrefix}${truncateForColumn(patchLine)}`;
}

function renderDiffRegion(region: { start: number; end: number }, originalLines: string[], patchedLines: string[]): string[] {
  const maxLines = Math.max(
    region.end - region.start,
    originalLines.slice(region.start, region.end).length,
    patchedLines.slice(region.start, region.end).length,
  );
  const rows = [DIFF_BOX_TOP, DIFF_BOX_HEADER, DIFF_BOX_SEP];
  for (let i = 0; i < maxLines; i++) {
    rows.push(renderDiffRow(region.start + i, originalLines, patchedLines));
  }
  rows.push(DIFF_BOX_BOTTOM);
  return rows;
}

export function buildSideBySideDiff(
  original: string,
  patched: string,
  ctx = 3
): string {
  const originalLines = original.split(/\r?\n/);
  const patchedLines = patched.split(/\r?\n/);

  const changes = findChangedIndices(originalLines, patchedLines);
  if (changes.length === 0) return "Files are identical (no changes)";

  const regions = groupIntoRegions(changes, ctx);
  const lines: string[] = [];
  regions.forEach((region, i) => {
    if (i > 0) lines.push("\n... (more changes) ...\n");
    lines.push(...renderDiffRegion(region, originalLines, patchedLines));
  });
  return lines.join("\n");
}
/** Index of the first differing line, or 0 if the arrays match. */
function firstChangedLine(a: string[], b: string[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return i;
  }
  return 0;
}

/** Unified `+`/`-`/` ` lines for one before/after row. */
function unifiedDiffRow(before: string, after: string, hasBefore: boolean, hasAfter: boolean): string[] {
  if (hasBefore && hasAfter) {
    return before !== after ? [`- ${before}`, `+ ${after}`] : [`  ${before}`];
  }
  return hasBefore ? [`- ${before}`] : [`+ ${after}`];
}

function renderUnifiedDiff(before: string[], after: string[]): string[] {
  const out: string[] = [];
  const maxLen = Math.max(before.length, after.length);
  for (let i = 0; i < maxLen; i++) {
    out.push(...unifiedDiffRow(before[i], after[i], i < before.length, i < after.length));
  }
  return out;
}

export function buildDiffSnippet(
  original: string,
  patched: string,
  ctx = 3,
  hintLine?: number,
): { snippet: string; changedLine: number } {
  const originalLines = original.split(/\r?\n/);
  const patchedLines = patched.split(/\r?\n/);

  const changedLine = hintLine ?? firstChangedLine(originalLines, patchedLines);
  const start = Math.max(0, changedLine - ctx);
  const before = originalLines.slice(start, Math.min(originalLines.length, changedLine + ctx + 1));
  const after = patchedLines.slice(start, Math.min(patchedLines.length, changedLine + ctx + 1));

  return { snippet: renderUnifiedDiff(before, after).join("\n"), changedLine };
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
 * @returns `Result<AdmZip>`
 */
/** Return a cached zip if present and unchanged (refreshing its LRU access time). */
function getCachedZip(resolved: string, mtime: number): AdmZip | null {
  const cached = iwdCache.get(resolved);
  if (cached && cached.mtime === mtime) {
    cached.lastAccess = Date.now(); // refresh for LRU
    return cached.zip;
  }
  return null;
}

/** Evict the least-recently-used cache entry when at capacity. */
function evictLruIfFull(): void {
  if (iwdCache.size < IWD_CACHE_MAX) return;
  let lruKey: string | undefined;
  let lruTime = Infinity;
  for (const [key, entry] of iwdCache.entries()) {
    if (entry.lastAccess < lruTime) {
      lruTime = entry.lastAccess;
      lruKey = key;
    }
  }
  if (lruKey !== undefined) iwdCache.delete(lruKey);
}

/** Parse an IWD from disk, store it in the cache (evicting LRU first), and return it. */
function parseAndCacheZip(resolved: string, mtime: number): Result<AdmZip> {
  try {
    const zip = new AdmZip(resolved);
    evictLruIfFull();
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

  const cached = getCachedZip(resolved, mtime);
  return cached ? ok(cached) : parseAndCacheZip(resolved, mtime);
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

function entryNotFoundMessage(normalized: string): string {
  return `Error: Entry not found: ${normalized}\n` +
    `Tip: use iwd_list to verify the exact entry path (forward slashes, case-sensitive).`;
}

// ---------------------------------------------------------------------------
// Command helpers (throwing variants for Command.run)
// ---------------------------------------------------------------------------

/** Expected failure inside a command: the message is shown to the caller as-is. */
export class CommandError extends Error {}

/** Resolve and open an IWD, throwing `CommandError` when it can't be opened. */
export function requireIwd(iwdPath: string): { resolved: string; zip: AdmZip } {
  const resolved = resolveIwdPath(iwdPath);
  const opened = openIwd(resolved);
  if (!opened.ok) throw new CommandError(opened.error);
  return { resolved, zip: opened.value };
}

/** Normalize an entry path and look it up, throwing `CommandError` when empty or missing. */
export function requireEntry(zip: AdmZip, entry: string): { normalized: string; zipEntry: IZipEntry } {
  const normalized = normalizeEntry(entry);
  if (!normalized) throw new CommandError("Error: entry path cannot be empty.");
  const zipEntry = zip.getEntry(normalized);
  if (!zipEntry) throw new CommandError(entryNotFoundMessage(normalized));
  return { normalized, zipEntry };
}

type IZipEntry = NonNullable<ReturnType<AdmZip["getEntry"]>>;

/** Validate an entry path for writing: non-empty and no traversal. */
export function requireSafeEntry(entry: string, label = "entry"): string {
  const normalized = normalizeEntry(entry);
  if (!normalized) throw new CommandError(`Error: ${label} path cannot be empty.`);
  if (!isSafeEntryPath(normalized)) {
    throw new CommandError(`Error: ${label} path is invalid or contains path traversal sequences (not allowed).`);
  }
  return normalized;
}

/** The one safe way to modify an IWD: backup, edit the (cached) zip, write atomically, drop the cache. */
export async function saveIwd(zip: AdmZip, resolved: string, edit: (zip: AdmZip) => void): Promise<void> {
  await ensureBackup(resolved);
  edit(zip);
  await atomicWrite(zip, resolved);
  invalidateIwdCache(resolved);
}
