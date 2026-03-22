# Phase 2: Code Gaps - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden three specific fragile code paths identified in CONCERNS.md:
1. Rate limiter `Map` that can grow without bound (CODE-01)
2. Orphaned temp file cleanup that only scans CWD (CODE-02)
3. `getKnowledgeDir()` path resolution that fails when bundled/relocated (CODE-03)

No new tools, no new features. Pure correctness fixes in existing code.

</domain>

<decisions>
## Implementation Decisions

### CODE-01: Rate limiter size cap
- Add `RATE_LIMIT_MAX_SIZE = 500` constant to `utils.ts`
- Before inserting a new entry into `rateLimitMap`, if `rateLimitMap.size >= RATE_LIMIT_MAX_SIZE`, evict the oldest entry via `rateLimitMap.keys().next().value`
- The existing `cleanupExpiredRateLimits()` (triggered at threshold 1000) is left as-is — the hard cap is a separate guard
- This ensures the map is bounded regardless of how many distinct keys accumulate

### CODE-02: Temp cleanup scan locations
- Add a module-level `Set<string>` named `atomicWriteDirs` to `utils.ts`
- In `atomicWrite()`, add `path.dirname(filePath)` to `atomicWriteDirs` before writing the `.tmp` file
- In `cleanupOrphanedTempFiles()` in `index.ts`, scan all directories in `atomicWriteDirs` (imported from utils) PLUS `process.cwd()`, instead of only CWD
- At startup, `atomicWriteDirs` is empty (no persistence across restarts), so the CWD scan remains the cold-start baseline

### CODE-03: getKnowledgeDir hardening
- Remove the `process.execPath` fallback — it resolves to the Node.js binary directory (e.g., `/usr/bin/node`), not the server location, so it never produces a valid path
- Keep `import.meta.dirname` as primary, `import.meta.url` as secondary
- When all candidates fail and `null` is returned, emit `console.error('[iw4x-toolkit] Could not locate knowledge file: ${filename} — searched: [...]')` before returning null, so failures are visible in server stderr rather than silently propagating

### Claude's Discretion
- User has no preferences on implementation approach — all three fixes are left to Claude's judgment within the constraints above
- Keep changes minimal: touch only the three specific code paths; do not refactor surrounding code

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Code under change
- `mcp-server/src/utils.ts` — contains `rateLimitMap`, `checkRateLimit`, `cleanupExpiredRateLimits`, `RATE_LIMIT_CLEANUP_THRESHOLD`, `atomicWrite`, `getKnowledgeDir`
- `mcp-server/src/index.ts` — contains `cleanupOrphanedTempFiles()`, calls `atomicWriteDirs` (after fix), startup wiring

### Requirements and scope
- `.planning/REQUIREMENTS.md` — CODE-01, CODE-02, CODE-03 definitions
- `.planning/ROADMAP.md` — Phase 2 success criteria (rate limiter bounded, temp cleanup scans write locations, getKnowledgeDir resolves correctly when bundled)

### Known fragile areas (source of truth for what's broken)
- `.planning/codebase/CONCERNS.md` — "Rate Limiting" section (unbounded map), "Orphaned Temp File Cleanup" section (CWD-only scan), "Path Resolution Fallbacks" section (fragile fallback chain)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getCachedRegex()` in `utils.ts` — already implements hard-cap LRU eviction (size >= REGEX_CACHE_MAX → evict first key). Use this pattern exactly for CODE-01.
- `rateLimitMap` cleanup threshold already at line 89 (`RATE_LIMIT_CLEANUP_THRESHOLD = 1000`) — add `RATE_LIMIT_MAX_SIZE` alongside it

### Established Patterns
- `atomicWrite` writes `.tmp` file at `${filePath}.tmp` — temp file lives in the same directory as the target IWD file
- `backedUp` (Set) and `regexCache` (Map) are both module-level in `utils.ts` — `atomicWriteDirs` follows the same pattern
- `import` of utils in `index.ts` already uses named exports — `atomicWriteDirs` can be added to the existing export list

### Integration Points
- `cleanupOrphanedTempFiles()` is in `index.ts` and imports nothing from utils currently — it will need to import `atomicWriteDirs` from `./utils.js`
- `getKnowledgeDir` is exported from both `utils.ts` and re-exported from `index.ts` (line 37) — only change `utils.ts`

</code_context>

<specifics>
## Specific Ideas

- No specific references or "I want it like X" moments — straightforward correctness fixes

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-code-gaps*
*Context gathered: 2026-03-22*
