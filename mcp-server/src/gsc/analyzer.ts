/**
 * @file gsc/analyzer.ts
 * Token-stream analysis passes used by the linter:
 *  - definition collection (functions, variables)
 *  - undefined symbol usage checks (VAR-001 / FUN-001)
 *  - unreachable-code detection (FLOW-001)
 *  - case-insensitive name collisions (DEF-001)
 */

import { Token, TokenType } from "./tokenizer.js";
import { outline } from "./outline.js";
import type { LintError } from "./linter.js";

/** Symbols known while analysing a single source file. */
export interface DefinitionScope {
  /** Builtins plus user-defined function names (mixed case). */
  functions: Set<string>;
  /** User-defined function name -> defining line. */
  definedFunctions: Map<string, number>;
  variables: Set<string>;
}

// Identifiers appearing after one of these tokens read as a function call.
const CALL_CONTEXT_TYPES = new Set<TokenType>([
  TokenType.KEYWORD, TokenType.LEFT_PAREN, TokenType.COMMA,
  TokenType.COLON, TokenType.LEFT_BRACKET,
]);

// Tokens that don't count as executable code when scanning for unreachable statements.
const IGNORABLE_TYPES = new Set<TokenType>([
  TokenType.NEWLINE, TokenType.COMMENT, TokenType.BLOCK_COMMENT,
  TokenType.EOF, TokenType.SEMICOLON,
]);

// Control-flow keywords after which following code is unreachable.
const FLOW_BREAK_KEYWORDS = new Set(["return", "break", "continue"]);

// Property names treated as built-in entity fields rather than undefined vars.
const BUILTIN_PROPERTIES = new Set([
  "origin", "angles", "velocity", "model", "classname", "targetname",
  "script_noteworthy", "script_team", "script_gameobjectname",
  "u", "v", "forward", "right", "up",
]);

// Common entry-point / callback names allowed without a visible definition.
const COMMON_CALLS = new Set([
  "main", "init", "spawn", "think", "update", "damage", "death",
  "connect", "disconnect", "spawned", "playing", "onplayerconnect",
  "onplayerspawn", "onplayerdeath", "onteamchange", "onplayerspawned",
  "applyfpsboost", "watchtoggle", "showmessage",
  "apply", "callback", "handler", "callback_playerdamage",
  "callback_playerlastdamage", "callback_killed",
]);

// ---------------------------------------------------------------------------
// Pass 1: collect definitions
// ---------------------------------------------------------------------------

/** Populate `scope` with the functions/variables defined in `tokens`. */
export function collectDefinitions(tokens: Token[], scope: DefinitionScope): void {
  for (let i = 0; i < tokens.length; i++) {
    const next = tokens[i + 1];
    if (next?.type === TokenType.IDENTIFIER) addDefinition(tokens[i], next, scope);
  }
}

function addDefinition(token: Token, next: Token, scope: DefinitionScope): void {
  if (isFunctionKeyword(token)) {
    scope.functions.add(next.value);
    scope.definedFunctions.set(next.value, next.line);
  } else if (isVarKeyword(token) || isDefineMacro(token)) {
    scope.variables.add(next.value);
  }
}

function isFunctionKeyword(t: Token): boolean {
  return t.type === TokenType.KEYWORD && (t.value === "function" || t.value === "funcdef");
}
function isVarKeyword(t: Token): boolean {
  return t.type === TokenType.KEYWORD && t.value === "var";
}
function isDefineMacro(t: Token): boolean {
  return t.type === TokenType.HASH && t.value === "define";
}

// ---------------------------------------------------------------------------
// Pass 2: undefined symbol usage
// ---------------------------------------------------------------------------

interface ScopeState { inFunction: boolean; braceDepth: number; }

/** Report identifiers used as variables/functions that were never defined. */
export function analyzeUsage(tokens: Token[], scope: DefinitionScope): LintError[] {
  const errors: LintError[] = [];
  const state: ScopeState = { inFunction: false, braceDepth: 0 };
  for (let i = 0; i < tokens.length; i++) {
    trackBraceDepth(tokens[i], state);
    inspectIdentifier(tokens[i], tokens[i - 1], state, scope, errors);
  }
  return errors;
}

function trackBraceDepth(token: Token, state: ScopeState): void {
  if (token.type === TokenType.LEFT_BRACE) state.braceDepth++;
  if (token.type === TokenType.RIGHT_BRACE) {
    state.braceDepth--;
    if (state.braceDepth === 0) state.inFunction = false;
  }
}

function inspectIdentifier(
  token: Token, prev: Token | undefined, state: ScopeState,
  scope: DefinitionScope, errors: LintError[],
): void {
  if (token.type !== TokenType.IDENTIFIER || !prev) return;

  if (prev.type === TokenType.EQUAL) {
    reportUndefinedVar(token, state.inFunction || state.braceDepth > 0, scope, errors);
  } else if (CALL_CONTEXT_TYPES.has(prev.type)) {
    reportUndefinedFunc(token, scope, errors);
  }

  // `function name` shorthand also defines a function.
  if (prev.type === TokenType.KEYWORD && prev.value === "function") {
    state.inFunction = true;
    scope.functions.add(token.value);
    scope.definedFunctions.set(token.value, token.line);
  }
}

