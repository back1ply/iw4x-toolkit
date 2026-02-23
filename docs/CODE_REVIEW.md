# Comprehensive Code Review: iw4x-toolkit

**Review Date:** 2026-02-22  
**Codebase:** iw4x-toolkit MCP Server  
**Version:** 1.0.0

---

## Executive Summary

The iw4x-toolkit is a well-structured MCP server for IW4X/MW2 modding. The codebase demonstrates solid engineering practices with good separation of concerns, comprehensive testing, and thoughtful error handling. However, there are several areas where improvements can enhance maintainability, performance, and developer experience.

**Overall Assessment:** ⭐⭐⭐⭐ (4/5)

---

## 1. Architecture & Design Patterns

### ✅ Strengths

1. **Clean Module Separation**: The codebase is well-organized into logical modules:
   - [`index.ts`](mcp-server/src/index.ts) - Entry point and server setup
   - [`utils.ts`](mcp-server/src/utils.ts) - Shared utilities
   - [`iwd/tools.ts`](mcp-server/src/iwd/tools.ts) - IWD archive operations
   - [`gsc/tools.ts`](mcp-server/src/gsc/tools.ts) - GSC language tools
   - [`knowledge/tools.ts`](mcp-server/src/knowledge/tools.ts) - DVAR/GSC knowledge

2. **Consistent Tool Registration Pattern**: All tools follow the same registration pattern with proper Zod schemas and MCP annotations.

3. **Resource-Based Design**: Proper use of MCP resources for knowledge bases.

### ⚠️ Areas for Improvement

#### 1.1 Large Tool File

**Issue:** [`iwd/tools.ts`](mcp-server/src/iwd/tools.ts:1) is 1,389 lines with 14 tools registered in a single function.

**Recommendation:** Split into sub-modules:

```
src/iwd/
├── tools.ts          # Re-exports and registration orchestration
├── read-tools.ts     # iwd_list, iwd_read, iwd_info, iwd_grep
├── write-tools.ts    # iwd_write, iwd_patch, iwd_remove
├── archive-tools.ts  # iwd_pack, iwd_sync, iwd_extract
├── diff-tools.ts     # iwd_diff, iwd_copy, iwd_rename
└── sync-tools.ts     # mods_sync, userraw_sync
```

#### 1.2 Duplicate Path Resolution Logic

**Issue:** Both [`utils.ts`](mcp-server/src/utils.ts:58) and [`knowledge/tools.ts`](mcp-server/src/knowledge/tools.ts:58) have similar `getKnowledgeDir` / `resolveKnowledgePath` functions.

**Recommendation:** Consolidate into a single function in `utils.ts`:

```typescript
// utils.ts
export function resolveKnowledgePath(filename: string): string | null {
  // Single implementation used by all modules
}
```

#### 1.3 Missing Dependency Injection

**Issue:** Tools directly import and use `fs`, `AdmZip`, and other dependencies, making testing harder.

**Recommendation:** Consider a simple DI pattern for file operations:

```typescript
interface FileSystem {
  exists(path: string): boolean;
  read(path: string): Buffer;
  write(path: string, data: Buffer): Promise<void>;
}

// Default implementation
const realFs: FileSystem = { ... };

// Tools accept optional fs override for testing
function registerIwdTools(server: McpServer, fs: FileSystem = realFs) { ... }
```

---

## 2. Code Quality & Maintainability

### ✅ Strengths

1. **Good TypeScript Usage**: Strong typing with interfaces for DVARs, GSC builtins, and lint results.

2. **Comprehensive Error Messages**: Error messages include helpful tips and context.

3. **Consistent Naming Conventions**: Clear function and variable names throughout.

### ⚠️ Areas for Improvement

#### 2.1 Magic Numbers

**Issue:** Several magic numbers without constants:

```typescript
// iwd/tools.ts:221
if (text.length / totalLines > 200) { // What is 200?

// gsc/linter.ts:373
if (line.length > 200) { // Duplicate threshold

// utils.ts:113
const IWD_CACHE_MAX = 10; // Good - this one is named
```

**Recommendation:** Extract to named constants:

```typescript
const MINIFIED_FILE_CHARS_PER_LINE_THRESHOLD = 200;
const MAX_LINE_LENGTH_WARNING = 200;
```

#### 2.2 Inconsistent Error Handling

**Issue:** Mix of error handling patterns:

```typescript
// Pattern 1: Return object with error key
return { error: "message" };

// Pattern 2: Return errResult()
return errResult("message");

// Pattern 3: Throw in linter but return in tools
```

