/**
 * @file cli.ts
 * `iw4x-toolkit` command-line adapter. Every command comes from the same list as
 * the MCP tools (src/commands.ts): same names, same arguments, same text output.
 *
 *   iw4x-toolkit <command> [--arg value ...] [--json]
 *   iw4x-toolkit mcp          serve the MCP tools over stdio
 */

import { parseArgs } from "node:util";
import { z } from "zod";
import type { AnyCommand } from "./command.js";
import { COMMANDS, VERSION } from "./commands.js";
import { CommandError } from "./utils.js";

const BIN = "iw4x-toolkit";

export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const defaultIO: CliIO = {
  stdout: (text) => process.stdout.write(text + "\n"),
  stderr: (text) => process.stderr.write(text + "\n"),
};

interface JsonProp {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
}

/** JSON Schema of a command's arguments, as the caller supplies them (defaults not yet applied). */
function argSchema(cmd: AnyCommand): { properties: Record<string, JsonProp>; required: string[] } {
  const schema = z.toJSONSchema(z.object(cmd.input), { io: "input" }) as {
    properties?: Record<string, JsonProp>; required?: string[];
  };
  return { properties: schema.properties ?? {}, required: schema.required ?? [] };
}

function usage(): string {
  const width = Math.max(...COMMANDS.map((c) => c.name.length));
  return [
    `${BIN} ${VERSION} — IW4X/MW2 modding toolkit`,
    ``,
    `Usage: ${BIN} <command> [--arg value ...] [--json]`,
    ``,
    `Commands:`,
    ...COMMANDS.map((c) => `  ${c.name.padEnd(width)}  ${c.title}`),
    `  ${"mcp".padEnd(width)}  Serve these commands as MCP tools over stdio`,
    ``,
    `Run \`${BIN} <command> --help\` for its arguments.`,
  ].join("\n");
}

function commandHelp(cmd: AnyCommand): string {
  const { properties, required } = argSchema(cmd);
  const lines = Object.entries(properties).map(([name, p]) => {
    const value = p.type === "boolean" ? "" : ` <${p.enum ? p.enum.join("|") : p.type ?? "value"}>`;
    const notes = [
      required.includes(name) ? "required" : "",
      p.type === "array" ? "repeatable" : "",
      p.default !== undefined ? `default: ${JSON.stringify(p.default)}` : "",
      p.type === "boolean" && p.default === true ? `--no-${name} to turn off` : "",
    ].filter(Boolean);
    const suffix = notes.length > 0 ? ` (${notes.join(", ")})` : "";
    return `  --${name}${value}${suffix}\n      ${p.description ?? ""}`;
  });
  return [
    `${BIN} ${cmd.name} — ${cmd.title}`,
    ``,
    cmd.description,
    ``,
    `Arguments:`,
    ...lines,
    `  --json\n      Print the result as JSON data instead of text`,
  ].join("\n");
}

class UsageError extends Error {}

/** Turn argv into the command's argument object, converting flag strings to schema types. */
function parseCommandArgs(cmd: AnyCommand, argv: string[]): { args: Record<string, unknown>; json: boolean; help: boolean } {
  const { properties } = argSchema(cmd);
  const options: Record<string, { type: "string" | "boolean"; multiple?: boolean }> = {
    json: { type: "boolean" },
    help: { type: "boolean" },
  };
  for (const [name, p] of Object.entries(properties)) {
    options[name] = { type: p.type === "boolean" ? "boolean" : "string", multiple: p.type === "array" };
  }

  let values: Record<string, unknown>;
  try {
    ({ values } = parseArgs({ args: argv, options, strict: true, allowPositionals: false, allowNegative: true }));
  } catch (e) {
    throw new UsageError((e as Error).message);
  }

  const args: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(values)) {
    if (name === "json" || name === "help") continue;
    const type = properties[name]?.type;
    if ((type === "number" || type === "integer") && typeof raw === "string") {
      args[name] = raw.trim() === "" ? raw : Number(raw);
    } else if (type === "object" && typeof raw === "string") {
      try {
        args[name] = JSON.parse(raw);
      } catch {
        throw new UsageError(`--${name} must be a JSON object, e.g. --${name} '{"key":"value"}'`);
      }
    } else {
      args[name] = raw;
    }
  }
  return { args, json: values.json === true, help: values.help === true };
}

/** Run the CLI. Returns the process exit code: 0 ok, 1 command failed, 2 usage error. */
export async function runCli(argv: string[], io: CliIO = defaultIO): Promise<number> {
  const [name, ...rest] = argv;
  if (!name || name === "--help" || name === "-h" || name === "help") {
    io.stdout(usage());
    return 0;
  }
  if (name === "--version" || name === "-v") {
    io.stdout(VERSION);
    return 0;
  }
  if (name === "mcp") {
    const { createMcpServer, startMcpServer } = await import("./mcp.js");
    await startMcpServer(createMcpServer());
    return 0;
  }

  const cmd = COMMANDS.find((c) => c.name === name);
  if (!cmd) {
    io.stderr(`Unknown command: ${name}\n\n${usage()}`);
    return 2;
  }

  try {
    const { args, json, help } = parseCommandArgs(cmd, rest);
    if (help) {
      io.stdout(commandHelp(cmd));
      return 0;
    }
    const parsed = z.object(cmd.input).safeParse(args);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  --${i.path.join(".") || "?"}: ${i.message}`);
      throw new UsageError(`Invalid arguments for ${cmd.name}:\n${issues.join("\n")}`);
    }
    const data = await cmd.run(parsed.data);
    if (json) {
      io.stdout(JSON.stringify(data, null, 2));
    } else {
      const out = cmd.render(data, parsed.data);
      io.stdout(Array.isArray(out) ? out.join("\n") : out);
    }
    return 0;
  } catch (e) {
    if (e instanceof UsageError) {
      io.stderr(`${e.message}\n\nRun \`${BIN} ${cmd.name} --help\` for its arguments.`);
      return 2;
    }
    if (e instanceof CommandError) {
      io.stderr(e.message);
      return 1;
    }
    io.stderr(`Error: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}
