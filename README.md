# iw4x-toolkit

A Claude Code plugin for IW4X/MW2 modding. Provides direct IWD archive manipulation and a searchable DVAR knowledge base — no more manual extract/edit/repack workflows.

## What it does

**IWD Tools** — Read, write, diff, and manage files inside IWD archives (renamed ZIPs used by the IW engine) without extracting them first.

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
| `iwd_list` | `path` | List all entries in an IWD (name, size, compressed size) |
| `iwd_read` | `path`, `entry` | Read a file from inside an IWD. UTF-8 for text, base64 for binary (.iwi, .d3dbsp, etc.) |
| `iwd_write` | `path`, `entry`, `content` | Write or update a file inside an IWD. Auto-creates `.bak` backup on first write per session |
| `iwd_remove` | `path`, `entry` | Remove a file from inside an IWD. Auto-backup on first modification |
| `iwd_diff` | `path1`, `path2` | Compare two IWDs. Reports added, removed, and modified entries using CRC32 from the ZIP central directory (fast — no content decompression needed) |

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
│   │   ├── index.ts             # MCP server — 5 tools + 1 resource
│   │   └── index.test.ts        # Test suite (27 tests via vitest)
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
│   └── TODO.md                  # Roadmap and planned features
└── README.md
```

## Usage examples

### List files in an IWD

> "List the contents of promodlive_v3.3.iwd"

Claude uses `iwd_list` to show all entries with sizes.

### Read and edit a GSC script

> "Read _globallogic.gsc from the promod IWD and add a print statement at the top of init()"

Claude uses `iwd_read` to get the file, then `iwd_write` to put the modified version back. A `.bak` backup is created automatically.

### Compare two IWD versions

> "Diff the original promod IWD against my modified one"

Claude uses `iwd_diff` to show what files were added, removed, or changed between the two archives.

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

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.12.1 | MCP server framework |
| `adm-zip` | ^0.5.16 | ZIP/IWD archive operations |
| `zod` | ^3.23.0 | Schema validation for tool parameters |
| `vitest` | ^3.0.0 | Test framework (dev) |

## License

MIT