**Recommendation:** Standardize on Result type pattern:

```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function openIwd(path: string): Result<AdmZip> {
  // ...
}
```

#### 2.3 Missing Input Validation

**Issue:** Some tools don't validate input bounds:

```typescript
// iwd_read: offset can be negative?
// iwd_grep: max_matches has no upper bound
// iwd_patch: count can be any number
```

**Recommendation:** Add validation in Zod schemas:

```typescript
limit: z.number().int().positive().max(10000).optional(),
max_matches: z.number().int().positive().max(1000).optional(),
```

#### 2.4 Unused Variables in Linter

**Issue:** In [`linter.ts`](mcp-server/src/gsc/linter.ts:440), `nextBrace` is computed but not used:

```typescript
const nextBrace = this.tokens.findIndex((t, idx) => 
  idx > i && t.type === TokenType.LEFT_BRACE
);
if (nextBrace !== -1) {
  // We'll track this function when we hit its opening brace
  // But we never do anything with nextBrace!
}
```

**Recommendation:** Either implement the intended logic or remove dead code.

---

## 3. Performance Considerations

### ✅ Strengths

1. **LRU Cache for IWD Files**: Well-implemented cache with mtime checking.

2. **Mtime-Based Knowledge Cache**: Avoids repeated JSON parsing.

3. **Streaming-Friendly Design**: Pagination support in `iwd_read` and `iwd_grep`.

### ⚠️ Areas for Improvement

#### 3.1 Synchronous File Operations

**Issue:** Many synchronous file operations in a Node.js server:

```typescript
// utils.ts
fs.existsSync(resolved)
fs.statSync(resolved).mtimeMs

// gsc/tools.ts
fs.readFileSync(resolved, "utf-8")
```

**Recommendation:** Use async versions where possible, especially in hot paths:

```typescript
async function openIwd(resolved: string): Promise<Result<AdmZip>> {
  try {
    await fs.promises.access(resolved);
    const stats = await fs.promises.stat(resolved);
    // ...
  }
}
```

#### 3.2 Large File Handling

**Issue:** `iwd_grep` loads entire files into memory:

```typescript
const text = zip.readAsText(e); // Entire file in memory
const fileLines = text.split(/\r?\n/); // Another allocation
```

**Recommendation:** For very large files, consider streaming:

```typescript
// For files > 1MB, use streaming line-by-line processing
if (size > 1_000_000) {
  // Stream processing
}
```

#### 3.3 Regex Compilation in Hot Path

**Issue:** Regex compiled on every grep call:

```typescript
// iwd/tools.ts:767-779
if (is_regex) {
  searchRe = new RegExp(pattern, "i"); // Compiled every call
}
```

**Recommendation:** Cache compiled regexes:

```typescript
const regexCache = new LRUCache<string, RegExp>({ max: 50 });

function getOrCompileRegex(pattern: string, flags: string): RegExp {
  const key = `${pattern}:${flags}`;
  let re = regexCache.get(key);
  if (!re) {
    re = new RegExp(pattern, flags);
    regexCache.set(key, re);
  }
  return re;
}
```

---

## 4. Security Considerations

### ✅ Strengths

1. **Path Traversal Protection**: [`isSafeEntryPath()`](mcp-server/src/utils.ts:206) properly validates entry paths.

2. **Double-Check in Extract**: Extra validation in [`iwd_extract`](mcp-server/src/iwd/tools.ts:926) ensures paths stay within destination.

3. **No SQL Injection Risk**: No database queries.

### ⚠️ Areas for Improvement

#### 4.1 No Rate Limiting

**Issue:** No protection against abuse through repeated tool calls.

**Recommendation:** Consider adding rate limiting for expensive operations:

```typescript
const rateLimiter = new Map<string, number[]>();

function checkRateLimit(clientId: string, operation: string): boolean {
  // Implementation
}
```

#### 4.2 Backup File Security

**Issue:** `.bak` files are created with default permissions:

```typescript
await copyFile(iwdPath, bakPath); // Uses default umask
```

**Recommendation:** Set explicit permissions:

```typescript
await copyFile(iwdPath, bakPath);
await fs.promises.chmod(bakPath, 0o644);
```

#### 4.3 Temp File Cleanup

**Issue:** If process crashes during `atomicWrite`, `.tmp` files may remain:

```typescript
const tmpPath = targetPath + ".tmp";
zip.writeZip(tmpPath);
// Crash here leaves .tmp file
await rename(tmpPath, targetPath);
```

