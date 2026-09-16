/**
 * @file gsc/linter.ts
 * GSC Static Analysis / Linter — orchestration entry point.
 *
 * The actual rules live in focused modules:
 *  - builtins.ts  : known builtins / DVARs
 *  - analyzer.ts  : token-stream passes (definitions, usage, flow, collisions)
 *  - patterns.ts  : line-based anti-pattern + style rules
 *  - fixer.ts     : best-effort auto-fixer
 */

import { tokenize } from "./tokenizer.js";
import { getKnownBuiltins } from "./builtins.js";
import {
  DefinitionScope,
  collectDefinitions,
  analyzeUsage,
  checkUnreachableCode,
  checkCaseCollisions,
} from "./analyzer.js";
import { checkLinePatterns } from "./patterns.js";
import { outline } from "./outline.js";

export interface LintError {
  type: "error" | "warning" | "info";
  code: string;
  message: string;
  line: number;
  column: number;
  length?: number;
}

export interface LintResult {
  errors: LintError[];
  stats: {
    lines: number;
    tokens: number;
    errors: number;
    warnings: number;
  };
}

/** Options for configuring linter behavior */
export interface LintOptions {
  /** Check for undefined variables and functions (default: true) */
  checkUndefined?: boolean;
  /** Check for bad patterns and anti-patterns (default: true) */
  checkPatterns?: boolean;
}

/**
 * GSC Linter. Composes the analysis passes into a single result.
 */
export class GSCLinter {
  /** Lint GSC source code. */
  async lint(source: string, options?: LintOptions): Promise<LintResult> {
    const opts = options ?? {};
    const errors: LintError[] = [];
    const scope: DefinitionScope = {
      functions: new Set(await getKnownBuiltins()), // copy: definitions below must not leak into the shared cache
      definedFunctions: new Map(),
      variables: new Set(["self", "level", "game", "player"]),
    };

    const { tokens, errors: tokenErrors } = tokenize(source);
    for (const err of tokenErrors) {
      errors.push({ type: "error", code: err.code ?? "TOK-001", message: err.message, line: err.line, column: err.column });
    }

    collectDefinitions(tokens, scope);
    // IW4 defines functions as `name(params) { }` with no keyword; outline() parses that form.
    for (const fn of outline(source).functions) {
      scope.functions.add(fn.name.toLowerCase());
      scope.definedFunctions.set(fn.name, fn.line);
    }
    errors.push(...checkCaseCollisions(source));

    if (opts.checkUndefined !== false) {
      errors.push(...analyzeUsage(tokens, scope));
    }
    if (opts.checkPatterns !== false) {
      errors.push(...await checkLinePatterns(source));
      errors.push(...checkUnreachableCode(tokens));
    }

    return { errors, stats: buildStats(source, tokens.length, errors) };
  }
}

function buildStats(source: string, tokenCount: number, errors: LintError[]): LintResult["stats"] {
  return {
    lines: source.split("\n").length,
    tokens: tokenCount,
    errors: errors.filter(e => e.type === "error").length,
    warnings: errors.filter(e => e.type === "warning").length,
  };
}

/** Convenience function to lint GSC source. */
export async function lint(source: string, options?: LintOptions): Promise<LintResult> {
  return new GSCLinter().lint(source, options);
}

// Re-export the public auto-fix and knowledge-base API so existing importers
// (e.g. gsc/tools.ts) keep working unchanged.
export { fix } from "./fixer.js";
export type { FixResult } from "./fixer.js";
export { getKnownBuiltins, getKnownDvars } from "./builtins.js";
