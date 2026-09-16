/**
 * @file iwd/sync-tools.ts
 * External sync commands: mods_sync, userraw_sync
 */
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import * as path from "node:path";
import { CommandError } from "../utils.js";
import { command, registerCommands, type AnyCommand } from "../command.js";
import { requireSourceDir } from "./archive-tools.js";

interface CopyDirData { source: string; dest: string; dryRun: boolean; }

/** Copy a directory tree over a destination (loose files win over .iwd content in-game). */
async function copyToDestination(sourceDir: string, destDir: string, dryRun: boolean): Promise<CopyDirData> {
  const source = await requireSourceDir(sourceDir);
  const dest = path.resolve(destDir);
  if (dryRun) return { source, dest, dryRun };
  const fs = await import("node:fs/promises");
  try {
    await fs.cp(source, dest, { recursive: true, force: true });
  } catch (e) {
    throw new CommandError(`Error syncing files: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { source, dest, dryRun };
}

function renderCopy(d: CopyDirData, label?: string): string {
  if (d.dryRun) return `[dry_run] Would copy files from ${d.source} to ${label ? `${label} ${d.dest}` : d.dest}`;
  return `Synced loose files from ${d.source}\n    → ${d.dest}`;
}

const modsSync = command({
  name: "mods_sync",
  title: "Sync to Mod Directory",
  description:
    "Copies modified loose files from your workspace directly into a specific mods/<modname> folder. " +
    "The engine prioritizes loose files over packed .iwd files, enabling rapid live testing.",
  input: {
    source_dir: z.string().describe("Folder with modified files"),
    mod_dir: z.string().describe("The target mods/<modname> folder in the MW2 game directory"),
    dry_run: z.boolean().optional().default(false).describe("If true, validates without copying"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  run: ({ source_dir, mod_dir, dry_run }) => copyToDestination(source_dir, mod_dir, dry_run),
  render: (d) => renderCopy(d),
});

const userrawSync = command({
  name: "userraw_sync",
  title: "Sync to Userraw Directory",
  description:
    "Copies modified loose files from your workspace into the MW2 userraw installation folder. " +
    "Files placed here are loaded globally by the engine, overriding everything else.",
  input: {
    source_dir: z.string().describe("Folder with modified files"),
    userraw_dir: z.string().describe("The absolute path to the MW2 userraw folder"),
    dry_run: z.boolean().optional().default(false).describe("If true, validates without copying"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
  run: ({ source_dir, userraw_dir, dry_run }) => copyToDestination(source_dir, userraw_dir, dry_run),
  render: (d) => renderCopy(d, "global userraw directory"),
});

export const SYNC_COMMANDS: AnyCommand[] = [modsSync, userrawSync];

/** Registers external sync tools on the given MCP server instance. */
export function registerSyncTools(server: McpServer): void {
  registerCommands(server, SYNC_COMMANDS);
}
