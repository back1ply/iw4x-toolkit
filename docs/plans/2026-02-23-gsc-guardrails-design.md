# GSC Guardrails Stack — Design Document

**Date:** 2026-02-23
**Status:** Approved
**Goal:** Make it impossible for a clueless LLM to silently write broken IW4 GSC.

---

## Problem

Three failure modes occur equally in practice:
1. **Wrong syntax** — LLM uses JS/BO3 patterns (`function` keyword, `var`, `.push()`, ternary, etc.)
2. **Hallucinated APIs** — LLM calls functions that don't exist in IW4, or with wrong signatures
3. **Breaking existing files** — LLM deletes functions, breaks event chains, clobbers shared state

The existing tools (`gsc_lint`, `gsc_lookup`, `gsc_fix`, `gsc_outline`, `gsc-writer` skill) provide a foundation but leave gaps: only 15 lint rules, no IW4-specific pattern detection, no anti-pattern lookup, and the skill is written for an LLM that already understands the problem space.

---

## Out of Scope (Phase 2)

- Expanding `gsc-builtins.json` from Muhlex/gsc-doc (MIT). Source confirmed at https://github.com/Muhlex/gsc-doc — explicit IW4/IW4x coverage, 30+ categories. Defer to separate effort.

---

## Components

### 1. Linter — 15 new IW4-specific error rules

Implemented in `mcp-server/src/gsc/linter.ts`. All fire as **errors**, not warnings.

| Rule | Pattern detected | Reason |
|------|-----------------|--------|
| PAT-010 | `function <name>(` | BO3+ syntax, not IW4 |
| PAT-011 | `var `, `let `, `const ` | JS declarations, not valid |
| PAT-012 | `.push(`, `.pop(` | JS array methods; use `arr[arr.size] =` |
| PAT-013 | `.length` | JS property; use `.size` |
| PAT-014 | `===`, `!==` | JS strict equality; use `==`, `!=` |
| PAT-015 | `?` ternary | Not supported in IW4 GSC |
| PAT-016 | `=>` arrow | ES6 arrow functions, not valid |
| PAT-017 | `{ <key>:` object literal | Use `spawnstruct()` + property assignment |
| PAT-018 | `null` literal | Use `!isDefined(x)` or `undefined` checks |
| PAT-019 | `Math.`, `parseInt(`, `parseFloat(` | JS globals not in IW4 |
| PAT-020 | Backtick template literal | Not supported |
| PAT-021 | `new ` keyword | Not available in GSC |
| PAT-022 | `this.` | Not a concept in GSC |
| PAT-023 | `for...of`, `.forEach(` | Use indexed `for` loops |
| PAT-024 | `.concat(`, `.join(` | String methods not available |

Detection strategy: token-level pattern matching in the linter's `checkBadPatterns` pass. Most can be matched as token sequences or substring matches on token values.

### 2. `knowledge/gsc-anti-patterns.json`

~30 entries covering all seven categories.

**Schema:**
```json
{
  "id": "AP-001",
  "category": "syntax",
  "title": "No function keyword",
  "wrong": "function init() { }",
  "right": "init() { }",
  "explanation": "IW4 doesn't support the function keyword. Just write the name directly."
}
```

**Categories and planned entries:**
- `syntax` — function keyword, return type annotations, semicolons (5 entries)
- `arrays` — push/pop, .length, array creation (4 entries)
- `objects` — object literals, class syntax, spawnstruct usage (4 entries)
- `types` — null, undefined, typeof, boolean literals (4 entries)
- `loops` — for...of, forEach, while vs waittill (4 entries)
- `events` — event string syntax, waittill unpacking, endon usage (4 entries)
- `entities` — this keyword, entity method chaining, player property access (5 entries)

### 3. New MCP tool — `gsc_anti_patterns`

Registered in `mcp-server/src/gsc/tools.ts`.

**Input schema:**
```typescript
{
  query: z.string().describe("Search term (e.g. 'push', 'array', 'null check')"),
  category: z.string().optional().describe("Filter by category"),
  list: z.boolean().optional().default(false).describe("List all categories"),
}
```

**Behavior:**
- Loads `knowledge/gsc-anti-patterns.json` (cached like other knowledge files)
- Searches `title`, `wrong`, `right`, `explanation` fields for query term
- Returns matching wrong→right pairs with explanations
- `list=true` returns all category names and entry counts

**Tool description** (what the LLM sees):
> Search IW4 GSC anti-patterns. Call this BEFORE writing any code to check how to do something correctly in IW4. Returns wrong→right pairs with explanations for common JS/BO3 patterns that break in IW4.

### 4. New templates (7 additions to `knowledge/templates.json`)

| Key | Description |
|-----|-------------|
| `player_death` | Player death callback with killer/weapon info |
| `player_damage` | Player damage modifier (return modified damage) |
| `chat_handler` | Chat command loop with `waittill("say", ...)` |
| `round_start_end` | Round state callbacks via `waittill("game_ended")` |
| `timer_system` | Countdown timer using `wait` in a thread |
| `hud_element` | HUD text element creation and update |
| `player_score` | Score/stat tracking via `self.score` |

### 5. Skill hardening — `skills/gsc-writer/SKILL.md` rewrite

Key changes from current version:
- **Pre-flight checklist** before writing ANY function: look up name with `gsc_lookup`, check pattern with `gsc_anti_patterns`
- **"ALWAYS"** instead of "if unfamiliar" — mandatory lookups, not optional
- **`gsc_outline` in workflow** — must run on existing file before editing
- **Exhaustive NEVER table** — every rule from the 15 lint checks, inline code examples
- **Aggressive tone** — "your linter WILL catch this", "do not guess"
- **Entity reference inline** — compact table of `self.*`, `level.*`, `game.*` common fields

---

## File changes

| File | Change |
|------|--------|
| `mcp-server/src/gsc/linter.ts` | Add PAT-010–PAT-024 detection |
| `mcp-server/src/gsc/tools.ts` | Register `gsc_anti_patterns` tool |
| `mcp-server/src/gsc/tools.test.ts` | Tests for `gsc_anti_patterns` |
| `knowledge/gsc-anti-patterns.json` | New file, ~30 entries |
| `knowledge/templates.json` | Add 7 new templates |
| `skills/gsc-writer/SKILL.md` | Full rewrite |
| `docs/LINTER_ERRORS.md` | Document PAT-010–PAT-024 |
| `mcp-server/dist/index.js` | Rebuild after changes |

---

## Success criteria

- `gsc_lint` catches all 15 JS/BO3 patterns as errors
- `gsc_anti_patterns` returns relevant wrong→right pairs for any common mistake query
- A new template exists for each of the 7 common patterns
- The gsc-writer skill explicitly requires `gsc_anti_patterns` in its workflow
- All new lint rules have test coverage
- Build clean, all tests pass
