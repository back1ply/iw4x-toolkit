# GSC Formatter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `gsc_format` — a GSC source code formatter exposed as an MCP tool, backed by a standalone `formatter.ts` module operating on token streams.

**Architecture:** `formatter.ts` exports a pure `format(tokens, opts?)` function (no I/O). `gsc/tools.ts` wraps it in a `gsc_format` MCP tool that accepts raw code strings or IWD path+entry, with optional `write_back` support. Tests live in the existing `gsc/gsc.test.ts`.

**Tech Stack:** TypeScript, Vitest, existing `GSCTokenizer` from `gsc/tokenizer.ts`, `openIwd`/`buildDiffSnippet`/`errResult`/`okResult` from `utils.ts`

**Spec:** `docs/superpowers/specs/2026-03-19-gsc-formatter-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `mcp-server/src/gsc/formatter.ts` | Pure `format()` function — all formatting logic |
| Modify | `mcp-server/src/gsc/gsc.test.ts` | Add `describe("GSCFormatter", ...)` block |
| Modify | `mcp-server/src/gsc/tools.ts` | Add `gsc_format` tool registration + imports |

`index.ts` does NOT need to change — it already calls `registerGscTools(server)`.

---

## Key facts before starting

- **Test command:** `cd mcp-server && npm test` (vitest run)
- **Build command:** `cd mcp-server && npm run build` (esbuild)
- **`openIwd` is synchronous** — do NOT use `await`. Signature: `openIwd(path: string): Result<AdmZip>` where `Result<T>` is `T | { error: string }`.
- **`buildDiffSnippet`** signature: `buildDiffSnippet(original, patched, ctx?, hintLine?)` → returns `{ snippet: string; changedLine: number }`. Use `.snippet` for output. Default `ctx=3`.
- **`::` in tokenizer** — there is no `COLON_COLON` token. Two consecutive `COLON` tokens represent `::` (function path separator like `maps::myFunc`). Handle by suppressing space between adjacent COLONs.
- **`tokenize` is already imported** in `gsc.test.ts` — the new describe block can use it directly.
- **`tools.ts` currently imports** from `../utils.js`: `getKnowledgeDir, openIwd` — need to add `errResult, okResult, buildDiffSnippet`.
- **Registration API:** use `server.registerTool(...)` — consistent with existing tools in this file.
- **All git commits** run from repo root (`F:/Shehab Projects/iw4x-toolkit`), not from `mcp-server/`.

---

## Task 1: Formatter skeleton + FormatOptions type

**Files:**
- Create: `mcp-server/src/gsc/formatter.ts`
- Modify: `mcp-server/src/gsc/gsc.test.ts`

- [ ] **Step 1: Add failing tests**

In `gsc/gsc.test.ts`, add at the bottom (after existing `describe` blocks). `tokenize` is already imported:

```typescript
import { format } from "./formatter.js";

