/**
 * @file iwd/sync-tools.ts
 * External sync IWD tools: mods_sync, userraw_sync
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "node:path";
import { errResult, okResult } from "../utils.js";

// ---------------------------------------------------------------------------
// Shared copy logic
// ---------------------------------------------------------------------------

/**
 * Copies files from a source directory to a destination directory.
 * Validates the source exists and is a directory before copying.
 *
 * @param sourceDir - Absolute path to the source directory
 * @param destDir   - Absolute path to the destination directory
 * @param dryRun    - If true, validates without copying
 * @param label     - Human-readable label for the destination (used in dry_run messages)
 * @returns MCP result object
 */
async function copyToDestination(
  sourceDir: string,
  destDir: string,
  dryRun: boolean,
  label?: string,
): Promise<{ content: { type: "text"; text: string }[]; isError?: true }> {
  const resolvedSrc = path.resolve(sourceDir);
  const resolvedDst = path.resolve(destDir);
  const fs = await import("node:fs/promises");

  try {
    const stat = await fs.stat(resolvedSrc);
    if (!stat.isDirectory()) {
      return errResult(
        `Error: source_dir is not a directory: ${resolvedSrc}`,
      );
    }
  } catch {
    return errResult(`Error: source_dir does not exist: ${resolvedSrc}`);
  }

  if (dryRun) {
    const dstLabel = label ? `${label} ${resolvedDst}` : resolvedDst;
    return okResult(
      `[dry_run] Would copy files from ${resolvedSrc} to ${dstLabel}`,
    );
  }

  try {
    await fs.cp(resolvedSrc, resolvedDst, { recursive: true, force: true });
    return okResult(
      `Synced loose files from ${resolvedSrc}\n    → ${resolvedDst}`,
    );
  } catch (e) {
    return errResult(
      `Error syncing files: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Registers external sync IWD tools on the given MCP server instance.
 */
export function registerSyncTools(server: McpServer): void {
  // --- Tool: mods_sync ---
  server.registerTool(
    "mods_sync",
    {
      title: "Sync to Mod Directory",
      description:
        "Copies modified loose files from your workspace directly into a specific mods/<modname> folder. " +
        "The engine prioritizes loose files over packed .iwd files, enabling rapid live testing.",
      inputSchema: {
        source_dir: z.string().describe("Folder with modified files"),
        mod_dir: z
          .string()
          .describe(
            "The target mods/<modname> folder in the MW2 game directory",
          ),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, validates without copying"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ source_dir, mod_dir, dry_run }) => {
      return copyToDestination(source_dir, mod_dir, dry_run);
    },
  );

  // --- Tool: userraw_sync ---
  server.registerTool(
    "userraw_sync",
    {
      title: "Sync to Userraw Directory",
      description:
        "Copies modified loose files from your workspace into the MW2 userraw installation folder. " +
        "Files placed here are loaded globally by the engine, overriding everything else.",
      inputSchema: {
        source_dir: z.string().describe("Folder with modified files"),
        userraw_dir: z
          .string()
          .describe("The absolute path to the MW2 userraw folder"),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, validates without copying"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ source_dir, userraw_dir, dry_run }) => {
      return copyToDestination(source_dir, userraw_dir, dry_run, "global userraw directory");
    },
  );
}
