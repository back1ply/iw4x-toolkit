/**
 * @file iwd/tools.ts
 * Main registration function for IWD archive tools.
 * Orchestrates sub-modules for better maintainability.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadTools } from "./read-tools.js";
import { registerWriteTools } from "./write-tools.js";
import { registerArchiveTools } from "./archive-tools.js";
import { registerDiffTools } from "./diff-tools.js";
import { registerSyncTools } from "./sync-tools.js";

/**
 * Registers all IWD archive tools on the given MCP server instance.
 * Call this once during server bootstrap.
 */
export function registerIwdTools(server: McpServer): void {
  registerReadTools(server);
  registerWriteTools(server);
  registerArchiveTools(server);
  registerDiffTools(server);
  registerSyncTools(server);
}
