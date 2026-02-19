# iw4x-toolkit

A Claude Code plugin for IW4X/MW2 modding. Provides direct IWD archive manipulation and a searchable DVAR knowledge base — no more manual extract/edit/repack workflows.

## What it does

**IWD Tools** — Read, write, diff, search, and manage files inside IWD archives (renamed ZIPs used by the IW engine) without extracting them first.

**DVAR Reference** — 1,731 MW2 DVARs catalogued with types, defaults, categories, and FPS impact ratings. 89 key DVARs manually enriched with descriptions.

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

- **Tools**: See `iwd_list`, `iwd_read`, `iwd_write`, and more in the tool reference.
- **Resources**: `iw4x://dvars` knowledge base.
- **Skills**: `dvar-lookup` for optimization tips.

### Documentation

- [**WORKFLOW.md**](docs/WORKFLOW.md): Usage guide with "Golden Paths" and examples.
- [**STRATEGY.md**](docs/STRATEGY.md): Project vision, including the "Hybrid" legacy/modern workflow.
- [**TODO.md**](docs/TODO.md): Roadmap and active tasks.
- [**SOURCES.md**](docs/SOURCES.md): References and research.

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

| Package                     | Version | Purpose                               |
|-----------------------------|---------|---------------------------------------|
| `@modelcontextprotocol/sdk` | ^1.12.1 | MCP server framework                  |
| `adm-zip`                   | ^0.5.16 | ZIP/IWD archive operations            |
| `zod`                       | ^3.23.0 | Schema validation for tool parameters |
| `vitest`                    | ^3.0.0  | Test framework (dev)                  |

## License

MIT
