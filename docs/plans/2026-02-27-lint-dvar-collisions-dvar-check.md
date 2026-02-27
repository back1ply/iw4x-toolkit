# Case-Insensitive Collision + DVAR Integrity Check Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add DEF-001 (case-insensitive function name collision) to `gsc_lint`, and ship a new standalone `dvar_integrity_check` tool.

**Architecture:**
- DEF-001 adds a `checkCaseCollisions()` method to `GSCLinter` in `linter.ts`, reusing the existing `outline()` function for accurate IW4-style function detection. Called unconditionally from `lint()`.
- `dvar_integrity_check` is a new `server.registerTool()` block appended in `gsc/tools.ts`, using the existing `getKnownDvars()` helper and a single regex pass over source to extract DVAR name string literals.

**Tech Stack:** TypeScript, Vitest, MCP SDK (`@modelcontextprotocol/sdk`), existing `outline()` + `getKnownDvars()` helpers.

---

## Task 1: DEF-001 — Failing test first

**Files:**
- Modify: `mcp-server/src/gsc/gsc.test.ts`

**Step 1: Add failing test for collision detection**

Append inside the `describe("GSCLinter"` block in `gsc.test.ts`:

```typescript
describe("Case-Insensitive Collision Detection", () => {
  it("reports DEF-001 when two functions share a name differing only in case", async () => {
    const result = await lint(`
isAlive()
{
  return true;
}

isalive()
{
  return false;
}
`);
    const collisions = result.errors.filter(e => e.code === "DEF-001");
    expect(collisions.length).toBeGreaterThan(0);
  });

  it("does not report DEF-001 for functions with genuinely different names", async () => {
    const result = await lint(`
isAlive()
{
  return true;
}

isDead()
{
  return false;
}
`);
    const collisions = result.errors.filter(e => e.code === "DEF-001");
    expect(collisions).toHaveLength(0);
  });

  it("does not report DEF-001 when a function name appears only once", async () => {
    const result = await lint(`
myFunc()
{
  iprintln("hi");
}
`);
    const collisions = result.errors.filter(e => e.code === "DEF-001");
    expect(collisions).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

```
cd mcp-server && npm test -- --reporter=verbose 2>&1 | grep -A5 "DEF-001"
```

Expected: FAIL — `collisions` is empty (DEF-001 not implemented yet).

**Step 3: Commit the failing test**

```bash
git add mcp-server/src/gsc/gsc.test.ts
git commit -m "test: add failing DEF-001 case-insensitive collision tests"
```

---

## Task 2: DEF-001 — Implementation

**Files:**
- Modify: `mcp-server/src/gsc/linter.ts`

**Step 1: Add `outline` import at top of `linter.ts`**

Find the existing imports block and add:
```typescript
import { outline } from "./outline.js";
```

**Step 2: Add `checkCaseCollisions()` private method to `GSCLinter`**

Add this method just before the closing `}` of the `GSCLinter` class (before the `lint` export function at the bottom):

```typescript
/**
 * Detect case-insensitive function name collisions.
 * GSC is case-insensitive — two definitions of isAlive / isalive cause a compile crash.
 */
private checkCaseCollisions(): void {
  const outlineResult = outline(this.source);

  // Group definitions by lowercase name
  const byLower = new Map<string, Array<{ original: string; line: number }>>();
  for (const fn of outlineResult.functions) {
    const lower = fn.name.toLowerCase();
    const group = byLower.get(lower) ?? [];
    group.push({ original: fn.name, line: fn.line });
    byLower.set(lower, group);
  }

  for (const [, group] of byLower) {
    if (group.length < 2) continue;
    // Check if any two entries have different original casing
    const originals = new Set(group.map(g => g.original));
    if (originals.size < 2) continue;

    // Report all duplicate lines except the first
    const [first, ...rest] = group;
    for (const dup of rest) {
      this.errors.push({
        type: "error",
        code: "DEF-001",
        message: `Function name collision: '${dup.original}' (line ${dup.line}) and '${first.original}' (line ${first.line}) are the same name in GSC (case-insensitive)`,
        line: dup.line,
        column: 0,
      });
    }
  }
}
```

**Step 3: Call `checkCaseCollisions()` from `lint()`**

In the `lint()` method, after the `this.collectDefinitions()` call, add:

```typescript
// Check for case-insensitive function name collisions (always on)
this.checkCaseCollisions();
```

The relevant section looks like:
```typescript
// First pass: collect defined functions and variables
this.collectDefinitions();

// NEW — add here:
this.checkCaseCollisions();

