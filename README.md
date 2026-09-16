# iw4x-toolkit

IW4X/MW2 modding toolkit: IWD archive tools, GSC linting and formatting, a DVAR knowledge base, and symbol analysis for mod porting. Runs as an MCP server (Claude Code plugin or any MCP client) and as the `iw4x-toolkit` command-line tool.

## What it does

**IWD archives** — List, read, search, diff, and make surgical in-place edits inside IWD archives, or extract, edit on disk, and pack/sync back.

**GSC tooling** — `gsc_lint` catches undefined variables and functions, unreachable code, brace mismatches, and case-insensitive name collisions. `gsc_format` normalises indentation, brace style, and operator spacing. `iwd_index_symbols` indexes function definitions across archives so `gsc_find_orphans` can report calls nothing resolves.

**DVAR knowledge base** — 1,978 MW2 DVARs with types, defaults, categories, and FPS impact ratings. `dvar_search` filters server-side to avoid flooding context; `dvar_integrity_check` flags unknown DVAR names in GSC.

### Commands

- **IWD**: `iwd_list`, `iwd_read`, `iwd_info`, `iwd_grep`, `iwd_write`, `iwd_patch`, `iwd_remove`, `iwd_extract`, `iwd_pack`, `iwd_sync`, `iwd_diff`, `iwd_rename`, `iwd_copy`
- **Sync to game folders**: `mods_sync`, `userraw_sync`
- **GSC**: `gsc_lint`, `gsc_format`, `gsc_fix`, `gsc_lookup`, `gsc_template`, `gsc_outline`, `gsc_anti_patterns`, `gsc_menu_hud`, `iwd_index_symbols`, `gsc_find_orphans`
- **DVAR**: `dvar_search`, `dvar_integrity_check`
- **MCP resources**: `iw4x://dvars`, `iw4x://gsc-builtins`
- **Skills**: `dvar-lookup` for FPS optimization tips

## Installation

### Claude Code plugin

```bash
/plugin marketplace add back1ply/iw4x-toolkit
/plugin install iw4x-toolkit
```

### From source

```bash
cd mcp-server
npm install
npm run build          # dist/index.js (MCP server) and dist/bin.js (CLI)
npm test
npm link               # optional: put iw4x-toolkit on your PATH
npm run build:binary   # optional: standalone executable that needs no Node.js (requires Bun)
```

Running needs Node.js 20+; building and testing need Node.js 22.12+. The knowledge base (`knowledge/*.json`) is compiled into the build, so rebuild after editing it.

## Command-line tool

Every MCP tool is also a CLI command with the same name, arguments, and text output.

```bash
iw4x-toolkit --help                          # list all commands
iw4x-toolkit iwd_list --help                 # arguments for one command

iw4x-toolkit iwd_list --path mods/promod.iwd --summary_only
iw4x-toolkit iwd_grep --path mods/promod.iwd --pattern onPlayerConnect --entry_glob "**/*.gsc"
iw4x-toolkit gsc_lint --path maps/mp/gametypes/_mymod.gsc
iw4x-toolkit dvar_search --query fov --json   # structured data instead of text
iw4x-toolkit mcp                              # serve the commands as MCP tools over stdio
```

- Values: `--name value`. Booleans are flags; turn off a default-true one with `--no-name` (e.g. `--no-names_only`).
- Lists: repeat the flag (`--paths a.iwd --paths b.iwd`). Objects: JSON (`--variables '{"player":"self"}'`).
- Exit codes: `0` success, `1` command failed (message on stderr), `2` usage error.

The CLI has no MCP resources or rate limits. Each CLI run is its own session: the `iwd_index_symbols` index does not carry over to a later `gsc_find_orphans` run, and each run that modifies an IWD makes its own backup.

For MCP workflows and examples, see [WORKFLOW.md](docs/WORKFLOW.md).

## Implementation details

- **ZIP operations**: `adm-zip` for all IWD reads and writes, with a 10-entry cache of open archives keyed by modification time.
- **Atomic writes**: archive bytes go to `<archive>.tmp`, which is then renamed over the target. A failed write drops the cached archive so later reads match the disk. On startup the MCP server removes only its own stale `*.iwd.tmp` / `*.gsc.tmp` files (older than 1 hour).
- **Auto-backup**: the first modification to an IWD in a session creates a timestamped copy (e.g. `file.iwd.20260223_143045.bak`); backups are never overwritten.
- **Path safety**: entry paths with traversal (`../`) or absolute paths are rejected on write and skipped on extract.
- **Binary detection**: known binary extensions (`.iwi`, `.d3dbsp`, …) are returned as base64.
- **CRC diff**: `iwd_diff` compares CRC32 values from the ZIP central directory, with no decompression.
- **dry_run**: write operations accept `dry_run=true` to preview without changing anything.

## Documentation

- [WORKFLOW.md](docs/WORKFLOW.md): usage guide and examples
- [STRATEGY.md](docs/STRATEGY.md): project vision
- [TODO.md](docs/TODO.md): roadmap
- [MCP_IMPROVEMENTS.md](docs/MCP_IMPROVEMENTS.md): proposed tool enhancements
- [LINTER_ERRORS.md](docs/LINTER_ERRORS.md): GSC linter error codes
- [SOURCES.md](docs/SOURCES.md): references and research
- API docs: `cd mcp-server && npm run docs`, then open `docs/api/index.html`
- [CONTRIBUTING.md](CONTRIBUTING.md): development setup and pull requests

## Dependencies

Runtime: `@modelcontextprotocol/server` (MCP TypeScript SDK v2, spec 2026-07-28), `adm-zip`, `zod` 4. Dev: `vitest`, `esbuild`, `typescript`, `@modelcontextprotocol/client`.

## License

MIT
