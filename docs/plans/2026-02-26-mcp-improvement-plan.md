# MCP Improvement — Symbol Oracle & Orphan Detector: Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `iwd_index_symbols` and `gsc_find_orphans` MCP tools to eliminate the Promod crash-loop porting cycle.

**Architecture:** New `mcp-server/src/gsc/symbols.ts` module owns the in-memory symbol registry and include resolver. Both tools are registered in the existing `gsc/tools.ts`. `iwd_index_symbols` uses `openIwd` + `outline()` to extract function names from all `.gsc` entries in IWD archives. `gsc_find_orphans` tokenizes a target file, resolves each call site against local defs → includes (disk + cache) → builtins → symbol index.

**Tech Stack:** TypeScript, Node.js, adm-zip (already in deps), existing `outline.ts` and `tokenizer.ts`, vitest for tests, esbuild for dist rebuild.

---

## Task 1: Create `symbols.ts` — the symbol registry

**Files:**
- Create: `mcp-server/src/gsc/symbols.ts`

**Step 1: Write the failing test first**

Add to `mcp-server/src/gsc/tools.test.ts` at the end of the `describe("GSC Tools", ...)` block:

```typescript
// ===========================================================================
// symbols module (unit tests — import directly, no MCP client needed)
// ===========================================================================

describe("symbols registry", () => {
  it("starts empty", async () => {
    const { getStats, clearIndex } = await import("./symbols.js");
    clearIndex();
    const stats = getStats();
    expect(stats.symbols).toBe(0);
    expect(stats.files).toBe(0);
    expect(stats.archives).toBe(0);
    expect(stats.indexedAt).toBeNull();
  });

  it("hasSymbol returns false when empty", async () => {
    const { hasSymbol, clearIndex } = await import("./symbols.js");
    clearIndex();
    expect(hasSymbol("init")).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module './symbols.js'`

**Step 3: Create `mcp-server/src/gsc/symbols.ts`**

```typescript
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
import { openIwd } from "../utils.js";

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
let indexedAt: Date | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Clear the symbol index entirely.
 */
export function clearIndex(): void {
  symbolCache.clear();
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
  const result = new Set<string>();
  for (const [name, entries] of symbolCache) {
    for (const entry of entries) {
      if (entry.file.toLowerCase().endsWith(normalized)) {
        result.add(name);
      }
    }
  }
  return result;
}

/**
 * Current index statistics.
 */
export function getStats(): IndexStats {
  let files = 0;
  const seen = new Set<string>();
  for (const entries of symbolCache.values()) {
    for (const e of entries) {
      const key = `${e.archive}::${e.file}`;
      if (!seen.has(key)) {
        seen.add(key);
        files++;
      }
    }
  }
  const archives = new Set(
    [...symbolCache.values()].flatMap(es => es.map(e => e.archive))
  ).size;
  return { symbols: symbolCache.size, files, archives, indexedAt };
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
  if (clear) symbolCache.clear();

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
      const result = outline(source);
      if (result.functions.length === 0) continue;

      archiveFiles.add(entryName);

      for (const fn of result.functions) {
        const key = fn.name.toLowerCase();
        const existing = symbolCache.get(key) ?? [];
        existing.push({ name: fn.name, file: entryName, archive: resolved });
        symbolCache.set(key, existing);
        archiveSymbols++;
      }
    }

    perArchive.push({
      archive: resolved,
      symbols: archiveSymbols,
      files: archiveFiles.size,
    });
  }

  indexedAt = new Date();

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
    const diskPath = path.join(hintDir, withExt);
    if (fs.existsSync(diskPath)) {
      try {
        const source = fs.readFileSync(diskPath, "utf-8");
        const result = outline(source);
        const symbols = new Set(result.functions.map(f => f.name.toLowerCase()));
        return { symbols, source: "disk" };
      } catch {
        // fall through to cache
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
```

**Step 4: Run tests to verify they pass**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: `symbols registry` describe block: 2 passed.

**Step 5: Commit**

```bash
cd mcp-server && git add src/gsc/symbols.ts src/gsc/tools.test.ts
git commit -m "feat: add gsc/symbols.ts — in-memory symbol registry with buildIndex + resolveInclude"
```

