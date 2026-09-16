/**
 * @file cli.test.ts
 * The CLI and the MCP server are generated from one command list. These tests
 * keep the two surfaces identical: same command names, same text output.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import AdmZip from "adm-zip";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runCli } from "./cli.js";
import { COMMANDS } from "./commands.js";
import { cleanupOrphanedTempFiles, createMcpServer } from "./mcp.js";

async function cli(...argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await runCli(argv, {
    stdout: (t) => { stdout += t + "\n"; },
    stderr: (t) => { stderr += t + "\n"; },
  });
  return { code, stdout: stdout.replace(/\n$/, ""), stderr };
}

describe("CLI ↔ MCP parity", () => {
  let client: Client;
  let tmpDir: string;
  let iwdPath: string;

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "cli-parity", version: "1.0.0" });
    await createMcpServer().server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "iw4x-cli-test-"));
    iwdPath = path.join(tmpDir, "mod.iwd");
    const zip = new AdmZip();
    zip.addFile("maps/mp/_a.gsc", Buffer.from('init()\n{\n    iprintln("a");\n}'));
    zip.addFile("maps/mp/_b.gsc", Buffer.from("// b"));
    zip.addFile("images/x.iwi", Buffer.alloc(16, 1));
    zip.writeZip(iwdPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function mcpText(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await client.callTool({ name, arguments: args });
    return (result.content as { text: string }[]).map((c) => c.text).join("\n");
  }

  it("exposes exactly the same command names as MCP tools, and lists them all in --help", async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(COMMANDS.map((c) => c.name).sort());

    const { code, stdout } = await cli("--help");
    expect(code).toBe(0);
    for (const name of tools) expect(stdout).toContain(name);
  });

  it("prints the same text as the MCP tool for the same arguments", async () => {
    const cases: [string, Record<string, unknown>, string[]][] = [
      ["iwd_list", { path: iwdPath, pattern: "maps/**/*.gsc", names_only: false }, ["--path", iwdPath, "--pattern", "maps/**/*.gsc", "--no-names_only"]],
      ["iwd_read", { path: iwdPath, entry: "maps/mp/_a.gsc", offset: 1, limit: 2 }, ["--path", iwdPath, "--entry", "maps/mp/_a.gsc", "--offset", "1", "--limit", "2"]],
      ["iwd_read", { path: iwdPath, entry: "images/x.iwi" }, ["--path", iwdPath, "--entry", "images/x.iwi"]],
      ["gsc_template", { template: "hud_element", variables: { player: "self" } }, ["--template", "hud_element", "--variables", '{"player":"self"}']],
      ["dvar_search", { query: "fov" }, ["--query", "fov"]],
    ];
    for (const [name, args, argv] of cases) {
      const { code, stdout } = await cli(name, ...argv);
      expect(code, name).toBe(0);
      expect(stdout, name).toBe(await mcpText(name, args));
    }
  });

  it("--json prints the command's data", async () => {
    const { code, stdout } = await cli("iwd_list", "--path", iwdPath, "--pattern", "**/*.iwi", "--json");
    expect(code).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.total).toBe(3);
    expect(data.entries.map((e: { name: string }) => e.name)).toEqual(["images/x.iwi"]);
  });

  it("accepts repeatable array flags", async () => {
    const { code, stdout } = await cli("iwd_index_symbols", "--paths", iwdPath, "--paths", tmpDir, "--clear");
    expect(code).toBe(0);
    expect(stdout).toContain("Indexed");
  });

  it("returns exit 1 with the command's error message when the command fails", async () => {
    const { code, stderr } = await cli("iwd_read", "--path", iwdPath, "--entry", "missing.gsc");
    expect(code).toBe(1);
    expect(stderr).toContain("Error: Entry not found: missing.gsc");
  });

  it("returns exit 2 for usage errors", async () => {
    expect((await cli("nope")).code).toBe(2);
    const missing = await cli("iwd_list");
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("--path");
    expect((await cli("iwd_list", "--path", iwdPath, "--bogus")).code).toBe(2);
    expect((await cli("iwd_list", "--path", iwdPath, "--limit", "zero")).code).toBe(2);
  });

  it("startup temp cleanup only removes this toolkit's own stale temp files", async () => {
    const old = new Date(Date.now() - 2 * 3600_000);
    for (const name of ["crashed.iwd.tmp", "notes.tmp", "other-app.dat.tmp"]) {
      fs.writeFileSync(path.join(tmpDir, name), "x");
      fs.utimesSync(path.join(tmpDir, name), old, old);
    }
    fs.writeFileSync(path.join(tmpDir, "in-progress.iwd.tmp"), "x"); // fresh: may belong to a running write

    expect(await cleanupOrphanedTempFiles([tmpDir])).toBe(1);
    expect(fs.readdirSync(tmpDir).sort()).toEqual(["in-progress.iwd.tmp", "mod.iwd", "notes.tmp", "other-app.dat.tmp"]);
  });

  it("shows per-command help from the schema", async () => {
    const { code, stdout } = await cli("iwd_list", "--help");
    expect(code).toBe(0);
    expect(stdout).toContain("--path <string> (required)");
    expect(stdout).toContain("--no-names_only to turn off");
  });
});
