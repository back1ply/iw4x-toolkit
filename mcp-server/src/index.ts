/**
 * @file index.ts
 * MCP server entry point for iw4x-toolkit (`node dist/index.js`).
 * Registers every command in src/commands.ts as a tool (the CLI in src/cli.ts
 * uses the same list) plus the knowledge resources, then serves stdio.
 */
import { createMcpServer, startMcpServer } from "./mcp.js";

// ---------------------------------------------------------------------------
// Re-exports — maintain the same public surface for index.test.ts
// ---------------------------------------------------------------------------

export {
  isBinaryEntry,
  normalizeEntry,
  isSafeEntryPath,
  resolveIwdPath,
  ensureBackup,
  atomicWrite,
  globToRegex,
  buildDiffSnippet,
  backedUp,
  atomicWriteDirs,
  openIwd,
  invalidateIwdCache,
  getCachedRegex,
  checkRateLimit,
  rateLimitMap,
  RATE_LIMITS,
  RATE_LIMIT_MAX_SIZE,
} from "./utils.js";

export { loadDvars, loadGscBuiltins, loadMenuHud } from "./knowledge/tools.js";

export const server = createMcpServer();

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
  startMcpServer(server).catch((err: unknown) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
