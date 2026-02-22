/**
 * @file gsc/linter.ts
 * GSC Static Analysis / Linter
 * 
 * Provides linting rules for GSC code quality:
 * - Syntax errors
 * - Undefined variables/functions
 * - Bad patterns (anti-patterns)
 * - Best practice warnings
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { tokenize, Token, TokenType, TokenizeResult } from "./tokenizer.js";

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
 * Load known builtins from knowledge base
 */
function loadKnownBuiltins(): Set<string> {
  const builtins = new Set<string>();
  
  // Core builtins that are always needed for tokenization
  const coreBuiltins = [
    "println", "print", "iprintln", "iprintlnbold", "print3d", "iprintlnln",
    "getcvar", "setcvar", "getcvarint", "getcvarlen",
    "getdvar", "setdvar", "getdvarint", "getdvarfloat", "getdvarvector",
    "getent", "getarray", "getfirstarraykey", "getnextarraykey",
    "alloc", "free", "spawn", "spawnstruct",
    "self", "level", "game", "player",
    "thread", "call", "notify", "endon", "wait", "waittill",
    "waittillmatch", "waittillframeend", "childthread",
    "tostring", "int", "float", "strtok", "tolower", "toupper",
    "isdefined", "isstring", "isarray", "isfunction",
    // Math
    "length", "vectordot", "vectorcross", "vectornormalize", "vectorscale",
    "anglestoforward", "anglestoright", "anglestoleft",
    "forward", "right", "up",
    "distance", "distance2d", "distanceSquared",
    "clamp", "lerp", "lerpvector",
    // Entity
    "getorigin", "setorigin", "getangles", "setangles",
    "getvelocity", "setvelocity", "getmodel", "setmodel",
    "getnumlinks", "getlinkname",
    // Arrays
    "array", "array_size", "sort", "random", "randomint", "randomfloat",
    // Common
    "bullettrace", "bullettracepassed", "sighttracepassed",
    "playfx", "playsound", "playrumbleonentity",
    "setText", "setvalue", "clearalltextafterhud",
  ];
  
  for (const b of coreBuiltins) {
    builtins.add(b);
  }
  
  // Load from knowledge base
  const filePath = resolveKnowledgePath("gsc-builtins.json");
  if (filePath) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw);
      if (data.functions && Array.isArray(data.functions)) {
        for (const func of data.functions) {
          if (func.name) {
            builtins.add(func.name);
          }
        }
      }
    } catch {
      // Fall back to core builtins only
    }
  }
  
  return builtins;
}

/**
 * Load known DVARs from knowledge base
 */
function loadKnownDvars(): Set<string> {
  const dvars = new Set<string>();
  
  // Core DVARs
  const coreDvars = [
    "ui_gametype", "g_gametype", "sv_fps", "sv_maxclients",
    "r_fog", "r_detail", "r_normalmap", "r_specularmap",
    "cg_fov", "cg_thirdperson", "cg_drawcrosshair", "cg_hud",
    "cl_paused", "snaps", "rate", "cl_maxpackets",
  ];
  
  for (const d of coreDvars) {
    dvars.add(d);
  }
  
  // Load from knowledge base
  const filePath = resolveKnowledgePath("dvars.json");
  if (filePath) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw);
      if (data.dvars && Array.isArray(data.dvars)) {
        for (const dvar of data.dvars) {
          if (dvar.name) {
            dvars.add(dvar.name.toLowerCase());
          }
        }
      }
    } catch {
      // Fall back to core DVARs only
    }
  }
  
  return dvars;
}

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

/**
 * GSC Linter
 */
export class GSCLinter {
  private tokens: Token[] = [];
  private errors: LintError[] = [];
  private variables: Set<string> = new Set();
  private functions: Set<string> = new Set();
  private definedFunctions: Map<string, number> = new Map(); // name -> line
  private source: string = "";

  /**
   * Lint GSC source code
   */
  lint(source: string): LintResult {
    this.source = source;
    this.errors = [];
    this.variables = new Set(["self", "level", "game", "player"]);
    this.functions = loadKnownBuiltins();
    this.definedFunctions = new Map();

    // Tokenize first
    const tokenizeResult: TokenizeResult = tokenize(source);
    
    // Add tokenizer errors
    for (const err of tokenizeResult.errors) {
      this.errors.push({
        type: "error",
        code: "TOK-001",
        message: err.message,
        line: err.line,
        column: err.column,
      });
    }

    this.tokens = tokenizeResult.tokens;

    // First pass: collect defined functions and variables
    this.collectDefinitions();

    // Second pass: check usage
    this.analyzeUsage();

    // Check for bad patterns
    this.checkBadPatterns();

    // Count lines
    const lines = source.split("\n").length;

    return {
      errors: this.errors,
      stats: {
        lines,
        tokens: this.tokens.length,
        errors: this.errors.filter(e => e.type === "error").length,
        warnings: this.errors.filter(e => e.type === "warning").length,
      },
    };
  }

