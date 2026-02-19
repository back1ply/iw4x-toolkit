# TODO

## Phase 1 — Core Tools (Current)

### Done

- [x] MCP server with 5 IWD tools (`iwd_list`, `iwd_read`, `iwd_write`, `iwd_remove`, `iwd_diff`)
- [x] DVAR knowledge base — 1,731 entries, 89 manually enriched
- [x] DVAR lookup skill with FPS optimization guide
- [x] Auto-backup on first IWD modification per session
- [x] Atomic writes (write to `.tmp`, then rename)
- [x] Binary detection for known IW engine formats
- [x] CRC32-based diff (no decompression needed)
- [x] Plugin manifest and MCP config

- [x] Published to GitHub (`back1ply/iw4x-toolkit`) with marketplace.json
- [x] Fixed ESM `__dirname` crash (replaced with `import.meta.url` + `fileURLToPath`)
- [x] Added `zod` as explicit dependency (was implicit)
- [x] Fixed plugin.json skills path and cleaned up marketplace.json to match specs

- [x] Expanded SOURCES.md with 50+ references across the IW engine modding ecosystem

- [x] `iwd_grep(path, pattern, [entry_glob], [is_regex], [max_matches])` — search all text entries for a pattern; case-insensitive literal by default, regex mode available; skips binary entries; results capped at `max_matches` (default 50) to prevent context flood
- [x] `iwd_patch(path, entry, old, new, [count], [dry_run])` — surgical string replacement; returns ±3-line diff for verification; `count=-1` replaces all occurrences; `dry_run=true` to preview without writing; backup on first modification
- [x] `iwd_info(path, entry)` — entry metadata (size, CRC, type) before reading; warns if binary or large (>50 KB)
- [x] `iwd_read` — added `limit` and `offset` params for line-based pagination of large files
- [x] `iwd_list` — added `pattern` glob filter and `names_only` flag for token-efficient output
- [x] `globToRegex` helper — tokenizer-based glob→regex; unit tested
- [x] LLM-friendly error messages across all tools (actionable Tips, exact entry paths, case-sensitivity notes)

**Polish pass (2026-02-19):**
- [x] `openIwd()` helper — centralised file-not-found + corrupt-ZIP error handling for all tools
- [x] `dry_run=true` on `iwd_write`, `iwd_patch`, `iwd_remove`, `iwd_extract`, `iwd_rename`, `iwd_copy`
- [x] `iwd_write` — returns ±3-line diff snippet when replacing existing text entries
- [x] `iwd_remove` — reports CRC and size of removed entry in success message
- [x] `iwd_diff` — added `entry_glob` filter and `content_diff=true` option for line-level diffs on modified entries
- [x] `iwd_extract(path, dest, [entry_glob], [dry_run])` — extract entries to disk for use with native shell tools (rg, fd, etc.)
- [x] `iwd_rename(path, entry, নতুন_entry, [dry_run])` — atomic rename/move of an entry within an archive
- [x] `iwd_copy(src_path, src_entry, dst_path, dst_entry, [overwrite], [dry_run])` — copy entries between archives or within the same archive
- [x] Test suite expanded from 48 → 75 tests

**Audit & efficiency pass (2026-02-19):**
- [x] `iwd_grep` truncation off-by-one fixed — output now strictly respects `max_matches`
- [x] `entryNotFoundErr` helper — single unified error message across all 6 entry-not-found paths (DRY)
- [x] `buildDiffSnippet` `hintLine` param — `iwd_patch` diff now centred on actual replacement line, not line 0
- [x] `iwd_extract` — cleans up partially written files on failure before returning error
- [x] `iwd_list` — `names_only=true` is now the **default** (compact by default, verbose on request)
- [x] `iwd_list` — new `summary_only=true` mode: one-line extension breakdown (e.g. `45 .gsc, 12 .menu, 8 binary`)
- [x] `buildDiffSnippet` unit tests (4 tests: identical, last-line, EOF addition, hintLine centering)
- [x] `mcp-server/evals/evaluation.xml` — mcp-builder Phase 4 evaluation harness (10 read-only Q&A pairs)
- [x] `docs/WORKFLOW.md` — vibe-coder workflow guide: 4 golden paths, anti-pattern table, copy-paste LLM session primer
- [x] Fuzzing Unit Tests — robust corrupt/invalid archive rejection directly against `openIwd`
- [x] True E2E "Prompt" Testing — successful simulation of LLM context boundaries solving a real promod modding puzzle (Allow Famas)
- [x] Test suite expanded from 75 → 99 tests

