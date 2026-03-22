# Phase 2: Code Gaps - Research

**Researched:** 2026-03-22
**Domain:** TypeScript correctness fixes — rate limiting, temp file cleanup, path resolution
**Confidence:** HIGH

## Summary

All three fixes are pure TypeScript correctness changes in two files (`utils.ts` and `index.ts`). No new dependencies are needed. Every pattern required by the fixes already exists in the codebase — CODE-01 can copy `getCachedRegex`'s eviction pattern verbatim, CODE-02 mirrors `backedUp` and `regexCache` as module-level collections, and CODE-03 removes a broken fallback (`process.execPath` resolves to the Node binary dir, not the server dir).

The implementation decisions in CONTEXT.md are fully specified and internally consistent. This research confirms their correctness and surfaces the exact line-level context needed for the planner.

**Primary recommendation:** Implement in a single wave in dependency order: CODE-01 (standalone), CODE-02 (utils then index), CODE-03 (standalone). All three are independent — no ordering constraint between them.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**CODE-01: Rate limiter size cap**
- Add `RATE_LIMIT_MAX_SIZE = 500` constant to `utils.ts`
- Before inserting a new entry into `rateLimitMap`, if `rateLimitMap.size >= RATE_LIMIT_MAX_SIZE`, evict the oldest entry via `rateLimitMap.keys().next().value`
- The existing `cleanupExpiredRateLimits()` (triggered at threshold 1000) is left as-is — the hard cap is a separate guard
- This ensures the map is bounded regardless of how many distinct keys accumulate

**CODE-02: Temp cleanup scan locations**
- Add a module-level `Set<string>` named `atomicWriteDirs` to `utils.ts`
- In `atomicWrite()`, add `path.dirname(filePath)` to `atomicWriteDirs` before writing the `.tmp` file
- In `cleanupOrphanedTempFiles()` in `index.ts`, scan all directories in `atomicWriteDirs` (imported from utils) PLUS `process.cwd()`, instead of only CWD
- At startup, `atomicWriteDirs` is empty (no persistence across restarts), so the CWD scan remains the cold-start baseline

**CODE-03: getKnowledgeDir hardening**
- Remove the `process.execPath` fallback — it resolves to the Node.js binary directory (e.g., `/usr/bin/node`), not the server location, so it never produces a valid path
- Keep `import.meta.dirname` as primary, `import.meta.url` as secondary
- When all candidates fail and `null` is returned, emit `console.error('[iw4x-toolkit] Could not locate knowledge file: ${filename} — searched: [...]')` before returning null

### Claude's Discretion
- User has no preferences on implementation approach — all three fixes are left to Claude's judgment within the constraints above
- Keep changes minimal: touch only the three specific code paths; do not refactor surrounding code

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CODE-01 | Rate limiter `Map` has eviction to prevent unbounded growth | Pattern exists in `getCachedRegex` (lines 66-70 of utils.ts) — copy exactly |
| CODE-02 | Orphaned temp file cleanup scans write locations, not just CWD | `atomicWrite` is in utils.ts line 301; `cleanupOrphanedTempFiles` is in index.ts lines 53-86 |
| CODE-03 | `getKnowledgeDir()` path resolution hardened for bundled/relocated installs | Current code is utils.ts lines 169-198; broken fallback is the `catch` block at line 180 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.7.0 | Source language | Project standard |
| vitest | ^3.0.0 | Test runner | Project standard, `npm test` = `vitest run` |
| node:fs/promises | built-in | Async file I/O | Used throughout index.ts already |
| node:path | built-in | Path manipulation | Used in both utils.ts and index.ts |

### Supporting
No new dependencies. All fixes use Node.js built-ins already imported.

**Installation:** No installation needed — zero new dependencies.

## Architecture Patterns

### Existing Pattern: Hard-Cap Eviction (CODE-01 template)

The `getCachedRegex` function in `utils.ts` lines 62-75 already implements the exact pattern needed for CODE-01:

```typescript
// Source: mcp-server/src/utils.ts lines 66-70
if (regexCache.size >= REGEX_CACHE_MAX) {
  const firstKey = regexCache.keys().next().value;
  if (firstKey) regexCache.delete(firstKey);
}
```

CODE-01 mirrors this precisely — `RATE_LIMIT_MAX_SIZE = 500` alongside `RATE_LIMIT_CLEANUP_THRESHOLD = 1000` (line 89), and the same eviction guard before `rateLimitMap.set(key, entry)` at line 135.

### Existing Pattern: Module-Level Set Export (CODE-02 template)

`backedUp` (line 208 of utils.ts) is a module-level `Set<string>` exported as a named export. `atomicWriteDirs` follows the same pattern:

