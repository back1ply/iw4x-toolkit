import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import AdmZip from "adm-zip";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BINARY_EXTENSIONS = new Set([
  ".iwi",
  ".d3dbsp",
  ".xmodel_export",
  ".xanim_export",
  ".mp3",
  ".wav",
  ".flac",
  ".bik",
  ".roq",
  ".dds",
  ".tga",
  ".jpg",
  ".jpeg",
  ".png",
  ".bmp",
  ".pcx",
  ".xmodel_bin",
  ".xanim_bin",
  ".col_map_sp",
  ".col_map_mp",
  ".gfx_map",
  ".fx",
]);

// Track which IWDs have been backed up this session
const backedUp = new Set<string>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBinaryEntry(entryName: string): boolean {
  const ext = path.extname(entryName).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function resolveIwdPath(iwdPath: string): string {
  return path.resolve(iwdPath);
}

function ensureBackup(iwdPath: string): void {
  if (backedUp.has(iwdPath)) return;
  const bakPath = iwdPath + ".bak";
  if (!fs.existsSync(bakPath)) {
    fs.copyFileSync(iwdPath, bakPath);
  }
  backedUp.add(iwdPath);
}

function atomicWrite(zip: AdmZip, targetPath: string): void {
  const tmpPath = targetPath + ".tmp";
  zip.writeZip(tmpPath);
  fs.renameSync(tmpPath, targetPath);
}

function normalizeEntry(entry: string): string {
  // Normalize backslashes to forward slashes (ZIP standard)
  return entry.replace(/\\/g, "/");
}

// ---------------------------------------------------------------------------
// DVAR knowledge base loader
// ---------------------------------------------------------------------------

function loadDvars(): string {
  // Resolve relative to this file's location → ../knowledge/dvars.json
  // At runtime, this file is at dist/index.js, so knowledge/ is at ../../knowledge/
  const candidates = [
    path.resolve(__dirname, "..", "..", "knowledge", "dvars.json"),
    path.resolve(__dirname, "..", "knowledge", "dvars.json"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, "utf-8");
    }
  }
  return JSON.stringify({ error: "dvars.json not found", searched: candidates });
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "iw4x-toolkit",
  version: "1.0.0",
});

// --- Tool: iwd_list ---
server.tool(
  "iwd_list",
  "List all entries in an IWD file (name, size, compressed size)",
  { path: z.string().describe("Path to the IWD file") },
  async ({ path: iwdPath }) => {
    const resolved = resolveIwdPath(iwdPath);
    if (!fs.existsSync(resolved)) {
      return { content: [{ type: "text", text: `Error: File not found: ${resolved}` }], isError: true };
    }
    const zip = new AdmZip(resolved);
    const entries = zip.getEntries();
    const rows = entries
      .filter((e) => !e.isDirectory)
      .map((e) => ({
        name: e.entryName,
        size: e.header.size,
        compressedSize: e.header.compressedSize,
      }));
    return {
      content: [
        {
          type: "text",
          text: `${resolved}\n${rows.length} files\n\n${rows.map((r) => `${r.name}  (${r.size} → ${r.compressedSize} bytes)`).join("\n")}`,
        },
      ],
    };
  },
);

// --- Tool: iwd_read ---
server.tool(
  "iwd_read",
  "Read a file from inside an IWD archive. Returns UTF-8 text for text files, base64 for binary files.",
  {
    path: z.string().describe("Path to the IWD file"),
    entry: z.string().describe("Path of the entry inside the IWD (e.g. maps/mp/gametypes/_globallogic.gsc)"),
  },
  async ({ path: iwdPath, entry }) => {
    const resolved = resolveIwdPath(iwdPath);
    if (!fs.existsSync(resolved)) {
      return { content: [{ type: "text", text: `Error: File not found: ${resolved}` }], isError: true };
    }
    const zip = new AdmZip(resolved);
    const normalized = normalizeEntry(entry);
    const zipEntry = zip.getEntry(normalized);
    if (!zipEntry) {
      return { content: [{ type: "text", text: `Error: Entry not found: ${normalized}` }], isError: true };
    }
    if (isBinaryEntry(normalized)) {
      const buf = zip.readFile(zipEntry);
      if (!buf) {
        return { content: [{ type: "text", text: `Error: Failed to read entry: ${normalized}` }], isError: true };
      }
      return {
        content: [
          { type: "text", text: `[binary: ${normalized}, ${buf.length} bytes, base64-encoded below]` },
          { type: "text", text: buf.toString("base64") },
        ],
      };
    }
    const text = zip.readAsText(zipEntry);
    return { content: [{ type: "text", text }] };
  },
);