### Remaining (Phase 1 Finish Line)
*Before moving to advanced tools, we must finish enriching the foundational data.*

- [ ] Build `knowledge/gsc-builtins.json` — GSC built-in function reference. Primary source: CoD4/WaW official docs.
- [ ] Build `knowledge/menu-properties.json` — valid menuDef/itemDef properties
- [ ] Enrich more DVARs — currently 89/1,731 have manual descriptions. Priority targets:
  - [ ] All `sm_*` shadow map DVARs (12 total, only 6 enriched)
  - [ ] All `snd_*` sound DVARs (descriptions + performance notes)
  - [ ] Network DVARs (`rate`, `cl_maxpackets`, `snaps`, `sv_maxRate`) with competitive tuning notes
  - [ ] Gametype script DVARs (`scr_sd_*`, `scr_dom_*`, etc.) with promod-relevant values
- [ ] **DVAR Search Tool** — Server-side filtering (`dvar_search`) to avoid token limits.

---

## Phase 2 — Language Tooling (The Enabler)

*We cannot build LLM Agentic workflows without static analysis to catch syntax errors. This phase provides the building blocks.*

### 2A: GSC Tokenizer & Formatter
- [ ] Build a tokenizer (lexer) for GSC (References: `Muhlex/vscode-gsc`, `xensik/gsc-tool`)
- [ ] Build a simple formatter operating on token streams
- [ ] Expose as `gsc_format` MCP tool

### 2B: GSC Linter
*Uses the Tokenizer from 2A.*
- [ ] Undefined variable usage (used before assignment)
- [ ] Missing `#include` for built-in calls (References `knowledge/gsc-builtins.json` from Phase 1)
- [ ] Unreachable code after `return`/`break`/`continue`
- [ ] Infinite loops without `endon` or `wait`
- [ ] Brace/parentheses mismatched scope
- [ ] Expose as `gsc_lint` MCP tool

### 2C: Menu File Validator
- [ ] Brace matching (most common error)
- [ ] Required property validation per item type (`itemDef`, `menuDef`) using `knowledge/menu-properties.json` from Phase 1.
- [ ] `exp` expression syntax validation
- [ ] `dvar` references cross-checked against DVAR knowledge base

---

## Phase 3 — Agentic Workflows ("Vibe Code" & "Pro" Personas)

*Leverages the strong analysis foundation built in Phase 2 to create true autonomous LLM modification workflows.*

### The "Vibe Coding" Enthusiast
Built for LLMs driving development with minimal user expertise.
- [ ] **Dynamic Context Loader Tool** — (`gsc_context <topic>`) that fetches relevant syntax examples from `iw4x-rawfiles` based on semantic search, reducing hallucination.
- [ ] **"God Prompt" Templates** — Actionable CLI templates that standardize the "explore first, then execute" vibe coding pattern.
- [ ] **Sandbox Auto-Setup** — Automatically bootstrap a `fs_game/userraw` environment when starting a new mod.

### The Experienced Modder
Built to turbo-charge developers who know what they want.
- [ ] **Loose-File Toolkit** — MCP tools for the `userraw/` loose-file system (`userraw_read`, `userraw_write`).
- [ ] **GSC Linter CI Pipeline** (Requires Phase 2B) — Allow the LLM to run a continuous loop: Write Code -> Run `gsc_lint` -> Read Errors -> Fix Syntax -> Repeat, autonomously.
- [ ] **DVAR Constraints Validator** — Warn the LLM immediately if it assigns a string to a numeric DVAR using Phase 1 knowledge base.

---

## Phase 4 — Long-Term / Pipeline Ideas

*Features that automate the final leg of deployment or require complex external executables.*

- [ ] **Mod Packager** — Package a `userraw/` directory into the correct `.iwd` folder structure with validation.
- [ ] **OpenWarfare Analysis** — Study OpenWarfare source to extract "lost" admin/gameplay scripts for modern IW4x.
- [ ] **Server Config Generator** — Generate `server.cfg` from structured input using DVAR knowledge base.
- [ ] **Weapon File Editor** — Parse and edit weapon definition files with type-safe validation using a compiled `knowledge/weapon-defs.json`.
