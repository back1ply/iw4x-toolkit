# Conventions

## Code Style

- **Language**: TypeScript, strict mode (`"strict": true` in tsconfig)
- **Module system**: ESM — imports use `.js` extensions even for `.ts` source files
- **Indentation**: 2 spaces
- **Quotes**: double quotes for strings
- **Semicolons**: yes

## Naming

| Kind | Convention | Example |
|---|---|---|
| Functions | camelCase | `registerIwdTools`, `openIwd`, `getCachedRegex` |
| Constants | SCREAMING_SNAKE_CASE | `BINARY_EXTENSIONS`, `GREP_MAX_MATCHES_DEFAULT`, `RATE_LIMITS` |
| Types/Interfaces | PascalCase | `Dvar`, `LintError`, `GscBuiltin`, `LintResult` |
| Files | kebab-case | `read-tools.ts`, `write-tools.ts`, `diff-tools.ts` |
| Test files | `*.test.ts` co-located | `gsc.test.ts` next to `linter.ts` |

## Error Handling

Tools use a discriminated union `Result<T>` pattern — no thrown exceptions for expected failures:

```typescript
// Always return okResult or errResult — never throw
return okResult({ content: [...] });
return errResult(`File not found: ${path}`);
```

Error messages include context and actionable tips (e.g. "use iwd_list to see available entries").

Fatal startup errors are caught in `main()` and exit with code 1.

## File Organization

- `tools.ts` — MCP tool registration; pure side effects on `server`, no logic exports
- `*-tools.ts` — sub-domain registrations (read-tools, write-tools, etc.)
- `index.ts` — re-exports only; no logic
- `utils.ts` — shared utilities with no MCP SDK dependency (importable by tests)

## Function Patterns

### Tool Registration
All tools follow the `registerXxxTools(server: McpServer): void` pattern — called once at startup, never returned.

```typescript
export function registerReadTools(server: McpServer): void {
  server.tool("iwd_list", { /* zod schema */ }, async (args) => { ... });
  server.tool("iwd_read", { /* zod schema */ }, async (args) => { ... });
}
```

### Caching
Two caching patterns in use:

**LRU cache** (utils.ts) — for IWD file handles and compiled regexes:
```typescript
const cache = new Map<string, Value>();
const CACHE_MAX = 10;
// evict oldest if at capacity before inserting
```

**Mtime-keyed TTL cache** (knowledge/tools.ts) — for JSON knowledge files:
```typescript
if (cache && !isCacheExpired(cache.cachedAt) && mtime === cache.mtime) {
  return cache.data; // fast path
}
// otherwise re-read from disk
```

### Atomic Writes
IWD mutations use: write to `.tmp` → rename → backup original. Never overwrite in place.

```typescript
await atomicWrite(targetPath, data);  // .tmp → rename
await ensureBackup(originalPath);     // backup before clobbering
```

## JSDoc / Comments

- All files have a `@file` block header describing the module's purpose and listing sub-modules
- Public functions have JSDoc with `@param` and `@returns` (or inline description)
- Inline comments explain non-obvious logic; straightforward code left uncommented
- Section dividers: `// ---------------------------------------------------------------------------`

## Imports

- Node built-ins: `import * as fs from "node:fs"` (node: protocol prefix)
- Third-party: named imports where possible
- Internal: relative paths with `.js` extension — `import { util } from "../utils.js"`

## Constants vs Magic Numbers

All tuneable thresholds are named constants in `utils.ts`:
- `GREP_MAX_MATCHES_DEFAULT = 50`
- `MINIFIED_FILE_CHARS_PER_LINE = 200`
- `MAX_LINE_LENGTH_WARNING = 200`
- `REGEX_CACHE_MAX = 50`
- `KNOWLEDGE_CACHE_TTL_MS = 5 * 60 * 1000`