describe("GSCFormatter", () => {
  it("returns empty string for empty input", () => {
    const { tokens } = tokenize("");
    expect(format(tokens)).toBe("");
  });

  it("preserves a single identifier", () => {
    const { tokens } = tokenize("myVar");
    expect(format(tokens).trim()).toBe("myVar");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module './formatter.js'`

- [ ] **Step 3: Create `mcp-server/src/gsc/formatter.ts` with skeleton**

```typescript
/**
 * @file gsc/formatter.ts
 * GSC source code formatter operating on a Token[] stream.
 *
 * Pure function — no I/O. Feed it tokens from GSCTokenizer, get formatted source back.
 * Future: replace internals with tree-sitter CST walker (see design spec).
 */

import { Token, TokenType } from "./tokenizer.js";

export interface FormatOptions {
  /** Number of spaces per indent level. Default: 4 */
  indentSize?: number;
  /** Brace style. Only "k&r" supported for now. Reserved for future styles. */
  braceStyle?: "k&r";
}

/**
 * Format a GSC token stream into a consistently styled source string.
 * Rules: 4-space indent, K&R braces, spaces around binary operators,
 * blank line between top-level functions, trailing whitespace stripped.
 */
export function format(tokens: Token[], opts?: FormatOptions): string {
  const indentSize = opts?.indentSize ?? 4;
  void indentSize; // used in full implementation

  // Filter out EOF token
  const toks = tokens.filter(t => t.type !== TokenType.EOF);
  if (toks.length === 0) return "";

  // Placeholder: join token values for now
  return toks.map(t => t.value).join(" ");
}
```

- [ ] **Step 4: Run tests to verify skeleton passes**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: both new tests PASS

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/gsc/formatter.ts mcp-server/src/gsc/gsc.test.ts
git commit -m "feat: add gsc/formatter.ts skeleton + initial tests"
```

---

## Task 2: Indentation engine

**Files:**
- Modify: `mcp-server/src/gsc/formatter.ts`
- Modify: `mcp-server/src/gsc/gsc.test.ts`

- [ ] **Step 1: Add failing indentation tests**

Add to the `GSCFormatter` describe block:

```typescript
it("indents a simple function body", () => {
  const src = `myFunc() { return 1; }`;
  const { tokens } = tokenize(src);
  const out = format(tokens);
  expect(out).toBe(`myFunc() {\n    return 1;\n}`);
});

it("indents nested blocks", () => {
  const src = `outer() { if (x) { doThing(); } }`;
  const { tokens } = tokenize(src);
  const out = format(tokens);
  expect(out).toContain("    if");
  expect(out).toContain("        doThing");
});

it("indentSize option controls indent width", () => {
  const src = `f() { x = 1; }`;
  const { tokens } = tokenize(src);
  const out = format(tokens, { indentSize: 2 });
  expect(out).toBe(`f() {\n  x = 1;\n}`);
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|✗|indents|indentSize" | head -20
```

Expected: FAIL on all 3 new tests

- [ ] **Step 3: Implement the line-building engine in `formatter.ts`**

Replace the `format` function body with:

```typescript
export function format(tokens: Token[], opts?: FormatOptions): string {
  const indentSize = opts?.indentSize ?? 4;
  const toks = tokens.filter(t => t.type !== TokenType.EOF);
  if (toks.length === 0) return "";

  const lines: string[] = [];
  let currentLine: string[] = [];
  let indentLevel = 0;

  const flushLine = () => {
    const content = currentLine.join("").trimEnd();
    lines.push(content.length > 0 ? " ".repeat(indentSize * indentLevel) + content : "");
    currentLine = [];
  };

  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];

    // Newlines — flush current line
    if (tok.type === TokenType.NEWLINE) {
      flushLine();
      continue;
    }

    // Opening brace — K&R: stays on same line, content after goes to next line
    if (tok.type === TokenType.LEFT_BRACE) {
      if (currentLine.length > 0 && !currentLine[currentLine.length - 1].endsWith(" ")) {
        currentLine.push(" ");
      }
      currentLine.push("{");
      flushLine();
      indentLevel++;
      continue;
    }

    // Closing brace — dedent before placing }
    if (tok.type === TokenType.RIGHT_BRACE) {
      flushLine();
      indentLevel = Math.max(0, indentLevel - 1);
      currentLine.push("}");
      flushLine();
      continue;
    }

    // Semicolon — end of statement, flush line
    if (tok.type === TokenType.SEMICOLON) {
      currentLine.push(";");
      flushLine();
      continue;
    }

    currentLine.push(tok.value);
  }

  // Flush remaining content
  if (currentLine.length > 0) flushLine();

  // Strip trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|PASS|✓|✗" | head -30
```

Expected: indentation tests PASS. Fix any regressions in earlier tests.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/gsc/formatter.ts mcp-server/src/gsc/gsc.test.ts
git commit -m "feat: gsc formatter — indentation engine (brace-depth tracking)"
```

---

## Task 3: Spacing rules

**Files:**
- Modify: `mcp-server/src/gsc/formatter.ts`
- Modify: `mcp-server/src/gsc/gsc.test.ts`

- [ ] **Step 1: Add failing spacing tests**

```typescript
it("adds space after control keywords", () => {
  const { tokens } = tokenize(`if(x){}`);
  expect(format(tokens)).toContain("if (x)");
});

it("adds space around binary operators", () => {
  const { tokens } = tokenize(`x=1+2;`);
  const out = format(tokens);
  expect(out).toContain("x = 1 + 2");
});

it("does not add space for unary minus", () => {
  const { tokens } = tokenize(`x = -1;`);
  const out = format(tokens);
  expect(out).toContain("x = -1");
  expect(out).not.toContain("x = - 1");
});

it("adds space after comma but not before", () => {
  const { tokens } = tokenize(`f(a,b,c);`);
  expect(format(tokens)).toContain("f(a, b, c)");
});

it("no space between function name and paren", () => {
  const { tokens } = tokenize(`myFunc ();`);
  expect(format(tokens)).toContain("myFunc()");
});

it("no space around :: path separator", () => {
  const { tokens } = tokenize(`maps::myFunc();`);
  // Two consecutive COLON tokens — no spaces between them or around them
  expect(format(tokens)).toContain("maps::myFunc");
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|✗|space|comma|unary|paren|colon" | head -20
```

- [ ] **Step 3: Add helpers and spacing logic to `formatter.ts`**

Add these constants and helpers above the `format` function:

```typescript
const CONTROL_KEYWORDS = new Set([
  "if", "else", "for", "while", "switch", "foreach", "do",
]);

const BINARY_OP_TYPES = new Set<TokenType>([
  TokenType.EQUAL, TokenType.EQUAL_EQUAL, TokenType.BANG_EQUAL,
  TokenType.LESS, TokenType.GREATER, TokenType.LESS_EQUAL, TokenType.GREATER_EQUAL,
  TokenType.PLUS, TokenType.MINUS, TokenType.STAR, TokenType.SLASH, TokenType.PERCENT,
  TokenType.AMPERSAND_AMPERSAND, TokenType.PIPE_PIPE,
  TokenType.PLUS_EQUAL, TokenType.MINUS_EQUAL, TokenType.STAR_EQUAL, TokenType.SLASH_EQUAL,
]);

/** True when the previous token position suggests a unary operator (not binary). */
function isUnaryContext(prev: Token | null): boolean {
  if (!prev) return true;
  return [
    TokenType.LEFT_PAREN, TokenType.LEFT_BRACKET,
    TokenType.EQUAL, TokenType.PLUS_EQUAL, TokenType.MINUS_EQUAL,
    TokenType.STAR_EQUAL, TokenType.SLASH_EQUAL,
    TokenType.COMMA, TokenType.SEMICOLON,
    TokenType.EQUAL_EQUAL, TokenType.BANG_EQUAL,
    TokenType.LESS, TokenType.GREATER, TokenType.LESS_EQUAL, TokenType.GREATER_EQUAL,
    TokenType.AMPERSAND_AMPERSAND, TokenType.PIPE_PIPE,
    TokenType.BANG,
  ].includes(prev.type as TokenType);
}

/**
 * Returns true if a space should be inserted before `tok` given the previous token `prev`.
 */
function needsSpaceBefore(tok: Token, prev: Token | null): boolean {
  if (!prev) return false;

  // Never space after open paren/bracket or before close paren/bracket
  if (prev.type === TokenType.LEFT_PAREN || prev.type === TokenType.LEFT_BRACKET) return false;
  if (tok.type === TokenType.RIGHT_PAREN || tok.type === TokenType.RIGHT_BRACKET) return false;

  // Never space before comma or semicolon
  if (tok.type === TokenType.COMMA || tok.type === TokenType.SEMICOLON) return false;

  // Never space around dot
  if (tok.type === TokenType.DOT || prev.type === TokenType.DOT) return false;

  // Never space around :: (two consecutive COLON tokens)
  if (tok.type === TokenType.COLON || prev.type === TokenType.COLON) return false;

  // No space between function name/identifier and opening paren
  if (tok.type === TokenType.LEFT_PAREN && prev.type === TokenType.IDENTIFIER) return false;

  // Space after comma
  if (prev.type === TokenType.COMMA) return true;

  // Space around binary operators — but detect unary minus/plus
  if (BINARY_OP_TYPES.has(tok.type)) {
    if ((tok.type === TokenType.MINUS || tok.type === TokenType.PLUS) && isUnaryContext(prev)) {
      return false;
    }
    return true;
  }
  if (BINARY_OP_TYPES.has(prev.type)) return true;

  // Space after control keywords before (
  if (
    prev.type === TokenType.KEYWORD &&
    CONTROL_KEYWORDS.has(prev.value) &&
    tok.type === TokenType.LEFT_PAREN
  ) return true;

  return false;
}
```

In the main `format` loop, before pushing any generic token value, track `lastNonNewlineTok` and call `needsSpaceBefore`:

```typescript
let lastNonNewlineTok: Token | null = null;

// Inside the loop, before the final `currentLine.push(tok.value)`:
if (needsSpaceBefore(tok, lastNonNewlineTok) && currentLine.length > 0) {
  currentLine.push(" ");
}
currentLine.push(tok.value);
lastNonNewlineTok = tok;
```

Also update `lastNonNewlineTok` in the `LEFT_BRACE`, `RIGHT_BRACE`, `SEMICOLON` branches after pushing.

- [ ] **Step 4: Run tests**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|PASS|✓|✗" | head -40
```

Expected: all spacing tests PASS. Fix any regressions.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/gsc/formatter.ts mcp-server/src/gsc/gsc.test.ts
git commit -m "feat: gsc formatter — spacing rules (keywords, binary ops, unary, commas, ::)"
```

---

## Task 4: Blank line normalization + function separator

**Files:**
- Modify: `mcp-server/src/gsc/formatter.ts`
- Modify: `mcp-server/src/gsc/gsc.test.ts`

- [ ] **Step 1: Add failing tests**

```typescript
it("collapses multiple blank lines into one", () => {
  const src = `x = 1;\n\n\n\ny = 2;`;
  const { tokens } = tokenize(src);
  const out = format(tokens);
  expect(out).not.toMatch(/\n{3,}/);
});

it("inserts blank line between top-level functions", () => {
  const src = `foo() { return 1; }\nbar() { return 2; }`;
  const { tokens } = tokenize(src);
  const out = format(tokens);
  // A blank line between the closing } of foo and the start of bar
  expect(out).toMatch(/\}\n\n\w/);
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | grep -E "blank|function separator|collapses" | head -10
```

- [ ] **Step 3: Add post-processing pass after the main loop**

After building `lines[]` and before `return lines.join("\n")`, add:

```typescript
// Post-process: collapse consecutive blank lines, insert blank between top-level functions
const processed: string[] = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const prevLine = processed[processed.length - 1];

  // Collapse multiple blank lines → max one
  if (line.trim() === "" && (prevLine === undefined || prevLine.trim() === "")) continue;

  // Insert blank line after a top-level closing } if next line starts a new function
  if (prevLine === "}" && line.trim() !== "" && !line.trim().startsWith("}")) {
    processed.push("");
  }

  processed.push(line);
}

// Strip trailing empty lines from processed
while (processed.length > 0 && processed[processed.length - 1].trim() === "") {
  processed.pop();
}

return processed.join("\n");
```

Remove the earlier trailing-blank-line strip from the `lines` array (it's now handled in post-processing).

- [ ] **Step 4: Run tests**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|PASS|✓|✗" | head -40
```

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/gsc/formatter.ts mcp-server/src/gsc/gsc.test.ts
git commit -m "feat: gsc formatter — blank line normalization + top-level function separator"
```

---

## Task 5: Comment preservation + edge cases

**Files:**
- Modify: `mcp-server/src/gsc/formatter.ts`
- Modify: `mcp-server/src/gsc/gsc.test.ts`

- [ ] **Step 1: Add failing tests**

```typescript
it("preserves line comments", () => {
  const src = `// my comment\nx = 1;`;
  const { tokens } = tokenize(src);
  const out = format(tokens);
  expect(out).toContain("// my comment");
});

it("preserves block comments", () => {
  const src = `/* block comment */\nx = 1;`;
  const { tokens } = tokenize(src);
  const out = format(tokens);
  expect(out).toContain("/* block comment */");
});

it("preserves [[ ]] function pointer syntax", () => {
  const src = `[[ func ]](args);`;
  const { tokens } = tokenize(src);
  const out = format(tokens);
  expect(out).toContain("[[");
  expect(out).toContain("]]");
});

it("is idempotent — format(format(x)) === format(x)", () => {
  // Covers: nested blocks, binary ops, unary, ::, [[ ]]
  const src = `foo(){x=1+2;if(y){maps::bar();}}`;
  const { tokens: t1 } = tokenize(src);
  const once = format(t1);
  const { tokens: t2 } = tokenize(once);
  const twice = format(t2);
  expect(twice).toBe(once);
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | grep -E "comment|pointer|idempotent" | head -10
```

- [ ] **Step 3: Handle COMMENT and BLOCK_COMMENT token types in the main loop**

Add before the general token handling (after the SEMICOLON branch):

```typescript
if (tok.type === TokenType.COMMENT) {
  // Inline comment: preserve with a space before if on same line as code
  if (currentLine.length > 0) currentLine.push(" ");
  currentLine.push(tok.value);
  flushLine();
  lastNonNewlineTok = tok;
  continue;
}

if (tok.type === TokenType.BLOCK_COMMENT) {
  if (currentLine.length > 0) flushLine();
  currentLine.push(tok.value);
  flushLine();
  lastNonNewlineTok = tok;
  continue;
}
```

For `[[`/`]]`: consecutive `LEFT_BRACKET LEFT_BRACKET` tokens. The `needsSpaceBefore` function already suppresses space after `LEFT_BRACKET`, so no space is added inside `[[`. Verify the test passes — if `[[` still gets spaces, add `LEFT_BRACKET` to the no-space-before-LEFT_BRACKET rule.

- [ ] **Step 4: Run full test suite**

```bash
cd mcp-server && npm test -- --reporter=verbose 2>&1 | tail -30
```

Expected: ALL tests pass including idempotency. If idempotency fails, `console.log(once)` vs `console.log(twice)` to spot the diff, then fix the relevant spacing rule.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/gsc/formatter.ts mcp-server/src/gsc/gsc.test.ts
git commit -m "feat: gsc formatter — comment preservation, [[ ]] passthrough, idempotency verified"
```

---

## Task 6: `gsc_format` MCP tool

**Files:**
- Modify: `mcp-server/src/gsc/tools.ts`

- [ ] **Step 1: Update imports in `tools.ts`**

The current import from `../utils.js` is:
```typescript
import { getKnowledgeDir, openIwd } from "../utils.js";
```

Change to:
```typescript
import { getKnowledgeDir, openIwd, errResult, okResult, buildDiffSnippet } from "../utils.js";
```

Also add the formatter import after the existing gsc imports:
```typescript
import { format } from "./formatter.js";
```

- [ ] **Step 2: Add `gsc_format` tool registration in `registerGscTools`**

Add at the end of `registerGscTools(server)`, before the closing `}`:

```typescript
server.registerTool(
  "gsc_format",
  {
    title: "Format GSC Source Code",
    description:
      "Format GSC source code with consistent 4-space indentation, K&R brace style, " +
      "and proper operator spacing. Accepts raw code or an IWD path+entry. " +
      "Use write_back=true to save the formatted result back to the IWD.",
    inputSchema: {
      code: z.string().optional().describe("Raw GSC source code to format"),
      iwd_path: z.string().optional().describe("Absolute path to the .iwd archive"),
      entry: z.string().optional().describe(
        "Entry path within the IWD (e.g. maps/mp/gametypes/_mymod.gsc)"
      ),
      write_back: z.boolean().optional().describe(
        "Write formatted result back to IWD entry (default: false)"
      ),
      dry_run: z.boolean().optional().describe(
        "Preview diff without writing when write_back=true (default: false)"
      ),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
    },
  },
  async ({ code, iwd_path, entry, write_back, dry_run }) => {
    // Validate: need code OR (iwd_path + entry)
    if (!code && !(iwd_path && entry)) {
      return errResult("Provide either 'code', or both 'iwd_path' and 'entry'.");
    }

    let source: string;

    if (code) {
      source = code;
    } else {
      // Read from IWD (openIwd is synchronous, returns Result<AdmZip>)
      const iwdResult = openIwd(iwd_path!);
      if (!iwdResult.ok) return errResult(iwdResult.error);
      const zip = iwdResult.value; // AdmZip instance
      const fileEntry = zip.getEntry(entry!);
      if (!fileEntry) return errResult(`Entry not found: ${entry}`);
      source = fileEntry.getData().toString("utf-8");
    }

    // Tokenize and format
    const { tokens, errors: tokErrors } = tokenize(source);
    const formatted = format(tokens);

    // Write back to IWD if requested
    if (write_back && iwd_path && entry) {
      const iwdResult2 = openIwd(iwd_path);
      if (!iwdResult2.ok) return errResult(iwdResult2.error);
      const zipToWrite = iwdResult2.value;
      if (dry_run) {
        const { snippet } = buildDiffSnippet(source, formatted);
        return okResult(`[dry_run] Would write formatted ${entry}:\n\n${snippet}`);
      }
      zipToWrite.updateFile(entry, Buffer.from(formatted, "utf-8"));
      zipToWrite.writeZip(iwd_path);
      const { snippet } = buildDiffSnippet(source, formatted);
      return okResult(`Formatted and wrote ${entry}:\n\n${snippet}`);
    }

    // Return formatted source
    const warnings = tokErrors.length > 0
      ? `\n\n⚠️ Tokenizer warnings (${tokErrors.length}):\n` +
        tokErrors.map(e => `  L${e.line}: ${e.message}`).join("\n")
      : "";

    return okResult("```gsc\n" + formatted + "\n```" + warnings);
  },
);
```

- [ ] **Step 3: Run tests**

```bash
cd mcp-server && npm test 2>&1 | tail -10
```

Expected: all tests still PASS

- [ ] **Step 5: Build**

```bash
cd mcp-server && npm run build 2>&1 | tail -10
```

Expected: clean build. Fix any TypeScript errors before proceeding.

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/gsc/tools.ts mcp-server/dist/index.js
git commit -m "feat: add gsc_format MCP tool — format GSC from raw string or IWD entry"
```

---

## Task 7: Update TODO + final commit

**Files:**
- Modify: `docs/TODO.md`

- [ ] **Step 1: Mark formatter items done in `docs/TODO.md`**

Change:
```markdown
- [ ] Build a standalone formatter operating on token streams — `gsc/formatter.ts` (token-stream approach)
- [ ] Expose as `gsc_format` MCP tool (accepts raw code string OR iwd_path+entry; write_back option)
```

To:
```markdown
- [x] Build a standalone formatter operating on token streams — `gsc/formatter.ts` (token-stream approach)
- [x] Expose as `gsc_format` MCP tool (accepts raw code string OR iwd_path+entry; write_back option)
```

- [ ] **Step 2: Commit**

```bash
git add docs/TODO.md
git commit -m "docs: mark gsc_format formatter tasks complete"
```

---

## Verification Checklist

Before declaring done:

```bash
cd mcp-server && npm test 2>&1 | tail -5      # All tests pass
cd mcp-server && npm run build 2>&1 | tail -5  # Clean build
grep "gsc_format" mcp-server/dist/index.js | head -3  # Tool present in bundle
```

- [ ] All existing tests still pass (no regressions)
- [ ] New formatter tests cover: indent, spacing, blank lines, comments, `::`, `[[ ]]`, idempotency, unary minus
- [ ] `gsc_format` tool visible in built `dist/index.js`
- [ ] `TODO.md` updated with both items checked
