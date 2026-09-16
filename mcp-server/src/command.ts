/**
 * @file command.ts
 * One definition per tool. `run()` returns plain data; `render()` turns that data
 * into the text agents read. Adapters (MCP today, CLI next) are generated from
 * the same list, so the two surfaces cannot drift apart.
 */

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { CommandError, checkRateLimit, errResult } from "./utils.js";

export interface CommandAnnotations {
  readOnlyHint: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export type CommandArgs<S extends z.ZodRawShape> = z.output<z.ZodObject<S>>;

export interface Command<S extends z.ZodRawShape = z.ZodRawShape, D = unknown> {
  /** Tool name, shared by MCP and CLI (e.g. `iwd_list`). */
  name: string;
  title: string;
  description: string;
  input: S;
  annotations: CommandAnnotations;
  /** Do the work. Throw `CommandError` for expected failures (bad input, missing file). */
  run(args: CommandArgs<S>): D | Promise<D>;
  /** Text for agents and humans. An array becomes one content part per element. */
  render(data: D, args: CommandArgs<S>): string | string[];
  /** MCP-only throttle key in `RATE_LIMITS`. The CLI ignores it. */
  rateLimit?: string;
}

/** Identity helper so each definition infers its own args/data types. */
export function command<S extends z.ZodRawShape, D>(def: Command<S, D>): Command<S, D> {
  return def;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCommand = Command<any, any>;

type McpTextResult = { content: { type: "text"; text: string }[]; isError?: true };

/** Run + render a command, mapping `CommandError` to an MCP error result. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runForMcp(cmd: AnyCommand, args: any): Promise<McpTextResult> {
  if (cmd.rateLimit) {
    const check = checkRateLimit(cmd.rateLimit);
    if (!check.allowed) {
      return errResult(`Rate limit exceeded for ${cmd.rateLimit}. Try again in ${check.resetIn} seconds.`);
    }
  }
  try {
    const out = cmd.render(await cmd.run(args), args);
    return { content: (Array.isArray(out) ? out : [out]).map((text) => ({ type: "text" as const, text })) };
  } catch (e) {
    if (e instanceof CommandError) return errResult(e.message);
    throw e;
  }
}

/** Register every command as an MCP tool. */
export function registerCommands(server: McpServer, commands: readonly AnyCommand[]): void {
  for (const cmd of commands) {
    server.registerTool(
      cmd.name,
      { title: cmd.title, description: cmd.description, inputSchema: z.object(cmd.input), annotations: cmd.annotations },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((args: unknown) => runForMcp(cmd, args)) as any,
    );
  }
}
