# GSC Formatter — Design Spec
*Date: 2026-03-19*

## Summary

Add a `gsc_format` MCP tool that formats GSC source code using the existing tokenizer.
Implemented as a standalone `formatter.ts` module operating on token streams.
Tree-sitter upgrade path preserved for future linter/formatter consolidation.

---

## Context

- `gsc/tokenizer.ts` already produces a `Token[]` stream (MIT, adapted from Muhlex/vscode-gsc)
- `gsc_format` was listed as done in TODO but was never implemented
- `dvar_search` was also listed as undone but was already implemented — TODO updated

### Why not tree-sitter now?

Researched existing GSC parsers:
- **xensik/gsc-tool** (C++, GPL-3) — definitive IW4x AST reference, 80+ node types
- **echo000/tree-sitter-gsc** (grammar.js, GPL-3) — full Tree-sitter grammar for BO3 GSC (close to IW4x), has Node.js bindings

Tree-sitter is the right long-term investment but requires native C bindings, adding install complexity.
The token-stream formatter covers 90%+ of real-world formatting needs for an LLM tool.
**Decision:** build token-stream formatter now, upgrade to tree-sitter when Phase 2C (menu validator) and `gsc_lint_pro` need it — build it once, share across all tools.

---

## Architecture

```
tokenizer.ts  →  Token[]
                    ↓
formatter.ts  →  format(tokens, options?) → string
                    ↓
tools.ts      →  gsc_format MCP tool (wraps tokenize + format)
```

### New file: `mcp-server/src/gsc/formatter.ts`

Pure function, no I/O:

```typescript
export interface FormatOptions {
  indentSize?: number;   // default: 4
  braceStyle?: "k&r";   // reserved for future styles, only "k&r" supported
}

export function format(tokens: Token[], opts?: FormatOptions): string
```

No side effects. Independently testable. Easy to replace internals with tree-sitter later.

---

## Formatting Rules

Walk `Token[]` left-to-right with 1-token lookahead/lookbehind.

### Indentation
- Level increments after `{`, decrements before `}`
- Each line starts with `indentSize * level` spaces (default: 4 spaces)
- Empty lines get no indentation

### Spacing
- Space after control keywords: `if`, `else`, `for`, `while`, `switch`, `foreach`, `do`
- Space before `{` (K&R style: `if (x) {` not `if (x){`)
- Space around binary operators: `=`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `+=`, `-=`, `*=`, `/=`, `+`, `-`, `*`, `/`, `%`, `&&`, `||`
- Unary `-`/`!` detected by previous token context (operator, `(`, or start of line) — no space inserted
- Space after `,` but not before
- No space between function name and `(`: `myFunc()` not `myFunc ()`
- `::` operator (function pointers): no spaces — `maps::myFunc`
- `[[ ]]` (function pointer call): preserved as-is, no reformatting

### Blank Lines
- One blank line between top-level function definitions
- Multiple consecutive blank lines → collapsed to one

### Comments
- `//` line comments: preserved exactly, re-indented to current level
- `/* */` block comments: preserved exactly

### Trailing Whitespace
- Stripped from every line

---

## MCP Tool: `gsc_format`

### Input Schema

| Parameter   | Type    | Required | Description |
|-------------|---------|----------|-------------|
| `code`      | string  | either/or | Raw GSC source to format |
| `iwd_path`  | string  | either/or | Path to .iwd archive |
| `entry`     | string  | with iwd_path | Entry path within IWD (e.g. `maps/mp/gametypes/_mymod.gsc`) |
| `write_back`| boolean | no       | Write formatted result back to IWD (default: false) |
| `dry_run`   | boolean | no       | Preview diff without writing when write_back=true |

**Validation:** either `code` OR (`iwd_path` + `entry`) must be provided.

### Output
- Formatted GSC source string
- When replacing IWD content: `±3-line diff snippet` (consistent with `iwd_patch`/`iwd_write`)
- When tokenizer errors exist: returns them as warnings alongside best-effort formatted output

---

## Testing

In `mcp-server/src/gsc/gsc.test.ts` (existing test file):

| Test case | What it verifies |
|-----------|-----------------|
| Minified one-liner | Expands to multi-line with correct indentation |
| Already-clean code | Idempotent — format(format(x)) === format(x) |
| Nested blocks | Correct indent level at each depth |
| Comments preserved | `//` and `/* */` survive formatting unchanged |
| Unary vs binary minus | `x = -1` (unary) vs `x = a - b` (binary) |
| Function pointer syntax | `[[ func ]]()` preserved untouched |
| Multiple blank lines | Collapsed to one |
| Top-level functions | Blank line inserted between them |

---

## Future: Tree-sitter Upgrade Path

When Phase 2C (Menu File Validator) and `gsc_lint_pro` are built:

1. Add `tree-sitter` + `node-tree-sitter` as dependencies
2. Adapt `echo000/tree-sitter-gsc` grammar to IW4x dialect (remove classes, adjust preprocessor)
3. Replace `formatter.ts` internals with CST walker — public API (`format()`) stays the same
4. Reuse the same tree-sitter parse tree for linter, formatter, call graph, and menu validator

**Reference grammars:**
- IW4x AST node types: https://github.com/xensik/gsc-tool (ast.hpp)
- Tree-sitter grammar base: https://github.com/echo000/tree-sitter-gsc (grammar.js)
