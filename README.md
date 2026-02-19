# iw4x-toolkit

A Claude Code plugin for IW4X/MW2 modding. Provides direct IWD archive manipulation and a searchable DVAR knowledge base — no more manual extract/edit/repack workflows.

## What it does

**IWD Tools** — Read, write, diff, search, and manage files inside IWD archives (renamed ZIPs used by the IW engine) without extracting them first.

**DVAR Reference** — 1,731 MW2 DVARs catalogued with types, defaults, categories, and FPS impact ratings. 89 key DVARs manually enriched with descriptions.

## Installation

From inside Claude Code:

```
/plugin marketplace add back1ply/iw4x-toolkit
```

Then install the plugin:

```
/plugin install iw4x-toolkit
```

### Building from source

If you clone the repo and want to rebuild the MCP server:

```bash
cd mcp-server
npm install
npm run build
npm test
```

Requires Node.js 18+ and TypeScript 5.7+.

## Tools

| Tool | Parameters | Description |
|------|------------|-------------|
| `iwd_list` | `path`, `[pattern]`, `[summary_only]`, `[names_only]` | List entries. Compact names-only by default. `summary_only=true` for a one-line breakdown by type (e.g. `45 .gsc, 12 .menu, 8 binary`). `names_only=false` to include file sizes |
| `iwd_read` | `path`, `entry`, `[limit]`, `[offset]` | Read a file from an IWD. UTF-8 for text, base64 for binary. `limit`/`offset` for paging large files |
| `iwd_write` | `path`, `entry`, `content`, `[dry_run]` | Write/overwrite a file. Auto-creates `.bak` on first write. Returns a diff snippet on update. `dry_run=true` to validate first |
| `iwd_remove` | `path`, `entry`, `[dry_run]` | Remove a file. Reports CRC and size of removed entry. Auto-backup |
| `iwd_diff` | `path1`, `path2`, `[entry_glob]`, `[content_diff]` | Compare two IWDs — added, removed, modified. Filter by glob; `content_diff=true` for line-level diffs |
| `iwd_info` | `path`, `entry` | Get metadata (size, type, CRC) before reading. Warns if binary or large |
| `iwd_patch` | `path`, `entry`, `old`, `new`, `[count]`, `[dry_run]` | Surgical string replacement. Returns ±3-line diff. `count=-1` = replace all; `dry_run=true` to preview |
| `iwd_grep` | `path`, `pattern`, `[entry_glob]`, `[is_regex]`, `[max_matches]` | Search text entries for a pattern. Case-insensitive by default; `is_regex=true` for regex. Results capped at `max_matches` (default: 50) |
| `iwd_extract` | `path`, `dest`, `[entry_glob]`, `[dry_run]` | Extract entries to a directory for use with shell tools (rg, fd, etc.) |
| `iwd_rename` | `path`, `entry`, `new_entry`, `[dry_run]` | Rename or move an entry within the archive in one operation |
| `iwd_copy` | `src_path`, `src_entry`, `dst_path`, `dst_entry`, `[overwrite]`, `[dry_run]` | Copy an entry between archives (or within the same one) |

> **Tip — dry_run:** `iwd_write`, `iwd_patch`, `iwd_remove`, `iwd_extract`, `iwd_rename`, and `iwd_copy` all support `dry_run=true` to validate the operation and preview results without committing any changes.

## Resources

| Resource | URI | Description |
|----------|-----|-------------|
| DVAR Reference | `iw4x://dvars` | Full DVAR knowledge base as JSON |

## Skills

| Skill | Trigger |
|-------|---------|
| `dvar-lookup` | Asking about DVARs, game settings, FPS optimization, or server config |

## Project structure

```
iw4x-toolkit/
├── .claude-plugin/
│   ├── plugin.json              # Plugin manifest
│   └── marketplace.json         # Marketplace metadata
├── .mcp.json                    # MCP server config (stdio)
├── mcp-server/
│   ├── src/
│   │   ├── index.ts             # MCP server — 11 tools + 1 resource
│   │   └── index.test.ts        # Test suite (81 tests via vitest)
│   ├── evals/
│   │   └── evaluation.xml       # mcp-builder Phase 4 evaluation harness (10 Q&A pairs)
│   ├── dist/
│   │   └── index.js             # Compiled JS (committed for marketplace installs)
│   ├── package.json
│   └── tsconfig.json
├── knowledge/
│   └── dvars.json               # 1,731 DVAR entries
├── skills/
│   └── dvar-lookup/
│       └── SKILL.md             # DVAR search/FPS optimization skill
├── docs/
│   ├── SOURCES.md               # Research sources and references
│   ├── TODO.md                  # Roadmap and planned features
│   └── WORKFLOW.md              # Vibe-coder workflow guide — golden paths, anti-patterns, LLM primer
└── README.md
```

