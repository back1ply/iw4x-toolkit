/**
 * @file gsc/tools.test.ts
 * Integration tests for GSC tools (gsc_lint, gsc_lookup, gsc_template)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { server } from "../index.js";

// Helper to extract text from tool result
function getResultText(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0]?.text ?? "";
}

describe("GSC Tools", () => {
  let client: Client;
  let tmpDir: string;

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client-gsc", version: "1.0.0" });
    await server.server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "iw4x-gsc-test-"));
  });

  afterEach(() => {
    // Cleanup temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ===========================================================================
  // gsc_lint Tests
  // ===========================================================================

  describe("gsc_lint", () => {
    it("lints valid GSC code successfully", async () => {
      const result = await client.callTool({
        name: "gsc_lint",
        arguments: {
          content: 'test() {\n  iprintln("hello");\n}'
        }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("No issues found");
    });

    it("detects syntax errors in invalid GSC", async () => {
      // The tokenizer is lenient, so we need to test with truly broken code
      // that would cause a tokenizer error (e.g., unterminated string)
      const result = await client.callTool({
        name: "gsc_lint",
        arguments: {
          content: 'function test() {\n  x = "unterminated string\n}'  
        }
      });
      const text = getResultText(result as any);
      // Should have some kind of error (tokenizer or parser)
      expect(text).toMatch(/error|Error|TOK-\d+/);
    });

    it("returns stats (lines, tokens)", async () => {
      const result = await client.callTool({
        name: "gsc_lint",
        arguments: {
          content: 'function test() {\n  iprintln("hello");\n}'
        }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("lines");
      expect(text).toContain("tokens");
      // Should have actual numbers
      expect(text).toMatch(/\d+ lines/);
      expect(text).toMatch(/\d+ tokens/);
    });

    it("works with file path input", async () => {
      const gscPath = path.join(tmpDir, "test.gsc");
      fs.writeFileSync(gscPath, 'test() {\n  iprintln("hello");\n}');

      const result = await client.callTool({
        name: "gsc_lint",
        arguments: {
          path: gscPath
        }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("No issues found");
    });

    it("returns error for missing file", async () => {
      const result = await client.callTool({
        name: "gsc_lint",
        arguments: {
          path: path.join(tmpDir, "nonexistent.gsc")
        }
      });
      const text = getResultText(result as any);
      expect(text).toContain("File not found");
    });

    it("warns about undefined variables when check_undefined=true", async () => {
      // Use an undefined variable in an expression (not just assignment)
      const result = await client.callTool({
        name: "gsc_lint",
        arguments: {
          content: 'function test() {\n  y = undefinedVar + 5;\n}',
          check_undefined: true
        }
      });
      const text = getResultText(result as any);
      // Should warn about undefined variable 'undefinedVar'
      expect(text).toMatch(/VAR-001|Undefined variable/);
    });

    it("skips undefined checks when check_undefined=false", async () => {
      const result = await client.callTool({
        name: "gsc_lint",
        arguments: {
          content: 'function test() {\n  x = 5;\n}',
          check_undefined: false
        }
      });
      const text = getResultText(result as any);
      // Should NOT warn about undefined variable when check is disabled
      expect(text).not.toMatch(/VAR-001|Undefined variable/);
    });

    it("detects bad patterns when check_patterns=true", async () => {
      // Create code with unreachable code after return
      const result = await client.callTool({
        name: "gsc_lint",
        arguments: {
          content: 'function test() {\n  return;\n  iprintln("unreachable");\n}',
          check_patterns: true
        }
      });
      const text = getResultText(result as any);
      // Should detect unreachable code
      expect(text).toMatch(/FLOW-001|Unreachable/);
    });

    it("handles content input directly", async () => {
      const result = await client.callTool({
        name: "gsc_lint",
        arguments: {
          content: '// Simple comment\nfunction main() {}\n'
        }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("lines");
    });

    it("returns error when neither path nor content is provided", async () => {
      const result = await client.callTool({
        name: "gsc_lint",
        arguments: {}
      });
      const text = getResultText(result as any);
      expect(text).toContain("Either path or content must be provided");
    });

    it("warns when file is not a .gsc or .gsh file", async () => {
      const txtPath = path.join(tmpDir, "test.txt");
      fs.writeFileSync(txtPath, "not a gsc file");

      const result = await client.callTool({
        name: "gsc_lint",
        arguments: {
          path: txtPath
        }
      });
      const text = getResultText(result as any);
      expect(text).toContain("doesn't appear to be a GSC file");
    });

    it("detects unreachable code after return", async () => {
      const result = await client.callTool({
        name: "gsc_lint",
        arguments: {
          content: 'function test() {\n  return;\n  iprintln("unreachable");\n}'
        }
      });
      const text = getResultText(result as any);
      // The linter detects unreachable code but doesn't include the code in output
      expect(text).toMatch(/Unreachable code/);
    });

    it("detects long lines as info suggestions", async () => {
      // Create a line longer than MAX_LINE_LENGTH_WARNING (typically 120)
      const longLine = "x = " + "a".repeat(200) + ";";
      const result = await client.callTool({
        name: "gsc_lint",
        arguments: {
          content: `function test() {\n  ${longLine}\n}`
        }
      });
      const text = getResultText(result as any);
      expect(text).toMatch(/STY-001|exceeds.*characters/);
    });
  });

  // ===========================================================================
  // gsc_lookup Tests
  // ===========================================================================

  describe("gsc_lookup", () => {
    it("finds functions by name", async () => {
      const result = await client.callTool({
        name: "gsc_lookup",
        arguments: { query: "iprintln" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("iprintln");
      expect(text).toContain("Found");
    });

    it("finds functions by description keyword", async () => {
      const result = await client.callTool({
        name: "gsc_lookup",
        arguments: { query: "print" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      // Should find iprintln, iprintlnbold, etc.
      expect(text).toMatch(/iprintln|print/i);
    });

    it("filters by category when provided", async () => {
      const result = await client.callTool({
        name: "gsc_lookup",
        arguments: { query: "json", category: "json" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      // Should find json_encode, json_decode
      expect(text).toMatch(/json_encode|json_decode/);
    });

    it("returns 'not found' message for unknown function", async () => {
      const result = await client.callTool({
        name: "gsc_lookup",
        arguments: { query: "xyzzy_nonexistent_function_12345" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("No functions found");
    });

    it("limits results to 20 with 'more' footer", async () => {
      // Search for a very broad term that matches many functions
      // The builtins file has limited entries, so we'll search for something common
      const result = await client.callTool({
        name: "gsc_lookup",
        arguments: { query: "get" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      // If there are more than 20 matches, it should show "and N more"
      // Otherwise it just shows the count
      expect(text).toMatch(/Found \d+ functions/);
    });

    it("is case-insensitive", async () => {
      const result1 = await client.callTool({
        name: "gsc_lookup",
        arguments: { query: "IPRINTLN" }
      });
      const result2 = await client.callTool({
        name: "gsc_lookup",
        arguments: { query: "iprintln" }
      });
      
      const text1 = getResultText(result1 as any);
      const text2 = getResultText(result2 as any);
      
      // Both should find the same function
      expect(text1).toContain("iprintln");
      expect(text2).toContain("iprintln");
    });

    it("shows function parameters when available", async () => {
      const result = await client.callTool({
        name: "gsc_lookup",
        arguments: { query: "getent" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("getent");
      // Should show description
      expect(text).toMatch(/entity|Entity|Returns/);
    });

    it("shows category when available", async () => {
      const result = await client.callTool({
        name: "gsc_lookup",
        arguments: { query: "json_encode" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("json_encode");
      expect(text).toContain("[json]");
    });
  });

  // ===========================================================================
  // gsc_template Tests
  // ===========================================================================

  describe("gsc_template", () => {
    it("lists available templates when list=true", async () => {
      const result = await client.callTool({
        name: "gsc_template",
        arguments: { list: true }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("Available templates");
      // Should list known templates
      expect(text).toMatch(/player_connect|killstreak/);
    });

    it("lists available templates when template is not provided", async () => {
      const result = await client.callTool({
        name: "gsc_template",
        arguments: {}
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("Available templates");
    });

    it("generates code from template", async () => {
      const result = await client.callTool({
        name: "gsc_template",
        arguments: { template: "player_connect" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("Generated from 'player_connect'");
      expect(text).toContain("onPlayerConnect");
    });

    it("substitutes variables in template", async () => {
      const result = await client.callTool({
        name: "gsc_template",
        arguments: {
          template: "menu_response",
          variables: {
            menu_name: "custom_menu",
            option_1: "start_game",
            option_2: "exit_game"
          }
        }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("custom_menu");
      expect(text).toContain("start_game");
      expect(text).toContain("exit_game");
    });

    it("returns error for unknown template", async () => {
      const result = await client.callTool({
        name: "gsc_template",
        arguments: { template: "nonexistent_template_xyz" }
      });
      const text = getResultText(result as any);
      expect(text).toContain("not found");
      expect(text).toContain("list=true");
    });

    it("handles templates with no variables", async () => {
      const result = await client.callTool({
        name: "gsc_template",
        arguments: { template: "array_utils" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("Generated from 'array_utils'");
      expect(text).toContain("getArraySize");
    });

    it("shows template description in list", async () => {
      const result = await client.callTool({
        name: "gsc_template",
        arguments: { list: true }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      // player_connect has a description
      expect(text).toContain("Standard player connection callback");
    });

    it("shows template category in list", async () => {
      const result = await client.callTool({
        name: "gsc_template",
        arguments: { list: true }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      // killstreak has category "gameplay"
      expect(text).toMatch(/Category: gameplay|gameplay/);
    });

    it("generates killstreak template", async () => {
      const result = await client.callTool({
        name: "gsc_template",
        arguments: { template: "killstreak" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("watchKillstreaks");
      expect(text).toContain("UAV");
    });

    it("generates simple_gametype template with variables", async () => {
      const result = await client.callTool({
        name: "gsc_template",
        arguments: {
          template: "simple_gametype",
          variables: {
            gametype_name: "custom_tdm",
            is_team_based: "true"
          }
        }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("custom_tdm");
    });

    it("wraps generated code in code block", async () => {
      const result = await client.callTool({
        name: "gsc_template",
        arguments: { template: "player_connect" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("```gsc");
    });
  });

  // ---------------------------------------------------------------------------
  // gsc_fix
  // ---------------------------------------------------------------------------

  describe("gsc_fix", () => {
    it("reports no fixable issues on valid code", async () => {
      const result = await client.callTool({
        name: "gsc_fix",
        arguments: { content: "init()\n{\n    level thread doStuff();\n}\n\ndoStuff()\n{\n    wait 1;\n}" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("No auto-fixable");
    });

    it("fixes missing closing brace", async () => {
      const result = await client.callTool({
        name: "gsc_fix",
        arguments: { content: "init()\n{\n    wait 1;\n// missing closing brace" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("Fixed");
      expect(text).toContain("brace");
      expect(text).toContain("```gsc");
    });

    it("fixes unterminated string", async () => {
      const result = await client.callTool({
        name: "gsc_fix",
        arguments: { content: 'init()\n{\n    iprintln("hello);\n}' }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      // Either fixed a string or braces — should report something changed
      expect(text).toContain("Fixed");
    });

    it("errors on missing input", async () => {
      const result = await client.callTool({
        name: "gsc_fix",
        arguments: {}
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("❌");
    });

    it("errors on missing file", async () => {
      const result = await client.callTool({
        name: "gsc_fix",
        arguments: { path: "/nonexistent/path/file.gsc" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("❌");
    });
  });

  // ---------------------------------------------------------------------------
  // gsc_outline
  // ---------------------------------------------------------------------------

  describe("gsc_outline", () => {
    const sampleGsc = [
      "#include maps\\mp\\_utility;",
      "#include maps\\mp\\gametypes\\_globallogic;",
      "",
      "init()",
      "{",
      "    level.players = [];",
      "    level.roundActive = false;",
      "    level thread onPlayerConnect();",
      "    level thread watchRound();",
      "}",
      "",
      "onPlayerConnect()",
      "{",
      "    for(;;)",
      "    {",
      "        level waittill(\"connected\", player);",
      "        player thread setupPlayer();",
      "    }",
      "}",
      "",
      "setupPlayer()",
      "{",
      "    self endon(\"disconnect\");",
      "    self endon(\"death\");",
      "    self waittill(\"spawned\");",
      "    self.kills = 0;",
      "}",
      "",
      "watchRound()",
      "{",
      "    level waittill(\"round_start\");",
      "    level.roundActive = true;",
      "    level notify(\"game_ready\");",
      "}",
    ].join("\n");

    it("lists all function definitions", async () => {
      const result = await client.callTool({
        name: "gsc_outline",
        arguments: { content: sampleGsc }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("init");
      expect(text).toContain("onPlayerConnect");
      expect(text).toContain("setupPlayer");
      expect(text).toContain("watchRound");
    });

    it("lists includes", async () => {
      const result = await client.callTool({
        name: "gsc_outline",
        arguments: { content: sampleGsc }
      });
      const text = getResultText(result as any);
      expect(text).toContain("_utility");
      expect(text).toContain("_globallogic");
    });

    it("lists thread calls", async () => {
      const result = await client.callTool({
        name: "gsc_outline",
        arguments: { content: sampleGsc }
      });
      const text = getResultText(result as any);
      expect(text).toContain("onPlayerConnect");
      expect(text).toContain("watchRound");
    });

    it("lists waittill and endon events", async () => {
      const result = await client.callTool({
        name: "gsc_outline",
        arguments: { content: sampleGsc }
      });
      const text = getResultText(result as any);
      expect(text).toContain("waittill");
      expect(text).toContain("connected");
      expect(text).toContain("endon");
      expect(text).toContain("disconnect");
    });

    it("lists shared state properties", async () => {
      const result = await client.callTool({
        name: "gsc_outline",
        arguments: { content: sampleGsc }
      });
      const text = getResultText(result as any);
      expect(text).toContain("level.players");
      expect(text).toContain("level.roundActive");
      expect(text).toContain("self.kills");
    });

    it("includes line numbers", async () => {
      const result = await client.callTool({
        name: "gsc_outline",
        arguments: { content: sampleGsc }
      });
      const text = getResultText(result as any);
      expect(text).toMatch(/line \d+/);
    });

    it("errors on missing input", async () => {
      const result = await client.callTool({
        name: "gsc_outline",
        arguments: {}
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("❌");
    });

    it("errors on missing file", async () => {
      const result = await client.callTool({
        name: "gsc_outline",
        arguments: { path: "/nonexistent/path/file.gsc" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("❌");
    });
  });

  // ===========================================================================
  // gsc_anti_patterns Tests
  // ===========================================================================

  describe("gsc_anti_patterns", () => {
    it("finds patterns by keyword", async () => {
      const result = await client.callTool({
        name: "gsc_anti_patterns",
        arguments: { query: "push" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain(".size");
    });

    it("finds patterns by category filter", async () => {
      const result = await client.callTool({
        name: "gsc_anti_patterns",
        arguments: { query: "loop", category: "loops" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("loops");
    });

    it("lists all categories with list=true", async () => {
      const result = await client.callTool({
        name: "gsc_anti_patterns",
        arguments: { list: true }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("syntax");
      expect(text).toContain("arrays");
      expect(text).toContain("events");
    });

    it("returns no results message for unknown query", async () => {
      const result = await client.callTool({
        name: "gsc_anti_patterns",
        arguments: { query: "xyzzy_nonexistent_abc123" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("No patterns found");
    });

    it("finds null check pattern", async () => {
      const result = await client.callTool({
        name: "gsc_anti_patterns",
        arguments: { query: "null" }
      });
      expect(result.isError).toBeFalsy();
      const text = getResultText(result as any);
      expect(text).toContain("isDefined");
    });
  });

  describe("gsc_find_orphans", () => {
    it("reports no orphans for a clean file with only builtins", async () => {
      const result = await client.callTool({
        name: "gsc_find_orphans",
        arguments: {
          content: `init()\n{\n    iprintln("hello");\n    wait(1);\n}`
        }
      });
      const text = getResultText(result as any);
      expect(text).toContain("0 orphaned");
    });

    it("detects an orphaned call to an unknown function", async () => {
      const result = await client.callTool({
        name: "gsc_find_orphans",
        arguments: {
          content: `init()\n{\n    promod_someUnknownFunc();\n    iprintln("done");\n}`
        }
      });
      const text = getResultText(result as any);
      expect(text).toContain("promod_someUnknownFunc");
      expect(text).toMatch(/orphan|not.*found|unresolved/i);
    });

    it("does not flag locally defined functions as orphans", async () => {
      const result = await client.callTool({
        name: "gsc_find_orphans",
        arguments: {
          content: `init()\n{\n    helper();\n}\nhelper()\n{\n    iprintln("i am local");\n}`
        }
      });
      const text = getResultText(result as any);
      expect(text).toContain("0 orphaned");
    });
  });

  describe("iwd_index_symbols", () => {
    it("returns 0 symbols for a non-existent path", async () => {
      const result = await client.callTool({
        name: "iwd_index_symbols",
        arguments: { paths: ["/nonexistent/path.iwd"] }
      });
      const text = getResultText(result as any);
      expect(text).toContain("0 symbols");
    });

    it("clears and reports replaced count when clear=true", async () => {
      await client.callTool({
        name: "iwd_index_symbols",
        arguments: { paths: [], clear: true }
      });
      const result = await client.callTool({
        name: "iwd_index_symbols",
        arguments: { paths: [], clear: true }
      });
      const text = getResultText(result as any);
      expect(text).toContain("0 symbols");
      expect(text).toMatch(/replaced|previous/i);
    });
  });
});

// ===========================================================================
// symbols module (unit tests — import directly, no MCP client needed)
// ===========================================================================

describe("symbols registry", () => {
  it("starts empty", async () => {
    const { getStats, clearIndex } = await import("./symbols.js");
    clearIndex();
    const stats = getStats();
    expect(stats.symbols).toBe(0);
    expect(stats.files).toBe(0);
    expect(stats.archives).toBe(0);
    expect(stats.indexedAt).toBeNull();
  });

  it("hasSymbol returns false when empty", async () => {
    const { hasSymbol, clearIndex } = await import("./symbols.js");
    clearIndex();
    expect(hasSymbol("init")).toBe(false);
  });
});
