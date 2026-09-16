/**
 * @file knowledge/tools.ts
 * DVAR and GSC knowledge commands (dvar_search, gsc_menu_hud) and MCP resources.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { CommandError } from "../utils.js";
import { command, type AnyCommand } from "../command.js";
import { DVARS, GSC_BUILTINS, MENU_HUD, type Dvar } from "./data.js";

export type { Dvar } from "./data.js";

let dvarsText: string | null = null;
let builtinsText: string | null = null;

/** `dvars.json` as pretty-printed JSON text (the iw4x://dvars resource). */
export function loadDvars(): string {
  return (dvarsText ??= JSON.stringify(DVARS, null, 2));
}

/** `gsc-builtins.json` as JSON text (the iw4x://gsc-builtins resource). */
export function loadGscBuiltins(): string {
  return (builtinsText ??= JSON.stringify(GSC_BUILTINS));
}

/** `gsc-menu-hud.json` as JSON text. */
export function loadMenuHud(): string {
  return JSON.stringify(MENU_HUD);
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
    const cat = category?.toLowerCase();
    const matches = DVARS.dvars.filter(d => matchesDvar(d, query.toLowerCase(), cat));
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
    const { sections } = MENU_HUD;

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

/** Registers the DVAR and GSC built-in knowledge resources (MCP only; the CLI has no resources). */
export function registerKnowledgeResources(server: McpServer): void {

  // --- Resource: iw4x://dvars ---
  server.registerResource(
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
  server.registerResource(
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
