# MCP Improvement — Symbol Oracle & Orphan Detector: Design Document

**Date:** 2026-02-26
**Status:** Approved
**Goal:** Eliminate the "game-crash-and-log" porting cycle for Promod by adding cross-IWD symbol indexing and orphaned call detection.

---

## Problem

Porting complex mods (e.g. Bot Mod) to Promod requires repeated crash cycles:
1. Apply change/stub → pack mod → launch game → crash on *Unknown Function* or *Already Defined* → extract log → repeat.

The root cause is no static visibility into what functions exist in Promod's environment before running the game.

---

## Scope (this plan)

Two tools only — the highest-ROI pair from `docs/MCP IMPROVEMENT.md`:

| Tool | Purpose |
|------|---------|
| `iwd_index_symbols` | Scan .iwd archives, build in-memory function symbol map |
| `gsc_find_orphans` | Statically analyze a .gsc file, report all unresolved call sites |

Out of scope for this plan: `gsc_auto_stub`, `gsc_lint_pro`, live log streamer.

---

## Architecture

### New module: `mcp-server/src/gsc/symbols.ts`

Shared symbol registry used by both tools.

```
SymbolEntry { name: string, file: string, archive: string | null }

symbolCache: Map<string, SymbolEntry[]>   // key = lowercase function name

buildIndex(iwdPaths: string[], opts: { clear?: boolean }) → IndexStats
resolveFile(includePath: string, hint?: string) → SymbolEntry[]
hasSymbol(name: string) → boolean
getStats() → { symbols: number, files: number, archives: number, indexedAt: Date | null }
clearIndex() → void
```

`buildIndex` reuses existing `outline.ts` (already extracts function definitions from GSC source). No new parsing code.

Both tools are registered in the existing `mcp-server/src/gsc/tools.ts`. No new entry point needed.

---

## Tool 1: `iwd_index_symbols`

### Input schema

```typescript
{
  paths: string[]       // .iwd files or directories containing .iwd files
  clear?: boolean       // default false — clear existing index before scan
}
```

### Behavior

1. For each path: if directory, glob `*.iwd`; if `.iwd` file, use directly
2. For each archive: enumerate entries via existing IWD utils, filter `.gsc` files
3. For each `.gsc`: read content → `outline(content)` → extract function names → insert `SymbolEntry`
4. Return summary text

### Example output

```
Indexed 1,247 symbols across 89 files in 3 archives:
  C:/CoD4/main/iw_06.iwd          — 312 symbols (34 files)
  C:/CoD4/mods/promod/promod.iwd  — 891 symbols (51 files)
  C:/CoD4/mods/promod/promod2.iwd —  44 symbols  (4 files)
Replaced previous index (was 0 symbols).
```

---

## Tool 2: `gsc_find_orphans`

### Input schema

```typescript
{
  content?: string      // inline GSC source
  path?: string         // path to .gsc file on disk
  iwd?: string          // IWD archive path (if file lives inside one)
  // at least one of content / path required
}
```

### Analysis pipeline

1. Load source (inline content, disk read, or `iwd_read`)
2. `collectDefinitions()` from linter → local function set
3. Tokenizer pass → extract all call sites
4. `#include` resolution → included function set (see below)
5. For each call site: check local → included → builtins (`gsc-builtins.json`) → symbol index
6. Anything unmatched = orphan

### Include resolution

`resolveFile(includePath, hint?)` tries in order:
1. Normalize: `maps\utility` → `maps/utility.gsc`
2. Disk lookup: relative to directory of source file (if `path` was given)
3. Cache lookup: scan symbol index entries where `entry.file` ends with normalized path → return their symbols
4. If neither found: note as unresolved include in output, continue (not a fatal error)

### Example output

```
Found 7 orphaned calls in maps/bot_combat.gsc
Symbol index: 1,247 symbols — indexed 3 min ago

  Line  23  botGetThreatScore()    not in local, includes, builtins, or index
  Line  45  customNotify()         not in local, includes, builtins, or index
  Line 112  promod_isAlive()       not in local, includes, builtins, or index
  Line 134  promod_isAlive()       (duplicate)
  Line 201  getSpawnDelay()        not in local, includes, builtins, or index
  Line 278  awardAssist()          not in local, includes, builtins, or index
  Line 301  logCombatEvent()       not in local, includes, builtins, or index

Unresolved includes (symbols unknown):
  maps/promod_utility  — not on disk, not in index

Note: 3 function pointer calls [[ptr]]() skipped — not statically resolvable.
```

---

## Edge Cases

| Situation | Behavior |
|-----------|---------|
| Non-existent path in `iwd_index_symbols` | Clear error message, partial results from valid paths |
| `gsc_find_orphans` called before any indexing | Works, warns "index is empty — run iwd_index_symbols first" |
| `[[ptr]]()` function pointer calls | Skipped, counted and noted in output |
| Duplicate orphan call (same func, multiple lines) | Each line reported separately |
| Unresolved `#include` | Noted as caveat, not a hard error |
| Very large archives | Existing IWD rate-limiter handles this |

---

## Testing

Three tests in `mcp-server/src/gsc/tools.test.ts`:

1. **`iwd_index_symbols` happy path** — index a test IWD, assert symbol count > 0, assert a known function exists in registry
2. **`gsc_find_orphans` clean file** — file using only local defs + builtins, assert orphan list is empty
3. **`gsc_find_orphans` with orphans** — file calling `somePromodFunc()` absent from all sources, assert it appears in results

---

## File Changes

| File | Change |
|------|--------|
| `mcp-server/src/gsc/symbols.ts` | New: symbol registry (`buildIndex`, `resolveFile`, `hasSymbol`, `getStats`, `clearIndex`) |
| `mcp-server/src/gsc/tools.ts` | Register `iwd_index_symbols` and `gsc_find_orphans` |
| `mcp-server/src/gsc/tools.test.ts` | 3 new tests |
| `mcp-server/dist/index.js` | Rebuild after changes |

---

## Success Criteria

- `iwd_index_symbols` correctly indexes function definitions from real .iwd archives
- `gsc_find_orphans` reports zero false positives on a clean file
- `gsc_find_orphans` catches every unresolved call in a file with known orphans
- Include resolution works for both disk and cached sources
- All 3 tests pass, build clean
