/**
 * @file gsc/outline.ts
 * GSC file structure outline.
 *
 * Extracts the structural skeleton of a GSC file:
 *   - Function definitions (name, params, line)
 *   - #include / #using directives
 *   - Thread calls ([entity] thread funcName)
 *   - Event listeners (waittill / notify / endon)
 *   - Shared-state property assignments (level.x =, self.x =, game.x =)
 *
 * Used by the gsc_outline MCP tool so an LLM can understand a file's
 * structure before editing it — preventing accidental function deletion
 * or broken event chains.
 */

import { tokenize, Token, TokenType } from "./tokenizer.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FunctionDef {
  name: string;
  params: string[];
  line: number;
}

export interface IncludeDef {
  /** Raw path as written in source, e.g. maps\mp\_utility */
  path: string;
  line: number;
}

export interface ThreadCall {
  /** Function being threaded, may include path e.g. maps\mp\_util::fn */
  funcName: string;
  /** Entity the thread is spawned on, or null if bare `thread` */
  entity: string | null;
  line: number;
}

export interface EventDef {
  type: "waittill" | "notify" | "endon" | "waittillmatch";
  /** Entity context (level / self / etc), or null if unclear */
  entity: string | null;
  /** First string argument (the event name), or null if not a literal */
  eventName: string | null;
  line: number;
}

export interface PropAssignment {
  /** Object: "level", "self", or "game" */
  object: string;
  property: string;
  /** Line of first assignment */
  line: number;
}

