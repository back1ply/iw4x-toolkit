---
phase: 02-code-gaps
plan: 01
subsystem: mcp-server/utils
tags: [rate-limiting, temp-cleanup, path-resolution, hardening]
dependency_graph:
  requires: []
  provides: [CODE-01, CODE-02, CODE-03]
  affects: [mcp-server/src/utils.ts, mcp-server/src/index.ts, mcp-server/src/index.test.ts]
tech_stack:
  added: []
  patterns: [eviction-guard, Set-tracking, ESM-path-resolution]
key_files:
  created: []
  modified:
    - mcp-server/src/utils.ts
    - mcp-server/src/index.ts
    - mcp-server/src/index.test.ts
decisions:
  - "Export rateLimitMap and RATE_LIMIT_MAX_SIZE from utils.ts for testability"
  - "atomicWriteDirs tracks dirs as a module-level Set (same pattern as backedUp)"
  - "getKnowledgeDir uses string | undefined for baseDir instead of string to avoid execPath fallback"
metrics:
  duration: 3min
  completed_date: "2026-03-22"
  tasks_completed: 2
  files_modified: 3
---

# Phase 2 Plan 1: Code Gap Fixes Summary

**One-liner:** Bounded rate limiter (500-entry eviction), atomicWrite directory tracking for cleanup, and ESM-only getKnowledgeDir with console.error on failure.

## What Was Built

Three hardening fixes to fragile code paths identified in CONCERNS.md:

**CODE-01 — Rate limiter hard cap (`utils.ts`):**
- Added `export const RATE_LIMIT_MAX_SIZE = 500`
- Exported `rateLimitMap` for testability
- Added eviction guard in `checkRateLimit` before `rateLimitMap.set()`: if size >= 500, evict oldest entry (same LRU-first pattern used by `getCachedRegex`)

**CODE-02 — atomicWriteDirs tracking (`utils.ts` + `index.ts`):**
- Added `export const atomicWriteDirs = new Set<string>()` in utils.ts near `backedUp`
- `atomicWrite()` now calls `atomicWriteDirs.add(path.dirname(targetPath))` as its first line
- `cleanupOrphanedTempFiles()` replaced CWD-only scan with `new Set([...atomicWriteDirs, process.cwd()])` multi-directory loop
- Added `atomicWriteDirs` to index.ts re-export block

**CODE-03 — getKnowledgeDir hardening (`utils.ts`):**
- Removed `process.execPath` fallback (resolved to Node binary dir — always wrong)
- `baseDir` changed to `string | undefined`; catch block leaves it undefined
- Added `console.error` call on lookup failure with filename and all searched paths
- Candidate list only built from `baseDir` when defined, plus always-present CWD-relative path

## Verification

- `npx tsc --noEmit`: zero errors
- `npm test`: 251 passing, 4 failing (pre-existing backup naming failures, deferred)
- All 3 new describe blocks pass (CODE-01, CODE-02, CODE-03)
- Grep checks: all acceptance criteria confirmed

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] mcp-server/src/utils.ts modified (contains RATE_LIMIT_MAX_SIZE, atomicWriteDirs, updated getKnowledgeDir)
- [x] mcp-server/src/index.ts modified (contains atomicWriteDirs re-export, updated cleanupOrphanedTempFiles)
- [x] mcp-server/src/index.test.ts modified (contains CODE-01, CODE-02, CODE-03 describe blocks)
- [x] Commit afa3c3b: feat(02-01) implementation
- [x] Commit e586fa2: test(02-01) tests

## Self-Check: PASSED
