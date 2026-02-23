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
  isSafeEntryPath,
  resolveIwdPath,
  ensureBackup,
  atomicWrite,
  globToRegex,
  buildDiffSnippet,
  backedUp,
  openIwd,
  openIwdAsync,
  invalidateIwdCache,
  getKnowledgeDir,
  getCachedRegex,
  checkRateLimit,
  RATE_LIMITS,
} from "./utils.js";

export { loadDvars, loadGscBuiltins } from "./knowledge/tools.js";

// ---------------------------------------------------------------------------
// Startup cleanup
// ---------------------------------------------------------------------------

/**
 * Cleans up orphaned .tmp files from previous crashed sessions.
 * Called once on server startup.
 */
async function cleanupOrphanedTempFiles(): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  
  // Only clean up .tmp files in common IWD locations
  const cwd = process.cwd();
  
  try {
    const entries = await fs.readdir(cwd, { withFileTypes: true });
    let cleaned = 0;
    
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".tmp")) {
        try {
          const fullPath = path.join(cwd, entry.name);
          const stat = await fs.stat(fullPath);
          // Only remove files older than 1 hour
          if (Date.now() - stat.mtimeMs > 3600000) {
            await fs.unlink(fullPath);
            cleaned++;
          }
        } catch {
          // Ignore errors for individual files
        }
      }
    }
    
    if (cleaned > 0) {
      console.error(`[iw4x-toolkit] Cleaned up ${cleaned} orphaned .tmp file(s)`);
    }
  } catch {
    // Ignore errors during cleanup
  }
}

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
  await cleanupOrphanedTempFiles();
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