function reportUndefinedVar(token: Token, inScope: boolean, scope: DefinitionScope, errors: LintError[]): void {
  if (!inScope) return;
  if (scope.variables.has(token.value)) return;
  if (BUILTIN_PROPERTIES.has(token.value.toLowerCase())) return;
  if (scope.definedFunctions.has(token.value)) return;
  if (isCommonFunctionCall(token.value, scope.functions)) return;
  errors.push({
    type: "warning", code: "VAR-001",
    message: `Undefined variable: '${token.value}'`,
    line: token.line, column: token.column, length: token.length,
  });
}

function reportUndefinedFunc(token: Token, scope: DefinitionScope, errors: LintError[]): void {
  if (scope.functions.has(token.value.toLowerCase())) return;
  if (scope.definedFunctions.has(token.value)) return;
  if (isCommonFunctionCall(token.value, scope.functions)) return;
  errors.push({
    type: "warning", code: "FUN-001",
    message: `Undefined function: '${token.value}'`,
    line: token.line, column: token.column, length: token.length,
  });
}

/** Allowlist: known builtins, namespaced/map calls, self methods, common names. */
function isCommonFunctionCall(name: string, functions: Set<string>): boolean {
  const lower = name.toLowerCase();
  if (functions.has(lower)) return true;       // known builtin (case-insensitive)
  if (name.includes("\\")) return true;        // namespaced / map path
  if (name.includes("/")) return true;
  if (name.includes(".")) return true;         // method on self
  return COMMON_CALLS.has(lower);
}

// ---------------------------------------------------------------------------
// Pass 3: unreachable code
// ---------------------------------------------------------------------------

interface ReturnState {
  /** Indices of `{` tokens that opened function scopes. */
  scopes: number[];
  found: boolean;
  line: number;
  depth: number;
  keyword: string;
}

/** Report executable code that follows return/break/continue in the same scope. */
export function checkUnreachableCode(tokens: Token[]): LintError[] {
  const errors: LintError[] = [];
  const st: ReturnState = { scopes: [], found: false, line: 0, depth: -1, keyword: "return" };
  for (let i = 0; i < tokens.length; i++) {
    updateFunctionScope(tokens, i, st);
    detectFlowBreak(tokens[i], st);
    reportUnreachable(tokens[i], st, errors);
  }
  return errors;
}

function updateFunctionScope(tokens: Token[], i: number, st: ReturnState): void {
  const token = tokens[i];
  if (token.type === TokenType.LEFT_BRACE && opensFunctionScope(tokens, i)) {
    st.scopes.push(i);
    st.found = false;
  }
  // Closing the outermost function scope leaves the function.
  if (token.type === TokenType.RIGHT_BRACE && st.scopes.length === 1) {
    st.scopes.pop();
    st.found = false;
  }
}

function detectFlowBreak(token: Token, st: ReturnState): void {
  if (token.type !== TokenType.KEYWORD || !FLOW_BREAK_KEYWORDS.has(token.value)) return;
  st.found = true;
  st.line = token.line;
  st.depth = st.scopes.length;
  st.keyword = token.value;
}

function reportUnreachable(token: Token, st: ReturnState, errors: LintError[]): void {
  if (!st.found || token.line === st.line) return;
  if (IGNORABLE_TYPES.has(token.type)) return;
  if (st.scopes.length !== st.depth) return;
  errors.push({
    type: "warning", code: "FLOW-001",
    message: `Unreachable code after ${st.keyword} statement (line ${st.line})`,
    line: token.line, column: token.column, length: token.length,
  });
  st.found = false; // Only report once per function
}

/** True if the brace at index `i` opens a function body (preceded by `)` or `function name`). */
function opensFunctionScope(tokens: Token[], i: number): boolean {
  const prev = tokens[i - 1];
  if (!prev) return false;
  if (prev.type === TokenType.RIGHT_PAREN) return true;
  if (prev.type !== TokenType.IDENTIFIER || i < 2) return false;
  const keyword = tokens[i - 2];
  return keyword?.type === TokenType.KEYWORD && keyword?.value === "function";
}

// ---------------------------------------------------------------------------
// Pass 4: case-insensitive name collisions
// ---------------------------------------------------------------------------

interface FnDef { original: string; line: number; }

/**
 * Detect case-insensitive function name collisions. GSC is case-insensitive,
 * so two definitions of isAlive / isalive cause a compile crash.
 */
export function checkCaseCollisions(source: string): LintError[] {
  const errors: LintError[] = [];
  for (const group of groupFunctionsByLowerName(source).values()) {
    collectCollisions(group, errors);
  }
  return errors;
}

function groupFunctionsByLowerName(source: string): Map<string, FnDef[]> {
  const byLower = new Map<string, FnDef[]>();
  for (const fn of outline(source).functions) {
    const lower = fn.name.toLowerCase();
    const group = byLower.get(lower) ?? [];
    group.push({ original: fn.name, line: fn.line });
    byLower.set(lower, group);
  }
  return byLower;
}

function collectCollisions(group: FnDef[], errors: LintError[]): void {
  if (group.length < 2) return;
  // Only a collision if the originals differ in casing.
  if (new Set(group.map(g => g.original)).size < 2) return;

  const [first, ...rest] = group;
  for (const dup of rest) {
    if (dup.original === first.original) continue; // exact duplicate, not a casing collision
    errors.push({
      type: "error", code: "DEF-001",
      message: `Function name collision: '${dup.original}' (line ${dup.line}) and '${first.original}' (line ${first.line}) are the same name in GSC (case-insensitive)`,
      line: dup.line,
      column: 0, // outline() does not expose column positions
    });
  }
}