// --- Tool: iwd_write ---
server.tool(
  "iwd_write",
  "Write or update a file inside an IWD archive. Creates a .bak backup on first modification per session. Content is UTF-8 text.",
  {
    path: z.string().describe("Path to the IWD file"),
    entry: z.string().describe("Path of the entry inside the IWD"),
    content: z.string().describe("File content to write (UTF-8 text)"),
  },
  async ({ path: iwdPath, entry, content }) => {
    const resolved = resolveIwdPath(iwdPath);
    if (!fs.existsSync(resolved)) {
      return { content: [{ type: "text", text: `Error: File not found: ${resolved}` }], isError: true };
    }
    ensureBackup(resolved);
    const zip = new AdmZip(resolved);
    const normalized = normalizeEntry(entry);
    const existing = zip.getEntry(normalized);
    if (existing) {
      zip.updateFile(normalized, Buffer.from(content, "utf-8"));
    } else {
      zip.addFile(normalized, Buffer.from(content, "utf-8"));
    }
    atomicWrite(zip, resolved);
    const action = existing ? "Updated" : "Added";
    return {
      content: [{ type: "text", text: `${action} ${normalized} in ${resolved} (${content.length} chars)` }],
    };
  },
);

// --- Tool: iwd_remove ---
server.tool(
  "iwd_remove",
  "Remove a file from inside an IWD archive. Creates a .bak backup on first modification per session.",
  {
    path: z.string().describe("Path to the IWD file"),
    entry: z.string().describe("Path of the entry to remove"),
  },
  async ({ path: iwdPath, entry }) => {
    const resolved = resolveIwdPath(iwdPath);
    if (!fs.existsSync(resolved)) {
      return { content: [{ type: "text", text: `Error: File not found: ${resolved}` }], isError: true };
    }
    const zip = new AdmZip(resolved);
    const normalized = normalizeEntry(entry);
    const existing = zip.getEntry(normalized);
    if (!existing) {
      return { content: [{ type: "text", text: `Error: Entry not found: ${normalized}` }], isError: true };
    }
    ensureBackup(resolved);
    zip.deleteFile(normalized);
    atomicWrite(zip, resolved);
    return { content: [{ type: "text", text: `Removed ${normalized} from ${resolved}` }] };
  },
);

// --- Tool: iwd_diff ---
server.tool(
  "iwd_diff",
  "Compare two IWD files and report added, removed, modified (CRC mismatch), and identical entries.",
  {
    path1: z.string().describe("Path to the first IWD file"),
    path2: z.string().describe("Path to the second IWD file"),
  },
  async ({ path1, path2 }) => {
    const r1 = resolveIwdPath(path1);
    const r2 = resolveIwdPath(path2);
    if (!fs.existsSync(r1)) {
      return { content: [{ type: "text", text: `Error: File not found: ${r1}` }], isError: true };
    }
    if (!fs.existsSync(r2)) {
      return { content: [{ type: "text", text: `Error: File not found: ${r2}` }], isError: true };
    }

    const zip1 = new AdmZip(r1);
    const zip2 = new AdmZip(r2);

    // Build CRC maps from central directory
    const map1 = new Map<string, number>();
    for (const e of zip1.getEntries()) {
      if (!e.isDirectory) map1.set(e.entryName, e.header.crc);
    }
    const map2 = new Map<string, number>();
    for (const e of zip2.getEntries()) {
      if (!e.isDirectory) map2.set(e.entryName, e.header.crc);
    }

    const added: string[] = [];
    const removed: string[] = [];
    const modified: string[] = [];
    let identical = 0;

    // Entries in file2 not in file1 → added
    for (const [name, crc2] of map2) {
      const crc1 = map1.get(name);
      if (crc1 === undefined) {
        added.push(name);
      } else if (crc1 !== crc2) {
        modified.push(name);
      } else {
        identical++;
      }
    }
    // Entries in file1 not in file2 → removed
    for (const name of map1.keys()) {
      if (!map2.has(name)) {
        removed.push(name);
      }
    }

    const lines: string[] = [
      `Comparing:`,
      `  A: ${r1} (${map1.size} files)`,
      `  B: ${r2} (${map2.size} files)`,
      ``,
      `Summary: ${added.length} added, ${removed.length} removed, ${modified.length} modified, ${identical} identical`,
    ];
    if (added.length > 0) {
      lines.push(``, `Added (in B, not in A):`);
      added.forEach((n) => lines.push(`  + ${n}`));
    }
    if (removed.length > 0) {
      lines.push(``, `Removed (in A, not in B):`);
      removed.forEach((n) => lines.push(`  - ${n}`));
    }
    if (modified.length > 0) {
      lines.push(``, `Modified (CRC differs):`);
      modified.forEach((n) => lines.push(`  ~ ${n}`));
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

// --- Resource: iw4x://dvars ---
server.resource(
  "DVAR Reference",
  "iw4x://dvars",
  { description: "MW2/IW4X DVAR knowledge base — 700+ DVARs with types, defaults, flags, categories, and FPS impact" },
  async () => ({
    contents: [
      {
        uri: "iw4x://dvars",
        mimeType: "application/json",
        text: loadDvars(),
      },
    ],
  }),
);

// ---------------------------------------------------------------------------
// Exports (for testing)
// ---------------------------------------------------------------------------

export { isBinaryEntry, normalizeEntry, loadDvars, resolveIwdPath, ensureBackup, atomicWrite, server };

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only auto-start when run directly (not when imported by tests)
const isDirectRun =
  process.argv[1] &&
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`;

if (isDirectRun) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