  /**
   * First pass: collect function and variable definitions
   */
  private collectDefinitions(): void {
    let i = 0;
    while (i < this.tokens.length) {
      const token = this.tokens[i];

      // Look for function definitions: function name()
      if (token.type === TokenType.KEYWORD) {
        if (token.value === "function" || token.value === "funcdef") {
          // Next token should be identifier
          const next = this.tokens[i + 1];
          if (next && next.type === TokenType.IDENTIFIER) {
            this.functions.add(next.value);
            this.definedFunctions.set(next.value, next.line);
          }
        }
        
        // Variable declarations
        if (token.value === "var") {
          const next = this.tokens[i + 1];
          if (next && next.type === TokenType.IDENTIFIER) {
            this.variables.add(next.value);
          }
        }
      }

      // Check for #define macros
      if (token.type === TokenType.HASH && token.value === "define") {
        const next = this.tokens[i + 1];
        if (next && next.type === TokenType.IDENTIFIER) {
          this.variables.add(next.value);
        }
      }

      i++;
    }
  }

  /**
   * Second pass: analyze token usage
   */
  private analyzeUsage(): void {
    let i = 0;
    let inFunction = false;
    let braceDepth = 0;

    while (i < this.tokens.length) {
      const token = this.tokens[i];
      const prev = this.tokens[i - 1];
      const next = this.tokens[i + 1];

      // Track function scope
      if (token.type === TokenType.LEFT_BRACE) {
        braceDepth++;
      }
      if (token.type === TokenType.RIGHT_BRACE) {
        braceDepth--;
        if (braceDepth === 0) {
          inFunction = false;
        }
      }

      // Check identifier usage
      if (token.type === TokenType.IDENTIFIER) {
        // Skip after keywords or certain tokens
        if (prev && (prev.type === TokenType.KEYWORD || 
                     prev.type === TokenType.LEFT_PAREN ||
                     prev.type === TokenType.COMMA ||
                     prev.type === TokenType.COLON ||
                     prev.type === TokenType.EQUAL ||
                     prev.type === TokenType.LEFT_BRACKET)) {
          
          // Check if it's a known function being called
          if (next && next.type === TokenType.LEFT_PAREN) {
            // Function call
            if (!this.functions.has(token.value) && !this.definedFunctions.has(token.value)) {
              // Allow common patterns
              if (!this.isCommonFunctionCall(token.value)) {
                this.errors.push({
                  type: "warning",
                  code: "FUN-001",
                  message: `Undefined function: '${token.value}'`,
                  line: token.line,
                  column: token.column,
                  length: token.length,
                });
              }
            }
          } else {
            // Variable usage
            if (!this.variables.has(token.value) && 
                !this.isBuiltinProperty(token.value) &&
                !this.definedFunctions.has(token.value)) {
              // Only warn in function scope
              if (inFunction || braceDepth > 0) {
                this.errors.push({
                  type: "warning",
                  code: "VAR-001",
                  message: `Undefined variable: '${token.value}'`,
                  line: token.line,
                  column: token.column,
                  length: token.length,
                });
              }
            }
          }
        }

        // function keyword followed by name
        if (prev && prev.type === TokenType.KEYWORD && prev.value === "function") {
          inFunction = true;
          this.functions.add(token.value);
          this.definedFunctions.set(token.value, token.line);
        }
      }

      // Check for missing semicolons (basic check)
      if (token.type === TokenType.RIGHT_BRACE || token.type === TokenType.RIGHT_PAREN) {
        const nextNonWhitespace = this.findNextNonWhitespace(i + 1);
        if (nextNonWhitespace) {
          const nextToken = this.tokens[nextNonWhitespace];
          // If next statement could start a new expression
          if (nextToken && (
            nextToken.type === TokenType.IDENTIFIER ||
            nextToken.type === TokenType.KEYWORD
          )) {
            // Could be missing semicolon - but this is complex to check properly
            // For now, we'll skip this as it produces too many false positives
          }
        }
      }

      i++;
    }
  }

