/**
 * @file knowledge/data.ts
 * The knowledge base (repo-root `knowledge/*.json`), imported once so every build
 * embeds it: the node bundle, the Bun-compiled binary, and tests all read the same data.
 * Editing a JSON file takes effect on the next build, like any source change.
 */

import dvarsJson from "../../../knowledge/dvars.json" with { type: "json" };
import builtinsJson from "../../../knowledge/gsc-builtins.json" with { type: "json" };
import antiPatternsJson from "../../../knowledge/gsc-anti-patterns.json" with { type: "json" };
import menuHudJson from "../../../knowledge/gsc-menu-hud.json" with { type: "json" };
import templatesJson from "../../../knowledge/templates.json" with { type: "json" };

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

/** GSC builtin function metadata. */
export interface GscBuiltin {
  name: string;
  description?: string;
  category?: string;
  parameters?: { name: string; type: string; optional?: boolean }[];
  returnType?: string;
  engines?: string[];
}

/** GSC code template. */
export interface GscTemplate {
  code: string;
  description?: string;
  category?: string;
  variables?: Record<string, string>;
}

/** IW4 GSC anti-pattern entry. */
export interface AntiPattern {
  id: string;
  category: string;
  title: string;
  wrong: string;
  right: string;
  explanation: string;
}

export const DVARS = dvarsJson as unknown as { dvars: Dvar[] };
export const GSC_BUILTINS = builtinsJson as unknown as { functions: GscBuiltin[] };
export const ANTI_PATTERNS = (antiPatternsJson as unknown as { patterns: AntiPattern[] }).patterns;
export const MENU_HUD = menuHudJson as unknown as { sections: Record<string, unknown> };
export const TEMPLATES = templatesJson as unknown as Record<string, GscTemplate>;
