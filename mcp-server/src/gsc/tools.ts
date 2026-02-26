/**
 * @file gsc/tools.ts
 * Registers GSC tooling on the MCP server.
 * - gsc_lint: Lint GSC code for errors and warnings
 * - gsc_lookup: Search GSC built-in functions
 * - gsc_template: Generate code from templates
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { lint, fix, LintResult, LintError, LintOptions } from "./linter.js";
import { outline, formatOutline } from "./outline.js";
import { getKnowledgeDir } from "../utils.js";
import { buildIndex, getStats } from "./symbols.js";

/**
 * GSC builtin function metadata
 */
interface GscBuiltin {
  name: string;
  description?: string;
  category?: string;
  parameters?: { name: string; type: string; optional?: boolean }[];
  returnType?: string;
  engines?: string[];
}

/**
 * GSC template metadata
 */
interface GscTemplate {
  code: string;
  description?: string;
  category?: string;
  variables?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Module-level caches for knowledge base data
// ---------------------------------------------------------------------------

let gscBuiltinsCache: Map<string, GscBuiltin> | null = null;
let templatesCache: Record<string, GscTemplate> | null = null;

/**
 * IW4 GSC anti-pattern entry
 */
interface AntiPattern {
  id: string;
  category: string;
  title: string;
  wrong: string;
  right: string;
  explanation: string;
}

let antiPatternsCache: AntiPattern[] | null = null;

function loadAntiPatterns(): AntiPattern[] {
  if (antiPatternsCache) return antiPatternsCache;

  const filePath = getKnowledgeDir("gsc-anti-patterns.json");
  if (!filePath) {
    antiPatternsCache = [];
    return antiPatternsCache;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    antiPatternsCache = data.patterns ?? [];
    return antiPatternsCache!;
  } catch {
    antiPatternsCache = [];
    return antiPatternsCache;
  }
}

/**
 * Load GSC builtins from knowledge base (cached after first load)
 */
function loadGscBuiltins(): Map<string, GscBuiltin> {
  if (gscBuiltinsCache) return gscBuiltinsCache;

  const filePath = getKnowledgeDir("gsc-builtins.json");
  if (!filePath) {
    gscBuiltinsCache = new Map();
    return gscBuiltinsCache;
  }
  
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    const funcs = new Map<string, GscBuiltin>();
    
    if (data.functions) {
      for (const func of data.functions) {
        funcs.set(func.name, func);
      }
    }
    gscBuiltinsCache = funcs;
    return gscBuiltinsCache;
  } catch {
    gscBuiltinsCache = new Map();
    return gscBuiltinsCache;
  }
}

/**
 * Load templates from knowledge base (cached after first load)
 */
function loadTemplates(): Record<string, GscTemplate> {
  if (templatesCache) return templatesCache;

  const filePath = getKnowledgeDir("templates.json");
  if (!filePath) {
    templatesCache = {};
    return templatesCache;
  }
  
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    templatesCache = JSON.parse(raw);
    return templatesCache!;
  } catch {
    templatesCache = {};
    return templatesCache;
  }
}

/**
 * Format lint errors for output
 */
function formatLintResult(result: LintResult): string {
  if (result.errors.length === 0) {
    return `✅ No issues found!\n\n` +
      `Stats: ${result.stats.lines} lines, ${result.stats.tokens} tokens`;
  }

  const errors = result.errors.filter(e => e.type === "error");
  const warnings = result.errors.filter(e => e.type === "warning");
  const infos = result.errors.filter(e => e.type === "info");

  let output = `📊 Results: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} suggestions\n\n`;

  if (errors.length > 0) {
    output += `❌ **Errors:**\n`;
    for (const err of errors) {
      output += `  Line ${err.line}: ${err.message}\n`;
    }
    output += "\n";
  }

  if (warnings.length > 0) {
    output += `⚠️  **Warnings:**\n`;
    for (const err of warnings) {
      output += `  Line ${err.line}: ${err.message}\n`;
    }
    output += "\n";
  }

  if (infos.length > 0) {
    output += `💡 **Suggestions:**\n`;
    for (const err of infos) {
      output += `  Line ${err.line}: ${err.message}\n`;
    }
  }

  output += `\n---\nStats: ${result.stats.lines} lines, ${result.stats.tokens} tokens`;

  return output;
}

