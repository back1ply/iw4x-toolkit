/**
 * @file commands.ts
 * The single list both adapters are generated from: MCP tools (index.ts) and CLI commands (cli.ts).
 */

import type { AnyCommand } from "./command.js";
import { READ_COMMANDS } from "./iwd/read-tools.js";
import { WRITE_COMMANDS } from "./iwd/write-tools.js";
import { ARCHIVE_COMMANDS } from "./iwd/archive-tools.js";
import { DIFF_COMMANDS } from "./iwd/diff-tools.js";
import { SYNC_COMMANDS } from "./iwd/sync-tools.js";
import { KNOWLEDGE_COMMANDS } from "./knowledge/tools.js";
import { GSC_COMMANDS } from "./gsc/tools.js";

/** Shared by the MCP server info and `iw4x-toolkit --version`. */
export const VERSION = "1.0.1";

export const COMMANDS: readonly AnyCommand[] = [
  ...READ_COMMANDS,
  ...WRITE_COMMANDS,
  ...ARCHIVE_COMMANDS,
  ...DIFF_COMMANDS,
  ...SYNC_COMMANDS,
  ...KNOWLEDGE_COMMANDS,
  ...GSC_COMMANDS,
];