// Second pass: check usage (if enabled)
if (this.options.checkUndefined !== false) {
```

**Step 4: Run tests to verify they pass**

```
cd mcp-server && npm test -- --reporter=verbose 2>&1 | grep -A5 "DEF-001"
```

Expected: PASS — all three DEF-001 tests green, no regressions.

**Step 5: Commit**

```bash
git add mcp-server/src/gsc/linter.ts
git commit -m "feat: add DEF-001 case-insensitive function name collision detection to gsc_lint"
```

---

## Task 3: `dvar_integrity_check` — Failing test first

**Files:**
- Modify: `mcp-server/src/gsc/tools.test.ts`

**Step 1: Add failing tests for `dvar_integrity_check`**

Append a new `describe` block inside the outer `describe("GSC Tools", ...)` block in `tools.test.ts`:

```typescript
// ===========================================================================
// dvar_integrity_check Tests
// ===========================================================================

describe("dvar_integrity_check", () => {
  it("reports unknown DVAR names as potential typos", async () => {
    const result = await client.callTool({
      name: "dvar_integrity_check",
      arguments: {
        content: `
init()
{
  val = getDvar("sv_maxcliants");
}
`
      }
    });
    expect(result.isError).toBeFalsy();
    const text = getResultText(result as any);
    expect(text).toContain("sv_maxcliants");
    expect(text.toLowerCase()).toMatch(/unknown|typo|not found/);
  });

  it("recognises known DVARs", async () => {
    const result = await client.callTool({
      name: "dvar_integrity_check",
      arguments: {
        content: `
init()
{
  val = getDvarInt("sv_maxclients");
}
`
      }
    });
    expect(result.isError).toBeFalsy();
    const text = getResultText(result as any);
    expect(text).toContain("sv_maxclients");
    expect(text.toLowerCase()).toMatch(/known|valid|found/);
  });

  it("skips dynamic (non-literal) DVAR arguments silently", async () => {
    const result = await client.callTool({
      name: "dvar_integrity_check",
      arguments: {
        content: `
init()
{
  name = "sv_maxclients";
  val = getDvar(name);
}
`
      }
    });
    expect(result.isError).toBeFalsy();
    const text = getResultText(result as any);
    // Only one literal access (none) — no unknown DVARs should be reported
    expect(text).not.toContain("unknown");
  });

  it("handles content with no DVAR calls gracefully", async () => {
    const result = await client.callTool({
      name: "dvar_integrity_check",
      arguments: { content: 'init() { iprintln("hello"); }' }
    });
    expect(result.isError).toBeFalsy();
    const text = getResultText(result as any);
    expect(text.toLowerCase()).toContain("no dvar");
  });

  it("accepts a file path", async () => {
    const gscPath = path.join(tmpDir, "test.gsc");
    fs.writeFileSync(gscPath, `init() { x = getDvar("sv_maxclients"); }`);
    const result = await client.callTool({
      name: "dvar_integrity_check",
      arguments: { path: gscPath }
    });
    expect(result.isError).toBeFalsy();
    const text = getResultText(result as any);
    expect(text).toContain("sv_maxclients");
  });
});
```

**Step 2: Run tests to verify they fail**

```
cd mcp-server && npm test -- --reporter=verbose 2>&1 | grep -A5 "dvar_integrity_check"
```

Expected: FAIL — tool not registered yet.

**Step 3: Commit the failing test**

```bash
git add mcp-server/src/gsc/tools.test.ts
git commit -m "test: add failing dvar_integrity_check tool tests"
```

---

## Task 4: `dvar_integrity_check` — Implementation

**Files:**
- Modify: `mcp-server/src/gsc/tools.ts`

**Step 1: Verify `getKnownDvars` is already imported**

At the top of `gsc/tools.ts`, the import from `./linter.js` should already include `getKnownDvars`. Check:
```typescript
import { lint, fix, LintResult, LintError, LintOptions, getKnownBuiltins } from "./linter.js";
```

If `getKnownDvars` is not in this import, add it:
```typescript
import { lint, fix, LintResult, LintError, LintOptions, getKnownBuiltins, getKnownDvars } from "./linter.js";
```

**Step 2: Append the new tool registration at the end of `registerGscTools()`**

Just before the closing `}` of `registerGscTools`, add:

```typescript
// --- Tool: dvar_integrity_check ---
server.registerTool(
  "dvar_integrity_check",
  {
    title: "DVAR Integrity Check",
    description:
      "Scans a GSC file for getDvar/setDvar calls and validates the DVAR name string " +
      "literals against the known IW4x/MW2 DVAR database (1900+ entries). " +
      "Reports unknown names that are likely typos or unsupported DVARs. " +
      "Skips dynamic (non-literal) arguments silently. " +
      "Use path or content as input (same as gsc_lint).",
    inputSchema: {
      path: z.string().optional().describe(
        "Path to .gsc / .gsh file. Either this or content must be provided."
      ),
      content: z.string().optional().describe(
        "Raw GSC source code. Either this or path must be provided."
      ),
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  async ({ path: filePath, content }) => {
    // --- 1. Load source ---
    let source: string;
    if (filePath) {
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) {
        return { content: [{ type: "text", text: `❌ File not found: ${resolved}` }] };
      }
      try {
        source = fs.readFileSync(resolved, "utf-8");
      } catch (e) {
        return { content: [{ type: "text", text: `❌ Error reading file: ${e}` }] };
      }
    } else if (content) {
      source = content;
    } else {
      return { content: [{ type: "text", text: "❌ Either path or content must be provided." }] };
    }

    // --- 2. Extract DVAR accesses via regex ---
    // Matches: getDvar("name"), getDvarInt("name"), getDvarFloat("name"),
    //          getDvarVector("name"), setDvar("name", ...), setDvarifuninitialized("name", ...)
    const DVAR_CALL_RE = /\b(getDvar|getDvarInt|getDvarFloat|getDvarVector|setDvar|setDvarifuninitialized)\s*\(\s*"([^"]+)"/gi;

    interface DvarAccess {
      fn: string;
      name: string;
      line: number;
    }

    const lines = source.split("\n");
    const accesses: DvarAccess[] = [];

    for (let i = 0; i < lines.length; i++) {
      let match: RegExpExecArray | null;
      DVAR_CALL_RE.lastIndex = 0;
      while ((match = DVAR_CALL_RE.exec(lines[i])) !== null) {
        accesses.push({ fn: match[1], name: match[2], line: i + 1 });
      }
    }

    if (accesses.length === 0) {
      return { content: [{ type: "text", text: "✅ No DVAR string literal accesses found." }] };
    }

    // --- 3. Classify ---
    const knownDvars = await getKnownDvars();

    const known: DvarAccess[] = [];
    const unknown: DvarAccess[] = [];

    for (const a of accesses) {
      if (knownDvars.has(a.name.toLowerCase())) {
        known.push(a);
      } else {
        unknown.push(a);
      }
    }

    // --- 4. Format output ---
    const fileName = filePath ? path.basename(filePath) : "<inline>";
    let out = `DVAR integrity check: ${fileName}\n`;
    out += `Scanned ${accesses.length} DVAR access(es) — ${known.length} known, ${unknown.length} unknown\n\n`;

    if (unknown.length > 0) {
      out += `⚠️  Unknown DVARs (possible typos or unsupported):\n`;
      for (const a of unknown) {
        out += `  line ${a.line}: ${a.fn}("${a.name}")\n`;
      }
      out += "\n";
    } else {
      out += `✅ All DVAR names are valid.\n\n`;
    }

    if (known.length > 0) {
      out += `✓ Known DVARs (${known.length}):\n`;
      // Deduplicate for summary
      const uniqueKnown = [...new Set(known.map(a => a.name))];
      out += `  ${uniqueKnown.join(", ")}\n`;
    }

    return { content: [{ type: "text", text: out }] };
  }
);
```

**Step 3: Run tests to verify they pass**

```
cd mcp-server && npm test -- --reporter=verbose 2>&1 | grep -A5 "dvar_integrity_check"
```

Expected: PASS — all 5 dvar_integrity_check tests green.

**Step 4: Run full test suite to check for regressions**

```
cd mcp-server && npm test 2>&1 | tail -20
```

Expected: all tests pass (no regressions).

**Step 5: Commit**

```bash
git add mcp-server/src/gsc/tools.ts
git commit -m "feat: add dvar_integrity_check tool — validate DVAR name literals against MW2/IW4x database"
```

---

## Task 5: Build and final verification

**Step 1: Build the dist bundle**

```
cd mcp-server && npm run build 2>&1 | tail -5
```

Expected: exits 0, `dist/index.js` updated.

**Step 2: Run full test suite one final time**

```
cd mcp-server && npm test 2>&1 | tail -10
```

Expected: all tests pass.

**Step 3: Commit dist**

```bash
git add mcp-server/dist/index.js
git commit -m "chore: rebuild dist — DEF-001 collision detection + dvar_integrity_check tool"
```
