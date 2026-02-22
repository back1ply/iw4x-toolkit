# Priority Comparison: Current vs. Proposed

## Context
- **Primary users**: LLMs doing vibe coding with humans
- **Goal**: High-quality functional GSC scripts
- **Protocol**: MCP-only (not CLI)

---

## Current TODO Order (from docs/TODO.md)

### Phase 1 — Core Tools (Current Focus)
- [x] MCP server with 5 IWD tools (`iwd_list`, `iwd_read`, `iwd_write`, `iwd_remove`, `iwd_diff`)
- [x] DVAR knowledge base — 1,731 entries, 89 manually enriched
- [x] DVAR lookup skill with FPS optimization guide
- [x] `iwd_grep`, `iwd_patch`, `iwd_info`, `iwd_extract`, `iwd_rename`, `iwd_copy`
- [ ] Build `knowledge/gsc-builtins.json` — GSC built-in function reference
- [ ] Build `knowledge/menu-properties.json` — valid menuDef/itemDef properties
- [ ] Enrich more DVARs
- [ ] **DVAR Search Tool** — Server-side filtering (`dvar_search`)

### Phase 2 — Language Tooling (The Enabler)
- 2A: GSC Tokenizer & Formatter
- 2B: GSC Linter ← **Currently Phase 2!**
- 2C: Menu File Validator
- 2D: FastFile (.ff) Asset Scanner

### Phase 3 — Agentic Workflows
- Dynamic Context Loader
- "God Prompt" Templates
- Sandbox Auto-Setup
- Loose-File Toolkit ← **Currently Phase 3!**

---

## Proposed New Priority (User-Feedback Driven)

| Rank | Feature | Notes |
|------|---------|-------|
| **#1** | **GSC Linter** | Syntax errors, undefined vars, bad patterns — TOP PRIORITY |
| **#2** | **userraw/ File Ops** | Read/write GSC in loose-file structure |
| **#3** | **Template Snippets** | Common patterns LLM can generate from |
| **#4** | **GSC Builtins Lookup** | Function reference for autocomplete |
| **#5** | DVAR Reference | Lower priority than GSC quality |
| **#6** | IWD Tools | Keep existing, but not the focus |

---

## Key Changes

1. **GSC Linter moves from Phase 2 → Phase 1 (TOP)**
   - Critical for vibe coding: LLM writes code → linter catches errors
   
2. **userraw/ moves from Phase 3 → Phase 2**
   - Preferred workflow over IWD editing
   - Safer, faster iteration

3. **Template Snippets added (new)**
   - Common GSC patterns: player connect, killstreak, loadout, etc.

4. **DVAR Reference lowered priority**
   - Useful but not critical for writing quality scripts

5. **IWD tools deprioritized**
   - Already implemented
   - userraw/ is the preferred workflow anyway

---

## Recommended New Roadmap

### Phase 1 — GSC Quality Foundation (NEW #1)
- [ ] **GSC Linter** — syntax, undefined variables, bad patterns
- [ ] **userraw/ File Tools** — `userraw_read`, `userraw_write`, `userraw_list`
- [ ] **Template Library** — common GSC patterns/snippets

### Phase 2 — Knowledge & References
- [ ] GSC Builtins Lookup (expand `gsc-builtins.json`)
- [ ] DVAR Search (existing, but lower priority)
- [ ] Template expansion (more patterns)

### Phase 3 — Advanced Features
- [ ] Menu File Validator
- [ ] Agentic workflows
- [ ] IWD packaging (when needed)

---

*Generated from user feedback session — 2026-02-22*
