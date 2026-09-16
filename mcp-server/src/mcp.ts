/**
 * @file mcp.ts
 * Builds the MCP server from the shared command list. No side effects on import,
 * so both `index.ts` (MCP entry) and `cli.ts` (`iw4x-toolkit mcp`) can use it.
 */

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { McpServer } from "@modelcontextprotocol/server";
import { registerCommands } from "./command.js";
import { COMMANDS, VERSION } from "./commands.js";
import { registerKnowledgeResources } from "./knowledge/tools.js";
import { atomicWriteDirs } from "./utils.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "iw4x-toolkit", version: VERSION });
  registerCommands(server, COMMANDS);
  registerKnowledgeResources(server);
  return server;
}

/** Temp files this toolkit writes: `<archive>.iwd.tmp` (atomicWrite) and `<script>.gsc.tmp` (gsc_fix). */
const OWN_TEMP_FILE = /\.(iwd|gsc|gsh)\.tmp$/i;

/**
 * Removes this toolkit's temp files left by a crashed session (older than 1 hour).
 * Only names matching OWN_TEMP_FILE are touched — never other programs' `.tmp` files.
 */
export async function cleanupOrphanedTempFiles(dirs: Iterable<string> = [...atomicWriteDirs, process.cwd()]): Promise<number> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const dirsToScan = new Set(dirs);
  let cleaned = 0;

  for (const dir of dirsToScan) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && OWN_TEMP_FILE.test(entry.name)) {
          try {
            const fullPath = path.join(dir, entry.name);
            const stat = await fs.stat(fullPath);
            // Only remove files older than 1 hour
            if (Date.now() - stat.mtimeMs > 3600000) {
              await fs.unlink(fullPath);
              cleaned++;
            }
          } catch { /* Ignore errors for individual files */ }
        }
      }
    } catch { /* Ignore errors for inaccessible directories */ }
  }

  if (cleaned > 0) {
    console.error(`[iw4x-toolkit] Cleaned up ${cleaned} orphaned .tmp file(s)`);
  }
  return cleaned;
}

/** Clean up stale temp files and serve MCP over stdio. */
export async function startMcpServer(server: McpServer): Promise<void> {
  await cleanupOrphanedTempFiles();
  await server.connect(new StdioServerTransport());
}
