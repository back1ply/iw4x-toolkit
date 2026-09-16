# Spike: wevm/incur as the shared MCP + CLI registry

**Date:** 2026-09-16
**Question:** Can one command definition drive both the MCP tools and a new `iw4x` CLI without hand-building a registry?
**Answer:** Yes, with three known costs: a zod 3 → 4 upgrade, a move to the alpha v2 MCP server SDK, and a one-line workaround for compiled binaries until incur ships the fix.

Spike code lives outside the repo (session scratchpad `incur-spike/cli.ts`). It wrapped the existing core directly: `openIwd` / `resolveIwdPath` / `globToRegex` from `mcp-server/src/utils.ts` and `lint` from `mcp-server/src/gsc/linter.ts`.

## What was tested

Three commands in two groups: `iwd list`, `iwd remove` (no-op, destructive), `gsc lint`. Version: `incur@0.5.1` (npm latest; GitHub `main` is 0.6.0).

```ts
const iwd = Cli.create("iwd", { description: "IWD archive operations" })
  .command("list", {
    args: z.object({ path: z.string() }),
    options: z.object({ pattern: z.string().optional() }),
    output: z.object({ archive: z.string(), total: z.number(), entries: z.array(...) }),
    mcp: { annotations: { readOnlyHint: true, idempotentHint: true } },
    run(c) { /* calls existing openIwd + globToRegex, returns data */ },
  });

Cli.create("iw4x", { version, mcp: { tools: { discovery: "direct" } } })
  .command(iwd).command(gsc).serve();
```

## Results

| Check | Result |
| --- | --- |
| MCP tool names match today's (`iwd_list`, `gsc_lint`) | Yes. Name = command path joined with `_`; `mcp.name` overrides |
| Annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) | Yes, passed through unchanged |
| `outputSchema` + `structuredContent` | Yes, generated from the `output` zod schema |
| Errors | Thrown error → `isError: true` over MCP; exit code 1 on CLI |
| CLI output | TOON by default, `--json` / `--format yaml|md|jsonl`, `--schema`, `--llms` manifest, completions |
| Default MCP mode | **Progressive** (`search_tools`, `get_tool_details`, `call_read_tool`, `call_write_tool`). Must set `mcp.tools.discovery: "direct"` to keep one tool per command |
| `bun build --compile` CLI mode | Works (84 MB Windows binary) |
| Compiled binary `--mcp` | **Fails** in 0.5.1: `Cannot find module '@modelcontextprotocol/server/stdio'`. Also fails with `incur build`. Cause: `import(specifier)` through a variable is invisible to the bundler (incur issue #225, closed 2026-08-26). Patching `dist/Mcp.js` to a literal `import('@modelcontextprotocol/server/stdio')` fixes it: tools list correctly from the compiled binary |
| `incur build` targets | `windows-x64-baseline`, `windows-arm64`, `darwin-*`, `linux-*` (not plain `windows-x64`) |
| Knowledge files in compiled binary | **Not found**: `getKnowledgeDir()` searches `B:\~BUN\...`. Needs the JSON embedded at build time (independent of incur) |

## Costs and risks

- **zod 3 → 4.** incur requires `zod@^4`; `mcp-server` uses `^3.23`. All tool schemas move to zod 4.
- **MCP SDK swap.** incur depends on `@modelcontextprotocol/server@2.0.0-alpha.4` (alpha v2 split SDK) instead of `@modelcontextprotocol/sdk@1.26`. The server code stops calling the SDK directly, so exposure is limited, but it is an alpha dependency.
- **MCP text changes.** Tool text content becomes JSON of the returned data instead of today's hand-formatted markdown. Agents parse it fine; wording-based tests need rewriting.
- **Tests.** Today's ~1,250 lines of `client.callTool` round-trips become `run()` data tests plus a small MCP smoke test.
- **Resources.** `iw4x://dvars` and `iw4x://gsc-builtins` are MCP resources; incur exposes commands only. Keep them as commands or drop them.
- **Compiled-binary MCP** needs a patch (`patch-package` / `bun patch`) until a release includes a bundler-visible import.
- **Binary size** ~84 MB per platform (Bun runtime).

## Recommendation

Adopt incur for the registry instead of hand-building one. It already provides the pieces refactor option 1 would have to build (schema-driven CLI flags, direct MCP tools with annotations, structured output, `--llms`, completions, binary builds).

Order:
1. Move the data-returning logic out of the MCP handler files (still required: incur's `run()` needs plain functions to call).
2. Upgrade zod to 4 in `mcp-server`, keep the current server green.
3. Port tools to incur commands group by group (`gsc` first: its core is already pure), with `discovery: "direct"`.
4. Embed `knowledge/*.json` for compiled builds.
5. `bun patch incur` for the stdio import until upstream releases the fix; drop the patch after upgrading.
