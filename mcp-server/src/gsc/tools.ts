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
import { lint, LintResult, LintError } from "./linter.js";

/**
 * Resolve path to knowledge files
 */
function resolveKnowledgePath(filename: string): string | null {
  const __dirname = path.dirname(path.dirname(new URL(import.meta.url).pathname));
  const candidates = [
    path.resolve(__dirname, "..", "..", "knowledge", filename),
    path.resolve(__dirname, "..", "knowledge", filename),
    path.resolve(__dirname, "..", "..", "..", "knowledge", filename),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Load GSC builtins from knowledge base
 */
function loadGscBuiltins(): Map<string, any> {
  const filePath = resolveKnowledgePath("gsc-builtins.json");
  if (!filePath) return new Map();
  
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    const funcs = new Map();
    
    if (data.functions) {
      for (const func of data.functions) {
        funcs.set(func.name, func);
      }
    }
    return funcs;
  } catch {
    return new Map();
  }
}

/**
 * Load templates from knowledge base
 */
function loadTemplates(): Record<string, any> {
  const filePath = resolveKnowledgePath("templates.json");
  if (!filePath) return {};
  
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
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

      // Run linter
      const result = lint(source);
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

      const matches: any[] = [];

      for (const [name, func] of builtins) {
        const nameMatch = name.toLowerCase().includes(q);
        const descMatch = func.description?.toLowerCase().includes(q) ?? false;
        const catMatch = cat ? func.category?.toLowerCase() === cat : true;

        if ((nameMatch || descMatch) && catMatch) {
          matches.push({ name, ...func });
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
        if (func.parameters) output += `  Params: ${func.parameters}\n`;
        if (func.returns) output += `  Returns: ${func.returns}\n`;
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
        template: z.string().describe("Template name (e.g., 'player_connect', 'killstreak')"),
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
}
