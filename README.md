# iw4x-toolkit

IW4X/MW2 modding toolkit: IWD archive tools, GSC linting and formatting, DVAR knowledge base, and symbol analysis for mod porting. Use it as an MCP server (Claude Code plugin or any MCP client) or as the `iw4x-toolkit` command-line tool. Both expose the same 27 commands.

## What it does

**IWD Archive Tools** — Surgical in-place edits inside IWD archives (`iwd_patch`, `iwd_grep`, `iwd_write`, `iwd_rename`, `iwd_copy`, `iwd_extract`) plus diff, metadata, and listing across multiple archives.

**GSC Language Tooling** — `gsc_lint` catches undefined variables and functions, unreachable code, brace mismatches, and case-insensitive name collisions. `gsc_format` normalises indentation, brace style, and operator spacing. `iwd_index_symbols` indexes GSC function definitions across IWD archives so `gsc_find_orphans` can report calls nothing resolves.

**DVAR Knowledge Base** — 1,978 MW2 DVARs with types, defaults, categories, and FPS impact ratings. `dvar_search` filters server-side to avoid context flood; `dvar_integrity_check` flags unknown DVAR names in GSC.

## Installation

From inside Claude Code:

```bash
/plugin marketplace add back1ply/iw4x-toolkit
```

Then install the plugin:

```bash
/plugin install iw4x-toolkit
```

### Building from source

```bash
cd mcp-server
npm install
npm run build          # dist/index.js (MCP server) and dist/bin.js (CLI)
npm test
npm run build:binary   # optional: standalone dist/iw4x-toolkit executable (requires Bun)
```

Running needs Node.js 20+. Building and testing need Node.js 22.12+.

The knowledge base (`knowledge/*.json`) is compiled into the build. After editing a knowledge file, run `npm run build` again.

### Commands

- **IWD tools**: `iwd_list`, `iwd_read`, `iwd_info`, `iwd_grep`, `iwd_write`, `iwd_patch`, `iwd_remove`, `iwd_extract`, `iwd_pack`, `iwd_sync`, `iwd_diff`, `iwd_rename`, `iwd_copy`
- **Sync tools**: `mods_sync`, `userraw_sync`
- **GSC tools**: `gsc_lint`, `gsc_format`, `gsc_fix`, `gsc_lookup`, `gsc_template`, `gsc_outline`, `gsc_anti_patterns`, `gsc_menu_hud`, `iwd_index_symbols`, `gsc_find_orphans`
- **DVAR tools**: `dvar_search`, `dvar_integrity_check`
- **MCP resources** (MCP only): `iw4x://dvars`, `iw4x://gsc-builtins`
- **Skills**: `dvar-lookup` for FPS optimization tips

## Command-line tool

The `iw4x-toolkit` CLI runs the same commands as the MCP server. Command names and arguments are identical, and output is the same text an agent sees over MCP.

Install it from a clone:

```bash
cd mcp-server
npm install && npm run build
npm link               # puts iw4x-toolkit on your PATH
```

