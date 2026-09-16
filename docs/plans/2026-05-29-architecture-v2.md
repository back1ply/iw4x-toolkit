# iw4x-toolkit — MCP Tool Reference & What's Next

**Last updated:** 2026-05-31

---

## Full Tool Surface

### IWD — archive operations

| Tool | Purpose |
|------|---------|
| `iwd_list` | List files inside an IWD |
| `iwd_read` | Read a single file from IWD |
| `iwd_info` | Archive metadata (file count, sizes) |
| `iwd_grep` | Search file contents inside IWD |
| `iwd_write` | Write/overwrite a file in IWD |
| `iwd_patch` | Partial patch (string replace) inside IWD entry |
| `iwd_remove` | Delete a file from IWD |
| `iwd_extract` | Extract IWD to disk |
| `iwd_pack` | Pack a directory into IWD |
| `iwd_sync` | Sync changed files back into IWD |
| `iwd_diff` | Diff two IWD archives |
| `iwd_rename` | Rename a file inside IWD |
| `iwd_copy` | Copy a file inside IWD |

### GSC — language tooling

| Tool | Purpose |
|------|---------|
| `gsc_lint` | Lint GSC source — errors + warnings |
| `gsc_fix` | Auto-fix lint errors where possible |
| `gsc_format` | Format GSC source code |
| `gsc_outline` | Extract function list from a GSC file |
| `gsc_lookup` | Search built-in function signatures |
| `gsc_template` | Generate boilerplate from templates |
| `gsc_anti_patterns` | Query the IW4-specific anti-pattern knowledge base |
| `iwd_index_symbols` | Scan IWD archives → build in-memory function symbol map |
| `gsc_find_orphans` | Find call sites with no local/included/indexed definition |

### Knowledge

| Tool | Purpose |
|------|---------|
| `dvar_search` | Search DVAR definitions and valid value ranges |
| `dvar_integrity_check` | Validate DVAR usage in GSC against known definitions |
| `gsc_menu_hud` | Query Menu/HUD layout patterns and anti-patterns |

---

## Key Workflows

### 1. Porting a GSC file from another mod

```
iwd_index_symbols(promod.iwd, iw_mp.iwd)   ← build symbol map once per session
iwd_read(source.iwd, "maps/mp/gametypes/sd.gsc")
gsc_lint(content)                           ← catch syntax issues
gsc_find_orphans(content)                   ← find unknown call sites
gsc_lookup(unknown_fn)                      ← check if it's a builtin
→ fix / stub unknowns, then iwd_write back
```

### 2. Editing GSC in place (surgical fix)

```
iwd_read → gsc_lint → gsc_fix (auto) → gsc_format → iwd_write
```

### 3. Checking a DVAR before using it

```
dvar_search("cg_fov")        ← get range, default, flags
dvar_integrity_check(code)   ← validate all DVAR accesses in a file
```

### 4. Writing new GSC (LLM-assisted)

```
gsc_anti_patterns()          ← prime LLM with IW4 gotchas before generating
gsc_template("init_func")    ← scaffold boilerplate
gsc_lint(generated_code)     ← validate before writing
```

---

## What's Still Missing

These are gaps worth addressing next:

| Gap | Why it matters |
|-----|---------------|
| `gsc_find_orphans` false positives | No cross-file include resolution yet — flags builtins called via pointer |
| No `iwd_batch_read` | Reading 20 files from an IWD costs 20 round trips |
| `gsc_lookup` has no fuzzy match | Exact name only — typos return nothing |
| No linter rule for wrong arg counts | `PAT-0xx` catches syntax, not wrong arity on builtins |
| Templates are static strings | No param substitution — LLM has to edit manually after |
| `dvar_integrity_check` doesn't catch string misuse | Only checks name validity, not type coercion bugs |

---

## Architecture (current, stable)

```
mcp-server/src/
  gsc/
    linter.ts       ← lint rules + PAT-xxx anti-pattern rules
    formatter.ts    ← GSC formatter
    outline.ts      ← function extraction
    symbols.ts      ← in-memory symbol registry (iwd_index_symbols)
    tokenizer.ts    ← shared tokenizer
    tools.ts        ← all GSC + symbol MCP tool registrations
  iwd/
    read-tools.ts   ← iwd_list, iwd_read, iwd_info, iwd_grep
    write-tools.ts  ← iwd_write, iwd_patch, iwd_remove
    archive-tools.ts← iwd_extract, iwd_pack, iwd_sync
    diff-tools.ts   ← iwd_diff, iwd_rename, iwd_copy
  knowledge/
    tools.ts        ← dvar_search, dvar_integrity_check, gsc_menu_hud
  utils.ts          ← shared helpers (openIwd, getKnowledgeDir, etc.)
  index.ts          ← server entry point, wires everything up
```

Logic lives in the core modules. MCP handlers in `tools.ts` files are thin wrappers (~30–50 lines each). No planned rename or marketplace distribution — keep it as `iw4x-toolkit`.