  /**
   * Check for bad patterns / anti-patterns
   */
  private checkBadPatterns(): void {
    const source = this.source;
    const lines = source.split("\n");
    const knownDvars = loadKnownDvars();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Pattern: nested wait loops without endon
      if (line.includes("wait(") && !line.includes("endon")) {
        // Check if we're in a loop without endon
        // This is a simplified check - real implementation would need scope tracking
      }

      // Pattern: isdefined() without using the result
      if (line.match(/isDefined\s*\(\s*\)/)) {
        this.errors.push({
          type: "warning",
          code: "PAT-001",
          message: "isDefined() called without checking the result",
          line: lineNum,
          column: 0,
          length: line.length,
        });
      }

      // Pattern: long lines
      if (line.length > 200) {
        this.errors.push({
          type: "info",
          code: "STY-001",
          message: `Line exceeds 200 characters (${line.length})`,
          line: lineNum,
          column: 0,
          length: line.length,
        });
      }

      // Pattern: hardcoded strings that could be DVARs
      if (line.includes('"') && line.match(/"[^"]*[A-Z_]{4,}[^"]*"/)) {
        // Check for ALL_CAPS strings (likely config values that should be DVARs)
        const match = line.match(/"[A-Z_]+"/g);
        if (match) {
          for (const m of match) {
            const varName = m.replace(/"/g, "");
            if (!knownDvars.has(varName.toLowerCase())) {
              this.errors.push({
                type: "info",
                code: "STY-002",
                message: `Consider using a DVAR instead of hardcoded '${m}'`,
                line: lineNum,
                column: line.indexOf(m),
                length: m.length,
              });
            }
          }
        }
      }

      // Pattern: suspicious self usage
      if (line.match(/self\s*=\s*[^;]+;?\s*$/)) {
        // This is usually fine, skip
      }

      // Pattern: direct entity access without check
      if (line.includes(".") && !line.includes("isdefined") && !line.includes("isDefined")) {
        // Could be accessing a property on potentially undefined entity
        // This is a heuristic - might have false positives
      }
    }

    // Check for unreachable code after return/break/continue
    this.checkUnreachableCode();
  }

  /**
   * Check for unreachable code after return/break/continue
   */
  private checkUnreachableCode(): void {
    const lines = this.source.split("\n");
    let foundReturn = false;
    let returnLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      if (foundReturn) {
        // Skip empty lines and braces
        if (line === "" || line === "}" || line === "{") {
          continue;
        }
        
        // Found code after return
        if (!line.startsWith("//")) {
          this.errors.push({
            type: "warning",
            code: "FLOW-001",
            message: `Unreachable code after return statement (line ${returnLine})`,
            line: lineNum,
            column: 0,
            length: line.length,
          });
          foundReturn = false; // Only report once
        }
      }

      if (line.startsWith("return") || line.startsWith("break") || line.startsWith("continue")) {
        foundReturn = true;
        returnLine = lineNum;
      } else {
        foundReturn = false;
      }
    }
  }

  /**
   * Find next non-whitespace token index
   */
  private findNextNonWhitespace(start: number): number | null {
    for (let i = start; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      if (token.type !== TokenType.NEWLINE && token.value.trim() !== "") {
        return i;
      }
    }
    return null;
  }

  /**
   * Check if function is commonly used (allowlist)
   */
  private isCommonFunctionCall(name: string): boolean {
    // Allow any function that looks like it's from the game or maps
    if (name.includes("\\") || name.includes("/")) {
      return true;
    }
    // Allow methods on self
    if (name.includes(".")) {
      return true;
    }
    // Allow common patterns
    const common = [
      "main", "init", "spawn", "think", "update", "damage", "death",
      "connect", "disconnect", "spawned", "playing", "onplayerconnect",
      "onplayerspawn", "onplayerdeath", "onteamchange",
    ];
    return common.includes(name.toLowerCase());
  }

  /**
   * Check if identifier is a built-in property access
   */
  private isBuiltinProperty(name: string): boolean {
    const props = [
      "origin", "angles", "velocity", "model", "classname", "targetname",
      "script_noteworthy", "script_team", "script_gameobjectname",
      "u", "v", "forward", "right", "up",
    ];
    return props.includes(name.toLowerCase());
  }
}

/**
 * Convenience function to lint GSC source
 */
export function lint(source: string): LintResult {
  const linter = new GSCLinter();
  return linter.lint(source);
}