/**
 * Register GSC tools on the MCP server
 */
export function registerGscTools(server: McpServer): void {
  // --- Tool: gsc_lint ---
  server.registerTool(
    "gsc_lint",
    {
      title: "Lint GSC Code",
      description:
        "Lints GSC (Game Script) code for syntax errors, undefined variables, " +
        "bad patterns, and best practice violations. " +
        "Use this to validate GSC scripts before testing in-game. " +
        "Supports vibe coding: the LLM should run this after writing/modifying .gsc files.",
      inputSchema: {
        path: z.string().optional().describe(
          "Path to .gsc file to lint. Either this or content must be provided."
        ),
        content: z.string().optional().describe(
          "GSC source code to lint directly. Either this or path must be provided."
        ),
        check_undefined: z.boolean().optional().default(true).describe(
          "Check for undefined variables and functions"
        ),
        check_patterns: z.boolean().optional().default(true).describe(
          "Check for bad patterns and anti-patterns"
        ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ path: filePath, content, check_undefined, check_patterns }) => {
      let source: string;

      if (filePath) {
        // Read from file
        const resolved = path.resolve(filePath);
        if (!fs.existsSync(resolved)) {
          return {
            content: [{
              type: "text",
              text: `❌ File not found: ${resolved}`
            }]
          };
        }
        
        // Check it's a GSC file
        if (!resolved.toLowerCase().endsWith(".gsc") && !resolved.toLowerCase().endsWith(".gsh")) {
          return {
            content: [{
              type: "text",
              text: `⚠️ Warning: File doesn't appear to be a GSC file (.gsc or .gsh)`
            }]
          };
        }

        try {
          source = fs.readFileSync(resolved, "utf-8");
        } catch (e) {
          return {
            content: [{
              type: "text",
              text: `❌ Error reading file: ${e}`
            }]
          };
        }
      } else if (content) {
        source = content;
      } else {
        return {
          content: [{
            type: "text",
            text: "❌ Either path or content must be provided"
          }]
        };
      }

      // Run linter with options
      const lintOptions: LintOptions = {
        checkUndefined: check_undefined,
        checkPatterns: check_patterns,
      };
      const result = await lint(source, lintOptions);
      const formatted = formatLintResult(result);

      return {
        content: [{
          type: "text",
          text: formatted
        }]
      };
    }
  );

  // --- Tool: gsc_lookup ---
  server.registerTool(
    "gsc_lookup",
    {
      title: "GSC Function Lookup",
      description:
        "Search the GSC built-in function reference. " +
        "Use this to find correct function signatures and descriptions. " +
        "Helps prevent hallucinated function names in vibe coding.",
      inputSchema: {
        query: z.string().describe("Search term (function name or keyword)"),
        category: z.string().optional().describe("Optional category filter"),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ query, category }) => {
      const builtins = loadGscBuiltins();
      const q = query.toLowerCase();
      const cat = category?.toLowerCase();

      const matches: GscBuiltin[] = [];

      for (const [name, func] of builtins) {
        const nameMatch = name.toLowerCase().includes(q);
        const descMatch = func.description?.toLowerCase().includes(q) ?? false;
        const catMatch = cat ? func.category?.toLowerCase() === cat : true;

        if ((nameMatch || descMatch) && catMatch) {
          matches.push(func);
        }
      }

      if (matches.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No functions found matching '${query}'${cat ? ` in category '${cat}'` : ""}`
          }]
        };
      }

      const limited = matches.slice(0, 20);
      let output = `Found ${matches.length} functions:\n\n`;

      for (const func of limited) {
        output += `**${func.name}**`;
        if (func.category) output += ` [${func.category}]`;
        output += "\n";
        if (func.description) output += `  ${func.description}\n`;
        if (func.parameters) output += `  Params: ${func.parameters.map(p => `${p.name}: ${p.type}${p.optional ? "?" : ""}`).join(", ")}\n`;
        if (func.returnType) output += `  Returns: ${func.returnType}\n`;
        output += "\n";
      }

      if (matches.length > 20) {
        output += `\n...and ${matches.length - 20} more.`;
      }

      return {
        content: [{
          type: "text",
          text: output
        }]
      };
    }
  );

  // --- Tool: gsc_template ---
  server.registerTool(
    "gsc_template",
    {
      title: "Generate GSC from Template",
      description:
        "Generate GSC code from common templates. " +
        "Use this to quickly scaffold common patterns like callbacks, " +
        "gametypes, menus, etc. Reduces boilerplate errors.",
      inputSchema: {
        template: z.string().optional().describe(
          "Template name (e.g., 'player_connect', 'killstreak'). " +
          "Not required if list=true"
        ),
        variables: z.record(z.string()).optional().describe(
          "Variables to substitute in template (e.g., {player: 'self'})"
        ),
        list: z.boolean().optional().default(false).describe(
          "If true, list available templates instead of generating"
        ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ template, variables, list }) => {
      const templates = loadTemplates();

      if (list || !template) {
        // List all templates
        const names = Object.keys(templates);
        if (names.length === 0) {
          return {
            content: [{
              type: "text",
              text: "No templates available. Templates should be defined in knowledge/templates.json"
            }]
          };
        }

        let output = "Available templates:\n\n";
        for (const name of names) {
          const t = templates[name];
          output += `**${name}**\n`;
          if (t.description) output += `  ${t.description}\n`;
          if (t.category) output += `  Category: ${t.category}\n`;
          output += "\n";
        }

        return {
          content: [{
            type: "text",
            text: output
          }]
        };
      }

      // Generate from template
      const t = templates[template];
      if (!t) {
        return {
          content: [{
            type: "text",
            text: `Template '${template}' not found. Use list=true to see available templates.`
          }]
        };
      }

      let code = t.code || "";

      // Substitute variables with proper escaping
      if (variables) {
        for (const [key, value] of Object.entries(variables)) {
          // Escape regex special characters in the key
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          code = code.replace(new RegExp(`{{${escapedKey}}}`, 'g'), value);
        }
      }

      return {
        content: [{
          type: "text",
          text: `Generated from '${template}':\n\n\`\`\`gsc\n${code}\n\`\`\``
        }]
      };
    }
  );

  // --- Tool: gsc_fix ---
  server.registerTool(
    "gsc_fix",
    {
      title: "Auto-fix GSC Syntax Errors",
      description:
        "Attempts to auto-fix common GSC syntax errors: unmatched braces, " +
        "unterminated strings, and missing closing brackets. " +
        "Returns the fixed code and a list of changes made. " +
        "Use after gsc_lint reports fixable errors. " +
        "Set write_back=true to write the fix directly to a file path.",
      inputSchema: {
        path: z.string().optional().describe(
          "Path to .gsc file to fix. Either this or content must be provided."
        ),
        content: z.string().optional().describe(
          "GSC source code to fix directly. Either this or path must be provided."
        ),
        write_back: z.boolean().optional().default(false).describe(
          "If true and path is provided, write the fixed code back to the file."
        ),
      },
    },
    async ({ path: filePath, content, write_back }) => {
      let source: string;

      if (filePath) {
        const resolved = path.resolve(filePath);
        if (!fs.existsSync(resolved)) {
          return {
            content: [{ type: "text", text: `❌ File not found: ${resolved}` }]
          };
        }
        try {
          source = fs.readFileSync(resolved, "utf-8");
        } catch (e) {
          return {
            content: [{ type: "text", text: `❌ Error reading file: ${e}` }]
          };
        }
      } else if (content) {
        source = content;
      } else {
        return {
          content: [{ type: "text", text: "❌ Either path or content must be provided" }]
        };
      }

      const result = fix(source);

      let output: string;
      if (!result.fixed) {
        output = "ℹ️  No auto-fixable issues found.\n\n" +
          "Run gsc_lint for a full diagnostic report.";
      } else {
        output = `✅ Fixed ${result.fixesApplied.length} issue(s):\n`;
        for (const change of result.fixesApplied) {
          output += `  • ${change}\n`;
        }
        output += `\n**Fixed code:**\n\`\`\`gsc\n${result.fixedCode}\n\`\`\``;

        if (write_back && filePath) {
          try {
            fs.writeFileSync(path.resolve(filePath), result.fixedCode, "utf-8");
            output += `\n\n✍️  Written back to: ${filePath}`;
          } catch (e) {
            output += `\n\n❌ Write failed: ${e}`;
          }
        }
      }

      return { content: [{ type: "text", text: output }] };
    }
  );

  // --- Tool: gsc_outline ---
  server.registerTool(
    "gsc_outline",
    {
      title: "GSC File Outline",
      description:
        "Parses a GSC file and returns its structural skeleton: " +
        "function definitions (name, params, line), #include directives, " +
        "thread calls, event listeners (waittill/notify/endon), " +
        "and shared-state property assignments (level.x, self.x, game.x). " +
        "Use this BEFORE editing a GSC file to understand its structure " +
        "and avoid accidentally deleting functions or breaking event chains.",
      inputSchema: {
        path: z.string().optional().describe(
          "Path to .gsc file to outline. Either this or content must be provided."
        ),
        content: z.string().optional().describe(
          "GSC source code to outline directly. Either this or path must be provided."
        ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ path: filePath, content }) => {
      let source: string;

      if (filePath) {
        const resolved = path.resolve(filePath);
        if (!fs.existsSync(resolved)) {
          return {
            content: [{ type: "text", text: `❌ File not found: ${resolved}` }]
          };
        }
        try {
          source = fs.readFileSync(resolved, "utf-8");
        } catch (e) {
          return {
            content: [{ type: "text", text: `❌ Error reading file: ${e}` }]
          };
        }
      } else if (content) {
        source = content;
      } else {
        return {
          content: [{ type: "text", text: "❌ Either path or content must be provided" }]
        };
      }

      const result = outline(source);
      const formatted = formatOutline(result, source);

      return { content: [{ type: "text", text: formatted }] };
    }
  );

  // --- Tool: gsc_anti_patterns ---
  server.registerTool(
    "gsc_anti_patterns",
    {
      title: "GSC Anti-Patterns Reference",
      description:
        "Search IW4 GSC anti-patterns: common mistakes from JS/BO3/modern languages " +
        "with correct IW4 equivalents. " +
        "Call this BEFORE writing code to check how to do something correctly in IW4. " +
        "Returns wrong\u2192right pairs with explanations. " +
        "Examples: query='push' for array append, query='null' for null checks, " +
        "query='object' for struct creation, list=true to see all categories.",
      inputSchema: {
        query: z.string().optional().describe(
          "Search term (e.g. 'push', 'null', 'object', 'loop', 'event'). Not required if list=true."
        ),
        category: z.string().optional().describe(
          "Filter by category: syntax, arrays, objects, types, loops, events, entities"
        ),
        list: z.boolean().optional().default(false).describe(
          "If true, list all categories with entry counts instead of searching"
        ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ query, category, list }) => {
      const patterns = loadAntiPatterns();

      if (list || (!query && !category)) {
        const counts: Record<string, number> = {};
        for (const p of patterns) {
          counts[p.category] = (counts[p.category] ?? 0) + 1;
        }
        if (Object.keys(counts).length === 0) {
          return {
            content: [{ type: "text", text: "No anti-patterns loaded. Check knowledge/gsc-anti-patterns.json." }]
          };
        }
        let out = `\uD83D\uDCDA Anti-pattern categories (${patterns.length} total):\n\n`;
        for (const [cat, count] of Object.entries(counts).sort()) {
          out += `  **${cat}** \u2014 ${count} entries\n`;
        }
        out += "\nUse query='<term>' to search, or category='<name>' to filter.";
        return { content: [{ type: "text", text: out }] };
      }

      const q = query?.toLowerCase() ?? "";
      const cat = category?.toLowerCase();

      const matches = patterns.filter(p => {
        const inCat = cat ? p.category === cat : true;
        const inSearch = q
          ? p.title.toLowerCase().includes(q) ||
            p.wrong.toLowerCase().includes(q) ||
            p.right.toLowerCase().includes(q) ||
            p.explanation.toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q)
          : true;
        return inCat && inSearch;
      });

      if (matches.length === 0) {
        return {
          content: [{ type: "text", text: `No patterns found for '${query}'${cat ? ` in category '${cat}'` : ""}.\nUse list=true to see all categories.` }]
        };
      }

      let out = `Found ${matches.length} pattern(s):\n\n`;
      for (const p of matches.slice(0, 10)) {
        out += `### ${p.id}: ${p.title} [${p.category}]\n\n`;
        out += `**Wrong:**\n\`\`\`gsc\n${p.wrong}\n\`\`\`\n\n`;
        out += `**Right:**\n\`\`\`gsc\n${p.right}\n\`\`\`\n\n`;
        out += `**Why:** ${p.explanation}\n\n---\n\n`;
      }
      if (matches.length > 10) {
        out += `...and ${matches.length - 10} more. Narrow your query.`;
      }

      return { content: [{ type: "text", text: out }] };
    }
  );

  // --- Tool: iwd_index_symbols ---
  server.registerTool(
    "iwd_index_symbols",
    {
      title: "Index GSC Symbols from IWD Archives",
      description:
        "Scans one or more IWD archives and indexes every GSC function definition " +
        "into an in-memory symbol registry. " +
        "Run this once before gsc_find_orphans to enable cross-archive symbol resolution. " +
        "Accepts .iwd file paths or directories containing .iwd files. " +
        "The index persists for the duration of the MCP server session.",
      inputSchema: {
        paths: z.array(z.string()).describe(
          "Paths to .iwd files or directories containing .iwd files to index"
        ),
        clear: z.boolean().optional().default(false).describe(
          "If true, clear the existing index before scanning (default: false — adds to existing)"
        ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: false,
      },
    },
    async ({ paths, clear }) => {
      // Expand directories to .iwd files
      const iwdPaths: string[] = [];
      for (const p of paths) {
        const resolved = path.resolve(p);
        if (!fs.existsSync(resolved)) {
          continue;
        }
        let stat: fs.Stats;
        try {
          stat = fs.statSync(resolved);
        } catch {
          continue; // unreadable path — skip silently
        }
        if (stat.isDirectory()) {
          let dirEntries: string[];
          try {
            dirEntries = fs.readdirSync(resolved);
          } catch {
            continue; // unreadable directory — skip silently
          }
          for (const entry of dirEntries) {
            if (entry.toLowerCase().endsWith(".iwd")) {
              iwdPaths.push(path.join(resolved, entry));
            }
          }
        } else if (resolved.toLowerCase().endsWith(".iwd")) {
          iwdPaths.push(resolved);
        }
      }

      const prevStats = getStats();
      const result = buildIndex(iwdPaths, clear);

      // Format output
      let out = `Indexed ${result.stats.symbols} symbols across ${result.stats.files} files in ${result.stats.archives} archive(s)`;
      if (result.perArchive.length === 0) {
        out += ".\nNo valid .iwd archives found in provided paths.";
      } else {
        out += ":\n";
        for (const a of result.perArchive) {
          const name = path.basename(a.archive);
          out += `  ${name.padEnd(40)} — ${a.symbols} symbols (${a.files} files)\n`;
        }
      }

      if (result.stats.symbols === 0) {
        out += "\nTip: verify the paths contain .iwd files with .gsc entries.";
      }

      if (clear || prevStats.symbols > 0) {
        out += `\nReplaced previous index (was ${prevStats.symbols} symbols).`;
      }

      return { content: [{ type: "text", text: out }] };
    }
  );
}