---

## Task 2: Register `iwd_index_symbols` tool

**Files:**
- Modify: `mcp-server/src/gsc/tools.ts` (add import + tool at end of `registerGscTools`)

**Step 1: Write the failing test**

Add inside `describe("GSC Tools", ...)` in `tools.test.ts`:

```typescript
describe("iwd_index_symbols", () => {
  it("returns error for non-existent path", async () => {
    const result = await client.callTool({
      name: "iwd_index_symbols",
      arguments: { paths: ["/nonexistent/path.iwd"] }
    });
    const text = getResultText(result as any);
    // Should report 0 symbols indexed (skips bad paths gracefully)
    expect(text).toContain("0 symbols");
  });

  it("clears the index when clear=true", async () => {
    // First call with nonexistent paths to ensure some state
    await client.callTool({
      name: "iwd_index_symbols",
      arguments: { paths: [], clear: true }
    });
    // Second call should report replaced 0
    const result = await client.callTool({
      name: "iwd_index_symbols",
      arguments: { paths: [], clear: true }
    });
    const text = getResultText(result as any);
    expect(text).toContain("0 symbols");
    expect(text).toMatch(/replaced|previous/i);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | grep -A 5 "iwd_index_symbols"
```

Expected: FAIL — `Tool not found: iwd_index_symbols`

**Step 3: Add import and tool to `tools.ts`**

At the top of `mcp-server/src/gsc/tools.ts`, add to the existing imports:

```typescript
import { buildIndex, getStats, clearIndex } from "./symbols.js";
```

At the bottom of `registerGscTools`, before the closing `}`, add:

```typescript
  // --- Tool: iwd_index_symbols ---
  server.registerTool(
    "iwd_index_symbols",
    {
      title: "Index GSC Symbols from IWD Archives",
      description:
        "Scans one or more IWD archives and indexes every GSC function definition " +
        "into an in-memory symbol registry. " +
        "Run this once before gsc_find_orphans to enable cross-archive symbol resolution. " +
        "Accepts .iwd file paths or directories containing .iwd files. " +
        "The index persists for the duration of the MCP server session.",
      inputSchema: {
        paths: z.array(z.string()).describe(
          "Paths to .iwd files or directories containing .iwd files to index"
        ),
        clear: z.boolean().optional().default(false).describe(
          "If true, clear the existing index before scanning (default: false — adds to existing)"
        ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: false,
      },
    },
    async ({ paths, clear }) => {
      // Expand directories to .iwd files
      const iwdPaths: string[] = [];
      for (const p of paths) {
        const resolved = path.resolve(p);
        if (!fs.existsSync(resolved)) {
          // Skip silently — reported in summary
          continue;
        }
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
          const entries = fs.readdirSync(resolved);
          for (const entry of entries) {
            if (entry.toLowerCase().endsWith(".iwd")) {
              iwdPaths.push(path.join(resolved, entry));
            }
          }
        } else if (resolved.toLowerCase().endsWith(".iwd")) {
          iwdPaths.push(resolved);
        }
      }

      const result = buildIndex(iwdPaths, clear);

      // Format output
      let out = `Indexed ${result.stats.symbols} symbols across ${result.stats.files} files in ${result.stats.archives} archive(s)`;
      if (result.perArchive.length === 0) {
        out += ".\nNo valid .iwd archives found in provided paths.";
      } else {
        out += ":\n";
        for (const a of result.perArchive) {
          const name = path.basename(a.archive);
          out += `  ${name.padEnd(40)} — ${a.symbols} symbols (${a.files} files)\n`;
        }
      }

      if (result.stats.symbols === 0) {
        out += "\nTip: verify the paths contain .iwd files with .gsc entries.";
      }

      if (clear || result.replaced > 0) {
        out += `\nReplaced previous index (was ${result.replaced} symbols).`;
      }

      return { content: [{ type: "text", text: out }] };
    }
  );
```

