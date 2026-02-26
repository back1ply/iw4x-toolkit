/**
 * @file gsc/symbols.ts
 * In-memory GSC symbol registry.
 *
 * Populated by iwd_index_symbols, queried by gsc_find_orphans.
 * Survives for the duration of the MCP server process (session cache).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import AdmZip from "adm-zip";
import { outline } from "./outline.js";
import { openIwd, isSafeEntryPath } from "../utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SymbolEntry {
  /** Function name as written in source */
  name: string;
  /** Entry path inside the archive, e.g. "maps/utility.gsc" */
  file: string;
  /** Absolute path to the IWD archive this symbol came from */
  archive: string;
}

export interface IndexStats {
  symbols: number;
  files: number;
  archives: number;
  indexedAt: Date | null;
}

export interface ArchiveStat {
  archive: string;
  symbols: number;
  files: number;
}

export interface BuildIndexResult {
  stats: IndexStats;
  perArchive: ArchiveStat[];
  replaced: number;
}

// ---------------------------------------------------------------------------
// Registry state (module-level, session cache)
// ---------------------------------------------------------------------------

/** Map from lowercase function name → all locations where it is defined */
const symbolCache = new Map<string, SymbolEntry[]>();
/** Set of "archive::file" keys — for O(1) stats */
const fileSet = new Set<string>();
/** Set of archive paths — for O(1) stats */
const archiveSet = new Set<string>();
/** Map from normalized file path suffix → Set of lowercase function names */
const fileToSymbols = new Map<string, Set<string>>();
let indexedAt: Date | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Clear the symbol index entirely.
 */
export function clearIndex(): void {
  symbolCache.clear();
  fileSet.clear();
  archiveSet.clear();
  fileToSymbols.clear();
  indexedAt = null;
}

/**
 * Returns true if the given function name exists in the index (case-insensitive).
 */
export function hasSymbol(name: string): boolean {
  return symbolCache.has(name.toLowerCase());
}

/**
 * Returns all SymbolEntry records for a function name (case-insensitive).
 * Returns empty array if not found.
 */
export function lookupSymbol(name: string): SymbolEntry[] {
  return symbolCache.get(name.toLowerCase()) ?? [];
}

/**
 * Returns the set of function names defined in a specific file path
 * (matched by file suffix, case-insensitive). Used by the include resolver.
 */
export function symbolsForFile(fileSuffix: string): Set<string> {
  const normalized = fileSuffix.toLowerCase().replace(/\\/g, "/");
  // Direct lookup first
  const direct = fileToSymbols.get(normalized);
  if (direct) return new Set(direct);
  // Suffix scan fallback for partial paths (e.g. "utility.gsc" matching "maps/utility.gsc")
  const result = new Set<string>();
  for (const [filePath, syms] of fileToSymbols) {
    if (filePath.endsWith(normalized)) {
      for (const s of syms) result.add(s);
    }
  }
  return result;
}

/**
 * Current index statistics.
 */
export function getStats(): IndexStats {
  return {
    symbols: symbolCache.size,
    files: fileSet.size,
    archives: archiveSet.size,
    indexedAt,
  };
}

/**
 * Scan one or more IWD archives and add all GSC function definitions
 * to the symbol registry.
 *
 * @param iwdPaths  Absolute paths to .iwd files to index
 * @param clear     If true, clear existing index before scanning
 */
export function buildIndex(
  iwdPaths: string[],
  clear = false
): BuildIndexResult {
  const prevCount = symbolCache.size;
  if (clear) {
    symbolCache.clear();
    fileSet.clear();
    archiveSet.clear();
    fileToSymbols.clear();
  }

  const perArchive: ArchiveStat[] = [];

  for (const iwdPath of iwdPaths) {
    const resolved = path.resolve(iwdPath);
    const result = openIwd(resolved);
    if (!result.ok) continue; // skip archives that fail to open

    const zip: AdmZip = result.value;
    const entries = zip.getEntries();

    let archiveSymbols = 0;
    const archiveFiles = new Set<string>();

    for (const entry of entries) {
      const entryName = entry.entryName.replace(/\\/g, "/");
      if (!entryName.toLowerCase().endsWith(".gsc")) continue;

      let source: string;
      try {
        source = entry.getData().toString("utf-8");
      } catch {
        continue; // skip unreadable entries
      }

      // Use outline() to extract function definitions (no new parsing needed)
      const outlineResult = outline(source);
      if (outlineResult.functions.length === 0) continue;

      const fileKey = `${resolved}::${entryName}`;
      if (fileSet.has(fileKey)) continue; // skip already-indexed files to prevent duplicates on re-index

      archiveFiles.add(entryName);
      fileSet.add(fileKey);     // mark as indexed BEFORE the fn loop
      archiveSet.add(resolved); // same

      for (const fn of outlineResult.functions) {
        const key = fn.name.toLowerCase();
        const existing = symbolCache.get(key) ?? [];
        existing.push({ name: fn.name, file: entryName, archive: resolved });
        symbolCache.set(key, existing);
        archiveSymbols++;

        // Maintain fileToSymbols map
        const normalizedFile = entryName.toLowerCase();
        const fileSyms = fileToSymbols.get(normalizedFile) ?? new Set<string>();
        fileSyms.add(key);
        fileToSymbols.set(normalizedFile, fileSyms);
      }
    }

    perArchive.push({
      archive: resolved,
      symbols: archiveSymbols,
      files: archiveFiles.size,
    });
  }

  if (perArchive.length > 0) {
    indexedAt = new Date();
  }

  return {
    stats: getStats(),
    perArchive,
    replaced: prevCount,
  };
}

/**
 * Resolve an #include path to the set of function names it exports.
 * Tries:
 *  1. Disk: looks for <includePath>.gsc relative to `hintDir`
 *  2. Cache: looks for any indexed entry whose path ends with the normalized include path
 *
 * @param includePath   Raw include path from source, e.g. "maps\\utility"
 * @param hintDir       Directory of the file being analyzed (for disk resolution)
 */
export function resolveInclude(
  includePath: string,
  hintDir?: string
): { symbols: Set<string>; source: "disk" | "cache" | "unresolved" } {
  const normalized = includePath.replace(/\\/g, "/");
  const withExt = normalized.endsWith(".gsc") ? normalized : normalized + ".gsc";

  // 1. Try disk
  if (hintDir) {
    // Guard against path traversal in include paths
    if (isSafeEntryPath(withExt)) {
      const diskPath = path.join(hintDir, withExt);
      if (fs.existsSync(diskPath)) {
        try {
          const source = fs.readFileSync(diskPath, "utf-8");
          const outlineResult = outline(source);
          const symbols = new Set(outlineResult.functions.map(f => f.name.toLowerCase()));
          return { symbols, source: "disk" };
        } catch {
          // fall through to cache
        }
      }
    }
  }

  // 2. Try symbol cache
  const fromCache = symbolsForFile(withExt);
  if (fromCache.size > 0) {
    return { symbols: fromCache, source: "cache" };
  }

  return { symbols: new Set(), source: "unresolved" };
}
