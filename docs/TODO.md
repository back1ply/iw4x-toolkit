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

- [x] Build `knowledge/gsc-builtins.json` — GSC built-in function reference. v1.1.0, 80 functions. Source: X-Labs, CoD4x, Zeroy wikis.
- [ ] Build `knowledge/menu-properties.json` — valid menuDef/itemDef properties
- [ ] Enrich more DVARs — currently 89/1,731 have manual descriptions. Priority targets:
  - [ ] All `sm_*` shadow map DVARs (12 total, only 6 enriched)
  - [ ] All `snd_*` sound DVARs (descriptions + performance notes)
  - [ ] Network DVARs (`rate`, `cl_maxpackets`, `snaps`, `sv_maxRate`) with competitive tuning notes
  - [ ] Gametype script DVARs (`scr_sd_*`, `scr_dom_*`, etc.) with promod-relevant values
- [ ] **DVAR Search Tool** — Server-side filtering (`dvar_search`) to avoid token limits.

---

## Technical Debt / Code Quality

*Low-priority but high-value improvements to the MCP server internals. None of these are blockers — log them here to avoid losing them.*

- [ ] **AST-based GSC linter** — migrate from token-stream heuristics to a proper AST parser for accurate scope tracking, variable shadowing, and dead code analysis. Current `braceDepth` tracking is fragile.
- [ ] **Proactive cache invalidation** — replace the synchronous `fs.statSync` mtime check in `openIwd()` with `fs.watch` to avoid I/O overhead on every tool call when files are modified externally.
- [ ] **Parallel archive extraction** — `iwd_extract` writes files sequentially. Switch to `Promise.all` with a concurrency cap to speed up large archive extraction.
- [ ] **Streaming large file reads** — `iwd_read` loads the entire entry into memory before slicing. For large files, stream the buffer and count newlines on the fly to avoid V8 memory spikes.
- [ ] **Structured error types** — `Result<T>` uses plain `string` for errors. Define a discriminated union `ErrorCode` (`FILE_NOT_FOUND`, `CORRUPT_ARCHIVE`, etc.) to allow programmatic error handling if retry logic is ever needed.

---

## Phase 2 — Language Tooling (The Enabler)

*We cannot build LLM Agentic workflows without static analysis to catch syntax errors. This phase provides the building blocks.*

### 2A: GSC Tokenizer & Formatter ✅
- [x] Build a tokenizer (lexer) for GSC — `mcp-server/src/gsc/tokenizer.ts` (adapted from `Muhlex/vscode-gsc`)
- [x] Expose as `gsc_format` MCP tool
- [ ] Build a standalone formatter operating on token streams

### 2B: GSC Linter ✅
*Uses the Tokenizer from 2A.*
- [x] Undefined variable usage (used before assignment)
- [x] Missing `#include` / undefined function calls (cross-references `knowledge/gsc-builtins.json`)
- [x] Unreachable code after `return`/`break`/`continue`
- [x] Infinite loops without `endon` or `wait`
- [x] Brace/parentheses mismatched scope
- [x] Expose as `gsc_lint` MCP tool — `mcp-server/src/gsc/linter.ts` + `tools.ts`

### 2C: Menu File Validator
- [ ] Brace matching (most common error)
- [ ] Required property validation per item type (`itemDef`, `menuDef`) using `knowledge/menu-properties.json` from Phase 1.
- [ ] `exp` expression syntax validation
- [ ] `dvar` references cross-checked against DVAR knowledge base

### 2D: IWI Image Tools
*Give LLMs and scripts direct access to the texture assets stored inside IWD archives.*

IWD files are standard ZIP archives whose `images/` entries are IW-engine `.iwi` textures.
All research and a working Python reference implementation exist at
`F:/Shehab Projects/mw2-class-editor/extract_hud_all.py`.

