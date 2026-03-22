# Phase 1: Docs & Accuracy - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

README and supporting docs reflect exactly what is implemented — no phantom tools, no stale descriptions. Scope is audit + edit of documentation files only. No new features, no code changes except as strictly required to resolve phantom tools (and in this phase, all phantom tools are removed rather than built).

</domain>

<decisions>
## Implementation Decisions

### Phantom tool resolution
- `gsc_find_orphans` → **Remove from README** — scoped to Phase 2 (REQUIREMENTS.md P2-03); not yet implemented
- `dvar_integrity_check` → **Remove from README** — scoped to Phase 2 (REQUIREMENTS.md P2-04); not yet implemented
- `iwd_index_symbols` → **Remove from README** — no current milestone requirement; not yet implemented
- `gsc_menu_hud` → **Keep in README** — confirmed implemented in `mcp-server/src/knowledge/tools.ts:251`, backed by `knowledge/gsc-menu-hud.json`, has 9 tests; `menu-properties.json` is a separate future enhancement, not a blocker

### Missing tools to add to README
- `gsc_symbols` → **Add to README** under GSC tools — implemented in `gsc/symbols.ts`, registered in `gsc/tools.ts`
- `mods_sync` → **Add to README** — registered in `iwd/sync-tools.ts`, copies loose files to mods/<modname> directory
- `userraw_sync` → **Add to README** — registered in `iwd/sync-tools.ts`, copies loose files to userraw directory
- Grouping: add `mods_sync` and `userraw_sync` as a new "Sync Tools" category or alongside IWD tools (Claude's discretion on exact placement)

### Implementation details accuracy
- **Full audit** of the entire "Implementation details" section — fix every stale or inaccurate claim, not just known issues
- Fix "Caching is limited to 3 concurrent archives" → actual LRU cap is **10 entries** (`utils.ts`)
- Fix "asynchronously renamed" description of atomic writes → adm-zip ops are **synchronous**; description must be technically accurate
- Standard: every claim in the section must match the actual code behavior

### docs/TODO.md Phase 2 structure
- Mirror ROADMAP.md phase structure — Phase 2 section for Code Gaps, Phase 3 section for Tests & Arch Quality
- **Code gaps first** within Phase 2: CODE-01 (rate limiter eviction), CODE-02 (temp cleanup scan locations), CODE-03 (getKnowledgeDir path hardening)
- Phase 2 new tools (gsc_find_orphans, dvar_integrity_check) follow the hardening items
- Phase 3 section: TEST-01 (formatter), TEST-02 (knowledge cache), TEST-03 (linter edge cases), ARCH-01 (exports), ARCH-02 (all tests green)

### Claude's Discretion
- Exact wording of README descriptions for mods_sync and userraw_sync
- Whether to use a "Sync Tools" header or fold them under IWD tools in the README quick list
- Minor phrasing fixes in the Implementation details section (beyond the identified stale claims)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `.planning/ROADMAP.md` — phase breakdown, success criteria, requirement IDs per phase
- `.planning/REQUIREMENTS.md` — full requirement list; DOCS-01 through DOCS-04 are in scope for this phase

### Known fragile areas and stale claims
- `.planning/codebase/CONCERNS.md` — documents fragile areas, technical debt, and known code behavior (source of truth for what the implementation actually does)

### Tool implementations to verify against
- `mcp-server/src/knowledge/tools.ts` — gsc_menu_hud registered at line 251
- `mcp-server/src/iwd/sync-tools.ts` — mods_sync and userraw_sync registered
- `mcp-server/src/gsc/tools.ts` — gsc_symbols registered
- `mcp-server/src/utils.ts` — IWD LRU cache (10-entry cap, not 3)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- No code is being written in this phase — this is a docs-only phase

### Established Patterns
- Tool names follow `domain_verb` pattern (e.g., `iwd_list`, `gsc_lint`, `dvar_search`)
- README tool quick list groups by domain: IWD tools, GSC tools, DVAR tools — Sync Tools will be a new group

### Integration Points
- README tool list at top of README (around line 37–40 in current file)
- README "Implementation details" section (near end of README)
- `docs/TODO.md` — Phase 1 done items exist; Phase 2/3 sections need to be added

</code_context>

<specifics>
## Specific Ideas

- No specific references or "I want it like X" moments — straightforward audit and cleanup pass

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-docs-accuracy*
*Context gathered: 2026-03-22*
