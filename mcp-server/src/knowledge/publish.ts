/**
 * @file knowledge/publish.ts
 * Files published next to the knowledge base for use without this toolkit:
 * JSON Schemas generated from ./schemas.ts and an llms.txt index. All counts come
 * from the data, so regenerating after a data change keeps them accurate.
 * Written by `npm run knowledge`; a test fails if the committed copies are out of date.
 */

import { z } from "zod";
import { ANTI_PATTERNS, DVARS, GSC_BUILTINS, MENU_HUD, TEMPLATES } from "./data.js";
import {
  AntiPatternsFileSchema, DvarsFileSchema, GscBuiltinsFileSchema, MenuHudFileSchema, TemplatesFileSchema,
} from "./schemas.js";

export const REPO_URL = "https://github.com/back1ply/iw4x-toolkit";
/** jsDelivr serves files from the public GitHub repo; replace @master with a release tag to pin a version. */
export const CDN_BASE = "https://cdn.jsdelivr.net/gh/back1ply/iw4x-toolkit@master/knowledge";

const n = (x: number) => x.toLocaleString("en-US");

export const KNOWLEDGE_FILES = [
  { file: "dvars.json", schema: DvarsFileSchema, summary: `${n(DVARS.dvars.length)} DVARs: name, type, default, flags, category, context, description, FPS impact` },
  { file: "gsc-builtins.json", schema: GscBuiltinsFileSchema, summary: `${n(GSC_BUILTINS.functions.length)} GSC built-in functions: signature, return type, category, description` },
  { file: "gsc-anti-patterns.json", schema: AntiPatternsFileSchema, summary: `${n(ANTI_PATTERNS.length)} common mistakes with the correct IW4 GSC equivalent` },
  { file: "templates.json", schema: TemplatesFileSchema, summary: `${n(Object.keys(TEMPLATES).length)} GSC code templates with {{placeholder}} variables` },
  { file: "gsc-menu-hud.json", schema: MenuHudFileSchema, summary: `HUD element reference for script menus (${Object.keys(MENU_HUD.sections).join(", ")})` },
] as const;

const schemaFileName = (file: string) => `schemas/${file.replace(/\.json$/, ".schema.json")}`;

function llmsTxt(): string {
  const lines = [
    "# iw4x-toolkit knowledge base",
    "",
    "> Reference data for modding Call of Duty: Modern Warfare 2 (2009) on the IW4X client: DVARs, GSC built-in functions, " +
      "GSC anti-patterns, code templates, and a HUD menu reference. JSON files, each with a JSON Schema.",
    "",
    `URLs track the master branch. To pin a version, replace \`@master\` with a release tag. Source and issues: ${REPO_URL}`,
    "",
    "## Data",
    "",
    ...KNOWLEDGE_FILES.map((k) => `- [${k.file}](${CDN_BASE}/${k.file}): ${k.summary}`),
    "",
    "## Schemas",
    "",
    ...KNOWLEDGE_FILES.map((k) => `- [${schemaFileName(k.file)}](${CDN_BASE}/${schemaFileName(k.file)}): JSON Schema for ${k.file}`),
    "",
    "## Optional",
    "",
    `- [iw4x-toolkit](${REPO_URL}): MCP server and CLI that search this data (dvar_search, gsc_lookup, gsc_anti_patterns, gsc_template, gsc_menu_hud)`,
  ];
  return lines.join("\n") + "\n";
}

/** Relative path under knowledge/ -> file content. */
export function knowledgeArtifacts(): Map<string, string> {
  const files = new Map<string, string>();
  for (const k of KNOWLEDGE_FILES) {
    const schema = { $id: `${CDN_BASE}/${schemaFileName(k.file)}`, ...z.toJSONSchema(k.schema) };
    files.set(schemaFileName(k.file), JSON.stringify(schema, null, 2) + "\n");
  }
  files.set("llms.txt", llmsTxt());
  return files;
}
