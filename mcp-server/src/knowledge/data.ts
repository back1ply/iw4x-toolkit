/**
 * @file knowledge/data.ts
 * The knowledge base (repo-root `knowledge/*.json`), imported once so every build
 * embeds it: the node bundle, the Bun-compiled binary, and tests all read the same data.
 * Editing a JSON file takes effect on the next build, like any source change.
 * Shapes are defined (and validated in tests) by ./schemas.ts.
 */

import type { z } from "zod";
import dvarsJson from "../../../knowledge/dvars.json" with { type: "json" };
import builtinsJson from "../../../knowledge/gsc-builtins.json" with { type: "json" };
import antiPatternsJson from "../../../knowledge/gsc-anti-patterns.json" with { type: "json" };
import menuHudJson from "../../../knowledge/gsc-menu-hud.json" with { type: "json" };
import templatesJson from "../../../knowledge/templates.json" with { type: "json" };
import type {
  AntiPatternsFileSchema, DvarsFileSchema, GscBuiltinsFileSchema, MenuHudFileSchema, TemplatesFileSchema,
} from "./schemas.js";

export type { AntiPattern, Dvar, GscBuiltin, GscTemplate } from "./schemas.js";

export const DVARS = dvarsJson as unknown as z.infer<typeof DvarsFileSchema>;
export const GSC_BUILTINS = builtinsJson as unknown as z.infer<typeof GscBuiltinsFileSchema>;
export const ANTI_PATTERNS = (antiPatternsJson as unknown as z.infer<typeof AntiPatternsFileSchema>).patterns;
export const MENU_HUD = menuHudJson as unknown as z.infer<typeof MenuHudFileSchema>;
export const TEMPLATES = templatesJson as unknown as z.infer<typeof TemplatesFileSchema>;
