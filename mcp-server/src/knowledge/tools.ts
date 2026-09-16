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

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "node:fs";
import { CommandError, getErrMsg, getKnowledgeDir } from "../utils.js";
import { command, registerCommands, type AnyCommand } from "../command.js";

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
const rawCaches = new Map<string, RawCache>();

/** A cache entry is fresh when the file is unchanged and within the TTL. */
function isCacheFresh(cache: { mtime: number; cachedAt: number }, mtime: number): boolean {
  const expired = Date.now() - cache.cachedAt > KNOWLEDGE_CACHE_TTL_MS;
  return cache.mtime === mtime && !expired;
}

/**
 * Load a knowledge-base file as a raw JSON string, cached by mtime — disk is
 * only re-read when the file changes (or the TTL lapses). On any failure,
 * returns a JSON `{ error }` string so callers always get valid JSON.
 */
function loadCachedRaw(fileName: string): string {
  const filePath = getKnowledgeDir(fileName);
  if (!filePath) return JSON.stringify({ error: `${fileName} not found` });
  try {
    const mtime = fs.statSync(filePath).mtimeMs;
    const cached = rawCaches.get(fileName);
    if (cached && isCacheFresh(cached, mtime)) return cached.raw;
    const raw = fs.readFileSync(filePath, "utf-8");
    rawCaches.set(fileName, { raw, mtime, cachedAt: Date.now() });
    return raw;
  } catch (e) {
    return JSON.stringify({ error: `Failed to load ${fileName}: ${getErrMsg(e)}` });
  }
}

/** Loads `dvars.json` as a pretty-printed JSON string (or a JSON error string). */
export function loadDvars(): string {
  const result = getParsedDvars();
  return "error" in result ? JSON.stringify(result) : JSON.stringify(result, null, 2);
}

/** Loads `gsc-builtins.json` as a raw JSON string. */
export function loadGscBuiltins(): string {
  return loadCachedRaw("gsc-builtins.json");
}