```typescript
export const atomicWriteDirs = new Set<string>();
```

Then in `atomicWrite()` (line 301), add before `zip.writeZip(tmpPath)`:
```typescript
atomicWriteDirs.add(path.dirname(targetPath));
```

In `cleanupOrphanedTempFiles()` (index.ts line 53), replace the single `cwd`-only scan with a loop over `[...atomicWriteDirs, process.cwd()]`, deduplicating with a `Set` to avoid scanning the same directory twice.

### Existing Pattern: Structured Fallback Chain (CODE-03 template)

Current `getKnowledgeDir` has three blocks:
1. `import.meta.dirname` (try block, line 173) — correct
2. `import.meta.url` fallback (line 176) — correct
3. `process.execPath` fallback (catch block, line 180) — WRONG, resolves to Node binary dir

Fix: remove the entire `catch` block (lines 179-182) and let `baseDir` remain `undefined`/empty if both ESM sources fail. Add the `console.error` with searched paths before the final `return null` at line 197.

### Anti-Patterns to Avoid
- **Don't evict inside the `if (!entry || now > entry.resetTime)` branch**: The eviction must happen before `rateLimitMap.set()` on line 135, not inside the expired-entry reset block, because a new key insertion is what grows the map.
- **Don't persist `atomicWriteDirs` to disk**: It is intentionally ephemeral — cold-start behavior (CWD-only) is the documented fallback.
- **Don't remove CWD from cleanup scan**: The CWD scan is the cold-start baseline when `atomicWriteDirs` is empty on first startup.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LRU eviction | Custom eviction algorithm | `Map.keys().next().value` pattern | Map preserves insertion order; first key is oldest — already used in project |
| Directory deduplication | Custom Set logic | `new Set([...atomicWriteDirs, cwd])` | One-liner; handles overlap between write dirs and CWD |
| Path existence check | Custom stat wrapper | `fs.existsSync()` | Already used in getKnowledgeDir candidates loop |

## Common Pitfalls

### Pitfall 1: Eviction at Wrong Site
**What goes wrong:** Adding the size check to `cleanupExpiredRateLimits()` instead of `checkRateLimit()` — cleanup only runs when size > 1000, so the 500-entry cap is never enforced.
**Why it happens:** Confusion between the two defense layers.
**How to avoid:** The guard goes in `checkRateLimit()` immediately before the `rateLimitMap.set(key, entry)` call at line 135, mirroring the regex cache pattern exactly.

### Pitfall 2: Double-Scanning Directories
**What goes wrong:** If a write target is in CWD, and both `atomicWriteDirs` and `process.cwd()` are scanned independently, the same directory is readdir'd twice.
**Why it happens:** Naive concatenation of the two sources.
**How to avoid:** Deduplicate with `new Set([...atomicWriteDirs, process.cwd()])` before the scan loop.

### Pitfall 3: import.meta.dirname Availability
**What goes wrong:** `import.meta.dirname` is undefined in Node.js < 20.11.0 even in ESM mode (it was added in 20.11).
**Why it happens:** The code already guards this with `if (!baseDir)` on line 174 — the fallback to `import.meta.url` is the correct secondary. The `process.execPath` catch block is the only thing that needs removal.
**How to avoid:** Keep both ESM sources; only remove the broken execPath fallback.

### Pitfall 4: baseDir Becomes Undefined After Removing Catch Block
**What goes wrong:** TypeScript may flag `baseDir` as possibly uninitialized if the `catch` block that assigned it is removed.
**Why it happens:** The variable is declared with `let baseDir: string` but only assigned in `try`.
**How to avoid:** Restructure as:
```typescript
let baseDir: string | undefined;
try {
  baseDir = import.meta.dirname || path.dirname(new URL(import.meta.url).pathname);
} catch { /* baseDir remains undefined */ }
```
Then use `if (!baseDir)` guard before building candidates, or skip the `baseDir`-dependent candidates when undefined.

## Code Examples

### CODE-01: Rate Limiter Cap (verified from utils.ts line 127-135)
```typescript
// Add alongside RATE_LIMIT_CLEANUP_THRESHOLD at line 89:
const RATE_LIMIT_MAX_SIZE = 500;

// In checkRateLimit(), before rateLimitMap.set(key, entry) at line 135:
if (rateLimitMap.size >= RATE_LIMIT_MAX_SIZE) {
  const firstKey = rateLimitMap.keys().next().value;
  if (firstKey) rateLimitMap.delete(firstKey);
}
```

### CODE-02: atomicWriteDirs export (mirrors backedUp at utils.ts line 208)
```typescript
export const atomicWriteDirs = new Set<string>();
```

