import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import AdmZip from "adm-zip";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  isBinaryEntry,
  normalizeEntry,
  loadDvars,
  resolveIwdPath,
  ensureBackup,
  atomicWrite,
  globToRegex,
  buildDiffSnippet,
  server,
} from "./index.js";

// ---------------------------------------------------------------------------
// Unit tests — helper functions
// ---------------------------------------------------------------------------

describe("isBinaryEntry", () => {
  it("classifies binary extensions correctly", () => {
    expect(isBinaryEntry("textures/foo.iwi")).toBe(true);
    expect(isBinaryEntry("maps/mp_test.d3dbsp")).toBe(true);
    expect(isBinaryEntry("sound/ambient.mp3")).toBe(true);
    expect(isBinaryEntry("image.DDS")).toBe(true); // case insensitive
  });

  it("classifies text extensions correctly", () => {
    expect(isBinaryEntry("maps/mp/gametypes/_globallogic.gsc")).toBe(false);
    expect(isBinaryEntry("mod.csv")).toBe(false);
    expect(isBinaryEntry("weapons/mp/deserteagle.txt")).toBe(false);
  });
});

describe("normalizeEntry", () => {
  it("converts backslashes to forward slashes", () => {
    expect(normalizeEntry("maps\\mp\\gametypes\\_globallogic.gsc")).toBe(
      "maps/mp/gametypes/_globallogic.gsc",
    );
  });

  it("leaves forward slashes unchanged", () => {
    expect(normalizeEntry("maps/mp/test.gsc")).toBe("maps/mp/test.gsc");
  });

  it("strips leading slashes", () => {
    expect(normalizeEntry("/maps/mp/test.gsc")).toBe("maps/mp/test.gsc");
  });
});

