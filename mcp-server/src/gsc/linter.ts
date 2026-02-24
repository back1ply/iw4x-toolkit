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

import { tokenize, Token, TokenType, TokenizeResult } from "./tokenizer.js";
import { getKnowledgeDir, MAX_LINE_LENGTH_WARNING } from "../utils.js";

// ---------------------------------------------------------------------------
// Core builtins that are always available (no file I/O needed)
// ---------------------------------------------------------------------------

const CORE_BUILTINS = [
  // IO
  "println", "print", "iprintln", "iprintlnbold", "print3d", "iprintlnln",
  // Dvars
  "getcvar", "setcvar", "getcvarint", "getcvarlen",
  "getdvar", "setdvar", "getdvarint", "getdvarfloat", "getdvarvector",
  "setdvarifuninitialized",
  // Entity
  "getent", "getarray", "getfirstarraykey", "getnextarraykey",
  "alloc", "free", "spawn", "spawnstruct",
  // Special
  "self", "level", "game", "player",
  // Flow control
  "thread", "call", "notify", "endon", "wait", "waittill",
  "waittillmatch", "waittillframeend", "childthread",
  // Type conversion
  "tostring", "int", "float", "strtok", "tolower", "toupper",
  // Type checking
  "isdefined", "isstring", "isarray", "isfunction",
  // Math
  "length", "vectordot", "vectorcross", "vectornormalize", "vectorscale",
  "anglestoforward", "anglestoright", "anglestoleft",
  "forward", "right", "up",
  "distance", "distance2d", "distanceSquared",
  "clamp", "lerp", "lerpvector",
  // Entity methods
  "getorigin", "setorigin", "getangles", "setangles",
  "getvelocity", "setvelocity", "getmodel", "setmodel",
  "getnumlinks", "getlinkname",
  // Arrays
  "array", "array_size", "sort", "random", "randomint", "randomfloat",
  // Effects & Audio
  "bullettrace", "bullettracepassed", "sighttracepassed",
  "playfx", "playsound", "playrumbleonentity",
  "playlocalsound",
  // HUD
  "setText", "setvalue", "clearalltextafterhud",
  // Client
  "setclientdvar", "setclientdvars",
  // Player
  "getguid", "getentitynumber", "isalive", "getteam", "getname",
  "getplayerangles", "sayteam", "sayall", "suicide", "pingplayer",
  // Input
  "notifyonplayercommand", "_setactionslot",
  // UI
  "openpopupmenu", "openpopupmenugamepad", "closepopupmenu",
  "objective_add", "objective_delete", "objective_player",
  "newclienthudelem", "newhudelem",
  // Assets
  "precacheshader", "precachestring", "precachemenu", "precacheheadicon",
  // Time
  "gettime", "getsystemtime",
  // Filesystem
  "readfile", "writefile", "fileexists",
];

const CORE_DVARS = [
  "ui_gametype", "g_gametype", "sv_fps", "sv_maxclients",
  "r_fog", "r_detail", "r_normalmap", "r_specularmap",
  "cg_fov", "cg_thirdperson", "cg_drawcrosshair", "cg_hud",
  "cl_paused", "snaps", "rate", "cl_maxpackets",
];

// ---------------------------------------------------------------------------
// Lazy-loaded caches (populated on first access via async I/O)
// ---------------------------------------------------------------------------

let _knownBuiltins: Set<string> | null = null;
let _knownDvars: Set<string> | null = null;

/**
 * Returns the set of known GSC builtins, loading from the knowledge base
 * on first access using async file I/O.
 */
export async function getKnownBuiltins(): Promise<Set<string>> {
  if (_knownBuiltins) return _knownBuiltins;

  const builtins = new Set<string>(CORE_BUILTINS);

  const filePath = getKnowledgeDir("gsc-builtins.json");
  if (filePath) {
    try {
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(filePath, "utf-8");
      const data = JSON.parse(raw);
      if (data.functions && Array.isArray(data.functions)) {
        for (const func of data.functions) {
          if (func.name) {
            // Add both original case and lowercase for case-insensitive matching
            builtins.add(func.name);
            builtins.add(func.name.toLowerCase());
          }
        }
      }
    } catch {
      // Fall back to core builtins only
    }
  }

  _knownBuiltins = builtins;
  return builtins;
}

/**
 * Returns the set of known DVARs, loading from the knowledge base
 * on first access using async file I/O.
 */
