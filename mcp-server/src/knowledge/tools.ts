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
let menuHudCache: RawCache | null = null;

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
 * Loads `gsc-menu-hud.json` as a raw JSON string.
 * Cached by mtime.
 */
export function loadMenuHud(): string {
  const filePath = getKnowledgeDir("gsc-menu-hud.json");
  if (!filePath) {
    return JSON.stringify({ error: "gsc-menu-hud.json not found" });
  }
  try {
    const mtime = fs.statSync(filePath).mtimeMs;
    if (menuHudCache && menuHudCache.mtime === mtime && !isCacheExpired(menuHudCache.cachedAt)) {
      return menuHudCache.raw;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    menuHudCache = { raw, mtime, cachedAt: Date.now() };
    return raw;
  } catch (e) {
    return JSON.stringify({ error: `Failed to load gsc-menu-hud.json: ${getErrMsg(e)}` });
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

  // --- Tool: gsc_menu_hud ---
  server.registerTool(
    "gsc_menu_hud",
    {
      title: "GSC Menu HUD Reference",
      description:
        "Reference for building HUD-element script menus in CoD4/CoD4X and MW2/IW4X GSC. " +
        "Covers the positioning system (setPoint), all HUD element properties, " +
        "background/layering patterns, and CoD4 vs IW4X input differences. " +
        "Call this before writing any HUD menu code. " +
        "Topics: positioning, properties, layering, setPoint, fonts, sort, color, all.",
      inputSchema: {
        topic: z.string().describe(
          "Topic to look up. One of: 'positioning', 'properties', 'layering', " +
          "'setPoint', 'fonts', 'sort', 'color', 'all', or any property name."
        ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ topic }) => {
      const raw = loadMenuHud();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return errResult("Failed to parse gsc-menu-hud.json");
      }
      if ("error" in data) {
        return errResult(String(data.error));
      }

      const sections = data.sections as Record<string, unknown>;
      const t = topic.toLowerCase().trim();

      if (t === "all") {
        return okResult(JSON.stringify(sections, null, 2));
      }
      if (t === "positioning" || t === "properties" || t === "layering") {
        return okResult(JSON.stringify(sections[t], null, 2));
      }
      if (t === "setpoint") {
        const pos = sections.positioning as Record<string, unknown>;
        return okResult(JSON.stringify(pos.setPoint, null, 2));
      }
      if (t === "fonts" || t === "font") {
        const props = sections.properties as Record<string, unknown>;
        const text = props.text as Record<string, unknown>;
        return okResult(JSON.stringify(text.font, null, 2));
      }
      if (t === "sort") {
        const layer = sections.layering as Record<string, unknown>;
        return okResult(JSON.stringify(layer.sort_system, null, 2));
      }
      if (t === "color" || t === "colour") {
        const props = sections.properties as Record<string, unknown>;
        const vis = props.visual as Record<string, unknown>;
        return okResult(JSON.stringify(vis.color, null, 2));
      }
      if (t === "alpha") {
        const props = sections.properties as Record<string, unknown>;
        const vis = props.visual as Record<string, unknown>;
        return okResult(JSON.stringify(vis.alpha, null, 2));
      }
      if (t === "cleanup" || t === "destroy") {
        const layer = sections.layering as Record<string, unknown>;
        return okResult(JSON.stringify(layer.cleanup, null, 2));
      }
      if (t === "foreground") {
        const props = sections.properties as Record<string, unknown>;
        const vis = props.visual as Record<string, unknown>;
        return okResult(JSON.stringify(vis.foreground, null, 2));
      }

      // Generic property search across all sections
      const results: Record<string, unknown> = {};
      for (const [sectionName, section] of Object.entries(sections)) {
        const found = findInSection(section as Record<string, unknown>, t);
        if (found !== null) results[sectionName] = found;
      }
      if (Object.keys(results).length > 0) {
        return okResult(JSON.stringify(results, null, 2));
      }

      return okResult(
        `No match found for topic '${topic}'.\n` +
        `Valid topics: positioning, properties, layering, setPoint, fonts, sort, color, alpha, foreground, cleanup, all.\n` +
        `Or use any property name (e.g. 'fontscale', 'glowAlpha').`
      );
    },
  );

} // end registerKnowledgeTools

/**
 * Recursively searches a nested object for a key matching the search term.
 * Returns the matched entries if found, null otherwise.
 */
function findInSection(
  obj: Record<string, unknown>,
  term: string,
): Record<string, unknown> | null {
  const results: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.toLowerCase() === term) {
      results[key] = value;
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nested = findInSection(value as Record<string, unknown>, term);
      if (nested !== null) results[key] = nested;
    }
  }
  return Object.keys(results).length > 0 ? results : null;
}
