# Phase 1: Docs & Accuracy - Research

**Researched:** 2026-03-22
**Domain:** Documentation audit and correction (no code changes)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- `gsc_find_orphans` → Remove from README — scoped to Phase 2; not yet implemented
- `dvar_integrity_check` → Remove from README — scoped to Phase 2; not yet implemented
- `iwd_index_symbols` → Remove from README — no current milestone requirement; not yet implemented
- `gsc_menu_hud` → Keep in README — confirmed implemented in `mcp-server/src/knowledge/tools.ts:251`, backed by `knowledge/gsc-menu-hud.json`, has 9 tests
- `gsc_symbols` → Add to README under GSC tools — implemented in `gsc/symbols.ts`, registered in `gsc/tools.ts`
- `mods_sync` → Add to README — registered in `iwd/sync-tools.ts`
- `userraw_sync` → Add to README — registered in `iwd/sync-tools.ts`
- Full audit of "Implementation details" section — fix every stale or inaccurate claim
- Fix "Caching is limited to 3 concurrent archives" → actual LRU cap is 10 entries (`utils.ts`)
- Fix "asynchronously renamed" → adm-zip ops are synchronous; description must be technically accurate
- `docs/TODO.md` must mirror ROADMAP.md phase structure: Phase 2 (Code Gaps) then Phase 3 (Tests & Arch Quality)
- Phase 2 order in TODO.md: CODE-01, CODE-02, CODE-03 first, then gsc_find_orphans, dvar_integrity_check

### Claude's Discretion

- Exact wording of README descriptions for `mods_sync` and `userraw_sync`
- Whether to use a "Sync Tools" header or fold them under IWD tools in the README quick list
- Minor phrasing fixes in the Implementation details section (beyond the identified stale claims)

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOCS-01 | README tool list matches implemented tools exactly (no phantom entries) | Audit maps exact phantom tools to remove and missing tools to add — all changes identified in CONTEXT.md |
| DOCS-02 | Phantom tools resolved — `gsc_find_orphans`, `dvar_integrity_check`, `iwd_index_symbols` either implemented or removed | All three confirmed unimplemented; decision is remove-not-build in this phase |
| DOCS-03 | README "Implementation details" section reflects current code behavior accurately | Two confirmed stale claims identified (cache cap: 3→10, atomic write sync vs async); full section audit required |
| DOCS-04 | `docs/TODO.md` updated with clear Phase 2 priority order | Current TODO.md has no Phase 2/3 sections matching ROADMAP.md structure; full rewrite of those sections needed |
</phase_requirements>

## Summary

This is a pure documentation audit phase — no code is written, no logic changes. The work is: read existing files, find discrepancies between what the README claims and what the code does, and correct the documentation to match reality.

The README currently lists three tools that do not exist (`gsc_find_orphans`, `dvar_integrity_check`, `iwd_index_symbols`) and omits three tools that do exist (`gsc_symbols`, `mods_sync`, `userraw_sync`). The "Implementation details" section contains at least two confirmed factual errors (cache size stated as 3, actual is 10; atomic writes described as asynchronous, actual implementation is synchronous). The `docs/TODO.md` has no Phase 2/3 sections aligned with the ROADMAP.md structure.

All decisions about what to add, remove, and fix are locked in CONTEXT.md. The research task is primarily verification: confirm each decision is grounded in the actual files before the planner creates tasks.

**Primary recommendation:** Three discrete edit tasks — (1) fix the README tool lists, (2) audit and fix Implementation details, (3) rewrite docs/TODO.md Phase 2/3 sections. No external research needed; all source of truth is in the local codebase.

## Standard Stack

This phase involves no libraries, frameworks, or dependencies. The work is text editing of Markdown files.

### Tools in use (for verification, not installation)
| File | Current state | Action |
|------|--------------|--------|
| `README.md` | Lines 7–11: phantom tools in prose; line 40–42: phantom tools in quick list; line 88–96: stale implementation claims | Edit |
| `docs/TODO.md` | Phase 2/3 sections do not match ROADMAP.md structure | Rewrite those sections |

## Architecture Patterns