## Usage examples

### Quick overview of any IWD

> "What types of files are in promodlive_v3.3.iwd?"

Claude uses `iwd_list` with `summary_only=true` — returns a single line like `"127 entries: 45 .gsc, 12 .menu, 8 .csv, 62 binary"` with zero context waste.

### List files in an IWD

> "List the contents of promodlive_v3.3.iwd"

Claude uses `iwd_list` to show all entry names (compact by default, no sizes).

> "Just give me the .gsc files"

Claude uses `iwd_list` with `pattern="maps/**/*.gsc"`.

### Read and edit a GSC script

> "Read _globallogic.gsc from the promod IWD and add a print statement at the top of init()"

Claude uses `iwd_read` to get the file, then `iwd_write` to put the modified version back. A `.bak` backup is created automatically. The response includes a diff of the change.

### Targeted patch without round-tripping full content

> "Remove the `self setClientDvar(\"cg_fov\", \"80\")` call from _playerlogic.gsc"

Claude uses `iwd_patch` to replace the exact string. The response includes a ±3-line diff so the change can be verified without re-reading the file.

### Preview before writing

> "Change the FOV but let me check the diff before committing"

Claude uses `iwd_patch` with `dry_run=true` to show what would change, without modifying the file.

### Search across all scripts

> "Which GSC file defines the `options_promod` function?"

Claude uses `iwd_grep` with `entry_glob="maps/**/*.gsc"` to search all scripts and returns matching file paths and line numbers — like `ripgrep` but inside the IWD.

### Compare two IWD versions

> "Diff the original promod IWD against my modified one"

Claude uses `iwd_diff` to show what files were added, removed, or changed between the two archives. With `content_diff=true`, it also shows the actual line-level changes inside modified text files.

### Extract for shell tool use

> "Extract all scripts from the IWD so I can grep them myself"

Claude uses `iwd_extract` with `entry_glob="maps/**/*.gsc"` to extract only the matching files to a destination directory.

### Rename and reorganize entries

> "Move _playerlogic.gsc to scripts/_playerlogic.gsc inside the IWD"

Claude uses `iwd_rename` to move the entry in a single atomic operation, no read-write-delete roundtrip needed.

### FPS optimization

> "What DVARs should I change for maximum FPS in IW4X?"

Claude reads the DVAR resource and returns a prioritized table of settings sorted by FPS impact (high/medium/low) with recommended values.

### DVAR lookup

> "What does r_filmTweakEnable do? What are all the film tweak DVARs?"

Claude searches the knowledge base by name or category and returns structured results.

## Implementation details

- **ZIP operations**: Uses `adm-zip` for all IWD read/write/delete. IWD files are standard ZIP archives.
- **Atomic writes**: Writes go to a `.tmp` file first, then are renamed to the target to prevent corruption on failure.
- **Auto-backup**: On the first modification to any IWD in a session, a `.bak` copy is created (only if one doesn't already exist).
- **Binary detection**: Known binary extensions (.iwi, .d3dbsp, etc.) are returned as base64 instead of UTF-8.
- **CRC diff**: `iwd_diff` compares CRC32 values from the ZIP central directory — no decompression needed, very fast even on large archives.
- **DVAR categorization**: DVARs are auto-categorized from their prefix (e.g. `r_` = renderer, `cg_` = client game, `sv_` = server) with subcategories for renderer DVARs (lighting, bloom, shadows, etc.).
- **Corrupt archive detection**: All zip operations are wrapped with clear error messages if the file is not a valid ZIP/IWD archive.
- **dry_run support**: Destructive/write operations support `dry_run=true` for safe previewing before committing.
- **Context efficiency**: `iwd_grep` caps output at `max_matches` (default: 50); `iwd_list` defaults to compact names-only output (`names_only=true`) with an optional `summary_only` one-liner; `iwd_read` supports `limit`/`offset` pagination; `iwd_patch` diff is centred on the actual replacement line via `hintLine`.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.12.1 | MCP server framework |
| `adm-zip` | ^0.5.16 | ZIP/IWD archive operations |
| `zod` | ^3.23.0 | Schema validation for tool parameters |
| `vitest` | ^3.0.0 | Test framework (dev) |

## License

MIT
