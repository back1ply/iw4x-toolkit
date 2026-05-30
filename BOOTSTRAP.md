# V2 Refactor Status

**Last updated:** 2026-05-30  
**Repo:** `F:\Shehab Projects\iw4x-toolkit` — all development stays here  
**Publish as:** `@back1ply/cod-forge` on npm (name reserved, currently private placeholder)  
**Architecture:** `docs/plans/2026-05-29-architecture-v2.md`

---

## What This Project Is

**Redesigned MCP server + skills** for classic CoD modding (IW2/IW3/T4/IW4). npm: `@back1ply/cod-forge`. No binary.

The V1 problem was two things: (1) logic coupled to MCP handlers, (2) `iwd_read` returned file contents through the protocol, flooding context. Both are fixed by design:

- **Core library** (`src/gsc/`, `src/iwd/`, `src/knowledge/`) — pure logic, no MCP deps
- **MCP adapter** (`src/mcp/`) — thin wrappers, ~30–50 lines/tool
- **Redesigned IWD tools** — `iwd_extract` writes to disk, returns a path list. File contents never enter the protocol. Claude uses native Read/Edit/Write directly.
- **Skills** — teach the extract→edit→pack workflow. No binary guard needed.

---

## Status

### Done
- [x] `@back1ply/cod-forge@0.0.1` published to npm — name reserved
- [x] Git repo initialized at `F:\Shehab Projects\cod-forge` (not yet pushed to GitHub)
- [x] Architecture V2 doc finalized (`iw4x-toolkit/docs/plans/2026-05-29-architecture-v2.md`)
- [x] Binary name `codforge` verified clean across npm / brew / apt / cargo / GitHub

### Not Done
- [ ] GitHub repo created (`back1ply/cod-forge`) and pushed
- [x] Project structure scaffolded (`src/gsc/`, `src/iwd/`, `src/utils.ts`, `knowledge/iw4/`)
- [x] `package.json` fleshed out (scripts, devDeps, bin, tsconfig)
- [x] Core source files copied from old repo (`gsc/`, `iwd/`, `utils.ts`, `knowledge/`)
- [x] MCP wrappers extracted — `src/gsc/core.ts` and `src/iwd/core.ts` contain non-MCP logic
- [x] `marketplace.json` added to repo root
- [x] `.claude-plugin/plugin.json` created (no `version` field — auto-updates via git SHA)
- [x] Skills copied to `.claude-plugin/skills/` (still reference old MCP tools — needs update next)
- [ ] `src/mcp/` — thin MCP adapter, all 13 tools. Redesign `iwd_extract`/`iwd_pack` to use disk (not protocol).
- [ ] Tests migrated and passing (99 tests in old repo)
- [ ] Skills updated: rename tool references to `mcp__cod_forge__*`; add `iwd-workflow` skill
- [ ] No CLI binary — removed from scope entirely
- [ ] Tests migrated and passing (99 tests exist in `src/gsc/gsc.test.ts`)
- [ ] `bun build --compile` pipeline verified end-to-end
- [ ] GitHub repo created and pushed
- [ ] Deprecation notice added to old MCP server startup
- [ ] v2.0 tagged and GitHub Release binaries uploaded

---

## What to Copy from `iw4x-toolkit` (old repo)

### Copy as-is (no changes needed)
| Source | Destination | Notes |
|--------|-------------|-------|
| `knowledge/dvars.json` | `knowledge/iw4/dvars.json` | Move into per-engine subfolder |
| `knowledge/gsc-builtins.json` | `knowledge/iw4/gsc-builtins.json` | Same |
| `knowledge/gsc-anti-patterns.json` | `knowledge/iw4/gsc-anti-patterns.json` | Same |
| `knowledge/gsc-menu-hud.json` | `knowledge/iw4/gsc-menu-hud.json` | Same |
| `knowledge/templates.json` | `knowledge/iw4/templates.json` | Same |
| `mcp-server/src/utils.ts` | `src/utils.ts` | Shared helpers, no MCP deps |

### Copy and strip MCP wrappers
These files have two layers: core logic (keep) and MCP tool handler (discard).
The pattern is: extract the functions called by the tool handler into `src/<domain>/`, 
then wire them to CLI commands in `src/cli/commands/`.

