# Concerns

## Technical Debt

### Regex/Token-Based Linter (Not AST)
`src/gsc/linter.ts` uses tokenizer + regex patterns rather than a true AST. This limits accuracy of lint rules and makes it hard to add cross-expression analysis (e.g., unused variables, type narrowing).
- **Impact**: false positives/negatives in lint output; hard to extend
- **Fix path**: build a proper GSC parser/AST

### Synchronous I/O in Hot Paths
`adm-zip` and some `fs` operations are synchronous. For small IWD files this is fine; for large archives it blocks the Node event loop.
- **Impact**: server unresponsive during large IWD reads
- **Affected**: `openIwd` (sync), archive-tools.ts

### No Cross-File Static Analysis
GSC symbol index (`symbols.ts`) operates per-file. There is no workspace-wide indexing, so tools cannot detect cross-file symbol resolution errors or duplicate definitions across IWD entries.

## Fragile Areas

### Atomic Write Race Condition
`atomicWrite` writes `.tmp` then renames — correct for single-writer scenarios. Concurrent writes to the same IWD entry from multiple tool calls could corrupt the archive. No file-level locking exists.

### Orphaned Temp File Cleanup
`cleanupOrphanedTempFiles()` in `index.ts` only scans `process.cwd()` and only removes files older than 1 hour. If the server is run from a different directory than where IWD writes occur, temp files won't be cleaned.

### Path Resolution Fallbacks
`getKnowledgeDir()` uses multiple fallback strategies to find the `knowledge/` directory (relative to CWD, relative to `import.meta.url`, etc.). This is fragile when the server is bundled or run from unexpected locations.

### IWD Cache Capacity
The IWD LRU cache in `utils.ts` caps at 10 entries. Workflows that touch more than 10 distinct IWD files will see repeated re-opens. The cap is not configurable.

## Security

### Path Traversal
`isSafeEntryPath` validates entry names in IWD archives to prevent `../../` traversal. Edge cases at Unicode normalization boundaries or Windows/Unix path separator mixing may not be fully covered.

### Rate Limiting
`checkRateLimit` tracks call counts in a module-level `Map`. The map grows unboundedly if many distinct keys are used (e.g., one per IWD path). No eviction or reset mechanism exists.

### Binary File Handling
`BINARY_EXTENSIONS` is a static allowlist. Unknown binary formats not on the list will be served as UTF-8 text, potentially returning garbled content.

## Performance

### grep Output Limit
`iwd_grep` truncates at `GREP_MAX_MATCHES_DEFAULT = 50`. This prevents runaway output but may cause confusion when more matches exist and the caller doesn't know results were cut.

### Knowledge JSON Re-parse
Knowledge files (dvars.json, gsc-builtins.json) are JSON.parsed on cache miss. The DVAR file in particular is large. The mtime-keyed cache mitigates this but a cold start or file touch forces a re-parse.

### Sequential Entry Extraction
`adm-zip` extracts entries sequentially. Bulk IWD operations (e.g., sync_tools comparing many entries) cannot parallelize extractions.

## Dependency Risks

### adm-zip Memory
`adm-zip` loads the entire ZIP into memory when opened. Large IWD files (>50MB) will spike memory. No streaming support.

### adm-zip Maintenance
`adm-zip` is not actively maintained. It lacks support for ZIP64 (archives >4GB) and some compression methods. If IWD files using unsupported formats are encountered, they will fail silently or corrupt.

### Synchronous Tokenizer
`tokenize()` in `gsc/tokenizer.ts` is synchronous and runs on the event loop. For large GSC files (rare but possible), this blocks other tool calls.

## Missing Features (Known Gaps)

- Case-insensitive collision detection for IWD entries (CoD4 paths are case-insensitive on Windows)
- `gsc_lint` does not support modern IW4X GSC extensions (newer syntax variants)
- No watch mode — knowledge files are polled per-request rather than watched with `fs.watch`
- No tool for batch GSC formatting across all entries in an IWD
