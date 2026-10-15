# Project Status

**Last updated:** 2026-10-15 · **Version:** 3.0.0

Start here when picking the project back up.

## What it is

IW4X/MW2 modding toolkit shipped as a Claude Code plugin. 27 commands (IWD archives, GSC tooling, DVAR knowledge) exposed two ways from one command list:

- **MCP server**: `node mcp-server/dist/index.js`, registered by `.claude-plugin/plugin.json` as server `iw4x`
- **CLI**: `iw4x-toolkit <command> --arg value` (`mcp-server/dist/bin.js`, or a Bun-compiled binary)

See [README.md](README.md) for usage and [CONTRIBUTING.md](CONTRIBUTING.md) for layout and how to add a command.

## Decisions in force

| Decision | Date | Record |
|---|---|---|
| Keep the MCP server and add a CLI, both generated from one in-repo command list | 2026-09-17 | `docs/plans/2026-09-16-incur-spike.md` |
| MCP TypeScript SDK v2 (spec 2026-07-28), zod 4 | 2026-09-17 | commit `ab95a2f` |
| Knowledge base embedded in every build (rebuild after editing `knowledge/*.json`) | 2026-09-17 | commit `f200663` |
| Stay on TypeScript; Go/Rust/Deno may be better long term if binary size (84 MB) or startup becomes a problem | 2026-09-17 | — |

Superseded: the May 2026 plan to drop the MCP server, rename to `cod-forge`, and ship CLI-only (`docs/plans/2026-05-29-architecture-v2.md`).

## Open work

- Push `master` to GitHub
- Binary release workflow (GitHub Action running `build:binary` per platform)
- Interface ideas in `docs/plans/2026-09-16-interfaces-research.md`: `.iwd` git diff driver, published knowledge base + `llms.txt`, game bridge (rcon + console log, dedicated server only), watch mode, CI/pre-commit hooks, tree-sitter grammar
- Roadmap items in `docs/TODO.md`
