import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import AdmZip from "adm-zip";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { isBinaryEntry, normalizeEntry, loadDvars, resolveIwdPath, ensureBackup, atomicWrite, server, } from "./index.js";
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
        expect(normalizeEntry("maps\\mp\\gametypes\\_globallogic.gsc")).toBe("maps/mp/gametypes/_globallogic.gsc");
    });
    it("leaves forward slashes unchanged", () => {
        expect(normalizeEntry("maps/mp/test.gsc")).toBe("maps/mp/test.gsc");
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
    let tmpDir;
    let iwdPath;
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
    let tmpDir;
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
    let client;
    let tmpDir;
    let iwdPath;
    const TEXT_ENTRY = "maps/mp/gametypes/_test.gsc";
    const TEXT_CONTENT = '// test GSC script\nmain() {\n  iprintln("hello");\n}';
    const BINARY_ENTRY = "images/test.iwi";
    beforeAll(async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
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
            const text = result.content[0]
                .text;
            expect(text).toContain(TEXT_ENTRY);
            expect(text).toContain(BINARY_ENTRY);
            expect(text).toContain("2 files");
        });
        it("returns error for missing file", async () => {
            const result = await client.callTool({
                name: "iwd_list",
                arguments: { path: path.join(tmpDir, "nonexistent.iwd") },
            });
            expect(result.isError).toBe(true);
            const text = result.content[0]
                .text;
            expect(text).toContain("File not found");
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
            const text = result.content[0]
                .text;
            expect(text).toBe(TEXT_CONTENT);
        });
        it("reads a binary entry as base64", async () => {
            const result = await client.callTool({
                name: "iwd_read",
                arguments: { path: iwdPath, entry: BINARY_ENTRY },
            });
            expect(result.isError).toBeFalsy();
            const parts = result.content;
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
            const text = result.content[0]
                .text;
            expect(text).toBe(TEXT_CONTENT);
        });
        it("returns error for missing entry", async () => {
            const result = await client.callTool({
                name: "iwd_read",
                arguments: { path: iwdPath, entry: "does/not/exist.gsc" },
            });
            expect(result.isError).toBe(true);
            const text = result.content[0]
                .text;
            expect(text).toContain("Entry not found");
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
            const text = result.content[0]
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
            const text = result.content[0]
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
    });
    // --- iwd_remove ---
    describe("iwd_remove", () => {
        it("removes an existing entry", async () => {
            const result = await client.callTool({
                name: "iwd_remove",
                arguments: { path: iwdPath, entry: TEXT_ENTRY },
            });
            expect(result.isError).toBeFalsy();
            const text = result.content[0]
                .text;
            expect(text).toContain("Removed");
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
            const text = result.content[0]
                .text;
            expect(text).toContain("Entry not found");
        });
    });
    // --- iwd_diff ---
    describe("iwd_diff", () => {
        it("reports identical files as identical", async () => {
            // Copy the IWD so both are the same
            const iwdPath2 = path.join(tmpDir, "copy.iwd");
            fs.copyFileSync(iwdPath, iwdPath2);
            const result = await client.callTool({
                name: "iwd_diff",
                arguments: { path1: iwdPath, path2: iwdPath2 },
            });
            expect(result.isError).toBeFalsy();
            const text = result.content[0]
                .text;
            expect(text).toContain("0 added");
            expect(text).toContain("0 removed");
            expect(text).toContain("0 modified");
            expect(text).toContain("2 identical");
        });
        it("detects added, removed, and modified entries", async () => {
            const iwdPath2 = path.join(tmpDir, "modified.iwd");
            const zip2 = new AdmZip();
            // Same name, different content → modified
            zip2.addFile(TEXT_ENTRY, Buffer.from("// changed content"));
            // New entry → added
            zip2.addFile("new/file.gsc", Buffer.from("new"));
            // BINARY_ENTRY missing → removed
            zip2.writeZip(iwdPath2);
            const result = await client.callTool({
                name: "iwd_diff",
                arguments: { path1: iwdPath, path2: iwdPath2 },
            });
            expect(result.isError).toBeFalsy();
            const text = result.content[0]
                .text;
            expect(text).toContain("1 added");
            expect(text).toContain("1 removed");
            expect(text).toContain("1 modified");
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
            const content = result.contents[0];
            const parsed = JSON.parse(content.text);
            expect(Array.isArray(parsed.dvars)).toBe(true);
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
//# sourceMappingURL=index.test.js.map