export interface OutlineResult {
  functions: FunctionDef[];
  includes: IncludeDef[];
  threads: ThreadCall[];
  events: EventDef[];
  /** Deduplicated — first occurrence only */
  props: PropAssignment[];
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

const ENTITY_KEYWORDS = new Set(["level", "self", "game", "player"]);
const EVENT_KEYWORDS = new Set(["waittill", "notify", "endon", "waittillmatch"]);
const SHARED_STATE_KEYWORDS = new Set(["level", "self", "game"]);
const NON_CODE_TYPES = new Set([TokenType.COMMENT, TokenType.BLOCK_COMMENT, TokenType.EOF]);

/** Index of the next non-comment token at or after `from`, or -1 if none. */
function nextOf(tokens: Token[], from: number): number {
  for (let k = from; k < tokens.length; k++) {
    if (!NON_CODE_TYPES.has(tokens[k].type)) return k;
  }
  return -1;
}

/** Push `item` onto `arr` when it isn't null — keeps callers free of inline guards. */
function pushIf<T>(arr: T[], item: T | null): void {
  if (item) arr.push(item);
}

/** Entity an event/thread is attached to: the preceding identifier or entity keyword. */
function entityBefore(tokens: Token[], i: number): string | null {
  if (i === 0) return null;
  const prev = tokens[i - 1];
  if (prev.type === TokenType.IDENTIFIER) return prev.value;
  if (prev.type === TokenType.KEYWORD && ENTITY_KEYWORDS.has(prev.value)) return prev.value;
  return null;
}

function isIncludeDirective(tok: Token): boolean {
  return tok.type === TokenType.HASH && (tok.value === "include" || tok.value.startsWith("using"));
}
function isKeyword(tok: Token, value: string): boolean {
  return tok.type === TokenType.KEYWORD && tok.value === value;
}
function isEventKeyword(tok: Token): boolean {
  return tok.type === TokenType.KEYWORD && EVENT_KEYWORDS.has(tok.value);
}
function isSharedStateKeyword(tok: Token): boolean {
  return tok.type === TokenType.KEYWORD && SHARED_STATE_KEYWORDS.has(tok.value);
}

// ---------------------------------------------------------------------------
// Per-pattern parsers
// ---------------------------------------------------------------------------

/**
 * Parse a top-level function definition starting at `i`
 * (IDENTIFIER `(` params `)` `{`). Returns the def plus the index to resume
 * from (just before the opening brace), or null if it isn't a definition.
 */
function parseFunctionDef(tokens: Token[], i: number): { def: FunctionDef; nextIndex: number } | null {
  const parenIdx = nextOf(tokens, i + 1);
  if (parenIdx === -1 || tokens[parenIdx].type !== TokenType.LEFT_PAREN) return null;

  const { params, closeIdx } = collectParams(tokens, parenIdx);
  const braceIdx = nextOf(tokens, closeIdx + 1);
  if (braceIdx === -1 || tokens[braceIdx].type !== TokenType.LEFT_BRACE) return null;

  return { def: { name: tokens[i].value, params, line: tokens[i].line }, nextIndex: braceIdx - 1 };
}

/** Collect parameter identifiers between balanced parens; returns the closing-paren index. */
function collectParams(tokens: Token[], parenIdx: number): { params: string[]; closeIdx: number } {
  const params: string[] = [];
  let depth = 1;
  let j = parenIdx + 1;
  for (; j < tokens.length && depth > 0; j++) {
    const t = tokens[j];
    if (t.type === TokenType.LEFT_PAREN) depth++;
    else if (t.type === TokenType.RIGHT_PAREN) depth--;
    else if (depth === 1 && t.type === TokenType.IDENTIFIER) params.push(t.value);
    if (depth === 0) break; // stop on the matching close paren (j stays on it)
  }
  return { params, closeIdx: j };
}

/** Recover the raw include path from the source line (preprocessor consumed the tokens). */
function parseInclude(tok: Token, sourceLines: string[]): IncludeDef | null {
  const lineIdx = tok.line - 1;
  if (lineIdx < 0 || lineIdx >= sourceLines.length) return null;
  const m = sourceLines[lineIdx].match(/#\w+\s+(.+?)(?:\s*;.*)?$/);
  return m ? { path: m[1].trim(), line: tok.line } : null;
}

function endsThreadName(type: TokenType): boolean {
  return type === TokenType.LEFT_PAREN || type === TokenType.SEMICOLON || type === TokenType.EOF;
}

/** Parse `[entity] thread funcName(...)`; funcName is the run of tokens up to `(` / `;`. */
function parseThread(tokens: Token[], i: number): ThreadCall | null {
  const entity = entityBefore(tokens, i);
  const nxt = nextOf(tokens, i + 1);
  if (nxt === -1) return null;

  let funcName = "";
  for (let j = nxt; j < tokens.length && !endsThreadName(tokens[j].type); j++) {
    funcName += tokens[j].value;
  }
  funcName = funcName.trim();
  return funcName ? { funcName, entity, line: tokens[i].line } : null;
}

/** Parse `[entity] waittill|notify|endon|waittillmatch ("name")`. Always yields an event. */
function parseEvent(tokens: Token[], i: number): EventDef {
  return {
    type: tokens[i].value as EventDef["type"],
    entity: entityBefore(tokens, i),
    eventName: eventNameAfter(tokens, i),
    line: tokens[i].line,
  };
}

/** First string-literal argument of an event call, or null if not a literal. */
function eventNameAfter(tokens: Token[], i: number): string | null {
  const parenIdx = nextOf(tokens, i + 1);
  if (parenIdx === -1 || tokens[parenIdx].type !== TokenType.LEFT_PAREN) return null;
  const argIdx = nextOf(tokens, parenIdx + 1);
  if (argIdx === -1 || tokens[argIdx].type !== TokenType.STRING) return null;
  return tokens[argIdx].value;
}

/** Parse `level|self|game . prop =` (assignment only, not `==`). */
function parsePropAssignment(tokens: Token[], i: number): PropAssignment | null {
  const dotIdx = nextOf(tokens, i + 1);
  if (dotIdx === -1 || tokens[dotIdx].type !== TokenType.DOT) return null;
  const propIdx = nextOf(tokens, dotIdx + 1);
  if (propIdx === -1 || tokens[propIdx].type !== TokenType.IDENTIFIER) return null;
  const eqIdx = nextOf(tokens, propIdx + 1);
  if (eqIdx === -1 || tokens[eqIdx].type !== TokenType.EQUAL) return null;
  return { object: tokens[i].value, property: tokens[propIdx].value, line: tokens[i].line };
}

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------

interface OutlineAcc {
  functions: FunctionDef[];
  includes: IncludeDef[];
  threads: ThreadCall[];
  events: EventDef[];
  seenProps: Map<string, PropAssignment>;
}

/**
 * Parse GSC source and return a structural outline.
 * Tolerates syntax errors — best-effort on malformed code.
 */
export function outline(source: string): OutlineResult {
  const { tokens } = tokenize(source);
  const sourceLines = source.split("\n");
  const acc: OutlineAcc = { functions: [], includes: [], threads: [], events: [], seenProps: new Map() };
  let braceDepth = 0;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    // Brace depth — must be tracked first so other checks see the right depth.
    if (tok.type === TokenType.LEFT_BRACE) { braceDepth++; continue; }
    if (tok.type === TokenType.RIGHT_BRACE) { braceDepth = Math.max(0, braceDepth - 1); continue; }

    // Function definitions — only at top level.
    if (braceDepth === 0 && tok.type === TokenType.IDENTIFIER) {
      const fn = parseFunctionDef(tokens, i);
      if (fn) {
        acc.functions.push(fn.def);
        i = fn.nextIndex; // skip to opening brace so depth tracking stays correct
      }
      continue;
    }

    collectFromToken(tokens, i, sourceLines, acc);
  }

  return {
    functions: acc.functions,
    includes: acc.includes,
    threads: acc.threads,
    events: acc.events,
    props: Array.from(acc.seenProps.values()),
  };
}

/** Match a non-structural token against the include/thread/event/prop patterns. */
function collectFromToken(tokens: Token[], i: number, sourceLines: string[], acc: OutlineAcc): void {
  const tok = tokens[i];
  if (isIncludeDirective(tok)) {
    pushIf(acc.includes, parseInclude(tok, sourceLines));
  } else if (isKeyword(tok, "thread")) {
    pushIf(acc.threads, parseThread(tokens, i));
  } else if (isEventKeyword(tok)) {
    acc.events.push(parseEvent(tokens, i));
  } else if (isSharedStateKeyword(tok)) {
    recordProp(parsePropAssignment(tokens, i), acc.seenProps);
  }
}

/** Record a property assignment, keeping only the first occurrence per object.property. */
function recordProp(prop: PropAssignment | null, seen: Map<string, PropAssignment>): void {
  if (!prop) return;
  const key = `${prop.object}.${prop.property}`;
  if (!seen.has(key)) seen.set(key, prop);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format an OutlineResult as a human-readable text block.
 * Used by the gsc_outline MCP tool response.
 */
export function formatOutline(result: OutlineResult, source: string): string {
  const totalLines = source.split("\n").length;
  return [
    `📋 GSC Outline (${totalLines} lines)\n\n`,
    formatIncludes(result.includes),
    formatFunctions(result.functions),
    formatThreads(result.threads),
    formatEvents(result.events),
    formatProps(result.props),
  ].join("").trimEnd();
}

function formatIncludes(includes: IncludeDef[]): string {
  if (includes.length === 0) return "";
  let out = `📦 Includes (${includes.length}):\n`;
  for (const inc of includes) out += `  #include ${inc.path}\n`;
  return out + "\n";
}

function formatFunctions(functions: FunctionDef[]): string {
  if (functions.length === 0) return `🔧 Functions: none found\n\n`;
  const nameWidth = Math.max(...functions.map(f => f.name.length + f.params.join(", ").length + 2));
  let out = `🔧 Functions (${functions.length}):\n`;
  for (const fn of functions) {
    const sig = `${fn.name}(${fn.params.join(", ")})`;
    out += `  ${sig.padEnd(Math.min(nameWidth, 40))}  line ${fn.line}\n`;
  }
  return out + "\n";
}

function formatThreads(threads: ThreadCall[]): string {
  if (threads.length === 0) return "";
  const seen = new Set<string>();
  const unique = threads.filter(t => {
    if (seen.has(t.funcName)) return false;
    seen.add(t.funcName);
    return true;
  });
  let out = `🧵 Threads spawned (${threads.length} calls, ${unique.length} unique):\n`;
  for (const t of unique) {
    const prefix = t.entity ? `${t.entity} thread ` : "thread ";
    out += `  ${prefix}${t.funcName}()  line ${t.line}\n`;
  }
  return out + "\n";
}

function formatEvents(events: EventDef[]): string {
  if (events.length === 0) return "";
  let out = `📡 Events (${events.length}):\n`;
  for (const ev of events) {
    const eventLabel = ev.eventName ? `"${ev.eventName}"` : "(dynamic)";
    const entityLabel = ev.entity ? `${ev.entity} ` : "";
    out += `  ${ev.type.padEnd(12)}  ${entityLabel}${eventLabel}  line ${ev.line}\n`;
  }
  return out + "\n";
}

function formatProps(props: PropAssignment[]): string {
  if (props.length === 0) return "";
  let out = `🔑 Shared state (${props.length} unique properties, first assignment):\n`;
  const byObj: Record<string, PropAssignment[]> = {};
  for (const p of props) (byObj[p.object] ??= []).push(p);
  for (const obj of ["level", "self", "game"]) {
    if (!byObj[obj]) continue;
    for (const p of byObj[obj]) out += `  ${obj}.${p.property.padEnd(24)}  line ${p.line}\n`;
  }
  return out;
}
