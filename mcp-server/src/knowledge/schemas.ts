/**
 * @file knowledge/schemas.ts
 * Zod schemas for the knowledge base files. They type the embedded data, validate it in
 * tests, and generate the published JSON Schemas (knowledge/schemas/*.schema.json).
 */

import { z } from "zod";

export const DvarSchema = z.object({
  name: z.string(),
  type: z.enum(["bool", "float", "int", "string"]),
  default: z.string(),
  flags: z.array(z.string()).describe("e.g. CHEAT: needs sv_cheats 1"),
  category: z.string(),
  subcategory: z.string(),
  context: z.enum(["client", "network", "server", "shared", "unknown"]),
  description: z.string(),
  fps_impact: z.enum(["high", "medium", "low", "none"]).nullable().describe("null when not rated"),
});

export const DvarsFileSchema = z.object({
  version: z.string(),
  game: z.string(),
  source: z.string(),
  total: z.number().int(),
  dvars: z.array(DvarSchema),
}).describe("MW2 / IW4X console variables (DVARs)");

export const GscBuiltinSchema = z.object({
  name: z.string(),
  category: z.string(),
  description: z.string(),
  returnType: z.string(),
  // Hand-curated entries
  parameters: z.array(z.object({ name: z.string(), type: z.string(), optional: z.boolean().optional() })).optional(),
  engines: z.array(z.string()).optional(),
  // Entries imported from Muhlex/gsc-doc
  params: z.array(z.object({ name: z.string(), types: z.array(z.string()), optional: z.boolean(), description: z.string() })).optional(),
  calledOn: z.string().nullable().optional().describe("Entity the function is called on (e.g. player); null for global functions"),
  scopes: z.array(z.string()).optional().describe("e.g. iw4|mp, iw4|sp, iw4|sp-mp"),
  example: z.string().optional(),
}).describe("Hand-curated entries use parameters/engines; entries from Muhlex/gsc-doc use params/calledOn/scopes/example");

export const GscBuiltinsFileSchema = z.object({
  version: z.string(),
  meta: z.object({ description: z.string(), totalFunctions: z.number().int() }),
  functions: z.array(GscBuiltinSchema),
}).describe("IW4 / IW4X GSC built-in functions");

export const AntiPatternSchema = z.object({
  id: z.string(),
  category: z.string(),
  title: z.string(),
  wrong: z.string(),
  right: z.string(),
  explanation: z.string(),
});

export const AntiPatternsFileSchema = z.object({
  version: z.string(),
  patterns: z.array(AntiPatternSchema),
}).describe("Mistakes from JS/BO3/modern languages with the correct IW4 GSC equivalent");

export const GscTemplateSchema = z.object({
  code: z.string().describe("GSC source; {{name}} placeholders are replaced by variables"),
  description: z.string(),
  category: z.string(),
  variables: z.record(z.string(), z.string()).optional().describe("Placeholder name -> meaning"),
});

export const TemplatesFileSchema = z.record(z.string(), GscTemplateSchema).describe("GSC code templates keyed by name");

export const MenuHudFileSchema = z.object({
  version: z.string(),
  meta: z.object({ description: z.string(), games: z.array(z.string()) }),
  sections: z.record(z.string(), z.unknown()).describe("positioning, properties, layering reference sections"),
}).describe("HUD element reference for script menus in CoD4/CoD4X and MW2/IW4X");

export type Dvar = z.infer<typeof DvarSchema>;
export type GscBuiltin = z.infer<typeof GscBuiltinSchema>;
export type AntiPattern = z.infer<typeof AntiPatternSchema>;
export type GscTemplate = z.infer<typeof GscTemplateSchema>;
