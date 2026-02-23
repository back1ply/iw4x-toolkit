/**
 * @file knowledge/tools.ts
 * Registers DVAR and GSC built-in knowledge resources and tools.
 * Uses `registerTool` / `resource` (MCP spec 2025-11-25).
 *
 * Performance: Both knowledge files are cached after the first read.
 * Caches are mtime-keyed — a changed file on disk is automatically re-read on
 * the next access. The parsed DVAR object is also cached to avoid repeated
 * JSON.parse calls on dvar_search invocations.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "node:fs";
import { errResult, okResult, getErrMsg, getKnowledgeDir } from "../utils.js";

// ---------------------------------------------------------------------------
// DVAR type
// ---------------------------------------------------------------------------

/** A single DVAR entry from the MW2/IW4X knowledge base. */
export interface Dvar {
  name: string;
  type: string;
  default: string;
  flags?: string[];
  category: string;
  subcategory?: string;
  context?: string;
  description?: string;
  fps_impact?: string;
}

// ---------------------------------------------------------------------------
// Mtime-keyed file caches
// ---------------------------------------------------------------------------

interface RawCache {
  raw: string;
  mtime: number;
  cachedAt: number;
}

interface ParsedDvarsCache {
  data: { dvars: Dvar[] };
  mtime: number;
  cachedAt: number;
}

/** TTL for knowledge caches in milliseconds (5 minutes). */
const KNOWLEDGE_CACHE_TTL_MS = 5 * 60 * 1000;

let dvarsCache: ParsedDvarsCache | null = null;
let gscRawCache: RawCache | null = null;

/**
 * Checks if a cache entry has expired based on TTL.
 */
function isCacheExpired(cachedAt: number): boolean {
  return Date.now() - cachedAt > KNOWLEDGE_CACHE_TTL_MS;
}

/**
 * Loads `dvars.json` as a raw JSON string.
 * Uses getParsedDvars to fetch from the single cache, then serializes it.
 */
export function loadDvars(): string {
  const result = getParsedDvars();
  if ("error" in result) {
    return JSON.stringify(result);
  }
  return JSON.stringify(result, null, 2);
}

/**
 * Loads `gsc-builtins.json` as a raw JSON string.
 * Cached by mtime — disk is only re-read when the file changes.
 */
export function loadGscBuiltins(): string {
  const filePath = getKnowledgeDir("gsc-builtins.json");
  if (!filePath) {
    return JSON.stringify({ error: "gsc-builtins.json not found" });
  }
  try {
    const mtime = fs.statSync(filePath).mtimeMs;
    if (gscRawCache && gscRawCache.mtime === mtime && !isCacheExpired(gscRawCache.cachedAt)) {
      return gscRawCache.raw;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    gscRawCache = { raw, mtime, cachedAt: Date.now() };
    return raw;
  } catch (e) {
    return JSON.stringify({ error: `Failed to load gsc-builtins.json: ${getErrMsg(e)}` });
  }
}

/**
 * Returns the parsed DVAR data. Uses a mtime-keyed cache to avoid calling
 * `JSON.parse` on every `dvar_search` invocation.
 */
function getParsedDvars(): { dvars: Dvar[] } | { error: string } {
  const filePath = getKnowledgeDir("dvars.json");
  if (!filePath) return { error: "dvars.json not found" };

  try {
    const mtime = fs.statSync(filePath).mtimeMs;
    if (dvarsCache && dvarsCache.mtime === mtime && !isCacheExpired(dvarsCache.cachedAt)) {
      return dvarsCache.data;
    }
    
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as { dvars: Dvar[] };
    dvarsCache = { data, mtime, cachedAt: Date.now() };
    return data;
  } catch (e) {
    return { error: `Failed to parse dvars.json: ${getErrMsg(e)}` };
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Registers DVAR and GSC knowledge resources and the `dvar_search` tool
 * on the given MCP server instance. Call this once during server bootstrap.
 */
export function registerKnowledgeTools(server: McpServer): void {

  // --- Resource: iw4x://dvars ---
  server.resource(
    "DVAR Reference",
    "iw4x://dvars",
    {
      title: "MW2/IW4X DVAR Reference",
      description:
        "MW2/IW4X DVAR knowledge base — 1,731 DVARs with types, defaults, flags, categories, and FPS impact",
    },
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

  // --- Resource: iw4x://gsc-builtins ---
  server.resource(
    "GSC Built-ins Reference",
    "iw4x://gsc-builtins",
    {
      title: "GSC Built-in Functions Reference",
      description:
        "GSC built-in functions for CoD4, IW4, IW4x, and CoD4x. Used for autocomplete and validation.",
    },
    async () => ({
      contents: [
        {
          uri: "iw4x://gsc-builtins",
          mimeType: "application/json",
          text: loadGscBuiltins(),
        },
      ],
    }),
  );

  // --- Tool: dvar_search ---
  server.registerTool(
    "dvar_search",
    {
      title: "Search DVAR Knowledge Base",
      description:
        "Search the MW2 DVAR knowledge base without loading the full file. " +
        "Filters by name or description. Returns top 20 results to save context.",
      inputSchema: {
        query: z.string().describe("Search term (e.g. 'fov', 'shadow', 'network')"),
        category: z.string().optional().describe("Optional category filter (e.g. 'graphic', 'sound', 'network')"),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ query, category }) => {
      const result = getParsedDvars();
      if ("error" in result) {
        return errResult(result.error);
      }

      if (!Array.isArray(result.dvars)) {
        return errResult("Invalid dvars.json structure: missing 'dvars' array.");
      }

      const q = query.toLowerCase();
      const cat = category?.toLowerCase();

      const matches = result.dvars.filter((d) => {
        const nameMatch = d.name.toLowerCase().includes(q);
        const descMatch = d.description?.toLowerCase().includes(q) ?? false;
        const catMatch = cat !== undefined ? d.category?.toLowerCase() === cat : true;
        return (nameMatch || descMatch) && catMatch;
      });

      const count = matches.length;
      if (count === 0) {
        return okResult(`No DVARs found matching query='${query}'${cat ? ` category='${cat}'` : ""}.`);
      }

      const limited = matches.slice(0, 20);
      const output = limited.map((d) => {
        const desc = d.description ? `\n  ${d.description}` : "";
        const meta = `[${d.type}, default: ${d.default}]`;
        const catInfo = `(${d.category}/${d.subcategory ?? ""})`;
        return `- ${d.name} ${meta} ${catInfo}${desc}`;
      }).join("\n");

      const footer = count > 20
        ? `\n\n... and ${count - 20} more. Refine your search.`
        : "";

      return okResult(`Found ${count} DVARs matching '${query}':\n\n${output}${footer}`);
    },
  );

} // end registerKnowledgeTools