**Recommendation:** Add startup cleanup:

```typescript
// On server start, clean up orphaned .tmp files
async function cleanupOrphanedTempFiles() {
  // Find and remove *.tmp files older than 1 hour
}
```

---

## 5. Testing

### ✅ Strengths

1. **Comprehensive Integration Tests**: 1,745 lines of tests in [`index.test.ts`](mcp-server/src/index.test.ts).

2. **In-Memory Transport Testing**: Proper MCP protocol testing without actual stdio.

3. **Edge Case Coverage**: Tests for corrupt files, missing entries, path traversal.

4. **Smoke Test**: Dedicated stdio transport test in [`smoke.test.ts`](mcp-server/src/smoke.test.ts).

### ⚠️ Areas for Improvement

#### 5.1 Missing Unit Tests for GSC Tools

**Issue:** [`gsc/tools.ts`](mcp-server/src/gsc/tools.ts) has no direct unit tests - only linter/tokenizer tests.

**Recommendation:** Add tests for:

- `gsc_lookup` with various queries
- `gsc_template` variable substitution
- Error cases for missing templates

#### 5.2 No Performance Tests

**Issue:** No benchmarks for large file handling.

**Recommendation:** Add performance test suite:

```typescript
describe('Performance', () => {
  it('handles 10MB IWD file within 5 seconds', async () => {
    // ...
  });
});
```

#### 5.3 Test Isolation Issues

**Issue:** Tests share module-level state:

```typescript
// index.test.ts:279-286
beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await server.server.connect(serverTransport); // Modifies global 'server'
  await client.connect(clientTransport);
});
```

**Recommendation:** Create fresh server instance per test suite:

```typescript
beforeAll(async () => {
  const testServer = new McpServer({ name: "test", version: "1.0.0" });
  registerIwdTools(testServer);
  // ...
});
```

---

## 6. Documentation

### ✅ Strengths

1. **Good Inline Documentation**: JSDoc comments on public functions.

2. **Comprehensive README**: Clear installation and usage instructions.

3. **Workflow Documentation**: Detailed [`WORKFLOW.md`](docs/WORKFLOW.md).

### ⚠️ Areas for Improvement

#### 6.1 Missing API Documentation

**Issue:** No generated API documentation.

**Recommendation:** Add TypeDoc for API docs:

```json
// package.json
"scripts": {
  "docs": "typedoc --out docs/api src/index.ts"
}
```

#### 6.2 Incomplete Error Code Documentation

**Issue:** Linter error codes (TOK-001, VAR-001, etc.) not documented.

**Recommendation:** Create error code reference:

```markdown
## Linter Error Codes

| Code   | Type    | Description                    |
|--------|---------|--------------------------------|
| TOK-001| error   | Tokenization error             |
| VAR-001| warning | Potentially undefined variable |
| FUN-001| warning | Potentially undefined function |
| PAT-001| warning | Suspicious pattern detected    |
| STY-001| info    | Style suggestion               |
| FLOW-001| warning| Unreachable code detected      |
```

#### 6.3 Missing Contribution Guide

**Issue:** No `CONTRIBUTING.md` for open-source contributors.

**Recommendation:** Add contribution guidelines with:
- Development setup
- Code style requirements
- PR process
- Testing requirements

---

## 7. TypeScript Best Practices

### ✅ Strengths

1. **Strict Mode Enabled**: `strict: true` in tsconfig.

2. **Proper ESM Configuration**: Correct `Node16` module resolution.

3. **Type Exports**: Proper re-exports from index.ts.

### ⚠️ Areas for Improvement

#### 7.1 Missing Return Type Annotations

**Issue:** Many functions lack explicit return types:

```typescript
// utils.ts:385
export function errResult(text: string) { // No return type
  return { content: [{ type: "text" as const, text }], isError: true as const };
}
```

**Recommendation:** Add explicit return types:

```typescript
type McpResult = { 
  content: Array<{ type: "text"; text: string }>; 
  isError?: true 
};

export function errResult(text: string): McpResult {
  return { content: [{ type: "text", text }], isError: true };
}
```

#### 7.2 Type Assertion Safety

**Issue:** Several unsafe type assertions:

```typescript
// index.test.ts:311
const text = (result.content as Array<{ type: string; text: string }>)[0].text;
```

**Recommendation:** Use type guards:

```typescript
function isTextContent(content: unknown): content is Array<{ type: "text"; text: string }> {
  return Array.isArray(content) && content.every(c => c.type === "text");
}
```

