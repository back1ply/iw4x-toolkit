# Design: Case-Insensitive Collision Detection + DVAR Integrity Check

**Date:** 2026-02-27
**Status:** Approved

---

## Feature 1 — DEF-001: Case-Insensitive Function Name Collision (gsc_lint enhancement)

### Problem
GSC is case-insensitive. Two functions named `isReallyAlive` and `isreallyalive` cause a script compile crash that is invisible to the current linter.

### Design
Augment `GSCLinter.collectDefinitions()` in `mcp-server/src/gsc/linter.ts`:

- Add a private field: `private caseMap: Map<string, { original: string; line: number }> = new Map()`
  - Keyed by `name.toLowerCase()`
- When a function definition token is encountered:
  - Compute `lower = token.value.toLowerCase()`
  - If `caseMap.has(lower)` AND `caseMap.get(lower).original !== token.value` → push `DEF-001` error
  - Always update `caseMap` with the new name
- Reset `caseMap` in `lint()` alongside other fields

**Error format:**
```
[error] DEF-001 (line M, col C): Function name collision: 'Foo' (line N) and 'foo' are the same name in GSC (case-insensitive)
```

**Files changed:** `mcp-server/src/gsc/linter.ts` only.

---

## Feature 2 — `dvar_integrity_check`: Standalone DVAR Validation Tool

### Problem
Typos in DVAR name strings passed to `getDvar("name")` etc. silently return empty/default values at runtime. There is no static check today.

### Design
New tool registered in `mcp-server/src/gsc/tools.ts`.

**Tool name:** `dvar_integrity_check`

**Input schema:**
- `path` (string, optional) — path to a `.gsc` / `.gsh` file
- `content` (string, optional) — raw GSC source (one of the two required)

**Logic:**
1. Load source from file or `content` parameter.
2. Extract all DVAR accesses with a single regex pass:
   - Captures: function name (`getDvar`, `setDvar`, etc.), extracted DVAR name string, line number.
   - Regex pattern: `/\b(getDvar|getDvarInt|getDvarFloat|getDvarVector|setDvar|setDvarifuninitialized)\s*\(\s*"([^"]+)"/gi`
3. Load known DVARs via existing `getKnownDvars()` (lowercase-normalised, 1,978 entries from `dvars.json`).
4. Classify each hit:
   - **known** — `dvars.has(name.toLowerCase())`
   - **unknown** — potential typo / custom DVAR
5. Output:
   - Unknown DVARs listed with line numbers and the call site function
   - Known DVARs shown as a compact count summary
   - Total counts: X accesses, Y known, Z unknown

**Files changed:** `mcp-server/src/gsc/tools.ts` only (new `server.registerTool` block).

---

## Acceptance Criteria

- `gsc_lint` on a file with `isAlive()` and `isalive()` both defined reports `DEF-001` error.
- `dvar_integrity_check` on a file with `getDvar("sv_maxclients")` reports it as known.
- `dvar_integrity_check` on a file with `getDvar("sv_maxcliants")` (typo) reports it as unknown.
- `dvar_integrity_check` on a file with `getDvar(someVar)` (dynamic) silently skips it (no string literal to extract).
- Both features covered by tests in `mcp-server/src/gsc/gsc.test.ts`.