Or build a standalone executable that needs no Node.js install: `npm run build:binary` (requires [Bun](https://bun.sh)).

Usage:

```bash
iw4x-toolkit --help                          # list all commands
iw4x-toolkit iwd_list --help                 # arguments for one command

iw4x-toolkit iwd_list --path mods/promod.iwd --summary_only
iw4x-toolkit iwd_grep --path mods/promod.iwd --pattern onPlayerConnect --entry_glob "**/*.gsc"
iw4x-toolkit gsc_lint --path maps/mp/gametypes/_mymod.gsc
iw4x-toolkit dvar_search --query fov --json   # structured data instead of text
iw4x-toolkit mcp                              # serve the commands as MCP tools over stdio
```

Arguments map one-to-one to the MCP tool inputs:

- Pass values as `--name value`.
- Boolean arguments are flags. Turn off one that defaults to true with `--no-name`, e.g. `--no-names_only`.
- Repeat a flag for list arguments: `--paths a.iwd --paths b.iwd`.
- Pass object arguments as JSON: `--variables '{"player":"self"}'`.

Exit codes: `0` success, `1` the command failed (message on stderr), `2` usage error.

Differences from the MCP server:

- MCP resources are not available in the CLI.
- Rate limits on `iwd_grep` and `iwd_pack` apply to MCP only.
- The symbol index from `iwd_index_symbols` lasts one process. Across separate CLI runs, `gsc_find_orphans` starts with an empty index.
- Each CLI run that modifies an IWD creates its own timestamped `.bak`.

### Documentation

- [**WORKFLOW.md**](docs/WORKFLOW.md): Usage guide with "Golden Paths" and examples.
- [**STRATEGY.md**](docs/STRATEGY.md): Project vision, including the "Hybrid" legacy/modern workflow.
- [**TODO.md**](docs/TODO.md): Roadmap and active tasks.
- [**MCP_IMPROVEMENTS.md**](docs/MCP_IMPROVEMENTS.md): Proposed MCP tool enhancements from real modding sessions.
- [**LINTER_ERRORS.md**](docs/LINTER_ERRORS.md): GSC linter error code reference.
- [**SOURCES.md**](docs/SOURCES.md): References and research.

### API Documentation

API documentation is generated with TypeDoc. To generate:

```bash
cd mcp-server
npm run docs
```

View the generated documentation at `docs/api/index.html`.

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style guidelines, and pull request process.

## Quick Start

### Check IWD contents

```text
iwd_list path="mods/promod.iwd" summary_only=true
```

### Search for a script

```text
iwd_grep path="mods/promod.iwd" pattern="onPlayerConnect" entry_glob="*.gsc"
```

For more examples, see [WORKFLOW.md](docs/WORKFLOW.md).

## Implementation details

- **ZIP operations**: Uses `adm-zip` for all IWD read/write/delete. Caching uses a 10-entry LRU to prevent V8 memory bloat.
- **Atomic writes**: The archive bytes are written to `<archive>.tmp` first, then renamed over the target to prevent partial-write corruption. If the write fails, the in-memory cache is dropped so later reads show what is actually on disk. On startup, the MCP server removes only its own stale `*.iwd.tmp` / `*.gsc.tmp` files (older than 1 hour).
- **Auto-backup**: On the first modification to any IWD in a session (MCP) or run (CLI), a timestamped `.bak` copy is created (e.g. `file.iwd.20260223_143045.bak`). Existing backups are never overwritten.
- **Binary detection**: Known binary extensions (.iwi, .d3dbsp, etc.) are returned as base64 instead of UTF-8.
- **CRC diff**: `iwd_diff` compares CRC32 values from the ZIP central directory — no decompression needed, very fast even on large archives.
- **DVAR categorization**: DVARs are auto-categorized from their prefix (e.g. `r_` = renderer, `cg_` = client game, `sv_` = server) with subcategories for renderer DVARs (lighting, bloom, shadows, etc.).
- **Corrupt archive detection**: All zip operations are wrapped with clear error messages if the file is not a valid ZIP/IWD archive. Safe handling for missing files, empty files, non-zips, and missing headers.
- **dry_run support**: Destructive/write operations support `dry_run=true` for safe previewing before committing.
- **Context efficiency**: `iwd_grep` utilizes a pre-test regex fast-path to avoid string allocation GC spikes on large files, truncates excessively long minified lines, and caps output at `max_matches` (default: 50); `iwd_list` defaults to compact names-only output (`names_only=true`) with optional `summary_only` and `limit` parameters; `iwd_read` supports `limit`/`offset` pagination safely with friendly out-of-bounds errors; `iwd_info` provides a quick type-and-size breakdown via `summary_only`; `iwd_patch` diff is centred on the actual replacement line via `hintLine`.

## Dependencies

Runtime: `@modelcontextprotocol/server` (MCP TypeScript SDK v2, spec 2026-07-28), `adm-zip`, `zod` 4. Dev: `vitest`, `esbuild`, `typescript`, `@modelcontextprotocol/client` (tests).
See [SOURCES.md](docs/SOURCES.md#tools-and-libraries-used) for full details.

## License

MIT