#### 2D-1 — `iwd_image_scan` (IWD image manifest)
- [ ] Scan every `images/*.iwi` entry in an IWD matching an optional name prefix/glob
- [ ] Return a manifest: `{ name, width, height, format, source_iwd }` per image
- [ ] Accept multiple IWD paths so callers can collate across `aw03`, `aw06`, `iw_dlc5_00`, etc.
- [ ] Deduplicate by image name — last IWD wins (same rule used in the game's load order)
- [ ] Filter helpers: `prefix` (e.g. `hud_`, `specialty_`), `min_width`, `min_height`

#### 2D-2 — `iwd_image_extract` (IWI → PNG)
- [ ] Extract one or more images from IWD(s) by name or glob and write them as PNGs
- [ ] Supported IWI formats to implement (all confirmed present in MW2):
  - `0x73` / `0x0D` → **DXT5** (BC3) — most HUD and specialty icons
  - `0x0B` → **DXT1** (BC1) — some overlay textures
  - `0x71` → **DXT5 with full mip chain** (smallest-first; seek to tail for main image)
  - `0x00` / `0x01` → **ARGB8888** uncompressed
- [ ] `out_dir` parameter — destination folder; preserves original name (strips `.iwi`, adds `.png`)
- [ ] `dry_run` mode — returns manifest without writing files
- [ ] Returns a summary: `{ extracted: N, failed: [{ name, reason }] }`

#### Key IWI format facts (from empirical analysis)
```
Header (32 bytes):
  [0-2]  "IWi"         magic
  [3]    0x08          version (MW2)
  [4]    format byte   0x73/0x0D=DXT5, 0x0B=DXT1, 0x71=DXT5+mips, 0x00/0x01=ARGB
  [10-11] uint16 LE    width
  [12-13] uint16 LE    height
  [16-31] mip offsets  (uint32 LE, counted from file start; 0x71 stores smallest-first)
Data at byte 32: DXT blocks (4×4 pixels, 16 bytes/block DXT5, 8 bytes/block DXT1)
```

### 2E: FastFile (.ff) Asset Scanner
*Borrow from open-source to give LLMs read-access to compiled assets.*
- [ ] Investigate wrapping/integrating C# `OpenAssetTools` or `ZoneTool` to extract data from `.ff` and `.d3dbsp` files (e.g. reading map spawn coordinates).
- [ ] Note: MW2 FF files (`IWff0100`) use a non-standard compression (not zlib/deflate).
      Images referenced in FF files are loaded from IWD archives at runtime — pixel data
      lives in IWDs, not embedded in the FF. FF parsing is needed only for asset name
      enumeration and non-image assets (scripts, materials, spawns).

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
- [ ] **Loose-File Toolkit** — MCP tools for the `userraw/` loose-file system (`userraw_read`, `userraw_write`, `userraw_list`, `userraw_grep`, `userraw_patch`).
- [ ] **GSC Linter CI Pipeline** — LLM autonomous loop: Write Code → `gsc_lint` → Read Errors → Fix → Repeat.
- [ ] **DVAR Constraints Validator** — Warn immediately if a string is assigned to a numeric DVAR.
- [ ] **Live Server RCON** — `rcon_send(command)`, `rcon_read_log()` to inject test commands (`map_restart`, `give all`) and read live server console output; enables iterative GSC debugging without alt-tabbing.

### Smart Workflow Tools (Token Efficiency)
- [ ] **`scan_environment`** — One-call environment summary: IWDs in `mods/`, userraw contents, file counts. Replaces manual exploration at session start.
- [ ] **`file_locate`** — Unified search across all IWDs + userraw in one call; reports which location takes precedence (userraw wins over IWD).
- [ ] **`smart_read`** — Reads from userraw if an override exists, falls back to IWD. Prevents editing the wrong copy.
- [ ] **`smart_deploy`** — Writes to best location (userraw by default; `target=iwd` for production builds).

---

## Phase 4 — Long-Term / Pipeline Ideas

*Features that automate the final leg of deployment or require complex external executables.*

- [ ] **Cross-Title Linter Architecture** — Ensure the Phase 2 IW4 Linter architecture is modular enough that the community could later adapt it to officially support CoD4 (IW3) and WaW (T4) GSC dialects.
- [ ] **Spec-Ops / Campaign Expansion** — Expand `gsc-builtins.json` to include single-player (`sp/`) and Spec-Ops (`so/`) specific entity functions.
- [ ] **Mod Packager** — Package a `userraw/` directory into the correct `.iwd` folder structure with validation.
- [ ] **OpenWarfare Analysis** — Study OpenWarfare source to extract "lost" admin/gameplay scripts for modern IW4x.
- [ ] **ZoneBuilder Integration** — "Borrow" open-source tools to enable automated `.ff` (FastFile) compilation directly through the LLM.
- [ ] **Server Config Generator** — Generate `server.cfg` from structured input using DVAR knowledge base.
- [ ] **Weapon File Editor** — Parse and edit weapon definition files with type-safe validation using a compiled `knowledge/weapon-defs.json`.
- [ ] **FastFile / BSP Asset Reader** — Wrap `OpenAssetTools` or `ZoneTool` to extract data from `.ff` and `.d3dbsp` files (e.g. spawn coordinates); lets the LLM read compiled map assets without opening Radiant.
- [ ] **Semantic GSC Search (RAG)** — Local semantic search over `iw4x-rawfiles` to answer "how does IW handle X?" using actual base game scripts, preventing hallucinated constructs.

---

## Skills Roadmap

*Planned Claude Code skills (slash commands) for domain-specific workflows. Skills are high-leverage: they encode domain rules so LLMs don't re-derive them every session.*

- [ ] **gsc-script-master** — Prevent hallucinated GSC syntax; enforce strict GSC 1.0 rules (`spawn()`, `endon()`, `notify()`, `wait`); cross-reference `knowledge/gsc-builtins.json`; require `gsc_lint` before committing any `.gsc` files.
- [ ] **iw4-ui-engineer** — Master the text-based IW4 UI engine; `menuDef`/`itemDef` syntax, DVAR expression hooking, brace matching rules, `exp` macro formats. Backed by `knowledge/menu-properties.json`.
- [ ] **userraw-sandbox-manager** — Enforce local-first "Development Mode"; deploy/modify files in `userraw/` during iteration; console commands to verify changes (`vid_restart`, `map_restart`).
- [ ] **legacy-code-porter** — Guidelines for migrating OpenWarfare and other community scripts to modern IW4x patterns.
- [ ] **zonebuilder-compiler** — Automate FastFile compilation; rules for valid ZoneBuilder `.csv` payloads (e.g. `rawfile,maps/mp/gametypes/_my_script.gsc`); CLI commands to compile cleanly.