| Source | Core logic to keep | MCP wrapper to discard |
|--------|-------------------|------------------------|
| `mcp-server/src/gsc/tokenizer.ts` | entire file | n/a (pure logic) |
| `mcp-server/src/gsc/formatter.ts` | entire file | n/a (pure logic) |
| `mcp-server/src/gsc/linter.ts` | entire file | n/a (pure logic) |
| `mcp-server/src/gsc/outline.ts` | entire file | n/a (pure logic) |
| `mcp-server/src/gsc/symbols.ts` | entire file | n/a (pure logic) |
| `mcp-server/src/gsc/tools.ts` | the functions it calls | MCP handler boilerplate |
| `mcp-server/src/iwd/archive-tools.ts` | entire file | n/a (pure logic) |
| `mcp-server/src/iwd/read-tools.ts` | entire file | n/a (pure logic) |
| `mcp-server/src/iwd/write-tools.ts` | entire file | n/a (pure logic) |
| `mcp-server/src/iwd/diff-tools.ts` | entire file | n/a (pure logic) |
| `mcp-server/src/iwd/sync-tools.ts` | entire file | n/a (pure logic) |
| `mcp-server/src/iwd/tools.ts` | the functions it calls | MCP handler boilerplate |
| `mcp-server/src/knowledge/tools.ts` | dvar/builtin lookup logic | MCP handler boilerplate |

### Copy and update (skills need MCP → CLI rewrite)
| Source | Destination | What changes |
|--------|-------------|--------------|
| `skills/gsc-writer/SKILL.md` | `.claude-plugin/skills/gsc-writer.md` | Replace all `mcp__iw4x__*` calls with `codforge` CLI commands |
| `skills/dvar-lookup/SKILL.md` | `.claude-plugin/skills/dvar-lookup.md` | Same |

### Do not copy
- `mcp-server/src/index.ts` — MCP server entry, replaced by CLI
- `mcp-server/node_modules/` — obviously
- `mcp-server/package-lock.json` — start fresh with bun
- `.mcp.json` — deprecated, not applicable

### New files (to be created, not copied)
- `src/cli/index.ts` — CLI entry point (commander or citty)
- `src/cli/commands/iwd.ts` — extract, pack, list, grep, diff, rename, rm, cp, info
- `src/cli/commands/gsc.ts` — lint, format, outline, symbols, template
- `src/cli/commands/knowledge.ts` — dvar, lookup
- `.claude-plugin/plugin.json` — plugin manifest (no `version` field)
- `marketplace.json` — marketplace catalog pointing at this repo
- `tsconfig.json` — fresh config targeting bun
- `package.json` — already exists (stub), needs scripts + deps added

---

## Target `package.json` scripts (to add when scaffolding)

```json
{
  "scripts": {
    "build": "bun build src/cli/index.ts --compile --outfile dist/codforge.exe",
    "build:linux": "bun build src/cli/index.ts --compile --target=bun-linux-x64 --outfile dist/codforge",
    "build:mac": "bun build src/cli/index.ts --compile --target=bun-darwin-arm64 --outfile dist/codforge-mac",
    "dev": "bun run src/cli/index.ts",
    "test": "bun test"
  }
}
```

---

## Target Directory Layout

```
cod-forge/
  src/
    cli/
      index.ts          ← entry point, registers all commands
      commands/
        iwd.ts
        gsc.ts
        knowledge.ts
    gsc/                ← copied from mcp-server/src/gsc/ (pure logic files)
      tokenizer.ts
      formatter.ts
      linter.ts
      outline.ts
      symbols.ts
    iwd/                ← copied from mcp-server/src/iwd/ (pure logic files)
      archive-tools.ts
      read-tools.ts
      write-tools.ts
      diff-tools.ts
      sync-tools.ts
    knowledge/
      loader.ts         ← thin wrapper to load per-engine JSON
  knowledge/
    iw4/
      dvars.json
      gsc-builtins.json
      gsc-anti-patterns.json
      gsc-menu-hud.json
      templates.json
  .claude-plugin/
    plugin.json         ← no version field
    skills/
      gsc-writer.md
      dvar-lookup.md
      iwd-workflow.md   ← new skill (teach extract→edit→pack pattern)
  marketplace.json
  dist/
    cli.js              ← stub (already exists for npm placeholder)
  package.json
  .gitignore
  BOOTSTRAP.md          ← this file
```

---

## Key Decisions (already made, do not revisit)

| Decision | Rationale |
|----------|-----------|
| Drop MCP server | All target clients have native shell — verified |
| Binary name `codforge` | `forge` is taken by Foundry (Ethereum), Atlassian, Autodesk, Laravel |
| npm package `@back1ply/cod-forge` | `cod-forge` blocked by npm similarity to `node-forge` |
| No `version` in plugin.json | Auto-updates via git SHA — no manual version bumps |
| No `ref`/`sha` in marketplace.json | Same — tracks default branch HEAD |
| TypeScript + Bun compile | Zero rewrite cost, single binary, 8-15ms cold start |
| Knowledge files under `knowledge/<engine>/` | Multi-title support (iw3, iw4, t4) from day one |
