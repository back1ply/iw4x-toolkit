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

import { tokenize, TokenType } from "./tokenizer.js";

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
// Outline
// ---------------------------------------------------------------------------

/**
 * Parse GSC source and return a structural outline.
 * Tolerates syntax errors — best-effort on malformed code.
 */
export function outline(source: string): OutlineResult {
  const { tokens } = tokenize(source);
  const sourceLines = source.split("\n");
  const len = tokens.length;

  const functions: FunctionDef[] = [];
  const includes: IncludeDef[] = [];
  const threads: ThreadCall[] = [];
  const events: EventDef[] = [];
  const seenProps = new Map<string, PropAssignment>();

  let braceDepth = 0;

  /**
   * Returns the index of the next token that isn't a comment,
   * starting at `from`. Returns -1 if none found before EOF.
   */
  function nextOf(from: number): number {
    for (let k = from; k < len; k++) {
      const t = tokens[k];
      if (
        t.type !== TokenType.COMMENT &&
        t.type !== TokenType.BLOCK_COMMENT &&
        t.type !== TokenType.EOF
      ) {
        return k;
      }
    }
    return -1;
  }

  for (let i = 0; i < len; i++) {
    const tok = tokens[i];

    // -----------------------------------------------------------------------
    // Brace depth — must be first so all other checks see the right depth
    // -----------------------------------------------------------------------
    if (tok.type === TokenType.LEFT_BRACE) {
      braceDepth++;
      continue;
    }
    if (tok.type === TokenType.RIGHT_BRACE) {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }

    // -----------------------------------------------------------------------
    // Function definitions — only at top level (depth 0)
    // Pattern: IDENTIFIER LEFT_PAREN [params] RIGHT_PAREN LEFT_BRACE
    // -----------------------------------------------------------------------
    if (braceDepth === 0 && tok.type === TokenType.IDENTIFIER) {
      const parenIdx = nextOf(i + 1);
      if (parenIdx === -1 || tokens[parenIdx].type !== TokenType.LEFT_PAREN) continue;

      // Collect parameter identifiers between the parens
      const params: string[] = [];
      let j = parenIdx + 1;
      let depth = 1;
      while (j < len && depth > 0) {
        const t = tokens[j];
        if (t.type === TokenType.LEFT_PAREN) depth++;
        else if (t.type === TokenType.RIGHT_PAREN) {
          depth--;
          if (depth === 0) break;
        } else if (depth === 1 && t.type === TokenType.IDENTIFIER) {
          params.push(t.value);
        }
        j++;
      }
      // j is now on the closing RIGHT_PAREN
      const braceIdx = nextOf(j + 1);
      if (braceIdx !== -1 && tokens[braceIdx].type === TokenType.LEFT_BRACE) {
        functions.push({ name: tok.value, params, line: tok.line });
        // Advance past the opening brace so the main loop tracks depth correctly
        i = braceIdx - 1; // loop will increment to braceIdx
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // #include / #using directives
    // The preprocessor scanner consumes the full line; recover path from source
    // -----------------------------------------------------------------------
    if (
      tok.type === TokenType.HASH &&
      (tok.value === "include" || tok.value.startsWith("using"))
    ) {
      const lineIdx = tok.line - 1;
      if (lineIdx >= 0 && lineIdx < sourceLines.length) {
        const lineText = sourceLines[lineIdx];
        const m = lineText.match(/#\w+\s+(.+?)(?:\s*;.*)?$/);
        if (m) {
          includes.push({ path: m[1].trim(), line: tok.line });
        }
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // Thread calls — [entity] thread funcName(args)
    // -----------------------------------------------------------------------
    if (tok.type === TokenType.KEYWORD && tok.value === "thread") {
      // Entity is the immediately preceding token (if it looks like one)
      let entity: string | null = null;
      if (i > 0) {
        const prev = tokens[i - 1];
        if (
          prev.type === TokenType.IDENTIFIER ||
          (prev.type === TokenType.KEYWORD &&
            ["level", "self", "game", "player"].includes(prev.value))
        ) {
          entity = prev.value;
        }
      }

      // Collect function name tokens until LEFT_PAREN or SEMICOLON
      const nxt = nextOf(i + 1);
      if (nxt !== -1) {
        let funcName = "";
        let j = nxt;
        while (
          j < len &&
          tokens[j].type !== TokenType.LEFT_PAREN &&
          tokens[j].type !== TokenType.SEMICOLON &&
          tokens[j].type !== TokenType.EOF
        ) {
          funcName += tokens[j].value;
          j++;
        }
        funcName = funcName.trim();
        if (funcName) {
          threads.push({ funcName, entity, line: tok.line });
        }
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // Event listeners — [entity] waittill|notify|endon|waittillmatch ("name")
    // -----------------------------------------------------------------------
    if (
      tok.type === TokenType.KEYWORD &&
      (tok.value === "waittill" ||
        tok.value === "notify" ||
        tok.value === "endon" ||
        tok.value === "waittillmatch")
    ) {
      let entity: string | null = null;
      if (i > 0) {
        const prev = tokens[i - 1];
        if (
          prev.type === TokenType.IDENTIFIER ||
          (prev.type === TokenType.KEYWORD &&
            ["level", "self", "game", "player"].includes(prev.value))
        ) {
          entity = prev.value;
        }
      }

      let eventName: string | null = null;
      const nxt = nextOf(i + 1);
      if (nxt !== -1 && tokens[nxt].type === TokenType.LEFT_PAREN) {
        const argIdx = nextOf(nxt + 1);
        if (argIdx !== -1 && tokens[argIdx].type === TokenType.STRING) {
          eventName = tokens[argIdx].value;
        }
      }

      events.push({
        type: tok.value as EventDef["type"],
        entity,
        eventName,
        line: tok.line,
      });
      continue;
    }

    // -----------------------------------------------------------------------
    // Property assignments — level.x = ..., self.x = ..., game.x = ...
    // Deduplicated: only first occurrence per property is kept.
    // -----------------------------------------------------------------------
    if (
      tok.type === TokenType.KEYWORD &&
      (tok.value === "level" || tok.value === "self" || tok.value === "game")
    ) {
      const dotIdx = nextOf(i + 1);
      if (dotIdx === -1 || tokens[dotIdx].type !== TokenType.DOT) continue;

      const propIdx = nextOf(dotIdx + 1);
      if (propIdx === -1 || tokens[propIdx].type !== TokenType.IDENTIFIER) continue;

      const eqIdx = nextOf(propIdx + 1);
      // TokenType.EQUAL is plain `=`; EQUAL_EQUAL is `==` — we only want assignment
      if (eqIdx !== -1 && tokens[eqIdx].type === TokenType.EQUAL) {
        const key = `${tok.value}.${tokens[propIdx].value}`;
        if (!seenProps.has(key)) {
          seenProps.set(key, {
            object: tok.value,
            property: tokens[propIdx].value,
            line: tok.line,
          });
        }
      }
    }
  }

  return {
    functions,
    includes,
    threads,
    events,
    props: Array.from(seenProps.values()),
  };
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
  let out = `📋 GSC Outline (${totalLines} lines)\n\n`;

  // Includes
  if (result.includes.length > 0) {
    out += `📦 Includes (${result.includes.length}):\n`;
    for (const inc of result.includes) {
      out += `  #include ${inc.path}\n`;
    }
    out += "\n";
  }

  // Functions
  if (result.functions.length > 0) {
    out += `🔧 Functions (${result.functions.length}):\n`;
    const nameWidth = Math.max(...result.functions.map(f => f.name.length + f.params.join(", ").length + 2));
    for (const fn of result.functions) {
      const sig = `${fn.name}(${fn.params.join(", ")})`;
      out += `  ${sig.padEnd(Math.min(nameWidth, 40))}  line ${fn.line}\n`;
    }
    out += "\n";
  } else {
    out += `🔧 Functions: none found\n\n`;
  }

  // Threads
  if (result.threads.length > 0) {
    // Deduplicate by funcName for conciseness
    const seen = new Set<string>();
    const unique = result.threads.filter(t => {
      if (seen.has(t.funcName)) return false;
      seen.add(t.funcName);
      return true;
    });
    out += `🧵 Threads spawned (${result.threads.length} calls, ${unique.length} unique):\n`;
    for (const t of unique) {
      const prefix = t.entity ? `${t.entity} thread ` : "thread ";
      out += `  ${prefix}${t.funcName}()  line ${t.line}\n`;
    }
    out += "\n";
  }

  // Events
  if (result.events.length > 0) {
    out += `📡 Events (${result.events.length}):\n`;
    for (const ev of result.events) {
      const eventLabel = ev.eventName ? `"${ev.eventName}"` : "(dynamic)";
      const entityLabel = ev.entity ? `${ev.entity} ` : "";
      out += `  ${ev.type.padEnd(12)}  ${entityLabel}${eventLabel}  line ${ev.line}\n`;
    }
    out += "\n";
  }

  // Props
  if (result.props.length > 0) {
    out += `🔑 Shared state (${result.props.length} unique properties, first assignment):\n`;
    // Group by object
    const byObj: Record<string, PropAssignment[]> = {};
    for (const p of result.props) {
      (byObj[p.object] ??= []).push(p);
    }
    for (const obj of ["level", "self", "game"]) {
      if (!byObj[obj]) continue;
      for (const p of byObj[obj]) {
        out += `  ${obj}.${p.property.padEnd(24)}  line ${p.line}\n`;
      }
    }
  }

  return out.trimEnd();
}
