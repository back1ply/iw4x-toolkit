# Structure

## Directory Layout

```
iw4x-toolkit/
├── mcp-server/               # Main MCP server package
│   ├── src/                  # TypeScript source
│   │   ├── index.ts          # Server entry point + re-exports
│   │   ├── utils.ts          # Shared utilities (no MCP SDK dependency)
│   │   ├── iwd/              # IWD archive tools
│   │   │   ├── tools.ts      # Tool registration orchestrator
│   │   │   ├── index.ts      # Public API re-export
│   │   │   ├── read-tools.ts # iwd_list, iwd_read
│   │   │   ├── write-tools.ts# iwd_write
│   │   │   ├── archive-tools.ts # archive-level ops
│   │   │   ├── diff-tools.ts # iwd_diff
│   │   │   └── sync-tools.ts # iwd_sync
│   │   ├── gsc/              # GSC language tools
│   │   │   ├── tools.ts      # Tool registration + caches
│   │   │   ├── tokenizer.ts  # GSC lexer
│   │   │   ├── linter.ts     # GSC linter/fixer
│   │   │   ├── formatter.ts  # GSC formatter
│   │   │   ├── outline.ts    # Function outline extractor
│   │   │   ├── symbols.ts    # Symbol index builder
│   │   │   ├── tools.test.ts # Tool integration tests
│   │   │   └── gsc.test.ts   # Core GSC unit tests
│   │   └── knowledge/        # Knowledge base tools
│   │       └── tools.ts      # DVAR + builtins tools + caches
│   ├── knowledge/            # Static JSON knowledge files
│   │   ├── dvars.json        # MW2/IW4X DVAR database
│   │   ├── gsc-builtins.json # GSC built-in function signatures
│   │   ├── gsc-anti-patterns.json # Common GSC mistakes
│   │   ├── gsc-menu-hud.json # Menu/HUD GSC reference
│   │   ├── templates.json    # GSC code templates
│   │   └── README.md         # Knowledge base docs
│   ├── package.json          # npm manifest + scripts
│   ├── tsconfig.json         # TypeScript config
│   └── node_modules/         # Dependencies (not committed)
├── testiwd/                  # Sample/test IWD files
│   └── promod_v3.3/
│       ├── promodlive_v3.3.iwd
│       └── z_custom_ruleset.iwd
├── tasks/                    # Task tracking (todo.md, lessons.md)
├── docs/                     # Project documentation
└── .planning/                # GSD planning artifacts
    └── codebase/             # This codebase map
```

## Key File Locations

| File | Purpose |
|---|---|
| `mcp-server/src/index.ts` | Server bootstrap and entry point |
| `mcp-server/src/utils.ts` | All shared helpers — start here |
| `mcp-server/src/iwd/tools.ts` | IWD tool registrations |
| `mcp-server/src/gsc/tools.ts` | GSC tool registrations + caches |
| `mcp-server/src/gsc/linter.ts` | Core GSC lint/fix logic |
| `mcp-server/src/gsc/formatter.ts` | GSC code formatter |
| `mcp-server/src/gsc/tokenizer.ts` | GSC tokenizer/lexer |
| `mcp-server/src/knowledge/tools.ts` | Knowledge DB tools + mtime cache |
| `mcp-server/knowledge/dvars.json` | DVAR database (primary knowledge asset) |
| `mcp-server/package.json` | Scripts: `build`, `test`, `start` |

## Naming Conventions

### Files
- `tools.ts` — MCP tool registration functions (one per module or domain)
- `*-tools.ts` — sub-module tool registrations (read-tools, write-tools, etc.)
- `index.ts` — public re-exports only; no logic
- `*.test.ts` — test files co-located with implementation
- `utils.ts` — shared utilities; singular, flat file

### Functions
- `register*Tools(server)` — tool registration functions (side-effectful, called once)
- `load*` — functions that read and parse JSON knowledge files
- `ok/errResult(...)` — MCP tool result constructors
- `open*` / `get*` — cache-aware accessors
- `is*` / `has*` — boolean predicates
- `build*` / `format*` — constructors/formatters returning strings

### Types/Interfaces
- PascalCase interfaces (`Dvar`, `LintError`, `GscBuiltin`)
- Exported from the module that owns them, re-exported from `index.ts` or `utils.ts` as needed

### Constants
- `SCREAMING_SNAKE_CASE` — `BINARY_EXTENSIONS`, `GREP_MAX_MATCHES_DEFAULT`, `RATE_LIMITS`

## Adding New Code

### New MCP tool in existing domain
1. Add handler in the relevant `*-tools.ts` file (or `tools.ts` for gsc/knowledge)
2. Call `server.tool(name, schema, handler)` inside the `register*Tools` function
3. Export any new types from the module

### New domain (e.g. `src/maps/`)
1. Create `src/maps/tools.ts` with `registerMapsTools(server: McpServer): void`
2. Create `src/maps/index.ts` re-exporting `registerMapsTools`
3. Import and call in `src/index.ts`

### New knowledge file
1. Add JSON to `mcp-server/knowledge/`
2. Add loader function in `src/knowledge/tools.ts` with mtime cache
3. Register a `server.tool` or `server.resource` endpoint

## Special Directories

- `testiwd/` — real IWD files for manual testing and benchmarks
- `knowledge/` — static data shipped with the server; treated as read-only at runtime (cached)
- `.planning/` — GSD workflow planning artifacts; not part of the server build
- `tasks/` — developer task tracking; not shipped