**Step 4: Run tests to verify they pass**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | grep -A 10 "iwd_index_symbols"
```

Expected: 2 passed.

**Step 5: Commit**

```bash
cd mcp-server && git add src/gsc/tools.ts src/gsc/tools.test.ts
git commit -m "feat: add iwd_index_symbols tool — scan IWD archives, build in-memory function symbol map"
```

---

## Task 3: Register `gsc_find_orphans` tool

**Files:**
- Modify: `mcp-server/src/gsc/tools.ts` (add tool at end of `registerGscTools`)

**Step 1: Write the failing tests**

Add inside `describe("GSC Tools", ...)` in `tools.test.ts`:

```typescript
describe("gsc_find_orphans", () => {
  it("reports no orphans for a clean file with only builtins", async () => {
    const result = await client.callTool({
      name: "gsc_find_orphans",
      arguments: {
        content: `init()
{
    iprintln("hello");
    wait(1);
}`
      }
    });
    const text = getResultText(result as any);
    expect(text).toContain("0 orphaned");
  });

  it("detects an orphaned call to an unknown function", async () => {
    const result = await client.callTool({
      name: "gsc_find_orphans",
      arguments: {
        content: `init()
{
    promod_someUnknownFunc();
    iprintln("done");
}`
      }
    });
    const text = getResultText(result as any);
    expect(text).toContain("promod_someUnknownFunc");
    expect(text).toMatch(/orphan|not.*found|unresolved/i);
  });

  it("does not flag locally defined functions as orphans", async () => {
    const result = await client.callTool({
      name: "gsc_find_orphans",
      arguments: {
        content: `init()
{
    helper();
}
helper()
{
    iprintln("i am local");
}`
      }
    });
    const text = getResultText(result as any);
    expect(text).toContain("0 orphaned");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | grep -A 10 "gsc_find_orphans"
```

Expected: FAIL — `Tool not found: gsc_find_orphans`

**Step 3: Add the tool to `tools.ts`**

Add this import at the top (alongside existing linter imports):

```typescript
import { tokenize, TokenType } from "./tokenizer.js";
import { resolveInclude } from "./symbols.js";
```

> Note: `TokenType` and `tokenize` are already exported from `tokenizer.ts` — used by `linter.ts`. Check the existing import in `linter.ts` for the exact export names: `import { tokenize, Token, TokenType, TokenizeResult } from "./tokenizer.js"`.

Add the tool at the bottom of `registerGscTools`:

```typescript
  // --- Tool: gsc_find_orphans ---
  server.registerTool(
    "gsc_find_orphans",
    {
      title: "Find Orphaned GSC Function Calls",
      description:
        "Statically analyzes a GSC file and reports every function call that cannot be resolved: " +
        "not defined locally, not in any #include, not a known IW4 builtin, " +
        "and not in the symbol index (run iwd_index_symbols first for cross-archive resolution). " +
        "Converts the 'one crash at a time' Promod porting cycle into a single batch fix.",
      inputSchema: {
        content: z.string().optional().describe(
          "GSC source code to analyze. Either this or path must be provided."
        ),
        path: z.string().optional().describe(
          "Path to a .gsc file on disk. Either this or content must be provided."
        ),
        iwd: z.string().optional().describe(
          "Path to an IWD archive. If provided, reads the file specified by path from inside this archive."
        ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ content, path: filePath, iwd }) => {
      // --- 1. Load source ---
      let source: string;
      let hintDir: string | undefined;

      if (content) {
        source = content;
      } else if (filePath && iwd) {
        const resolved = path.resolve(iwd);
        const result = openIwd(resolved);
        if (!result.ok) {
          return { content: [{ type: "text", text: `❌ ${result.error}` }] };
        }
        const zip = result.value;
        const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
        const entry = zip.getEntry(normalized);
        if (!entry) {
          return { content: [{ type: "text", text: `❌ Entry not found in archive: ${normalized}` }] };
        }
        try {
          source = entry.getData().toString("utf-8");
        } catch (e) {
          return { content: [{ type: "text", text: `❌ Failed to read entry: ${e}` }] };
        }
      } else if (filePath) {
        const resolved = path.resolve(filePath);
        if (!fs.existsSync(resolved)) {
          return { content: [{ type: "text", text: `❌ File not found: ${resolved}` }] };
        }
        try {
          source = fs.readFileSync(resolved, "utf-8");
          hintDir = path.dirname(resolved);
        } catch (e) {
          return { content: [{ type: "text", text: `❌ Failed to read file: ${e}` }] };
        }
      } else {
        return { content: [{ type: "text", text: "❌ Either content or path must be provided" }] };
      }

      // --- 2. Load builtins ---
      const builtins = await getKnownBuiltins();

      // --- 3. Parse source ---
      const { tokens } = tokenize(source);

      // --- 4. Collect local function definitions via outline ---
      const outlineResult = outline(source);
      const localFunctions = new Set(outlineResult.functions.map(f => f.name.toLowerCase()));

      // --- 5. Resolve #include symbols ---
      const includedFunctions = new Set<string>();
      const unresolvedIncludes: string[] = [];

      for (const inc of outlineResult.includes) {
        const resolved = resolveInclude(inc.path, hintDir);
        if (resolved.source === "unresolved") {
          unresolvedIncludes.push(inc.path);
        } else {
          for (const sym of resolved.symbols) {
            includedFunctions.add(sym);
          }
        }
      }

      // --- 6. Find all call sites ---
      // A call site is: IDENTIFIER followed by LEFT_PAREN
      // Exclude function definitions (at brace depth 0, followed by LEFT_PAREN then body)
      // Also exclude [[ptr]]() calls — not statically resolvable
      interface CallSite {
        name: string;
        line: number;
      }

      const callSites: CallSite[] = [];
      let ptrCallCount = 0;
      let braceDepth = 0;

      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];

        if (tok.type === TokenType.LEFT_BRACE) { braceDepth++; continue; }
        if (tok.type === TokenType.RIGHT_BRACE) { braceDepth = Math.max(0, braceDepth - 1); continue; }

        // Skip [[ptr]]() patterns
        if (tok.type === TokenType.LEFT_BRACKET) {
          const next = tokens[i + 1];
          if (next && next.type === TokenType.LEFT_BRACKET) {
            ptrCallCount++;
            // Skip until matching ]]
            while (i < tokens.length && !(tokens[i].type === TokenType.RIGHT_BRACKET && tokens[i + 1]?.type === TokenType.RIGHT_BRACKET)) i++;
            i += 2; // skip ]]
            continue;
          }
        }

        // IDENTIFIER followed by LEFT_PAREN = call site
        if (tok.type === TokenType.IDENTIFIER) {
          const next = findNextMeaningful(tokens, i + 1);
          if (next !== -1 && tokens[next].type === TokenType.LEFT_PAREN) {
            // At depth 0 with a matching body brace = function definition, skip
            if (braceDepth === 0) {
              // Check if this is a function def (brace follows the closing paren)
              let j = next + 1;
              let parenDepth = 1;
              while (j < tokens.length && parenDepth > 0) {
                if (tokens[j].type === TokenType.LEFT_PAREN) parenDepth++;
                else if (tokens[j].type === TokenType.RIGHT_PAREN) parenDepth--;
                j++;
              }
              const afterParen = findNextMeaningful(tokens, j);
              if (afterParen !== -1 && tokens[afterParen].type === TokenType.LEFT_BRACE) {
                continue; // it's a function definition
              }
            }
            callSites.push({ name: tok.value, line: tok.line });
          }
        }
      }

      // Helper: skip comments/EOF to find next real token index
      function findNextMeaningful(toks: typeof tokens, from: number): number {
        for (let k = from; k < toks.length; k++) {
          const t = toks[k];
          if (t.type !== TokenType.COMMENT && t.type !== TokenType.BLOCK_COMMENT && t.type !== (TokenType as any).EOF) {
            return k;
          }
        }
        return -1;
      }

      // --- 7. Classify call sites ---
      const { getStats: getIndexStats } = await import("./symbols.js");
      const indexStats = getIndexStats();

      interface Orphan { name: string; line: number }
      const orphans: Orphan[] = [];
      const seen = new Set<string>(); // for deduplication tracking

      for (const call of callSites) {
        const lower = call.name.toLowerCase();
        const isLocal = localFunctions.has(lower);
        const isIncluded = includedFunctions.has(lower);
        const isBuiltin = builtins.has(lower);
        const isIndexed = hasSymbol(lower);

        if (!isLocal && !isIncluded && !isBuiltin && !isIndexed) {
          orphans.push({ name: call.name, line: call.line });
        }
      }

      // --- 8. Format output ---
      const fileName = filePath ? path.basename(filePath) : "<inline>";
      const uniqueOrphans = new Set(orphans.map(o => o.name.toLowerCase())).size;

      let out = "";

      if (orphans.length === 0) {
        out = `✅ 0 orphaned calls in ${fileName}.\n`;
        out += `All function calls are resolved (local, includes, builtins, or symbol index).`;
      } else {
        out = `Found ${orphans.length} orphaned call(s) (${uniqueOrphans} unique) in ${fileName}\n`;

        if (indexStats.symbols === 0) {
          out += `⚠️  Symbol index is empty — run iwd_index_symbols first to reduce false positives.\n`;
        } else {
          out += `Symbol index: ${indexStats.symbols} symbols — indexed at ${indexStats.indexedAt?.toLocaleTimeString() ?? "unknown"}\n`;
        }

        out += "\n";

        const seenInOutput = new Set<string>();
        for (const o of orphans) {
          const isDup = seenInOutput.has(o.name.toLowerCase());
          seenInOutput.add(o.name.toLowerCase());
          out += `  Line ${String(o.line).padStart(4)}  ${o.name}()${isDup ? "  (duplicate)" : ""}\n`;
        }
      }

      if (unresolvedIncludes.length > 0) {
        out += `\nUnresolved includes (symbols unknown — not on disk, not in index):\n`;
        for (const inc of unresolvedIncludes) {
          out += `  ${inc}\n`;
        }
      }

      if (ptrCallCount > 0) {
        out += `\nNote: ${ptrCallCount} function pointer call(s) [[ptr]]() skipped — not statically resolvable.\n`;
      }

      return { content: [{ type: "text", text: out }] };
    }
  );
```

You'll also need to add these imports to `tools.ts` (alongside the existing ones at the top):

```typescript
import { tokenize, TokenType } from "./tokenizer.js";
import { resolveInclude, hasSymbol } from "./symbols.js";
import { openIwd } from "../utils.js";
```

And add `getKnownBuiltins` to the existing linter import:

```typescript
// Change:
import { lint, fix, LintResult, LintError, LintOptions } from "./linter.js";
// To:
import { lint, fix, LintResult, LintError, LintOptions, getKnownBuiltins } from "./linter.js";
```

**Step 4: Run tests to verify they pass**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | grep -A 15 "gsc_find_orphans"
```

Expected: 3 passed.

**Step 5: Run full test suite**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass, no regressions.

**Step 6: Commit**

```bash
cd mcp-server && git add src/gsc/tools.ts src/gsc/tools.test.ts
git commit -m "feat: add gsc_find_orphans tool — static orphan call detection with include resolution"
```

---

## Task 4: Rebuild dist and final verification

**Files:**
- Modify: `mcp-server/dist/index.js` (rebuilt by build script)

**Step 1: Run the build**

```bash
cd mcp-server && npm run build 2>&1
```

Expected: exits 0, no errors.

**Step 2: Verify dist registers both tools**

```bash
grep -c "iwd_index_symbols\|gsc_find_orphans" mcp-server/dist/index.js
```

Expected: 2 (or more — the strings appear in the bundle)

**Step 3: Run full test suite one final time**

```bash
cd mcp-server && npm test 2>&1 | tail -10
```

Expected: all tests pass.

**Step 4: Commit**

```bash
cd mcp-server && git add dist/index.js
git commit -m "chore: rebuild dist — iwd_index_symbols + gsc_find_orphans tools"
```

---

## Acceptance Criteria

- [ ] `iwd_index_symbols` correctly indexes function definitions from real .iwd archives (manual smoke test: point at a Promod IWD, verify symbol count > 0)
- [ ] `gsc_find_orphans` reports 0 false positives on a file using only builtins and local functions
- [ ] `gsc_find_orphans` catches every unresolved call in a file with known orphans
- [ ] Include resolution works: a function defined via `#include` is not flagged as an orphan
- [ ] Symbol index resolution works: after `iwd_index_symbols`, functions from indexed archives are not flagged
- [ ] All tests pass, build is clean
- [ ] `mcp-server/dist/index.js` is rebuilt and committed
