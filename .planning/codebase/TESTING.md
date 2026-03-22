# Testing

## Framework
**Vitest** — configured in `mcp-server/package.json`. Run via `npm test` in `mcp-server/`.

## Test File Locations

Tests are co-located with source:
- `mcp-server/src/index.test.ts` — utility and integration tests (primary test suite, ~64KB)
- `mcp-server/src/gsc/gsc.test.ts` — GSC core unit tests (tokenizer, linter, formatter)
- `mcp-server/src/gsc/tools.test.ts` — GSC MCP tool integration tests
- `mcp-server/src/smoke.test.ts` — full-stack smoke test
- `mcp-server/src/benchmark.test.ts` — performance benchmarks

## Test Categories

### Unit Tests (pure logic)
Test pure functions without I/O. Primary examples:
- `getCachedRegex`, `globToRegex`, `isSafeEntryPath`, `normalizeEntry`, `isBinaryEntry`
- GSC tokenizer, linter rules, formatter, outline extractor

### Integration Tests (real files)
Use real `adm-zip` archives and temp directories — no mocking framework. Pattern:
```typescript
// Create a real temp IWD in a temp dir
const tmpDir = fs.mkdtempSync(...);
const zip = new AdmZip();
zip.addFile("test.gsc", Buffer.from("..."));
zip.writeZip(path.join(tmpDir, "test.iwd"));
// Call the tool function
```

### Smoke Test
`smoke.test.ts` spawns the compiled `dist/index.js` bundle as a subprocess and sends real MCP protocol JSON-RPC messages over stdin/stdout. Validates end-to-end tool registration and response shape without mocking.

### Benchmarks
`benchmark.test.ts` measures performance of hot paths (IWD open, grep, outline, format).

## Mocking Strategy

**No mocking framework used.** Tests use:
- Real `AdmZip` instances
- Real `fs` I/O in system temp directories (`fs.mkdtempSync`)
- Real JSON knowledge files from `knowledge/`
- Cleanup in `afterEach`/`afterAll` hooks

## Result Type Testing

Tools return discriminated union results — tests check the `ok` flag:
```typescript
const result = someToolFunction(args);
expect(result.ok).toBe(true);
if (result.ok) {
  expect(result.value).toMatchObject({ ... });
}
```

## Known Test Gaps

- Startup `.tmp` cleanup logic (`cleanupOrphanedTempFiles`) has no coverage
- IWD LRU cache eviction path not tested
- Rate limiting bypass scenarios not covered
- Some GSC modern syntax edge cases untested
- Path traversal validation edge cases at boundaries

## Running Tests

```bash
cd mcp-server
npm test          # run all tests once
npm run test:watch # watch mode
npm run build     # compile before smoke test
```
