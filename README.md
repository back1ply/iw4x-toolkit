# iw4x-toolkit

A Claude Code plugin for IW4X/MW2 modding. IWD archive tools, GSC linting and formatting, DVAR knowledge base, and symbol analysis for mod porting.

## What it does

**IWD Archive Tools** — Surgical in-place edits inside IWD archives (`iwd_patch`, `iwd_grep`, `iwd_write`, `iwd_rename`, `iwd_copy`, `iwd_extract`) plus diff, metadata, and symbol indexing across multiple archives.

**GSC Language Tooling** — `gsc_lint` catches undefined variables, missing includes, unreachable code, infinite loops, brace mismatches, and case-insensitive name collisions. `gsc_format` normalises indentation, brace style, and operator spacing. `gsc_find_orphans` identifies unresolvable function calls before the game launches.

**DVAR Knowledge Base** — 1,731 MW2 DVARs with types, defaults, categories, and FPS impact ratings. `dvar_search` filters server-side to avoid context flood. `dvar_integrity_check` validates DVAR name literals in GSC against the database.

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

If you clone the repo and want to rebuild the MCP server:

```bash
cd mcp-server
npm install
npm run build
npm test
```

Requires Node.js 18+ and TypeScript 5.7+.

- **IWD tools**: `iwd_list`, `iwd_read`, `iwd_write`, `iwd_patch`, `iwd_grep`, `iwd_diff`, `iwd_rename`, `iwd_copy`, `iwd_extract`, `iwd_info`, `iwd_remove`, `iwd_index_symbols`
- **GSC tools**: `gsc_lint`, `gsc_format`, `gsc_find_orphans`, `gsc_lookup`, `gsc_template`, `gsc_outline`, `gsc_menu_hud`
- **DVAR tools**: `dvar_search`, `dvar_integrity_check`
- **Resources**: `iw4x://dvars`, `iw4x://gsc-builtins`
- **Skills**: `dvar-lookup` for FPS optimization tips

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

- **ZIP operations**: Uses `adm-zip` for all IWD read/write/delete. Caching is limited to 3 concurrent archives to prevent V8 memory bloat.
- **Atomic writes**: Writes are piped to a `.tmp` file first, then asynchronously renamed to the target to prevent corruption on failure while keeping the event loop unblocked.
- **Auto-backup**: On the first modification to any IWD in a session, a `.bak` copy is created (only if one doesn't already exist).
- **Binary detection**: Known binary extensions (.iwi, .d3dbsp, etc.) are returned as base64 instead of UTF-8.
- **CRC diff**: `iwd_diff` compares CRC32 values from the ZIP central directory — no decompression needed, very fast even on large archives.
- **DVAR categorization**: DVARs are auto-categorized from their prefix (e.g. `r_` = renderer, `cg_` = client game, `sv_` = server) with subcategories for renderer DVARs (lighting, bloom, shadows, etc.).
- **Corrupt archive detection**: All zip operations are wrapped with clear error messages if the file is not a valid ZIP/IWD archive. Safe handling for missing files, empty files, non-zips, and missing headers.
- **dry_run support**: Destructive/write operations support `dry_run=true` for safe previewing before committing.
- **Context efficiency**: `iwd_grep` utilizes a pre-test regex fast-path to avoid string allocation GC spikes on large files, truncates excessively long minified lines, and caps output at `max_matches` (default: 50); `iwd_list` defaults to compact names-only output (`names_only=true`) with optional `summary_only` and `limit` parameters; `iwd_read` supports `limit`/`offset` pagination safely with friendly out-of-bounds errors; `iwd_info` provides a quick type-and-size breakdown via `summary_only`; `iwd_patch` diff is centred on the actual replacement line via `hintLine`.

## Dependencies

Runtime: `@modelcontextprotocol/sdk`, `adm-zip`, `zod`. Dev: `vitest`.
See [SOURCES.md](docs/SOURCES.md#tools-and-libraries-used) for full details.

## License

MIT
