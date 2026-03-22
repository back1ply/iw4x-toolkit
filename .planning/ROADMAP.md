# Roadmap: iw4x-toolkit Polish Pass

## Overview

A brownfield polish pass across docs, code gaps, and test coverage. Every Phase 1 foundation item is hardened before Phase 2 language tooling begins. Three coarse phases deliver: accurate docs, resilient code, and a fully green test suite.

## Phases

- [ ] **Phase 1: Docs & Accuracy** - README matches implementation exactly; phantom tools resolved
- [ ] **Phase 2: Code Gaps** - Rate limiter, temp cleanup, and path resolution hardened
- [ ] **Phase 3: Tests & Arch Quality** - Formatter, cache, and linter edge cases covered; all tests green

## Phase Details

### Phase 1: Docs & Accuracy
**Goal**: README and supporting docs reflect exactly what is implemented — no phantom tools, no stale descriptions
**Depends on**: Nothing (first phase)
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04
**Success Criteria** (what must be TRUE):
  1. Every tool listed in README has a corresponding implementation; no tool is listed that does not exist
  2. `gsc_find_orphans`, `dvar_integrity_check`, and `iwd_index_symbols` each have a clear resolution: either built and listed, or removed from README
  3. README "Implementation details" section matches current code behavior (no stale claims)
  4. `docs/TODO.md` shows a clear, prioritized Phase 2 order that reflects current project state
**Plans**: TBD

### Phase 2: Code Gaps
**Goal**: The three fragile code paths from CONCERNS.md are hardened so the server cannot silently leak memory, leave temp files, or fail to locate its knowledge base
**Depends on**: Phase 1
**Requirements**: CODE-01, CODE-02, CODE-03
**Success Criteria** (what must be TRUE):
  1. Rate limiter Map cannot grow without bound — entries are evicted or the structure has a size cap
  2. Orphaned temp file cleanup scans write locations rather than CWD, so no temp files are left behind regardless of working directory
  3. `getKnowledgeDir()` resolves correctly when the package is bundled or relocated (not tied to source tree assumptions)
**Plans**: TBD

### Phase 3: Tests & Arch Quality
**Goal**: Untested paths have coverage, structural inconsistencies are eliminated, and all 99+ tests pass after every change in this milestone
**Depends on**: Phase 2
**Requirements**: TEST-01, TEST-02, TEST-03, ARCH-01, ARCH-02
**Success Criteria** (what must be TRUE):
  1. `gsc/formatter.ts` has vitest unit tests that cover its formatting logic
  2. Knowledge cache mtime/TTL logic has vitest unit tests that exercise cache hit, miss, and expiry
  3. Linter edge cases identified in CONCERNS.md each have a corresponding test
  4. Module exports match their actual usage — no dead exports, no undocumented public API surface
  5. `vitest run` exits green with ≥99 passing tests after all Phase 1–3 changes
**Plans**: TBD

## Progress

**Execution Order:** 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Docs & Accuracy | 0/? | Not started | - |
| 2. Code Gaps | 0/? | Not started | - |
| 3. Tests & Arch Quality | 0/? | Not started | - |