In `atomicWrite()`, before `zip.writeZip(tmpPath)` at line 306:
```typescript
atomicWriteDirs.add(path.dirname(targetPath));
```

In `cleanupOrphanedTempFiles()` in index.ts, replace single CWD scan with:
```typescript
import { atomicWriteDirs } from "./utils.js";
// ...
const dirsToScan = new Set([...atomicWriteDirs, process.cwd()]);
for (const dir of dirsToScan) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    // ... existing per-file cleanup logic ...
  } catch { /* ignore */ }
}
```

### CODE-03: Remove execPath fallback and add error logging
```typescript
export function getKnowledgeDir(filename: string): string | null {
  let baseDir: string | undefined;
  try {
    baseDir = import.meta.dirname || path.dirname(new URL(import.meta.url).pathname);
  } catch { /* baseDir remains undefined */ }

  const candidates = [
    ...(baseDir ? [
      path.resolve(baseDir, "..", "knowledge", filename),
      path.resolve(baseDir, "..", "..", "knowledge", filename),
      path.resolve(baseDir, "..", "..", "..", "knowledge", filename),
    ] : []),
    path.resolve("knowledge", filename),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  console.error(`[iw4x-toolkit] Could not locate knowledge file: ${filename} — searched: ${candidates.join(", ")}`);
  return null;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single CWD scan for temp cleanup | Scan all write dirs + CWD | Phase 2 | Cleanup works regardless of working directory |
| Unbounded rateLimitMap | Hard cap at 500 + existing cleanup at 1000 | Phase 2 | Memory bounded under adversarial key diversity |
| Silent null return from getKnowledgeDir | Null + console.error with searched paths | Phase 2 | Failures surface in server stderr |
| process.execPath fallback (wrong dir) | No fallback (fail cleanly) | Phase 2 | Removes always-failing code path |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^3.0.0 |
| Config file | none — vitest picks up defaults, exclude pattern covers node_modules |
| Quick run command | `cd mcp-server && npm test` |
| Full suite command | `cd mcp-server && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CODE-01 | rateLimitMap stays <= 500 entries under flood | unit | `cd mcp-server && npm test -- --reporter=verbose src/index.test.ts` | ❌ Wave 0 |
| CODE-02 | cleanup scans atomicWriteDirs dirs, not just CWD | unit | `cd mcp-server && npm test -- --reporter=verbose src/index.test.ts` | ❌ Wave 0 |
| CODE-03 | getKnowledgeDir logs error on null return | unit | `cd mcp-server && npm test -- --reporter=verbose src/index.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd mcp-server && npm test`
- **Per wave merge:** `cd mcp-server && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Add to `mcp-server/src/index.test.ts`:
  - `checkRateLimit` flood test (CODE-01) — call with 600 distinct clientIds, assert `rateLimitMap.size <= 500`
  - `atomicWriteDirs` registration test (CODE-02) — call `atomicWrite` with a tmp dir path, assert dir appears in set
  - `cleanupOrphanedTempFiles` scan coverage test (CODE-02) — verify scan covers injected dirs beyond CWD
  - `getKnowledgeDir` error log test (CODE-03) — spy on `console.error`, call with nonexistent file, assert message includes filename and "searched:"

*(rateLimitMap and atomicWriteDirs are module-level — tests access them by importing from utils.ts)*

## Open Questions

1. **TypeScript strictness on `baseDir` restructure**
   - What we know: Current code declares `let baseDir: string` (always string) which will need to become `string | undefined` after removing the catch-block fallback.
   - What's unclear: Whether any downstream candidate-building will error on `undefined` if not restructured.
   - Recommendation: Restructure as shown in Code Examples above — guard with `...(baseDir ? [...] : [])` spread.

## Sources

### Primary (HIGH confidence)
- `mcp-server/src/utils.ts` — direct code read: rateLimitMap (line 86), cleanupExpiredRateLimits (line 95), checkRateLimit (line 118), getKnowledgeDir (line 169), atomicWrite (line 301), getCachedRegex eviction pattern (line 62)
- `mcp-server/src/index.ts` — direct code read: cleanupOrphanedTempFiles (lines 53-86)
- `.planning/phases/02-code-gaps/02-CONTEXT.md` — locked implementation decisions
- `mcp-server/package.json` — test command: `vitest run`, devDependencies verified

### Secondary (MEDIUM confidence)
- Node.js docs: `import.meta.dirname` added in Node 20.11.0 (ESM, no `__dirname` equivalent before that)
- MDN/Node docs: `Map` preserves insertion order — `keys().next().value` is oldest entry

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — read directly from package.json and source files
- Architecture: HIGH — patterns verified from existing code in utils.ts
- Pitfalls: HIGH — derived from direct code analysis, not speculation

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable — no moving parts)
