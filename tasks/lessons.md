# Lessons Learned

Failure modes, detection signals, and prevention rules captured during development.

## ESM `__dirname` crash

- **Failure**: `__dirname` is not defined in ESM modules. Server crashed when DVAR resource was accessed.
- **Signal**: `ReferenceError: __dirname is not defined` at runtime.
- **Prevention**: Always use `import.meta.url` + `fileURLToPath` + `path.dirname` in ESM modules. Never use bare `__dirname` or `__filename`.

## Implicit dependency

- **Failure**: `zod` was used in `index.ts` but not listed in `package.json` dependencies. Worked locally because the MCP SDK pulls it transitively, but would fail in clean installs.
- **Signal**: `npm ls zod` shows it as a transitive dep only.
- **Prevention**: Every `import` in source must correspond to an explicit entry in `dependencies` or `devDependencies`.

## Plugin path traversal

- **Failure**: `plugin.json` used `"../skills/dvar-lookup"` which violates the Claude Code spec requirement that paths start with `./`. Could break after marketplace install (installed plugins can't reference files outside their directory).
- **Signal**: Spec alignment check caught it.
- **Prevention**: Always use `./` prefix for plugin paths. Run spec alignment checks before shipping.

## marketplace.json non-standard fields

- **Failure**: Added `id`, top-level `description`, and `owner.url` fields that aren't in the official schema. Not breaking, but messy.
- **Signal**: Spec comparison against official docs.
- **Prevention**: Check the official schema before adding fields. Only use documented fields.

## Large knowledge file generation

- **Failure**: Research agent hit 32K output token limit trying to write `gsc-builtins.json` in a single response. File is too large.
- **Signal**: `API Error: Claude's response exceeded the 32000 output token maximum`
- **Prevention**: For large data files, write in chunks using multiple agent calls or Write tool calls. Don't try to generate 400KB+ of JSON in a single agent response.

## Test imports trigger server startup

- **Failure**: Importing `index.ts` in tests caused `main()` to run, connecting to stdio and hanging the test process.
- **Signal**: Tests hang indefinitely on import.
- **Prevention**: Guard `main()` with an `isDirectRun` check comparing `import.meta.url` against `process.argv[1]`. Export functions separately for testing.
