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
- [x] `iwd_rename(path, entry, new_entry, [dry_run])` — atomic rename/move of an entry within an archive
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
- [x] Test suite expanded from 75 → 81 tests

### Remaining

- [ ] Build `knowledge/gsc-builtins.json` — GSC built-in function reference
  - Sources: Zeroy Wiki scripting reference, X Labs GSC functions, leafized/GSC-Functions, iw4x-rawfiles, xensik/gsc-tool grammars
  - Use GitHub MCP to pull real function signatures from repos
  - Schema per function: name, calledOn (level/player/entity/global), params, returnType, description, category
  - Expose as `iw4x://gsc-builtins` MCP resource, add `gsc-lookup` skill
- [ ] Build `knowledge/weapon-defs.json` — weapon property reference from IW4 rawfiles
- [ ] Build `knowledge/fastfile-assets.json` — asset type index from Zeroy Wiki
- [ ] Build `knowledge/menu-properties.json` — valid menuDef/itemDef properties
- [ ] Enrich more DVARs — currently 89/1,731 have manual descriptions. Priority targets:
  - [ ] All `sm_*` shadow map DVARs (12 total, only 6 enriched)
  - [ ] All `snd_*` sound DVARs (descriptions + performance notes)
  - [ ] Network DVARs (`rate`, `cl_maxpackets`, `snaps`, `sv_maxRate`) with competitive tuning notes
  - [ ] Gametype script DVARs (`scr_sd_*`, `scr_dom_*`, etc.) with promod-relevant values
- [ ] Add DVAR search tool (server-side filtering) so Claude doesn't need to load the full 440KB JSON into context
- [ ] Test on larger IWD files (iw_00.iwd through iw_23.iwd are 50-200MB each)

---

## Phase 2 — GSC Formatter

A tokenizer and pretty-printer for GSC (Game Script Code) files.

### Goals

- Format minified/compressed GSC into readable, indented code
- Preserve comments and string literals
- Handle GSC-specific syntax: `/#`, `#include`, `#using_animtree`, `waittill`, `notify`, `endon`, `thread`, `[[ ]]` function pointers
- Configurable indent style (tabs vs spaces, size)

### References

- `Muhlex/vscode-gsc` — TypeScript tokenizer for IW3/IW4 GSC
- `xensik/gsc-tool` — Bison grammar (most complete formal spec)

### Approach

1. Build a tokenizer (lexer) for GSC
2. Build a simple formatter that operates on token streams (no full AST needed)
3. Expose as `gsc_format` MCP tool

---

## Phase 2 — GSC Linter

Static analysis rules for GSC scripts.

### Planned rules

- [ ] Undefined variable usage (variable used before assignment in scope)
- [ ] Missing `#include` for built-in function calls
- [ ] Unreachable code after `return`/`break`/`continue`
- [ ] `wait` / `waittill` in potentially infinite loops without `endon`
- [ ] String literal issues (missing closing quote, invalid escape)
- [ ] Brace/parenthesis mismatch
- [ ] Duplicate function definitions in same file
- [ ] `self` usage outside of entity context

### Approach

1. Build a recursive descent parser from the GSC grammar
2. Implement lint rules as AST visitors
3. Expose as `gsc_lint` MCP tool returning diagnostics with line numbers

---

## Phase 2 — Menu File Validator

Validate `.menu` files used for IW4 UI definitions.

### Planned checks

- [ ] Brace matching (most common error in menu editing)
- [ ] Required property validation per item type (`itemDef`, `menuDef`)
- [ ] Unknown property warnings
- [ ] Duplicate `name` detection within a menu
- [ ] `rect` value validation (x y w h align-h align-v)
- [ ] `exp` expression syntax validation
- [ ] `dvar` references cross-checked against DVAR knowledge base

### References

- `aerosoul94/IWMenuDumper` — C struct definitions for menu format
- IW4 menu files in `ui_mp/` — real-world examples

---

## Phase 3 — Ideas

- [ ] **IWD Creator** — `iwd_create` tool to build a new IWD from a directory
- [ ] **Fastfile Inspector** — Read zone files (.ff) to list assets (would need custom parser, complex)
- [ ] **GSC Decompiler Integration** — Wrap `xensik/gsc-tool` decompiler for reading compiled GSC from fastfiles
- [ ] **Server Config Generator** — Generate `server.cfg` from structured input using DVAR knowledge base
- [ ] **Mod Packager** — Package a mod directory into the correct IWD/folder structure with validation
- [ ] **Weapon File Editor** — Parse and edit weapon definition files with type-safe validation
