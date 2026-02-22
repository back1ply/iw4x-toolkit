/**
 * @file index.ts
 * MCP server entry point for iw4x-toolkit.
 * Creates the server, wires up all tools, and starts listening on stdio.
 *
 * All tool implementations live in:
 *   - src/iwd/tools.ts      (IWD archive tools)
 *   - src/gsc/tools.ts      (GSC language tools)
 *   - src/knowledge/tools.ts (DVAR / GSC knowledge tools)
 *
 * All shared utilities are in src/utils.ts.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerIwdTools } from "./iwd/tools.js";
import { registerKnowledgeTools } from "./knowledge/tools.js";
import { registerGscTools } from "./gsc/tools.js";

// ---------------------------------------------------------------------------
// Re-exports — maintain the same public surface for index.test.ts
// ---------------------------------------------------------------------------

export {
  isBinaryEntry,
  normalizeEntry,
  resolveIwdPath,
  ensureBackup,
  atomicWrite,
  globToRegex,
  buildDiffSnippet,
  backedUp,
  openIwd,
  invalidateIwdCache,
} from "./utils.js";

export { loadDvars, loadGscBuiltins } from "./knowledge/tools.js";

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export const server = new McpServer({
  name: "iw4x-toolkit",
  version: "1.0.0",
});

registerIwdTools(server);
registerKnowledgeTools(server);
registerGscTools(server);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only auto-start when run directly (not when imported by tests).
// On Windows, import.meta.url URL-encodes spaces/special chars and may differ
// in drive-letter casing from process.argv[1], so normalise both sides.
const isDirectRun = (() => {
  if (!process.argv[1]) return false;
  const metaPath = decodeURIComponent(import.meta.url)
    .replace(/^file:\/\/\//, "")
    .replace(/\\/g, "/")
    .toLowerCase();
  const argPath = process.argv[1]
    .replace(/\\/g, "/")
    .replace(/^\//, "")
    .toLowerCase();
  return metaPath === argPath;
})();

if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
