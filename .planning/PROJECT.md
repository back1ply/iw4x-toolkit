# iw4x-toolkit

## What This Is

A Claude Code plugin and MCP server that exposes IW4X/MW2 modding tools to AI assistants. It provides IWD archive manipulation, GSC language tooling (lint, format, outline, symbols), a 1,731-entry DVAR knowledge base, and GSC built-in references — all designed to let an AI agent work confidently with MW2 mod files without hallucinating engine behavior.

This milestone is a **polish pass**: harden the existing Phase 1 foundation (docs accuracy, code gaps, test coverage, incomplete tools, arch quality) before advancing to Phase 2 language tooling.

## Core Value

Every tool in the toolkit must work correctly and be accurately described — no phantom tools, no silent failures, no undocumented limitations — so Phase 2 can build on a trustworthy base.

## Requirements

### Validated

- ✓ IWD archive tools (`iwd_list`, `iwd_read`, `iwd_write`, `iwd_remove`, `iwd_diff`, `iwd_grep`, `iwd_patch`, `iwd_info`, `iwd_extract`, `iwd_rename`, `iwd_copy`) — existing
- ✓ GSC tooling (`gsc_lint`, `gsc_format`, `gsc_outline`, `gsc_symbols`, `gsc_lookup`, `gsc_template`) — existing
- ✓ DVAR knowledge base — 1,731 entries with `dvar_search` — existing
- ✓ Atomic writes, auto-backup, binary detection, CRC diff — existing
- ✓ 99 passing tests (vitest) — existing
- ✓ Plugin manifest, marketplace.json, skills — existing
- ✓ Codebase map (`.planning/codebase/`) — existing

### Active

- [ ] README accurately reflects implemented tool set (no phantom tools)
- [ ] Tools claimed in README but unimplemented are either built or removed from README (`gsc_find_orphans`, `dvar_integrity_check`, `iwd_index_symbols` status resolved)
- [ ] Known code gaps from CONCERNS.md addressed: rate limiter map unbounded growth, orphaned temp cleanup CWD assumption, `getKnowledgeDir()` path fragility
- [ ] Test coverage filled for untested paths (linter edge cases, formatter, knowledge cache)
- [ ] Code/arch polish: any structural issues or inconsistencies cleaned up
- [ ] `docs/TODO.md` updated to reflect a clear Phase 2 priority order
- [ ] All tests pass after polish changes

### Out of Scope

- Phase 2C (menu file validator) — needs `menu-properties.json` and design work
- Phase 2D (IWI image tools) — separate milestone
- Phase 2E (FastFile scanner) — separate milestone
- Phase 3 agentic workflows (userraw, smart_read, scan_environment) — separate milestone
- AST-based GSC linter rewrite — long-term debt, not this pass

## Context

- Brownfield: MCP server at `mcp-server/src/`, fully built and published at `back1ply/iw4x-toolkit`
- Stack: TypeScript 5.7, MCP SDK 1.12.1, adm-zip, zod, vitest, esbuild
- README describes an aspirational tool list that may be ahead of implementation
- CONCERNS.md documents known fragile areas logged during development
- `docs/TODO.md` is the authoritative task log; polish items live under "Remaining (Phase 1 Finish Line)" and "Technical Debt"
- The project is a personal modding tool that also serves as a published Claude Code plugin

## Constraints

- **Compatibility**: No breaking changes to existing tool schemas — Claude Code plugin users may depend on current parameter names
- **Scope**: Polish only — no Phase 2 features in this milestone
- **Testing**: All changes must maintain or increase the 99-test passing baseline
- **Docs**: README and CONTRIBUTING.md must reflect reality, not aspirations

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Polish-first before Phase 2 | Solid ground prevents tech debt from compounding across phases | — Pending |
| Resolve phantom tools (build or remove) | README listing unimplemented tools misleads users and future planning | — Pending |

---
*Last updated: 2026-03-22 after initialization*