/** Loads `gsc-menu-hud.json` as a raw JSON string. */
export function loadMenuHud(): string {
  return loadCachedRaw("gsc-menu-hud.json");
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
    if (dvarsCache && isCacheFresh(dvarsCache, mtime)) return dvarsCache.data;

    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as { dvars: Dvar[] };
    dvarsCache = { data, mtime, cachedAt: Date.now() };
    return data;
  } catch (e) {
    return { error: `Failed to parse dvars.json: ${getErrMsg(e)}` };
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Match a DVAR against the query (name/description) and optional category filter. */
function matchesDvar(d: Dvar, q: string, cat: string | undefined): boolean {
  if (cat !== undefined && d.category?.toLowerCase() !== cat) return false;
  const desc = d.description?.toLowerCase() ?? "";
  return d.name.toLowerCase().includes(q) || desc.includes(q);
}

/** Render one DVAR search-result line. */
function formatDvarLine(d: Dvar): string {
  const desc = d.description ? `\n  ${d.description}` : "";
  return `- ${d.name} [${d.type}, default: ${d.default}] (${d.category}/${d.subcategory ?? ""})${desc}`;
}

const dvarSearch = command({
  name: "dvar_search",
  title: "Search DVAR Knowledge Base",
  description:
    "Search the MW2 DVAR knowledge base without loading the full file. " +
    "Filters by name or description. Returns top 20 results to save context.",
  input: {
    query: z.string().describe("Search term (e.g. 'fov', 'shadow', 'network')"),
    category: z.string().optional().describe("Optional category filter (e.g. 'graphic', 'sound', 'network')"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  run({ query, category }): { total: number; dvars: Dvar[] } {
    const result = getParsedDvars();
    if ("error" in result) throw new CommandError(result.error);
    if (!Array.isArray(result.dvars)) throw new CommandError("Invalid dvars.json structure: missing 'dvars' array.");
    const cat = category?.toLowerCase();
    const matches = result.dvars.filter(d => matchesDvar(d, query.toLowerCase(), cat));
    return { total: matches.length, dvars: matches.slice(0, 20) };
  },
  render(d, { query, category }) {
    const cat = category?.toLowerCase();
    if (d.total === 0) return `No DVARs found matching query='${query}'${cat ? ` category='${cat}'` : ""}.`;
    const output = d.dvars.map(formatDvarLine).join("\n");
    const footer = d.total > 20 ? `\n\n... and ${d.total - 20} more. Refine your search.` : "";
    return `Found ${d.total} DVARs matching '${query}':\n\n${output}${footer}`;
  },
});

// Maps a menu-hud topic alias to its key path within the JSON `sections` object.
const MENU_HUD_PATHS: Record<string, string[]> = {
  positioning: ["positioning"],
  properties: ["properties"],
  layering: ["layering"],
  setpoint: ["positioning", "setPoint"],
  fonts: ["properties", "text", "font"],
  font: ["properties", "text", "font"],
  sort: ["layering", "sort_system"],
  color: ["properties", "visual", "color"],
  colour: ["properties", "visual", "color"],
  alpha: ["properties", "visual", "alpha"],
  cleanup: ["layering", "cleanup"],
  destroy: ["layering", "cleanup"],
  foreground: ["properties", "visual", "foreground"],
};

const MENU_HUD_VALID_TOPICS = "positioning, properties, layering, setPoint, fonts, sort, color, alpha, foreground, cleanup, all";

/** Parse gsc-menu-hud.json and return its `sections` object, or an error message. */
function loadMenuHudSections(): { sections: Record<string, unknown> } | { error: string } {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(loadMenuHud()) as Record<string, unknown>;
  } catch {
    return { error: "Failed to parse gsc-menu-hud.json" };
  }
  if ("error" in data) return { error: String(data.error) };
  const sections = data.sections;
  if (!sections || typeof sections !== "object") {
    return { error: "gsc-menu-hud.json: missing or invalid 'sections' key." };
  }
  return { sections: sections as Record<string, unknown> };
}

/** Walk a key path through `sections`; returns the value, or undefined if absent. */
function resolvePath(sections: Record<string, unknown>, keys: string[]): unknown {
  let current: unknown = sections;
  for (const key of keys) {
    if (!isPlainObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

/** Fallback search: scan every section for a key matching the topic; null when nothing matches. */
function searchMenuTopic(sections: Record<string, unknown>, term: string): Record<string, unknown> | null {
  const results: Record<string, unknown> = {};
  for (const [sectionName, section] of Object.entries(sections)) {
    const found = findInSection(section as Record<string, unknown>, term);
    if (found !== null) results[sectionName] = found;
  }
  return Object.keys(results).length > 0 ? results : null;
}

const menuHud = command({
  name: "gsc_menu_hud",
  title: "GSC Menu HUD Reference",
  description:
    "Reference for building HUD-element script menus in CoD4/CoD4X and MW2/IW4X GSC. " +
    "Covers the positioning system (setPoint), all HUD element properties, " +
    "background/layering patterns, and CoD4 vs IW4X input differences. " +
    "Call this before writing any HUD menu code. " +
    "Topics: positioning, properties, layering, setPoint, fonts, sort, color, all.",
  input: {
    topic: z.string().describe(
      "Topic to look up. One of: 'positioning', 'properties', 'layering', " +
      "'setPoint', 'fonts', 'sort', 'color', 'all', or any property name."
    ),
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  run({ topic }): { reference: unknown | null } {
    const loaded = loadMenuHudSections();
    if ("error" in loaded) throw new CommandError(loaded.error);
    const { sections } = loaded;

    const t = topic.toLowerCase().trim();
    if (t === "all") return { reference: sections };
    const keys = MENU_HUD_PATHS[t];
    if (!keys) return { reference: searchMenuTopic(sections, t) };
    const val = resolvePath(sections, keys);
    if (val === undefined) throw new CommandError(`gsc-menu-hud.json: '${keys.join(".")}' not found.`);
    return { reference: val };
  },
  render(d, { topic }) {
    if (d.reference !== null) return JSON.stringify(d.reference, null, 2);
    return `No match found for topic '${topic}'.\n` +
      `Valid topics: ${MENU_HUD_VALID_TOPICS}.\n` +
      `Or use any property name (e.g. 'fontscale', 'glowAlpha').`;
  },
});

export const KNOWLEDGE_COMMANDS: AnyCommand[] = [dvarSearch, menuHud];

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

  registerCommands(server, KNOWLEDGE_COMMANDS);
}

/** A non-null, non-array object — i.e. a plain `{ ... }` record. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  return !Array.isArray(value);
}

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
    } else if (isPlainObject(value)) {
      const nested = findInSection(value, term);
      if (nested !== null) results[key] = nested;
    }
  }
  return Object.keys(results).length > 0 ? results : null;
}
