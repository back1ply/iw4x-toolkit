# Project Notes

Working notes and context for the iw4x-toolkit project. Kept in repo so nothing is lost between sessions.

## Architecture

- MCP server: `mcp-server/src/index.ts` (ESM, Node16 module resolution)
- Knowledge base: `knowledge/dvars.json` (1,731 entries, 434KB)
- Skill: `skills/dvar-lookup/SKILL.md`
- Plugin manifest: `.claude-plugin/plugin.json`
- Tests: `mcp-server/src/index.test.ts` (27 tests, vitest, MCP InMemoryTransport for integration tests)
- `main()` is guarded with `isDirectRun` check so imports don't trigger stdio connection

## Conventions

- Plugin paths must start with `./` (not `../`) per Claude Code spec
- `server.tool()` / `server.resource()` are deprecated in MCP SDK — prefer `registerTool()` / `registerResource()` when upgrading
- dist/ is committed for marketplace installs
- Knowledge files in `knowledge/` exposed as MCP resources are the most token-efficient way to give context

## In Progress

- `knowledge/gsc-builtins.json` — GSC built-in function reference. Not yet created.
  - Research agent hit 32K token limit trying to write the JSON — file is too large for single agent
  - Strategy: use GitHub MCP to pull real signatures from iw4x-rawfiles, xensik/gsc-tool, leafized/GSC-Functions
  - Write the JSON in chunks or use multiple smaller agents
  - Schema: name, calledOn, params, returnType, description, category
- Planned knowledge files: `weapon-defs.json`, `fastfile-assets.json`, `menu-properties.json`

## MCP Servers Available

- Tavily (search/extract)
- GitHub MCP
- Context7

## Lessons Learned

- ESM modules: bare `__dirname` doesn't work — must use `import.meta.url` + `fileURLToPath`
- `zod` was an implicit dependency via MCP SDK but must be explicit in `package.json`
- Plugin spec requires `./` prefix on paths (not `../`)
- `marketplace.json` schema only supports `owner.name` and `owner.email` — no `url` field
- Large knowledge files (400KB+) exceed single-agent output limits — write in chunks
- MCP InMemoryTransport is the cleanest way to integration-test tool handlers
- Guard `main()` with `isDirectRun` so test imports don't trigger stdio connection
