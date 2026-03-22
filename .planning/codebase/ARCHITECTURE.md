# Architecture

## Pattern
**MCP Server (stdio transport)** — a Model Context Protocol server that exposes IW4X/MW2 modding tools to AI assistants. No HTTP endpoints, no frontend. All communication is via stdio JSON-RPC (MCP protocol).

## Layers

```
Claude / AI Client
        │  stdio (JSON-RPC)
        ▼
 McpServer (index.ts)
        │
        ├── IWD Layer       (src/iwd/)       — ZIP archive operations
        ├── GSC Layer       (src/gsc/)       — GSC language tooling
        ├── Knowledge Layer (src/knowledge/) — DVAR / builtins lookup
        └── Shared Utils    (src/utils.ts)   — caches, helpers, types
```

## Entry Point
`mcp-server/src/index.ts` — creates `McpServer`, calls three `register*Tools()` functions, starts `StdioServerTransport`. Guard prevents auto-start when imported by tests.

## Module Breakdown

### `src/iwd/` — IWD Archive Tools
IWD files are ZIP archives used by IW4X/CoD4. This layer provides:
- `read-tools.ts` — `iwd_list`, `iwd_read` (list/read entries)
- `write-tools.ts` — `iwd_write` (add/update entries with atomic write + backup)
- `archive-tools.ts` — archive-level operations
- `diff-tools.ts` — `iwd_diff` (diff two IWD entries or versions)
- `sync-tools.ts` — sync/compare between IWD files
- `tools.ts` — orchestrates registration of all IWD sub-modules
- `index.ts` — re-exports `registerIwdTools`

Uses `adm-zip` for ZIP manipulation. Writes use atomic pattern: write to `.tmp` → rename → backup original.

### `src/gsc/` — GSC Language Tools
GSC is the scripting language used by CoD4/IW4X. This layer provides:
- `tokenizer.ts` — tokenizes GSC source into `TokenType` tokens
- `linter.ts` — lints GSC code, reports errors/warnings, exposes `lint()`, `fix()`, `getKnownBuiltins()`, `getKnownDvars()`
- `formatter.ts` — formats GSC source (comment preservation, `[[ ]]` passthrough, blank line normalization)
- `outline.ts` — extracts function outline from GSC file; `outline()` + `formatOutline()`
- `symbols.ts` — symbol index: `buildIndex()`, `getStats()`, `resolveInclude()`, `hasSymbol()`
- `tools.ts` — registers `gsc_lint`, `gsc_lookup`, `gsc_template`, `gsc_format`, `gsc_outline`, `gsc_symbols` tools

### `src/knowledge/` — Knowledge Base Tools
Static JSON knowledge files from `knowledge/` directory:
- `dvars.json` — MW2/IW4X DVAR database (type, default, category, fps_impact)
- `gsc-builtins.json` — GSC built-in function signatures
- `gsc-anti-patterns.json` — common GSC anti-patterns with wrong/right examples
- `gsc-menu-hud.json` — menu/HUD GSC reference
- `templates.json` — GSC code templates

`tools.ts` registers: `dvar_search`, `gsc_lookup`, and resource endpoints. All knowledge data is cached with mtime-keyed TTL (5 min) to avoid repeated JSON.parse on hot paths.

### `src/utils.ts` — Shared Utilities
No MCP SDK imports (importable by tests). Provides:
- `openIwd` / `openIwdAsync` — open IWD files with LRU cache + `invalidateIwdCache`
- `atomicWrite` / `ensureBackup` — safe file write pattern
- `isSafeEntryPath` / `normalizeEntry` / `isBinaryEntry` — entry validation
- `resolveIwdPath` / `globToRegex` / `buildDiffSnippet` — path/diff helpers
- `getCachedRegex` — LRU regex cache (cap 50)
- `checkRateLimit` / `RATE_LIMITS` — rate limiting for expensive operations
- `getKnowledgeDir` — resolves `knowledge/` directory path
- `okResult` / `errResult` / `getErrMsg` — MCP result helpers
- `BINARY_EXTENSIONS`, `GREP_MAX_MATCHES_DEFAULT`, constants

## Data Flow

**Tool call (e.g. `iwd_read`):**
```
MCP client → stdio → McpServer.tool handler
  → utils.openIwd() [cache hit or adm-zip open]
  → read entry bytes → decode UTF-8 or mark binary
  → okResult({content}) → stdio → MCP client
```

**Knowledge lookup (e.g. `dvar_search`):**
```
MCP client → stdio → McpServer.tool handler
  → getKnowledgeDir() → fs.readFileSync(dvars.json)
  → check mtime cache → JSON.parse if stale
  → filter/search dvars array → okResult → stdio
```

## Key Abstractions

| Abstraction | Location | Purpose |
|---|---|---|
| `McpServer` | index.ts | MCP protocol host |
| `registerXxxTools(server)` | */tools.ts | Tool registration pattern |
| `openIwd(path)` | utils.ts | Cached IWD file handle |
| `atomicWrite` | utils.ts | Crash-safe file mutation |
| `okResult/errResult` | utils.ts | Consistent MCP responses |
| `lint/fix` | gsc/linter.ts | GSC analysis engine |
| `format` | gsc/formatter.ts | GSC formatter |
| `tokenize` | gsc/tokenizer.ts | GSC lexer |
| Knowledge caches | knowledge/tools.ts | Mtime-keyed JSON cache |

## Error Handling
- Tools return `errResult(msg)` (not throw) for expected failures (file not found, bad path, etc.)
- Fatal startup errors are caught in `main()` and exit with code 1
- Rate limiting via `checkRateLimit()` prevents abuse of expensive operations
- Orphaned `.tmp` files from crashed sessions are cleaned up on startup

## Cross-Cutting Concerns
- **Caching**: IWD LRU cache in `utils.ts`; knowledge mtime+TTL cache in `knowledge/tools.ts`; regex LRU in `utils.ts`
- **Safety**: `isSafeEntryPath` prevents path traversal attacks in IWD operations
- **Binary detection**: `isBinaryEntry` / `BINARY_EXTENSIONS` prevents serving binary as text
- **Atomic writes**: `.tmp` → rename → backup pattern for all IWD mutations
