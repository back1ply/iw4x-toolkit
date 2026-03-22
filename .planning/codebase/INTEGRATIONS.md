# External Integrations

**Analysis Date:** 2026-03-22

## APIs & External Services

**Model Context Protocol (MCP):**
- Claude AI integration via Model Context Protocol
  - SDK: `@modelcontextprotocol/sdk` v1.12.1
  - Transport: stdio-based (stdin/stdout communication)
  - Server registration: `mcp-server` package, `dist/index.js` entry point

**No external REST APIs:**
- Codebase is self-contained; no HTTP calls to external services
- All operations are local file-based (IWD archives, GSC files)

## Data Storage

**File-Based Storage:**
- Local filesystem only
- IWD archives (ZIP format) read/written via `adm-zip`
- Knowledge files loaded from `knowledge/` directory

**Knowledge Base Files:**
- `knowledge/dvars.json` - DVAR variable reference data
- `knowledge/gsc-builtins.json` - GSC function definitions and signatures
- `knowledge/gsc-menu-hud.json` - Menu/HUD system reference
- `knowledge/gsc-anti-patterns.json` - Anti-patterns for linting
- `knowledge/templates.json` - Code templates
- Format: JSON (loaded via `fs.readFileSync()`)
- Cache: In-memory (expires after 5 minutes of inactivity)

**Caching:**
- Regex cache (LRU, max 50 patterns) in `utils.ts`
- Knowledge data cache (5-minute TTL)
- IWD file cache (in-memory when open)

**File Operations:**
- Read: `node:fs` and `node:fs/promises`
- Archive: `adm-zip` for ZIP file operations
- Path handling: `node:path` module

## Authentication & Identity

**Auth Provider:**
- None — codebase runs locally and requires no authentication
- Claude integration is handled by MCP framework at the transport layer

## Monitoring & Observability

**Error Tracking:**
- Console stderr only
- Logs and errors written to `console.error()` and `process.stderr`
- No external error tracking service

**Logs:**
- Approach: Direct console output
  - Startup messages: `[iw4x-toolkit]` prefix to stderr
  - Tool execution results: returned via MCP result objects (structured content)
  - Debug info: Available via test output (`console.error()`)
- No persistent log files by default

**Example log entries:**
- `[iw4x-toolkit] Cleaned up X orphaned .tmp file(s)` (startup cleanup)

## CI/CD & Deployment

**Hosting:**
- Runs locally on user's machine via Claude Code
- No cloud deployment or server hosting
- Single `dist/index.js` file for distribution

**Build Pipeline:**
- `npm run build` compiles and bundles TypeScript
- `npm test` runs test suite before release
- Output: Single ESM file with CommonJS compatibility

**Distribution:**
- Package registered in Claude plugin system
- `.claude-plugin/` configuration directory
- Invoked via MCP stdio transport by Claude

## Environment Configuration

**Required env vars:**
- None — application is entirely self-contained
- Knowledge base paths are relative to cwd

**Secrets location:**
- Not applicable — no API keys or secrets required
- File paths are configurable via parameter to tools (e.g., IWD archive paths)

**Runtime Configuration:**
- Tool parameters passed via MCP (zod-validated)
- No config files or environment variables needed

## Webhooks & Callbacks

**Incoming:**
- None — stdio-based MCP is request/response only

**Outgoing:**
- None — no external service calls

## Tool Registration

**MCP Tools Registered:**
- IWD archive operations: `registerIwdTools()` in `src/iwd/tools.ts`
- GSC language tools: `registerGscTools()` in `src/gsc/tools.ts`
- Knowledge tools: `registerKnowledgeTools()` in `src/knowledge/tools.ts`

**Tool Categories:**
- **IWD Operations:** Read, write, archive, diff, sync operations on ZIP archives
- **GSC Analysis:** Linting, formatting, outline parsing, symbol indexing, function resolution
- **Knowledge Lookup:** DVAR reference, GSC builtin function search, anti-pattern detection

## Data Formats

**Input/Output:**
- JSON: Tool parameters and structured responses
- Text: GSC source code, IWD entry contents
- Binary: Archive contents (ZIP, game assets)

**Serialization:**
- zod: Schema validation for all tool inputs
- JSON: Standard for knowledge base and results
- Plain text: For code content (GSC, scripts)

---

*Integration audit: 2026-03-22*