export async function getKnownDvars(): Promise<Set<string>> {
  if (_knownDvars) return _knownDvars;

  const dvars = new Set<string>(CORE_DVARS);

  const filePath = getKnowledgeDir("dvars.json");
  if (filePath) {
    try {
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(filePath, "utf-8");
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

  _knownDvars = dvars;
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
 * Options for configuring linter behavior
 */
export interface LintOptions {
  /** Check for undefined variables and functions (default: true) */
  checkUndefined?: boolean;
  /** Check for bad patterns and anti-patterns (default: true) */
  checkPatterns?: boolean;
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
  private options: LintOptions = {};

  /**
   * Lint GSC source code
   */
  async lint(source: string, options?: LintOptions): Promise<LintResult> {
    this.source = source;
    this.options = options ?? {};
    this.errors = [];
    this.variables = new Set(["self", "level", "game", "player"]);
    this.functions = await getKnownBuiltins();
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

    // Second pass: check usage (if enabled)
    if (this.options.checkUndefined !== false) {
      this.analyzeUsage();
    }

    // Check for bad patterns (if enabled)
    if (this.options.checkPatterns !== false) {
      await this.checkBadPatterns();
    }

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
        // Identifier on RHS of assignment — treat as a variable reference
        if (prev && prev.type === TokenType.EQUAL) {
          if (!this.variables.has(token.value) &&
              !this.isBuiltinProperty(token.value) &&
              !this.definedFunctions.has(token.value) &&
              !this.isCommonFunctionCall(token.value)) {
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
        // Identifier after certain tokens — treat as a function call
        } else if (prev && (prev.type === TokenType.KEYWORD ||
                     prev.type === TokenType.LEFT_PAREN ||
                     prev.type === TokenType.COMMA ||
                     prev.type === TokenType.COLON ||
                     prev.type === TokenType.LEFT_BRACKET)) {

          // Check if it's a known function being called (case-insensitive)
          const funcLower = token.value.toLowerCase();
          if (!this.functions.has(funcLower) && !this.definedFunctions.has(token.value)) {
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
  private async checkBadPatterns(): Promise<void> {
    const source = this.source;
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

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
      if (line.length > MAX_LINE_LENGTH_WARNING) {
        this.errors.push({
          type: "info",
          code: "STY-001",
          message: `Line exceeds ${MAX_LINE_LENGTH_WARNING} characters (${line.length})`,
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
            const dvars = await getKnownDvars();
              if (!dvars.has(varName.toLowerCase())) {
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

      // --- IW4-specific anti-patterns (PAT-010 to PAT-024, all errors) ---

      // PAT-010: No `function` keyword for definitions
      if (/\bfunction\s+\w+\s*\(/.test(line)) {
        this.errors.push({
          type: "error", code: "PAT-010",
          message: "IW4 GSC does not support the `function` keyword. Write `myFunc() {}` not `function myFunc() {}`",
          line: lineNum, column: 0, length: line.trimStart().length,
        });
      }

      // PAT-011: No var/let/const declarations
      const varMatch011 = line.match(/\b(var|let|const)\s+\w/);
      if (varMatch011) {
        this.errors.push({
          type: "error", code: "PAT-011",
          message: `IW4 GSC does not support '${varMatch011[1]}'. Use plain assignment: x = 5;`,
          line: lineNum, column: line.indexOf(varMatch011[0]), length: varMatch011[1].length,
        });
      }

      // PAT-012: No .push()/.pop() array methods
      const pushMatch012 = line.match(/\.(push|pop|shift|unshift|splice)\s*\(/);
      if (pushMatch012) {
        const fix012 = pushMatch012[1] === "push"
          ? "use arr[arr.size] = item;"
          : "no direct equivalent — rethink with indexed loop";
        this.errors.push({
          type: "error", code: "PAT-012",
          message: `IW4 GSC does not support .${pushMatch012[1]}(). ${fix012}`,
          line: lineNum, column: line.indexOf(pushMatch012[0]), length: pushMatch012[0].length,
        });
      }

      // PAT-013: No .length property — use .size
      if (/\.length\b/.test(line)) {
        this.errors.push({
          type: "error", code: "PAT-013",
          message: "IW4 GSC uses .size not .length for array/string length",
          line: lineNum, column: line.indexOf(".length"), length: 7,
        });
      }

      // PAT-014: No strict equality operators
      if (/===|!==/.test(line)) {
        this.errors.push({
          type: "error", code: "PAT-014",
          message: "IW4 GSC does not support === or !==. Use == or != instead",
          line: lineNum, column: Math.max(0, line.search(/===|!==/)), length: 3,
        });
      }

      // PAT-015: No ternary operator
      if (/\s\?\s/.test(line)) {
        this.errors.push({
          type: "error", code: "PAT-015",
          message: "IW4 GSC does not support the ternary operator (?:). Use if/else instead",
          line: lineNum, column: Math.max(0, line.search(/\s\?\s/) + 1), length: 1,
        });
      }

      // PAT-016: No arrow functions
      if (/=>/.test(line)) {
        this.errors.push({
          type: "error", code: "PAT-016",
          message: "IW4 GSC does not support arrow functions (=>). Use named functions",
          line: lineNum, column: line.indexOf("=>"), length: 2,
        });
      }

      // PAT-017: No object literal syntax { key: value }
      if (/[=(,]\s*\{[^}]*\w+\s*:/.test(line) || /\breturn\s+\{[^}]*\w+\s*:/.test(line)) {
        this.errors.push({
          type: "error", code: "PAT-017",
          message: "IW4 GSC does not support object literals {key: value}. Use spawnstruct() then assign properties",
          line: lineNum, column: 0, length: line.trimStart().length,
        });
      }

      // PAT-018: No null literal
      if (/\bnull\b/.test(line)) {
        this.errors.push({
          type: "error", code: "PAT-018",
          message: "IW4 GSC does not have 'null'. Use !isDefined(x) to test for undefined variables",
          line: lineNum, column: Math.max(0, line.search(/\bnull\b/)), length: 4,
        });
      }

      // PAT-019: No JS Math/parseInt/parseFloat globals
      const jsGlobal019 = line.match(/\b(Math\.\w+|parseInt|parseFloat|Number\s*\(|Boolean\s*\(|JSON\.)\s*/);
      if (jsGlobal019) {
        const name019 = jsGlobal019[1].replace(/\s*$/, "");
        const alt019 = name019 === "parseInt" ? "int()" :
                       name019 === "parseFloat" ? "float()" :
                       name019.startsWith("Math.floor") ? "int()" :
                       name019.startsWith("Math.") ? "a built-in GSC math function (randomint, sin, cos, etc.)" :
                       "GSC equivalent";
        this.errors.push({
          type: "error", code: "PAT-019",
          message: `'${name019}' is a JavaScript global not available in IW4 GSC. Use ${alt019}`,
          line: lineNum, column: line.indexOf(jsGlobal019[0]), length: jsGlobal019[0].trimEnd().length,
        });
      }

      // PAT-020: No template literals (backticks)
      if (line.includes("`")) {
        this.errors.push({
          type: "error", code: "PAT-020",
          message: 'IW4 GSC does not support template literals (`). Use string concatenation: "Hello " + name',
          line: lineNum, column: line.indexOf("`"), length: 1,
        });
      }

      // PAT-021: No `new` keyword
      if (/\bnew\s+\w/.test(line)) {
        this.errors.push({
          type: "error", code: "PAT-021",
          message: "IW4 GSC does not support the `new` keyword. Use spawnstruct() to create objects",
          line: lineNum, column: Math.max(0, line.search(/\bnew\s+\w/)), length: 3,
        });
      }

      // PAT-022: No `this.` references
      if (/\bthis\./.test(line)) {
        this.errors.push({
          type: "error", code: "PAT-022",
          message: "IW4 GSC does not have 'this'. Use 'self' for the current entity context",
          line: lineNum, column: Math.max(0, line.search(/\bthis\./)), length: 5,
        });
      }

      // PAT-023: No for...of or functional iteration (.forEach/.map/.filter)
      const iterMatch023 = line.match(/\bfor\s*\([^)]*\bof\b|\b(forEach|\.map|\.filter|\.reduce)\s*\(/);
      if (iterMatch023) {
        this.errors.push({
          type: "error", code: "PAT-023",
          message: "IW4 GSC does not support for...of or .forEach. Use: for(i=0; i<arr.size; i++)",
          line: lineNum, column: 0, length: line.trimStart().length,
        });
      }

      // PAT-024: No JS string/array methods (.concat, .join, .indexOf, etc.)
      const strMethod024 = line.match(/\.(concat|join|slice|indexOf|includes|startsWith|endsWith|split|trim|replace)\s*\(/);
      if (strMethod024) {
        const alts024: Record<string, string> = {
          concat: "use + operator for strings",
          indexOf: "use strtok() or manual loop",
          split: "use strtok()",
          trim: "no equivalent — avoid extra whitespace",
          replace: "no equivalent — rethink approach",
        };
        const alt024 = alts024[strMethod024[1]] ?? "no direct equivalent in IW4 GSC";
        this.errors.push({
          type: "error", code: "PAT-024",
          message: `IW4 GSC does not support .${strMethod024[1]}(). ${alt024}`,
          line: lineNum, column: line.indexOf(strMethod024[0]), length: strMethod024[0].length,
        });
      }
    }

    // Check for unreachable code after return/break/continue
    this.checkUnreachableCode();
  }

  /**
   * Check for unreachable code after return/break/continue
   * Uses token-based analysis to properly track function scopes
   */
  private checkUnreachableCode(): void {
    // Track function scopes: each entry is the brace depth where a function starts
    const functionScopeDepths: number[] = [];
    let currentFunctionDepth = -1;
    let foundReturn = false;
    let returnLine = 0;
    let returnBraceDepth = -1;

    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      const prev = this.tokens[i - 1];

      // Track function definitions
      if (token.type === TokenType.KEYWORD && token.value === "function") {
        // Next brace opens a new function scope
        const nextBrace = this.tokens.findIndex((t, idx) => 
          idx > i && t.type === TokenType.LEFT_BRACE
        );
        if (nextBrace !== -1) {
          // We'll track this function when we hit its opening brace
        }
      }

      // Track opening braces - may start a function scope
      if (token.type === TokenType.LEFT_BRACE) {
        // Check if this brace opens a function (preceded by ) or identifier for shorthand)
        if (prev && (prev.type === TokenType.RIGHT_PAREN || 
            (prev.type === TokenType.IDENTIFIER && i >= 2 && 
             this.tokens[i - 2]?.type === TokenType.KEYWORD && 
             this.tokens[i - 2]?.value === "function"))) {
          // Entering a new function scope
          currentFunctionDepth = functionScopeDepths.length;
          functionScopeDepths.push(i);
          foundReturn = false; // Reset for new function
        }
      }

      // Track closing braces
      if (token.type === TokenType.RIGHT_BRACE) {
        if (functionScopeDepths.length > 0) {
          // Check if we're closing a function scope
          const lastFuncStart = functionScopeDepths[functionScopeDepths.length - 1];
          // Simple heuristic: if we're at depth 0 after closing, we left a function
          if (functionScopeDepths.length === 1) {
            functionScopeDepths.pop();
            currentFunctionDepth = -1;
            foundReturn = false;
          }
        }
      }

      // Detect return/break/continue statements
      if (token.type === TokenType.KEYWORD && 
          (token.value === "return" || token.value === "break" || token.value === "continue")) {
        foundReturn = true;
        returnLine = token.line;
        returnBraceDepth = functionScopeDepths.length;
      }

      // Check for unreachable code
      if (foundReturn && token.type !== TokenType.NEWLINE && 
          token.type !== TokenType.COMMENT && token.type !== TokenType.BLOCK_COMMENT &&
          token.type !== TokenType.EOF && token.type !== TokenType.SEMICOLON) {
        
        // Skip the return statement itself and tokens on the same line
        if (token.line === returnLine) {
          continue;
        }

        // Only report if we're in the same function scope
        if (functionScopeDepths.length === returnBraceDepth) {
          this.errors.push({
            type: "warning",
            code: "FLOW-001",
            message: `Unreachable code after ${this.getReturnKeyword(returnLine)} statement (line ${returnLine})`,
            line: token.line,
            column: token.column,
            length: token.length,
          });
          foundReturn = false; // Only report once per function
        }
      }
    }
  }

  /**
   * Get the keyword (return/break/continue) that was used on a given line
   */
  private getReturnKeyword(lineNum: number): string {
    for (const token of this.tokens) {
      if (token.line === lineNum && token.type === TokenType.KEYWORD &&
          (token.value === "return" || token.value === "break" || token.value === "continue")) {
        return token.value;
      }
    }
    return "return";
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
    const nameLower = name.toLowerCase();
    // Check if it's a known builtin (case-insensitive)
    if (this.functions.has(nameLower)) {
      return true;
    }
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
      "onplayerspawn", "onplayerdeath", "onteamchange", "onplayerspawned",
      "applyfpsboost", "watchtoggle", "showmessage", "onplayerspawned",
      "apply", "callback", "handler", "callback_playerdamage",
      "callback_playerlastdamage", "callback_killed",
    ];
    return common.includes(nameLower);
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
export async function lint(source: string, options?: LintOptions): Promise<LintResult> {
  const linter = new GSCLinter();
  return linter.lint(source, options);
}

/**
 * Auto-fix result
 */
export interface FixResult {
  fixed: boolean;
  original: string;
  fixedCode: string;
  fixesApplied: string[];
}

/**
 * Attempt to auto-fix common GSC syntax errors
 * Returns the fixed code and list of fixes applied
 */
export function fix(source: string): FixResult {
  let fixedCode = source;
  const fixesApplied: string[] = [];
  let hasChanges = false;

  // Fix 1: Add missing closing quotes for unterminated strings
  // Pattern: strings that end without closing quote
  const unterminatedStringPattern = /("[^"\\]*(?:\\.[^"\\]*)*)(?=[^;"]*$)/g;
  // Check for unterminated strings by counting quotes
  const lines = source.split("\n");
  let inString = false;
  let stringChar = "";
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let modifiedLine = line;
    
    for (let j = 0; j < modifiedLine.length; j++) {
      const char = modifiedLine[j];
      
      if ((char === '"' || char === "'") && (j === 0 || modifiedLine[j-1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }
    }
    
    // If we're still in a string at end of line, add closing quote
    if (inString) {
      modifiedLine += stringChar;
      fixesApplied.push(`Line ${i + 1}: Added missing closing '${stringChar}'`);
      hasChanges = true;
    }
    
    lines[i] = modifiedLine;
  }
  
  if (hasChanges) {
    fixedCode = lines.join("\n");
  }

  // Fix 2: Add missing closing brackets (basic heuristic)
  // Count brackets and add missing ones at end of line/function
  const bracketCounts = countBrackets(fixedCode);
  
  if (bracketCounts.unmatchedBraces > 0) {
    // Add missing closing braces
    for (let i = 0; i < bracketCounts.unmatchedBraces; i++) {
      fixedCode += "\n}";
    }
    fixesApplied.push(`Added ${bracketCounts.unmatchedBraces} missing closing brace(s)`);
    hasChanges = true;
  }
  
  if (bracketCounts.unmatchedParens > 0) {
    fixesApplied.push(`Warning: ${bracketCounts.unmatchedParens} unmatched parenthesis(es) - manual fix required`);
  }
  
  if (bracketCounts.unmatchedBrackets > 0) {
    fixesApplied.push(`Warning: ${bracketCounts.unmatchedBrackets} unmatched bracket(s) - manual fix required`);
  }

  return {
    fixed: hasChanges,
    original: source,
    fixedCode,
    fixesApplied,
  };
}

/**
 * Count unmatched brackets in code
 */
function countBrackets(code: string): {
  unmatchedBraces: number;
  unmatchedParens: number;
  unmatchedBrackets: number;
} {
  let braces = 0;
  let parens = 0;
  let brackets = 0;
  let inString = false;
  let stringChar = "";
  
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    
    // Skip strings
    if ((char === '"' || char === "'") && (i === 0 || code[i-1] !== '\\')) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }
    
    if (inString) continue;
    
    // Skip comments
    if (char === '/' && i + 1 < code.length) {
      if (code[i + 1] === '/') {
        // Skip to end of line
        while (i < code.length && code[i] !== '\n') i++;
        continue;
      }
      if (code[i + 1] === '*') {
        // Skip block comment
        i += 2;
        while (i < code.length - 1) {
          if (code[i] === '*' && code[i + 1] === '/') {
            i += 2;
            break;
          }
          i++;
        }
        continue;
      }
    }
    
    switch (char) {
      case '{': braces++; break;
      case '}': braces--; break;
      case '(': parens++; break;
      case ')': parens--; break;
      case '[': brackets++; break;
      case ']': brackets--; break;
    }
  }
  
  return {
    unmatchedBraces: Math.max(0, braces),
    unmatchedParens: Math.max(0, parens),
    unmatchedBrackets: Math.max(0, brackets),
  };
}
