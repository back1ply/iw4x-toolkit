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
- [x] Test suite — 27 tests via vitest (unit + integration via MCP in-memory transport)
- [x] Fixed plugin.json skills path and cleaned up marketplace.json to match specs

- [x] Expanded SOURCES.md with 50+ references across the IW engine modding ecosystem

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