### Existing README structure (line numbers)
- **Lines 7–11**: "What it does" prose — three paragraphs, each describing a tool category. `gsc_find_orphans` and `dvar_integrity_check` are mentioned in prose here.
- **Lines 40–42**: Quick-reference tool list by category (IWD tools, GSC tools, DVAR tools).
- **Lines 88–96**: "Implementation details" bullet list — the section with confirmed stale claims.

### Tool naming pattern
Tools follow `domain_verb` convention: `iwd_list`, `gsc_lint`, `dvar_search`. New tools `mods_sync` and `userraw_sync` follow this pattern and belong in a "Sync Tools" group or alongside IWD tools.

### README quick list format (line 40–42, current)
```
- **IWD tools**: `iwd_list`, `iwd_read`, ... `iwd_index_symbols`
- **GSC tools**: `gsc_lint`, `gsc_format`, `gsc_find_orphans`, `gsc_lookup`, `gsc_template`, `gsc_outline`, `gsc_menu_hud`
- **DVAR tools**: `dvar_search`, `dvar_integrity_check`
```

After this phase, the list must have:
- IWD tools: remove `iwd_index_symbols`
- GSC tools: remove `gsc_find_orphans`; add `gsc_symbols`
- DVAR tools: remove `dvar_integrity_check`
- New group (Sync Tools or similar): `mods_sync`, `userraw_sync`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Verifying tool existence | Manual grep | Read the registered tool lists in `gsc/tools.ts`, `iwd/sync-tools.ts`, `knowledge/tools.ts` | Single source of truth already exists |
| Verifying cache cap | Assume | Read `utils.ts` directly | CONTEXT.md says 10 but planner should verify line before editing README |

## Common Pitfalls

### Pitfall 1: Editing prose but missing the quick list (or vice versa)
**What goes wrong:** `gsc_find_orphans` appears in two places — the "What it does" prose (line 9) AND the quick list (line 41). Fixing only one leaves a partial phantom entry.
**How to avoid:** Treat README edits as "find all occurrences" tasks, not single-line edits.

### Pitfall 2: Removing too much from docs/TODO.md
**What goes wrong:** The current TODO.md has legitimate done-item history (Phase 1 items) that must be preserved. Only the Phase 2/3 forward-looking sections need to change.
**How to avoid:** Plan specifies adding new sections, not rewriting the whole file. The "Done" section stays intact.

### Pitfall 3: Stale "Implementation details" claims beyond the two known ones
**What goes wrong:** CONTEXT.md identifies two confirmed errors but also mandates a full audit. There may be additional stale claims not yet identified.
**How to avoid:** The planner task for DOCS-03 must include a read-and-verify step for every bullet in lines 88–96, not just the two known fixes.

### Pitfall 4: Wrong characterization of mods_sync / userraw_sync
**What goes wrong:** Writing an inaccurate description of what these tools do without reading `iwd/sync-tools.ts`.
**How to avoid:** Read the tool registration and handler before writing the README description.

## Code Examples

### Confirmed stale claims in README lines 88–89 (current text)
```
- **ZIP operations**: Uses `adm-zip` for all IWD read/write/delete. Caching is limited to 3 concurrent archives to prevent V8 memory bloat.
- **Atomic writes**: Writes are piped to a `.tmp` file first, then asynchronously renamed to the target to prevent corruption on failure while keeping the event loop unblocked.
```

Required fixes (HIGH confidence — source: CONTEXT.md + CONCERNS.md):
- "3 concurrent archives" → "10 entries" (LRU cap in `utils.ts`)
- "asynchronously renamed" → remove the async claim; adm-zip ops are synchronous

### Target docs/TODO.md Phase 2 section structure (from CONTEXT.md)
The new Phase 2 section must contain, in order:
1. CODE-01: Rate limiter eviction
2. CODE-02: Temp cleanup scan locations
3. CODE-03: getKnowledgeDir path hardening
4. Then: gsc_find_orphans (P2-03), dvar_integrity_check (P2-04)

The new Phase 3 section must contain:
- TEST-01: Formatter unit tests
- TEST-02: Knowledge cache unit tests
- TEST-03: Linter edge cases
- ARCH-01: Module exports consistency
- ARCH-02: All tests green (≥99)