describe("resolveIwdPath", () => {
  it("returns an absolute path", () => {
    const result = resolveIwdPath("relative/test.iwd");
    expect(path.isAbsolute(result)).toBe(true);
  });

  it("preserves already-absolute paths", () => {
    const abs = path.resolve("some/file.iwd");
    expect(resolveIwdPath(abs)).toBe(abs);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — globToRegex
// ---------------------------------------------------------------------------

describe("globToRegex", () => {
  it("matches wildcard *.gsc", () => {
    const re = globToRegex("*.gsc");
    expect(re.test("_globallogic.gsc")).toBe(true);
    expect(re.test("_globallogic.menu")).toBe(false);
    // * should not cross directory boundaries
    expect(re.test("maps/_globallogic.gsc")).toBe(false);
  });

  it("matches double-wildcard maps/**/*.gsc", () => {
    const re = globToRegex("maps/**/*.gsc");
    expect(re.test("maps/mp/gametypes/_globallogic.gsc")).toBe(true);
    expect(re.test("maps/_test.gsc")).toBe(true);
    expect(re.test("ui_mp/something.menu")).toBe(false);
  });

  it("matches exact path", () => {
    const re = globToRegex("ui_mp/options.menu");
    expect(re.test("ui_mp/options.menu")).toBe(true);
    expect(re.test("ui_mp/other.menu")).toBe(false);
  });

  it("treats . as literal", () => {
    const re = globToRegex("*.menu");
    expect(re.test("testXmenu")).toBe(false); // . is literal, not regex .
  });
});

// ---------------------------------------------------------------------------
// Unit tests — buildDiffSnippet
// ---------------------------------------------------------------------------

describe("buildDiffSnippet", () => {
  it("returns empty snippet when files are identical", () => {
    const text = "line1\nline2\nline3";
    const { snippet } = buildDiffSnippet(text, text);
    expect(snippet.includes("-")).toBe(false);
    expect(snippet.includes("+")).toBe(false);
  });

  it("detects a diff at the last line", () => {
    const original = "a\nb\nc";
    const patched  = "a\nb\nX";
    const { snippet, changedLine } = buildDiffSnippet(original, patched);
    expect(changedLine).toBe(2);
    expect(snippet).toContain("- c");
    expect(snippet).toContain("+ X");
  });

  it("detects an EOF-only addition (patched is longer)", () => {
    const original = "a\nb";
    const patched  = "a\nb\nnewline";
    const { snippet, changedLine } = buildDiffSnippet(original, patched);
    expect(changedLine).toBe(2);
    expect(snippet).toContain("+ newline");
  });

  it("hintLine centres context on the supplied line, not line 0", () => {
    // Build a file where line 0 matches but the actual replacement is at line 10
    const lines = Array.from({ length: 15 }, (_, i) => `line${i}`);
    const original = lines.join("\n");
    const patchedLines = [...lines];
    patchedLines[10] = "REPLACED";
    const patched = patchedLines.join("\n");

    // Without hintLine: changedLine should still be 10 (first difference)
    const { changedLine: auto } = buildDiffSnippet(original, patched);
    expect(auto).toBe(10);

    // With hintLine=10: snippet should include surrounding lines 7-13
    const { snippet, changedLine: hinted } = buildDiffSnippet(original, patched, 3, 10);
    expect(hinted).toBe(10);
    expect(snippet).toContain("- line10");
    expect(snippet).toContain("+ REPLACED");
    expect(snippet).toContain("  line7");
    expect(snippet).toContain("  line13");
  });
});

describe("loadDvars", () => {
  it("returns valid JSON", () => {
    const raw = loadDvars();
    const parsed = JSON.parse(raw);
    expect(parsed).toBeDefined();
    expect(parsed.error).toBeUndefined();
  });

  it("contains a dvars array", () => {
    const parsed = JSON.parse(loadDvars());
    expect(Array.isArray(parsed.dvars)).toBe(true);
    expect(parsed.dvars.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — file helpers (ensureBackup, atomicWrite)
// ---------------------------------------------------------------------------

describe("ensureBackup", () => {
  let tmpDir: string;
  let iwdPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "iw4x-test-"));
    iwdPath = path.join(tmpDir, "test.iwd");
    // Create a minimal IWD (zip) so the file exists
    const zip = new AdmZip();
    zip.addFile("dummy.txt", Buffer.from("hello"));
    zip.writeZip(iwdPath);
  });

  afterAll(() => {
    // Cleanup handled per-test by OS temp, but be tidy
  });

  it("creates a .bak file on first call", () => {
    ensureBackup(iwdPath);
    expect(fs.existsSync(iwdPath + ".bak")).toBe(true);
  });

  it("does not overwrite existing .bak", () => {
    // Pre-create a .bak with known content
    fs.writeFileSync(iwdPath + ".bak", "original-backup");
    ensureBackup(iwdPath);
    expect(fs.readFileSync(iwdPath + ".bak", "utf-8")).toBe("original-backup");
  });
});

describe("atomicWrite", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "iw4x-test-"));
  });

  it("writes a zip file atomically (no .tmp left behind)", () => {
    const target = path.join(tmpDir, "output.iwd");
    const zip = new AdmZip();
    zip.addFile("test.gsc", Buffer.from("// script"));
    atomicWrite(zip, target);

    expect(fs.existsSync(target)).toBe(true);
    expect(fs.existsSync(target + ".tmp")).toBe(false);

    // Verify the written file is a valid zip
    const readBack = new AdmZip(target);
    expect(readBack.getEntry("test.gsc")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Integration tests — MCP tool handlers via in-memory transport
// ---------------------------------------------------------------------------

describe("MCP tool handlers", () => {
  let client: Client;
  let tmpDir: string;
  let iwdPath: string;

  const TEXT_ENTRY = "maps/mp/gametypes/_test.gsc";
  const TEXT_CONTENT = '// test GSC script\nmain() {\n  iprintln("hello");\n}';
  const BINARY_ENTRY = "images/test.iwi";

  beforeAll(async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "1.0.0" });
    await server.server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "iw4x-tool-test-"));
    iwdPath = path.join(tmpDir, "test.iwd");

    // Create a fixture IWD with one text and one binary entry
    const zip = new AdmZip();
    zip.addFile(TEXT_ENTRY, Buffer.from(TEXT_CONTENT, "utf-8"));
    zip.addFile(BINARY_ENTRY, Buffer.alloc(64, 0xab)); // fake binary
    zip.writeZip(iwdPath);
  });

  // --- iwd_list ---

  describe("iwd_list", () => {
    it("lists entries in an IWD file", async () => {
      const result = await client.callTool({
        name: "iwd_list",
        arguments: { path: iwdPath },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain(TEXT_ENTRY);
      expect(text).toContain(BINARY_ENTRY);
      expect(text).toContain("2 of 2 entries");
    });

    it("filters entries by pattern", async () => {
      const result = await client.callTool({
        name: "iwd_list",
        arguments: { path: iwdPath, pattern: "maps/**/*.gsc" },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain(TEXT_ENTRY);
      expect(text).not.toContain(BINARY_ENTRY);
      expect(text).toContain("1 of 2 entries");
    });

    it("returns compact names-only list by default (no sizes)", async () => {
      const result = await client.callTool({
        name: "iwd_list",
        arguments: { path: iwdPath },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain(TEXT_ENTRY);
      // default (names_only=true) should NOT include byte sizes
      expect(text).not.toContain("bytes");
    });

    it("returns sizes when names_only=false", async () => {
      const result = await client.callTool({
        name: "iwd_list",
        arguments: { path: iwdPath, names_only: false },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain(TEXT_ENTRY);
      expect(text).toContain("bytes");
    });

    it("summary_only returns one-line extension breakdown", async () => {
      const result = await client.callTool({
        name: "iwd_list",
        arguments: { path: iwdPath, summary_only: true },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("2 entries"); // total count
      expect(text).toContain(".gsc");       // text extension counted
      expect(text).toContain("binary");     // .iwi classified as binary
      // must NOT list individual file names
      expect(text).not.toContain(TEXT_ENTRY);
    });

    it("returns descriptive message when pattern matches nothing", async () => {
      const result = await client.callTool({
        name: "iwd_list",
        arguments: { path: iwdPath, pattern: "*.nonexistent" },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("No entries match pattern");
      expect(text).toContain("*.nonexistent");
      expect(text).toContain("iwd_list"); // actionable tip
    });

    it("returns error for missing file", async () => {
      const result = await client.callTool({
        name: "iwd_list",
        arguments: { path: path.join(tmpDir, "nonexistent.iwd") },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("IWD file not found");
    });

    it("returns error for non-ZIP file", async () => {
      const badPath = path.join(tmpDir, "bad.iwd");
      fs.writeFileSync(badPath, "this is not a zip");
      const result = await client.callTool({
        name: "iwd_list",
        arguments: { path: badPath },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Failed to open IWD archive");
    });
  });

  // --- iwd_read ---

  describe("iwd_read", () => {
    it("reads a text entry as UTF-8", async () => {
      const result = await client.callTool({
        name: "iwd_read",
        arguments: { path: iwdPath, entry: TEXT_ENTRY },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain(TEXT_ENTRY);
      expect(text).toContain('iprintln("hello")');
    });

    it("reads a binary entry as base64", async () => {
      const result = await client.callTool({
        name: "iwd_read",
        arguments: { path: iwdPath, entry: BINARY_ENTRY },
      });
      expect(result.isError).toBeFalsy();
      const parts = result.content as Array<{ type: string; text: string }>;
      expect(parts[0].text).toContain("[binary:");
      // Verify base64 decodes to the right length
      const decoded = Buffer.from(parts[1].text, "base64");
      expect(decoded.length).toBe(64);
    });

    it("normalizes backslash paths", async () => {
      const backslashEntry = TEXT_ENTRY.replace(/\//g, "\\");
      const result = await client.callTool({
        name: "iwd_read",
        arguments: { path: iwdPath, entry: backslashEntry },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain(TEXT_ENTRY);
      expect(text).toContain('iprintln("hello")');
    });

    it("returns error for missing entry", async () => {
      const result = await client.callTool({
        name: "iwd_read",
        arguments: { path: iwdPath, entry: "does/not/exist.gsc" },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Entry not found");
    });

    it("reads partial text with limit and offset", async () => {
      const result = await client.callTool({
        name: "iwd_read",
        arguments: { path: iwdPath, entry: TEXT_ENTRY, limit: 1, offset: 1 },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      // offset=1 (0-indexed), limit=1 → reads line 2 of 4 → header shows lines 2-2
      expect(text).toContain("lines 2-2 of 4");
      expect(text).toContain("main() {");
      expect(text).not.toContain('iprintln("hello")');
    });

    it("reads from offset to end of file when no limit given", async () => {
      const result = await client.callTool({
        name: "iwd_read",
        arguments: { path: iwdPath, entry: TEXT_ENTRY, offset: 2 },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      // offset=2 (0-indexed), no limit → reads lines 3-4
      expect(text).toContain("lines 3-4 of 4");
      expect(text).toContain('iprintln("hello")');
      expect(text).not.toContain("// test GSC script");
    });

    it("returns error when offset exceeds file length", async () => {
      const result = await client.callTool({
        name: "iwd_read",
        arguments: { path: iwdPath, entry: TEXT_ENTRY, offset: 9999 },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("offset");
      expect(text).toContain("beyond end of file");
    });
  });

  // --- iwd_info ---

  describe("iwd_info", () => {
    it("returns metadata for a text entry", async () => {
      const result = await client.callTool({
        name: "iwd_info",
        arguments: { path: iwdPath, entry: TEXT_ENTRY },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain(`Entry:`);
      expect(text).toContain(TEXT_ENTRY);
      expect(text).toContain("Type:      Text");
      expect(text).toContain("CRC:");
      expect(text).toContain("Ready to read with iwd_read");
    });

    it("returns metadata for a binary entry and warns about base64", async () => {
      const result = await client.callTool({
        name: "iwd_info",
        arguments: { path: iwdPath, entry: BINARY_ENTRY },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain(BINARY_ENTRY);
      expect(text).toContain("Type:      Binary");
      expect(text).toContain("iwd_read will return base64");
    });
  });

  // --- iwd_write ---

  describe("iwd_write", () => {
    it("updates an existing entry", async () => {
      const newContent = '// updated\nmain() { iprintln("updated"); }';
      const result = await client.callTool({
        name: "iwd_write",
        arguments: { path: iwdPath, entry: TEXT_ENTRY, content: newContent },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Updated");

      // Verify the write persisted
      const zip = new AdmZip(iwdPath);
      expect(zip.readAsText(TEXT_ENTRY)).toBe(newContent);
    });

    it("adds a new entry", async () => {
      const newEntry = "scripts/new_script.gsc";
      const content = "// brand new";
      const result = await client.callTool({
        name: "iwd_write",
        arguments: { path: iwdPath, entry: newEntry, content },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Added");

      const zip = new AdmZip(iwdPath);
      expect(zip.readAsText(newEntry)).toBe(content);
    });

    it("creates a .bak backup on first write", async () => {
      await client.callTool({
        name: "iwd_write",
        arguments: {
          path: iwdPath,
          entry: TEXT_ENTRY,
          content: "backup test",
        },
      });
      expect(fs.existsSync(iwdPath + ".bak")).toBe(true);
    });

    it("returns a diff snippet when replacing an existing text entry", async () => {
      const newContent = '// updated\nmain() {\n  iprintln("hello");\n}';
      const result = await client.callTool({
        name: "iwd_write",
        arguments: { path: iwdPath, entry: TEXT_ENTRY, content: newContent },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Diff");
      expect(text).toContain("- ");
      expect(text).toContain("+ ");
    });

    it("dry_run returns validation without writing", async () => {
      const result = await client.callTool({
        name: "iwd_write",
        arguments: {
          path: iwdPath,
          entry: TEXT_ENTRY,
          content: "dry run content",
          dry_run: true,
        },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("[dry_run]");

      // File should be unchanged
      const zip = new AdmZip(iwdPath);
      expect(zip.readAsText(TEXT_ENTRY)).toBe(TEXT_CONTENT);
    });
  });

  // --- iwd_patch ---

  describe("iwd_patch", () => {
    it("performs surgical string replacement", async () => {
      const oldStr = 'iprintln("hello")';
      const newStr = 'iprintln("patched")';
      const result = await client.callTool({
        name: "iwd_patch",
        arguments: {
          path: iwdPath,
          entry: TEXT_ENTRY,
          old: oldStr,
          new: newStr,
        },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Patched");
      expect(text).toContain("Replaced 1/1 occurrence");

      const zip = new AdmZip(iwdPath);
      expect(zip.readAsText(TEXT_ENTRY)).toContain(newStr);
      expect(zip.readAsText(TEXT_ENTRY)).not.toContain(oldStr);
    });

    it("returns a diff snippet for in-place verification", async () => {
      const result = await client.callTool({
        name: "iwd_patch",
        arguments: {
          path: iwdPath,
          entry: TEXT_ENTRY,
          old: 'iprintln("hello")',
          new: 'iprintln("world")',
        },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Context around change");
      expect(text).toContain("- ");
      expect(text).toContain("+ ");
    });

    it("replaces all occurrences when count=-1", async () => {
      // Create an IWD with multiple occurrences
      const multiContent = "foo()\nfoo()\nfoo()";
      const multiIwd = path.join(tmpDir, "multi.iwd");
      const z = new AdmZip();
      z.addFile("scripts/test.gsc", Buffer.from(multiContent));
      z.writeZip(multiIwd);

      const result = await client.callTool({
        name: "iwd_patch",
        arguments: {
          path: multiIwd,
          entry: "scripts/test.gsc",
          old: "foo()",
          new: "bar()",
          count: -1,
        },
      });
      expect(result.isError).toBeFalsy();
      const zip = new AdmZip(multiIwd);
      const result2 = zip.readAsText("scripts/test.gsc");
      expect(result2).toBe("bar()\nbar()\nbar()");
    });

    it("dry_run returns diff without modifying", async () => {
      const result = await client.callTool({
        name: "iwd_patch",
        arguments: {
          path: iwdPath,
          entry: TEXT_ENTRY,
          old: 'iprintln("hello")',
          new: 'iprintln("dry")',
          dry_run: true,
        },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("[dry_run]");
      expect(text).toContain("Context around change");

      // File should be unchanged
      const zip = new AdmZip(iwdPath);
      expect(zip.readAsText(TEXT_ENTRY)).toContain('iprintln("hello")');
    });

    it("shows 'remaining' count when not all occurrences replaced", async () => {
      const multiContent = "foo()\nfoo()\nfoo()";
      const multiIwd = path.join(tmpDir, "partial.iwd");
      const z = new AdmZip();
      z.addFile("scripts/test.gsc", Buffer.from(multiContent));
      z.writeZip(multiIwd);

      const result = await client.callTool({
        name: "iwd_patch",
        arguments: {
          path: multiIwd,
          entry: "scripts/test.gsc",
          old: "foo()",
          new: "bar()",
          count: 1,
        },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("remaining");
      expect(text).toContain("count=-1");
    });

    it("returns error when attempting to patch a binary entry", async () => {
      const result = await client.callTool({
        name: "iwd_patch",
        arguments: {
          path: iwdPath,
          entry: BINARY_ENTRY,
          old: "abc",
          new: "def",
        },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Cannot patch binary entry");
      expect(text).toContain("Only text files");
    });

    it("creates a .bak backup on first patch", async () => {
      await client.callTool({
        name: "iwd_patch",
        arguments: {
          path: iwdPath,
          entry: TEXT_ENTRY,
          old: "// test GSC script",
          new: "// patched",
        },
      });
      expect(fs.existsSync(iwdPath + ".bak")).toBe(true);
    });

    it("returns error if old string not found", async () => {
      const result = await client.callTool({
        name: "iwd_patch",
        arguments: {
          path: iwdPath,
          entry: TEXT_ENTRY,
          old: "missing",
          new: "new",
        },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Search string not found");
      expect(text).toContain("case-sensitive");
    });
  });

  // --- iwd_remove ---

  describe("iwd_remove", () => {
    it("removes an existing entry and reports its size/CRC", async () => {
      const result = await client.callTool({
        name: "iwd_remove",
        arguments: { path: iwdPath, entry: TEXT_ENTRY },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Removed");
      expect(text).toContain("bytes");
      expect(text).toContain("CRC:");

      // Verify it's gone
      const zip = new AdmZip(iwdPath);
      expect(zip.getEntry(TEXT_ENTRY)).toBeNull();
    });

    it("returns error for missing entry", async () => {
      const result = await client.callTool({
        name: "iwd_remove",
        arguments: { path: iwdPath, entry: "nope.gsc" },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Entry not found");
    });

    it("dry_run returns info without removing", async () => {
      const result = await client.callTool({
        name: "iwd_remove",
        arguments: { path: iwdPath, entry: TEXT_ENTRY, dry_run: true },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("[dry_run]");
      expect(text).toContain("bytes");

      // File should still exist
      const zip = new AdmZip(iwdPath);
      expect(zip.getEntry(TEXT_ENTRY)).not.toBeNull();
    });
  });

  // --- iwd_diff ---

  describe("iwd_diff", () => {
    it("reports identical files as identical", async () => {
      const iwdPath2 = path.join(tmpDir, "copy.iwd");
      fs.copyFileSync(iwdPath, iwdPath2);

      const result = await client.callTool({
        name: "iwd_diff",
        arguments: { path1: iwdPath, path2: iwdPath2 },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("0 added");
      expect(text).toContain("0 removed");
      expect(text).toContain("0 modified");
      expect(text).toContain("2 identical");
    });

    it("detects added, removed, and modified entries", async () => {
      const iwdPath2 = path.join(tmpDir, "modified.iwd");
      const zip2 = new AdmZip();
      zip2.addFile(TEXT_ENTRY, Buffer.from("// changed content"));
      zip2.addFile("new/file.gsc", Buffer.from("new"));
      zip2.writeZip(iwdPath2);

      const result = await client.callTool({
        name: "iwd_diff",
        arguments: { path1: iwdPath, path2: iwdPath2 },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("1 added");
      expect(text).toContain("1 removed");
      expect(text).toContain("1 modified");
    });

    it("filters comparison with entry_glob", async () => {
      const iwdPath2 = path.join(tmpDir, "glob-diff.iwd");
      const zip2 = new AdmZip();
      zip2.addFile(TEXT_ENTRY, Buffer.from("// changed"));
      zip2.addFile(BINARY_ENTRY, Buffer.alloc(64, 0xab));
      zip2.writeZip(iwdPath2);

      // Only compare .gsc files
      const result = await client.callTool({
        name: "iwd_diff",
        arguments: {
          path1: iwdPath,
          path2: iwdPath2,
          entry_glob: "*.gsc",
        },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("filter: *.gsc");
      // The binary entry should not appear since we filtered to *.gsc
      expect(text).not.toContain(BINARY_ENTRY);
    });

    it("returns content_diff for modified text entries", async () => {
      const iwdPath2 = path.join(tmpDir, "content-diff.iwd");
      const zip2 = new AdmZip();
      zip2.addFile(TEXT_ENTRY, Buffer.from('// changed\nmain() {\n  iprintln("changed");\n}'));
      zip2.addFile(BINARY_ENTRY, Buffer.alloc(64, 0xab));
      zip2.writeZip(iwdPath2);

      const result = await client.callTool({
        name: "iwd_diff",
        arguments: {
          path1: iwdPath,
          path2: iwdPath2,
          content_diff: true,
        },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Content diffs");
      expect(text).toContain("- ");
      expect(text).toContain("+ ");
    });

    it("returns error for missing file", async () => {
      const result = await client.callTool({
        name: "iwd_diff",
        arguments: {
          path1: iwdPath,
          path2: path.join(tmpDir, "ghost.iwd"),
        },
      });
      expect(result.isError).toBe(true);
    });
  });

  // --- iw4x://dvars resource ---

  describe("iw4x://dvars resource", () => {
    it("returns DVAR JSON via resource read", async () => {
      const result = await client.readResource({ uri: "iw4x://dvars" });
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe("application/json");
      const content = result.contents[0] as {
        uri: string;
        text: string;
        mimeType?: string;
      };
      const parsed = JSON.parse(content.text);
      expect(Array.isArray(parsed.dvars)).toBe(true);
    });
  });

  // --- iwd_grep ---

  describe("iwd_grep", () => {
    it("searches content across files (case-insensitive)", async () => {
      const result = await client.callTool({
        name: "iwd_grep",
        arguments: { path: iwdPath, pattern: "IPRINTLN" }, // uppercase
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Found 1 match");
      expect(text).toContain(TEXT_ENTRY);
      expect(text).toContain('iprintln("hello")');
    });

    it("searches with is_regex=true", async () => {
      const result = await client.callTool({
        name: "iwd_grep",
        arguments: { path: iwdPath, pattern: 'iprintln\\("hell', is_regex: true },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Found 1 match");
      expect(text).toContain('iprintln("hello")');
    });

    it("returns clear error for invalid regex", async () => {
      const result = await client.callTool({
        name: "iwd_grep",
        arguments: { path: iwdPath, pattern: "(unclosed", is_regex: true },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Invalid regex pattern");
      expect(text).toContain("is_regex=false");
    });

    it("skips binary files", async () => {
      const result = await client.callTool({
        name: "iwd_grep",
        arguments: { path: iwdPath, pattern: "AB", is_regex: false },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("No matches for");
    });

    it("filters entries by glob and returns entry count in no-match message", async () => {
      const result = await client.callTool({
        name: "iwd_grep",
        arguments: {
          path: iwdPath,
          pattern: "main",
          entry_glob: "incorrect/*.gsc",
        },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("No text entries match glob");
      expect(text).toContain("iwd_list");
    });

    it("truncates results at max_matches", async () => {
      // Build IWD with a file that has many matches
      const bigContent = Array.from({ length: 100 }, (_, i) => `foo_${i}()`).join("\n");
      const bigIwd = path.join(tmpDir, "big.iwd");
      const z = new AdmZip();
      z.addFile("scripts/big.gsc", Buffer.from(bigContent));
      z.writeZip(bigIwd);

      const result = await client.callTool({
        name: "iwd_grep",
        arguments: { path: bigIwd, pattern: "foo_", max_matches: 5 },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("truncated at 5");
    });
  });

  // --- iwd_extract ---

  describe("iwd_extract", () => {
    it("extracts all entries to a directory", async () => {
      const dest = path.join(tmpDir, "extracted");
      const result = await client.callTool({
        name: "iwd_extract",
        arguments: { path: iwdPath, dest },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Extracted 2");
      expect(fs.existsSync(path.join(dest, TEXT_ENTRY))).toBe(true);
      expect(fs.existsSync(path.join(dest, BINARY_ENTRY))).toBe(true);
    });

    it("extracts a glob-filtered subset", async () => {
      const dest = path.join(tmpDir, "extracted-gsc");
      const result = await client.callTool({
        name: "iwd_extract",
        arguments: { path: iwdPath, dest, entry_glob: "maps/**/*.gsc" },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Extracted 1");
      expect(fs.existsSync(path.join(dest, TEXT_ENTRY))).toBe(true);
      // Binary not extracted
      expect(fs.existsSync(path.join(dest, BINARY_ENTRY))).toBe(false);
    });

    it("dry_run lists files without writing", async () => {
      const dest = path.join(tmpDir, "dry-extracted");
      const result = await client.callTool({
        name: "iwd_extract",
        arguments: { path: iwdPath, dest, dry_run: true },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("[dry_run]");
      expect(text).toContain(TEXT_ENTRY);
      // Directory should not have been created
      expect(fs.existsSync(dest)).toBe(false);
    });

    it("returns error when glob matches nothing", async () => {
      const dest = path.join(tmpDir, "empty");
      const result = await client.callTool({
        name: "iwd_extract",
        arguments: { path: iwdPath, dest, entry_glob: "*.xyz" },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("No entries match glob");
    });
  });

  // --- iwd_rename ---

  describe("iwd_rename", () => {
    it("renames an entry within the archive", async () => {
      const newName = "maps/mp/gametypes/_renamed.gsc";
      const result = await client.callTool({
        name: "iwd_rename",
        arguments: { path: iwdPath, entry: TEXT_ENTRY, new_entry: newName },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Renamed");
      expect(text).toContain(TEXT_ENTRY);
      expect(text).toContain(newName);

      const zip = new AdmZip(iwdPath);
      expect(zip.getEntry(TEXT_ENTRY)).toBeNull();
      const renamed = zip.getEntry(newName);
      expect(renamed).not.toBeNull();
      expect(zip.readAsText(renamed!)).toBe(TEXT_CONTENT);
    });

    it("dry_run returns rename info without modifying", async () => {
      const newName = "maps/mp/gametypes/_dry-renamed.gsc";
      const result = await client.callTool({
        name: "iwd_rename",
        arguments: { path: iwdPath, entry: TEXT_ENTRY, new_entry: newName, dry_run: true },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("[dry_run]");
      const zip = new AdmZip(iwdPath);
      expect(zip.getEntry(TEXT_ENTRY)).not.toBeNull();
      expect(zip.getEntry(newName)).toBeNull();
    });

    it("returns error if source entry not found", async () => {
      const result = await client.callTool({
        name: "iwd_rename",
        arguments: { path: iwdPath, entry: "does/not/exist.gsc", new_entry: "other.gsc" },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Entry not found");
    });

    it("returns error if destination already exists", async () => {
      const result = await client.callTool({
        name: "iwd_rename",
        arguments: { path: iwdPath, entry: TEXT_ENTRY, new_entry: BINARY_ENTRY },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("already exists");
    });

    it("returns error when source and destination are the same", async () => {
      const result = await client.callTool({
        name: "iwd_rename",
        arguments: { path: iwdPath, entry: TEXT_ENTRY, new_entry: TEXT_ENTRY },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("same path");
    });
  });

  // --- iwd_copy ---

  describe("iwd_copy", () => {
    it("copies an entry within the same archive", async () => {
      const dstEntry = "maps/mp/gametypes/_copy.gsc";
      const result = await client.callTool({
        name: "iwd_copy",
        arguments: {
          src_path: iwdPath,
          src_entry: TEXT_ENTRY,
          dst_path: iwdPath,
          dst_entry: dstEntry,
        },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Copied");

      const zip = new AdmZip(iwdPath);
      expect(zip.getEntry(TEXT_ENTRY)).not.toBeNull(); // original still there
      const copy = zip.getEntry(dstEntry);
      expect(copy).not.toBeNull();
      expect(zip.readAsText(copy!)).toBe(TEXT_CONTENT);
    });

    it("copies an entry to a different archive", async () => {
      const dstIwd = path.join(tmpDir, "dst.iwd");
      const dstZip = new AdmZip();
      dstZip.addFile("placeholder.gsc", Buffer.from("// placeholder"));
      dstZip.writeZip(dstIwd);

      const result = await client.callTool({
        name: "iwd_copy",
        arguments: {
          src_path: iwdPath,
          src_entry: TEXT_ENTRY,
          dst_path: dstIwd,
          dst_entry: TEXT_ENTRY,
        },
      });
      expect(result.isError).toBeFalsy();

      const zip = new AdmZip(dstIwd);
      const entry = zip.getEntry(TEXT_ENTRY);
      expect(entry).not.toBeNull();
      expect(zip.readAsText(entry!)).toBe(TEXT_CONTENT);
    });

    it("dry_run validates without writing", async () => {
      const dstEntry = "maps/mp/gametypes/_dry-copy.gsc";
      const result = await client.callTool({
        name: "iwd_copy",
        arguments: {
          src_path: iwdPath,
          src_entry: TEXT_ENTRY,
          dst_path: iwdPath,
          dst_entry: dstEntry,
          dry_run: true,
        },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("[dry_run]");
      const zip = new AdmZip(iwdPath);
      expect(zip.getEntry(dstEntry)).toBeNull();
    });

    it("returns error if destination exists and overwrite=false", async () => {
      const result = await client.callTool({
        name: "iwd_copy",
        arguments: {
          src_path: iwdPath,
          src_entry: TEXT_ENTRY,
          dst_path: iwdPath,
          dst_entry: BINARY_ENTRY, // already exists
          overwrite: false,
        },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("already exists");
      expect(text).toContain("overwrite=true");
    });

    it("overwrites destination when overwrite=true", async () => {
      const result = await client.callTool({
        name: "iwd_copy",
        arguments: {
          src_path: iwdPath,
          src_entry: TEXT_ENTRY,
          dst_path: iwdPath,
          dst_entry: BINARY_ENTRY,
          overwrite: true,
        },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("overwrote existing");
    });

    it("returns error if source entry not found", async () => {
      const result = await client.callTool({
        name: "iwd_copy",
        arguments: {
          src_path: iwdPath,
          src_entry: "does/not/exist.gsc",
          dst_path: iwdPath,
          dst_entry: "copy.gsc",
        },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Entry not found");
      expect(text).toContain("does/not/exist.gsc");
    });
  });
});

// ---------------------------------------------------------------------------
// Server instantiation smoke test
// ---------------------------------------------------------------------------

describe("server", () => {
  it("instantiates without error", () => {
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
  });
});
