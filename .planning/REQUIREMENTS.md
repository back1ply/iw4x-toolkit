# Requirements: iw4x-toolkit Polish Pass

**Defined:** 2026-03-22
**Core Value:** Every tool in the toolkit must work correctly and be accurately described so Phase 2 can build on a trustworthy base.

## v1 Requirements

### Docs & Accuracy

- [x] **DOCS-01**: README tool list matches implemented tools exactly (no phantom entries)
- [x] **DOCS-02**: Phantom tools resolved — `gsc_find_orphans`, `dvar_integrity_check`, `iwd_index_symbols` either implemented or removed from README
- [x] **DOCS-03**: README "Implementation details" section reflects current code behavior accurately
- [x] **DOCS-04**: `docs/TODO.md` updated with clear Phase 2 priority order

### Code Gaps

- [x] **CODE-01**: Rate limiter `Map` has eviction to prevent unbounded growth
- [x] **CODE-02**: Orphaned temp file cleanup scans write locations, not just CWD
- [x] **CODE-03**: `getKnowledgeDir()` path resolution hardened for bundled/relocated installs

### Tests

- [ ] **TEST-01**: Formatter (`gsc/formatter.ts`) has unit test coverage
- [ ] **TEST-02**: Knowledge cache (mtime/TTL logic) has unit test coverage
- [ ] **TEST-03**: Linter edge cases identified in CONCERNS.md covered

### Arch / Code Quality

- [ ] **ARCH-01**: No structural inconsistencies between module exports and their actual usage
- [ ] **ARCH-02**: All tests pass (≥99 tests green) after all changes

## v2 Requirements

### Phase 2 Prep (deferred — out of scope this milestone)

- **P2-01**: `menu-properties.json` knowledge base built
- **P2-02**: `gsc_menu_hud` tool fully implemented
- **P2-03**: `gsc_find_orphans` tool implemented (cross-file unresolvable call detection)
- **P2-04**: `dvar_integrity_check` tool implemented (DVAR name validation in GSC)

## Out of Scope

| Feature | Reason |
|---------|--------|
| AST-based GSC linter rewrite | Long-term tech debt — not a blocker for Phase 2 |
| Phase 2C menu validator | Requires menu-properties.json design work |
| Phase 2D IWI image tools | Separate milestone |
| Phase 2E FastFile scanner | Requires OpenAssetTools integration research |
| Phase 3 agentic workflows | Builds on Phase 2 foundation |
| DVAR enrichment (more entries) | Ongoing — not a blocker |
| Parallel archive extraction | Performance optimization, not correctness |
| Streaming large file reads | Performance optimization, not correctness |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOCS-01 | Phase 1 | Complete |
| DOCS-02 | Phase 1 | Complete |
| DOCS-03 | Phase 1 | Complete |
| DOCS-04 | Phase 1 | Complete |
| CODE-01 | Phase 2 | Complete |
| CODE-02 | Phase 2 | Complete |
| CODE-03 | Phase 2 | Complete |
| TEST-01 | Phase 3 | Pending |
| TEST-02 | Phase 3 | Pending |
| TEST-03 | Phase 3 | Pending |
| ARCH-01 | Phase 3 | Pending |
| ARCH-02 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after initial definition*
