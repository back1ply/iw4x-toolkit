# Contributing to iw4x-toolkit

## Development Setup

Prerequisites: Node.js 22.12+ and npm. [Bun](https://bun.sh) is only needed for `npm run build:binary`.

```bash
git clone https://github.com/YOUR_USERNAME/iw4x-toolkit.git
cd iw4x-toolkit/mcp-server
npm install
npm run build   # dist/index.js (MCP server) and dist/bin.js (CLI)
npm test
```

`dist/index.js` and `dist/bin.js` are committed so plugin installs work without `npm install`. Rebuild and commit them with every source change.

## Project Structure

```
iw4x-toolkit/
├── .claude-plugin/         # plugin.json (skills + MCP server) and marketplace.json
├── knowledge/              # knowledge base JSON, compiled into the build
├── skills/                 # Claude Code skills
├── docs/                   # user docs; docs/plans/ holds design notes
└── mcp-server/
    ├── dist/               # committed bundles
    └── src/
        ├── command.ts      # Command contract + MCP adapter (registerCommands)
        ├── commands.ts     # the one command list both adapters use
        ├── mcp.ts          # builds the MCP server (no side effects)
        ├── index.ts        # MCP entry: node dist/index.js
        ├── cli.ts, bin.ts  # CLI adapter and its executable entry
        ├── utils.ts        # IWD cache, backups, atomic writes, path safety
        ├── iwd/            # IWD archive commands
        ├── gsc/            # tokenizer, linter, formatter, outline, orphans, GSC commands
        └── knowledge/      # embedded knowledge data + DVAR/HUD commands
```

Tests live next to the code they cover (`tools.ts` → `tools.test.ts`).

## Adding a Command

Every tool is one `command({...})` definition. The MCP tool and the CLI command are both generated from it, so there is nothing else to register.

1. Add the definition to the module's `*_COMMANDS` list (e.g. `READ_COMMANDS` in `src/iwd/read-tools.ts`):
   - `name` (snake_case, used by both MCP and CLI), `title`, `description`
   - `input`: zod shape describing the arguments
   - `annotations`: `readOnlyHint` is required; set `destructiveHint: true` for anything that modifies files
   - `run(args)`: return plain data; throw `CommandError` for expected failures (bad input, missing file)
   - `render(data, args)`: the text agents and CLI users see
2. For IWD writes, use `requireIwd`, `requireSafeEntry`, and `saveIwd` from `utils.ts`. They handle path safety, backup, atomic write, and cache invalidation.
3. Add tests for the data and the rendered text. `src/cli.test.ts` already checks that MCP and CLI stay in sync.
4. Update the command list in `README.md`.

## Code Style

- TypeScript strict mode; ESM imports with `.js` extensions for local modules.
- Files kebab-case, functions camelCase, classes/types PascalCase, constants SCREAMING_SNAKE_CASE.

## Testing

```bash
npm test                          # all tests
npx vitest run src/cli.test.ts    # one file
npx vitest run -t "iwd_grep"      # tests whose name matches
```

## Pull Requests

1. Branch from `master` (`git checkout -b feat/my-change`).
2. Make the change with tests; run `npm test` and `npm run build`.
3. Commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
4. Push and open a pull request.

Open an issue for bugs, feature requests, or questions.
