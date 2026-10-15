/**
 * @file iwd/sync-tools.ts
 * External sync command: sync_loose_files (workspace -> mods/<name> or userraw)
 */
import { z } from "zod";
import * as path from "node:path";
import { CommandError } from "../utils.js";
import { command, type AnyCommand } from "../command.js";
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

function renderCopy(d: CopyDirData): string {
  if (d.dryRun) return `[dry_run] Would copy files from ${d.source} to ${d.dest}`;
  return `Synced loose files from ${d.source}
    → ${d.dest}`;
}

const syncLooseFiles = command({
  name: "sync_loose_files",
  title: "Sync Loose Files to Game Folder",
  description:
    "Copies a workspace folder's loose files into a game folder for live testing, overwriting files with the same name (no backup). " +
    "The engine loads loose files ahead of packed .iwd content. " +
    "dest_dir is either mods/<modname> (only that mod sees the files) or userraw (loaded globally, overriding everything). " +
    "NOT for writing into an .iwd archive — use iwd_sync for that. Run with dry_run=true first to see the resolved paths.",
  input: {
    source_dir: z.string().describe("Folder with modified files"),
    dest_dir: z.string().describe("Target game folder: the MW2 mods/<modname> folder or the userraw folder"),
    dry_run: z.boolean().optional().default(false).describe("If true, validates without copying"),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  run: ({ source_dir, dest_dir, dry_run }) => copyToDestination(source_dir, dest_dir, dry_run),
  render: (d) => renderCopy(d),
});

export const SYNC_COMMANDS: AnyCommand[] = [syncLooseFiles];
