# Phase 3: Tests & Arch Quality - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Untested code paths get vitest coverage, structural inconsistencies are eliminated, and all ≥99 tests pass after every change. No new tools, no new features — pure test coverage and arch cleanup.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All areas in this phase are left to Claude's judgment. The user has no preferences — implement correctly and minimally.

**Backup test fix (for ARCH-02)**
- Fix the 4 failing tests in `index.test.ts` to match the current timestamped `.bak` behavior
- Code creates `file.iwd.20260223_143045.bak` (preserves multiple backups — better behavior)
- Update tests to check for existence of any file matching `iwdPath + /\.\d{8}_\d{6}\.bak$/` pattern, or use `fs.readdirSync` to find any `.bak`-suffixed file in the temp dir
- Do NOT revert code to plain `.bak` — timestamped backups are strictly better

**Formatter tests (TEST-01)**
- `formatter.ts` already has ~20 tests in `gsc.test.ts` covering the `format(tokens)` function
- Add any missing edge cases: deeply nested blocks, comment tokens, empty input, indentation with custom `indentSize`
- If existing coverage is sufficient per vitest coverage report, no new tests needed — confirm and document

**Knowledge/IWD cache tests (TEST-02)**
- Target the IWD mtime cache in `utils.ts` (`iwdCache` Map, `IWD_CACHE_MAX = 10`)
- Cover three scenarios:
  1. **Cache hit** — same mtime: `openIwd` returns cached zip without re-reading file
  2. **Cache miss** — changed mtime: stale entry evicted, file re-read
  3. **LRU eviction** — open >10 distinct IWD files, verify oldest entry is evicted
- Tests should mock or stub `fs.statSync` / `fs.promises.stat` to avoid real file I/O

**Linter edge cases (TEST-03)**
- Add tests for `isSafeEntryPath` in `utils.ts`: path traversal via `../`, Windows-style `..\\`, URL-encoded `%2e%2e`, Unicode normalization edge cases
- Add tests for known linter false-positive patterns from CONCERNS.md: `===` and `!==` operators flagged as errors (they should be warned about, not blocked), arrow functions, object literals
- Do not attempt to fix the regex-based linter's fundamental accuracy limits — only add tests that document current behavior

**Dead exports (ARCH-01)**
- Remove `export` keyword from `getKnownBuiltins()` and `getKnownDvars()` in `linter.ts` — both are internal helpers only called within the same file
- Audit remaining exports in `utils.ts`, `formatter.ts`, `linter.ts` for any other unused public surface — remove exports that have no external consumers
- Do not change function signatures or behavior, only visibility

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `.planning/REQUIREMENTS.md` — TEST-01, TEST-02, TEST-03, ARCH-01, ARCH-02 definitions
- `.planning/ROADMAP.md` — Phase 3 success criteria (formatter tests, cache tests, linter edge cases, dead exports, ≥99 tests green)

### Known edge cases and fragile areas
- `.planning/codebase/CONCERNS.md` — "Regex/Token-Based Linter" section (false positives/negatives), "Path Traversal" section (isSafeEntryPath edge cases), "Rate Limiting" section

### Code under change
- `mcp-server/src/utils.ts` — `iwdCache`, `IWD_CACHE_MAX`, `isSafeEntryPath`, `ensureBackup`
- `mcp-server/src/gsc/formatter.ts` — `format()` function, `FormatOptions` interface
- `mcp-server/src/gsc/linter.ts` — `getKnownBuiltins()`, `getKnownDvars()` (export removal)
- `mcp-server/src/index.test.ts` — 4 failing backup tests to fix
- `mcp-server/src/gsc/gsc.test.ts` — existing formatter + linter tests to extend

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `gsc.test.ts` — already imports `format` and `lint`; extend in-place rather than creating new test files
- `index.test.ts` — already imports `ensureBackup`; fix existing test assertions in-place

### Established Patterns
- Tests use `vitest` with `describe`/`it`/`expect` — no custom test utilities
- Temp dirs in tests use `fs.mkdtempSync(path.join(os.tmpdir(), 'iw4x-'))` pattern
- Cache tests will need `vi.spyOn` or mock of `fs.statSync`/`fs.promises.stat` to control mtime

### Integration Points
- All tests run via `vitest run` from `mcp-server/` — single test suite, no splitting
- Export changes in `linter.ts` may require updating any re-exports in `index.ts` (check line ~37)

</code_context>

<specifics>
## Specific Ideas

- No specific references or "I want it like X" moments — straightforward test coverage and cleanup pass

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-tests-arch-quality*
*Context gathered: 2026-03-23*