## State of the Art

This phase is a brownfield docs cleanup. No external library or framework research is needed.

| Current README claim | Correct state | Confidence |
|---------------------|---------------|------------|
| IWD cache cap: 3 concurrent archives | 10-entry LRU in `utils.ts` | HIGH (CONTEXT.md + CONCERNS.md) |
| Atomic writes: "asynchronously renamed" | adm-zip ops are synchronous | HIGH (CONTEXT.md) |
| `iwd_index_symbols` listed as IWD tool | Not implemented | HIGH (CONTEXT.md) |
| `gsc_find_orphans` listed as GSC tool | Not implemented | HIGH (CONTEXT.md) |
| `dvar_integrity_check` listed as DVAR tool | Not implemented | HIGH (CONTEXT.md) |
| `gsc_symbols` not in README | Implemented in `gsc/symbols.ts` | HIGH (CONTEXT.md) |
| `mods_sync` not in README | Implemented in `iwd/sync-tools.ts` | HIGH (CONTEXT.md) |
| `userraw_sync` not in README | Implemented in `iwd/sync-tools.ts` | HIGH (CONTEXT.md) |

## Open Questions

1. **Exact descriptions for mods_sync and userraw_sync**
   - What we know: Both are registered in `iwd/sync-tools.ts`; `mods_sync` copies loose files to `mods/<modname>`, `userraw_sync` copies to `userraw`
   - What's unclear: The exact parameter signatures and behavior nuances
   - Recommendation: Planner task must include reading `iwd/sync-tools.ts` before writing README copy

2. **Additional stale claims in Implementation details beyond the two known**
   - What we know: Two confirmed errors; full audit mandated
   - What's unclear: Whether other bullets (auto-backup, binary detection, CRC diff, etc.) are still accurate
   - Recommendation: Planner task for DOCS-03 must read each bullet against the actual source before declaring done

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (version from package.json) |
| Config file | `mcp-server/package.json` (scripts.test) |
| Quick run command | `cd mcp-server && npm test` |
| Full suite command | `cd mcp-server && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCS-01 | README tool list matches implementation | manual-only | N/A — docs edit, no code path to test | N/A |
| DOCS-02 | Phantom tools removed | manual-only | N/A — docs edit | N/A |
| DOCS-03 | Implementation details accurate | manual-only | N/A — docs audit | N/A |
| DOCS-04 | TODO.md Phase 2/3 structure correct | manual-only | N/A — docs edit | N/A |

All four DOCS requirements are manual verification tasks — they are documentation edits with no testable code behavior. Nyquist validation does not apply to this phase; all acceptance criteria are human-readable document inspections.

### Sampling Rate
- **Per task commit:** N/A (docs only)
- **Per wave merge:** `cd mcp-server && npm test` — ensure existing 99 tests remain green after any incidental change
- **Phase gate:** Existing test suite green; no new tests required

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements (no new tests needed for docs-only work).

## Sources

### Primary (HIGH confidence)
- `.planning/phases/01-docs-accuracy/01-CONTEXT.md` — all locked decisions, confirmed stale claims, phantom tool resolution
- `.planning/codebase/CONCERNS.md` — LRU cache cap (10), sync I/O characterization
- `README.md` — current state of all claims being changed
- `docs/TODO.md` — current state of TODO before restructure
- `.planning/REQUIREMENTS.md` — DOCS-01 through DOCS-04 definitions
- `.planning/ROADMAP.md` — Phase 2/3 structure that TODO.md must mirror

### Secondary (MEDIUM confidence)
- None required — all decisions sourced from CONTEXT.md

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- What to change: HIGH — all decisions locked in CONTEXT.md, verified against source files
- Exact new wording for mods_sync/userraw_sync: MEDIUM — requires reading `iwd/sync-tools.ts` at plan time
- Completeness of stale claims audit: MEDIUM — two known, full audit may reveal more

**Research date:** 2026-03-22
**Valid until:** Stable indefinitely (docs-only phase, no external dependencies)