#### 7.3 Missing Null Checks

**Issue:** Some nullable values accessed without checks:

```typescript
// iwd/tools.ts:803
const line = fileLines[i] ?? ""; // Good - uses nullish coalescing
// But elsewhere:
const match = searchRe.exec(line);
if (match) { ... } // Good
// But match.index is used without checking match is not null
```

---

## 8. Specific Code Issues

### 8.1 Potential Bug in iwd_patch

**File:** [`iwd/tools.ts:485`](mcp-server/src/iwd/tools.ts:485)

```typescript
for (let i = 0; i < count && patched.includes(oldStr); i++) {
  patched = patched.replace(oldStr, newStr);
  replaced++;
}
```

**Issue:** If `count` is 0, the loop never runs but no error is returned.

**Recommendation:** Validate count:

```typescript
if (count === 0) {
  return errResult("Error: count must be at least 1 or -1 for all occurrences.");
}
```

### 8.2 Inconsistent Glob Behavior

**File:** [`utils.ts:235`](mcp-server/src/utils.ts:235)

```typescript
export function globToRegex(pattern: string): RegExp {
  // ...
  return new RegExp(`^${regexStr}$`, "i"); // Case insensitive
}
```

**Issue:** Glob matching is case-insensitive, but entry names in IWD are case-sensitive.

**Recommendation:** Make case-sensitivity configurable:

```typescript
export function globToRegex(pattern: string, caseSensitive = false): RegExp {
  return new RegExp(`^${regexStr}$`, caseSensitive ? "" : "i");
}
```

### 8.3 Memory Leak in Linter

**File:** [`linter.ts`](mcp-server/src/gsc/linter.ts:148)

```typescript
export class GSCLinter {
  private tokens: Token[] = [];
  private errors: LintError[] = [];
  private variables: Set<string> = new Set();
  // ...
}
```

**Issue:** Module-level `knownBuiltins` and `knownDvars` Sets are populated once but never cleared.

**Recommendation:** This is actually fine for singleton Sets, but document the intent:

```typescript
/**
 * Module-level cache of known built-in functions.
 * Populated once on first import, never modified after.
 */
const knownBuiltins: Set<string> = (() => { ... })();
```

---

## 9. Recommendations Summary

### High Priority

| Issue | Impact | Effort |
|-------|--------|--------|
| Split iwd/tools.ts into modules | Maintainability | Medium |
| Add input validation bounds | Security | Low |
| Fix potential iwd_patch bug | Correctness | Low |
| Add GSC tools unit tests | Quality | Medium |

### Medium Priority

| Issue | Impact | Effort |
|-------|--------|--------|
| Standardize error handling pattern | Maintainability | Medium |
| Add async file operations | Performance | Medium |
| Document error codes | DX | Low |
| Add TypeDoc generation | DX | Low |

### Low Priority

| Issue | Impact | Effort |
|-------|--------|--------|
| Add rate limiting | Security | Medium |
| Add performance tests | Quality | Medium |
| Create CONTRIBUTING.md | DX | Low |
| Add regex caching | Performance | Low |

---

## 10. Proposed Refactoring Plan

### Phase 1: Quick Wins (1-2 days)

1. Add input validation bounds to Zod schemas
2. Fix `iwd_patch` count=0 edge case
3. Extract magic numbers to constants
4. Add explicit return types to utility functions
5. Document linter error codes

### Phase 2: Module Split (3-5 days)

1. Split `iwd/tools.ts` into sub-modules
2. Consolidate path resolution functions
3. Standardize error handling pattern
4. Add missing unit tests for GSC tools

### Phase 3: Performance & Security (2-3 days)

1. Convert synchronous file operations to async
2. Add regex caching for grep operations
3. Add temp file cleanup on startup
4. Add rate limiting framework

### Phase 4: Documentation (1-2 days)

1. Add TypeDoc configuration and generate API docs
2. Create CONTRIBUTING.md
3. Add performance benchmark tests
4. Update README with API documentation links

---

## Conclusion

The iw4x-toolkit codebase is well-architected with good separation of concerns and comprehensive testing. The main areas for improvement are:

1. **Modularity**: Breaking down the large `iwd/tools.ts` file
2. **Consistency**: Standardizing error handling and validation
3. **Performance**: Moving to async operations where beneficial
4. **Documentation**: Adding generated API docs and error code references

The codebase demonstrates solid engineering practices and is in good shape for continued development. The suggested improvements would enhance maintainability and developer experience without requiring fundamental architectural changes.
