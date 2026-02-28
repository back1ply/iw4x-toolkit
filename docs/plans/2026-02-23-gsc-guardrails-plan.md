# GSC Guardrails Stack — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 15 IW4-specific lint rules, a queryable anti-patterns knowledge tool, 7 new GSC templates, and a hardened gsc-writer skill — making it impossible for a clueless LLM to silently write broken IW4 GSC.

**Architecture:** New lint rules slot into the existing `checkBadPatterns()` method in `linter.ts`. A new `gsc-anti-patterns.json` knowledge file is loaded via the existing `getKnowledgeDir()` pattern. The `gsc_anti_patterns` MCP tool is registered alongside existing tools in `tools.ts`. Templates extend the existing `templates.json`. The skill is a full rewrite of the existing `SKILL.md`.

**Tech Stack:** TypeScript, vitest, `@modelcontextprotocol/sdk`, Node.js ESM, existing tokenizer/linter architecture.

---

## Task 1: Add 15 IW4-specific lint rules (PAT-010–PAT-024)

**Files:**
- Modify: `mcp-server/src/gsc/linter.ts` — `checkBadPatterns()` method at line 386
- Test: `mcp-server/src/gsc/gsc.test.ts`

**Context:** `checkBadPatterns()` loops over `lines[i]` with regex checks. Each check pushes to `this.errors`. New rules use the same pattern. All fire as `"error"` type (not `"warning"`) so a moron LLM can't ignore them.

### Step 1: Write failing tests for the new patterns

Add to `mcp-server/src/gsc/gsc.test.ts`, inside the existing `describe("lint", ...)` block:

```typescript
describe("IW4 anti-pattern rules", () => {
  it("PAT-010: catches function keyword", async () => {
    const result = await lint('function init() { iprintln("hi"); }');
    const codes = result.errors.map(e => e.code);
    expect(codes).toContain("PAT-010");
  });

  it("PAT-011: catches var/let/const", async () => {
    const r1 = await lint("var x = 5;");
    expect(r1.errors.map(e => e.code)).toContain("PAT-011");
    const r2 = await lint("let y = 5;");
    expect(r2.errors.map(e => e.code)).toContain("PAT-011");
    const r3 = await lint("const z = 5;");
    expect(r3.errors.map(e => e.code)).toContain("PAT-011");
  });

  it("PAT-012: catches .push() and .pop()", async () => {
    const r1 = await lint("arr.push(item);");
    expect(r1.errors.map(e => e.code)).toContain("PAT-012");
    const r2 = await lint("arr.pop();");
    expect(r2.errors.map(e => e.code)).toContain("PAT-012");
  });

  it("PAT-013: catches .length", async () => {
    const result = await lint("x = arr.length;");
    expect(result.errors.map(e => e.code)).toContain("PAT-013");
  });

  it("PAT-014: catches === and !==", async () => {
    const r1 = await lint("if (x === 5) {}");
    expect(r1.errors.map(e => e.code)).toContain("PAT-014");
    const r2 = await lint("if (x !== 5) {}");
    expect(r2.errors.map(e => e.code)).toContain("PAT-014");
  });

  it("PAT-015: catches ternary operator", async () => {
    const result = await lint("x = (a > 0) ? 1 : 0;");
    expect(result.errors.map(e => e.code)).toContain("PAT-015");
  });

  it("PAT-016: catches arrow functions", async () => {
    const result = await lint("fn = (x) => x + 1;");
    expect(result.errors.map(e => e.code)).toContain("PAT-016");
  });

  it("PAT-017: catches object literals", async () => {
    const result = await lint("obj = { x: 1, y: 2 };");
    expect(result.errors.map(e => e.code)).toContain("PAT-017");
  });

  it("PAT-018: catches null literal", async () => {
    const result = await lint("if (x == null) {}");
    expect(result.errors.map(e => e.code)).toContain("PAT-018");
  });

  it("PAT-019: catches JS globals", async () => {
    const r1 = await lint("x = parseInt(str);");
    expect(r1.errors.map(e => e.code)).toContain("PAT-019");
    const r2 = await lint("x = Math.floor(y);");
    expect(r2.errors.map(e => e.code)).toContain("PAT-019");
  });

  it("PAT-020: catches template literals", async () => {
    const result = await lint("s = `hello ${name}`;");
    expect(result.errors.map(e => e.code)).toContain("PAT-020");
  });

  it("PAT-021: catches new keyword", async () => {
    const result = await lint("obj = new Object();");
    expect(result.errors.map(e => e.code)).toContain("PAT-021");
  });

  it("PAT-022: catches this.", async () => {
    const result = await lint("x = this.health;");
    expect(result.errors.map(e => e.code)).toContain("PAT-022");
  });

  it("PAT-023: catches forEach", async () => {
    const result = await lint("players.forEach(fn);");
    expect(result.errors.map(e => e.code)).toContain("PAT-023");
  });

  it("PAT-024: catches .concat() and .join()", async () => {
    const r1 = await lint('s = "a".concat("b");');
    expect(r1.errors.map(e => e.code)).toContain("PAT-024");
    const r2 = await lint('s = arr.join(", ");');
    expect(r2.errors.map(e => e.code)).toContain("PAT-024");
  });
});
```

### Step 2: Run tests to verify they fail

```bash
cd mcp-server && npx vitest run src/gsc/gsc.test.ts --reporter verbose 2>&1 | tail -30
```

Expected: 15 FAIL with "expected [] to contain PAT-01X"

### Step 3: Add the 15 rules to `checkBadPatterns()`

In `mcp-server/src/gsc/linter.ts`, find the end of the existing pattern checks (around line 450, just before `this.checkUnreachableCode()`). Insert this block **before** the `this.checkUnreachableCode()` call:

```typescript
      // --- IW4-specific anti-patterns (all errors, not warnings) ---

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
        const fix = pushMatch012[1] === "push"
          ? "use arr[arr.size] = item;"
          : "no direct equivalent — rethink with indexed loop";
        this.errors.push({
          type: "error", code: "PAT-012",
          message: `IW4 GSC does not support .${pushMatch012[1]}(). ${fix}`,
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

      // PAT-015: No ternary operator (?)
      // Heuristic: `?` not doubled, not in a string context we can detect
      if (/[^?!<>=]\?[^?.]/.test(line)) {
        this.errors.push({
          type: "error", code: "PAT-015",
          message: "IW4 GSC does not support the ternary operator (?:). Use if/else instead",
          line: lineNum, column: Math.max(0, line.search(/[^?!<>=]\?[^?.]/)), length: 1,
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
        const name = jsGlobal019[1].replace(/\s*$/, "");
        const alt = name === "parseInt" ? "int()" :
                    name === "parseFloat" ? "float()" :
                    name.startsWith("Math.floor") ? "int()" :
                    name.startsWith("Math.") ? "built-in math function (randomint, sin, cos, etc.)" :
                    "GSC equivalent";
        this.errors.push({
          type: "error", code: "PAT-019",
          message: `'${name}' is a JavaScript global not available in IW4 GSC. Use ${alt}`,
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
        const alts: Record<string, string> = {
          concat: "use + operator for strings",
          indexOf: "use strtok() or manual loop",
          split: "use strtok()",
          trim: "no equivalent — avoid extra whitespace",
          replace: "no equivalent — rethink approach",
        };
        const alt = alts[strMethod024[1]] ?? "no direct equivalent in IW4 GSC";
        this.errors.push({
          type: "error", code: "PAT-024",
          message: `IW4 GSC does not support .${strMethod024[1]}(). ${alt}`,
          line: lineNum, column: line.indexOf(strMethod024[0]), length: strMethod024[0].length,
        });
      }
```

### Step 4: Run tests to verify they pass

```bash
cd mcp-server && npx vitest run src/gsc/gsc.test.ts --reporter verbose 2>&1 | tail -30
```

Expected: all new tests PASS. Run full suite too:
```bash
npx vitest run --reporter verbose 2>&1 | tail -20
```

### Step 5: Commit

```bash
git add mcp-server/src/gsc/linter.ts mcp-server/src/gsc/gsc.test.ts
git commit -m "feat: add 15 IW4-specific lint rules PAT-010–PAT-024"
```

---

## Task 2: Create `knowledge/gsc-anti-patterns.json`

**Files:**
- Create: `knowledge/gsc-anti-patterns.json`

No code changes needed — just the data file. The tool in Task 3 will load it.

### Step 1: Create the file

```json
{
  "version": "1.0.0",
  "patterns": [
    {
      "id": "AP-001",
      "category": "syntax",
      "title": "No function keyword",
      "wrong": "function init() {\n    iprintln(\"hello\");\n}",
      "right": "init()\n{\n    iprintln(\"hello\");\n}",
      "explanation": "IW4 GSC does not use the `function` keyword. Just write the name followed by (). This is the same as CoD4 GSC."
    },
    {
      "id": "AP-002",
      "category": "syntax",
      "title": "No var/let/const declarations",
      "wrong": "var count = 0;\nlet name = \"player\";\nconst MAX = 10;",
      "right": "count = 0;\nname = \"player\";\nMAX = 10;",
      "explanation": "IW4 GSC has no variable declaration keywords. All variables are dynamically typed — just assign them."
    },
    {
      "id": "AP-003",
      "category": "syntax",
      "title": "No ternary operator",
      "wrong": "score = (kills > 0) ? kills * 100 : 0;",
      "right": "if (kills > 0)\n    score = kills * 100;\nelse\n    score = 0;",
      "explanation": "IW4 GSC does not support the ternary operator ?:. Use if/else."
    },
    {
      "id": "AP-004",
      "category": "syntax",
      "title": "No arrow functions",
      "wrong": "players.forEach(p => doSomething(p));",
      "right": "players = getplayers();\nfor (i = 0; i < players.size; i++)\n    doSomething(players[i]);",
      "explanation": "IW4 GSC does not support arrow functions (=>). Use named functions or inline for loops."
    },
    {
      "id": "AP-005",
      "category": "syntax",
      "title": "No template literals",
      "wrong": "msg = `Hello ${self.name}, you have ${self.score} points`;",
      "right": "msg = \"Hello \" + self.name + \", you have \" + self.score + \" points\";",
      "explanation": "IW4 GSC does not support template literals (backticks). Use + for string concatenation."
    },
    {
      "id": "AP-006",
      "category": "arrays",
      "title": "No .push() — use indexed append",
      "wrong": "myArray.push(newItem);",
      "right": "myArray[myArray.size] = newItem;",
      "explanation": "IW4 GSC arrays have no .push() method. Append by assigning to the index equal to .size."
    },
    {
      "id": "AP-007",
      "category": "arrays",
      "title": "No .length — use .size",
      "wrong": "count = myArray.length;",
      "right": "count = myArray.size;",
      "explanation": "IW4 GSC uses .size (not .length) to get the number of elements in an array or string."
    },
    {
      "id": "AP-008",
      "category": "arrays",
      "title": "Iterating arrays — use indexed for loop",
      "wrong": "for (player of getplayers()) {\n    player iprintlnbold(\"hi\");\n}",
      "right": "players = getplayers();\nfor (i = 0; i < players.size; i++)\n{\n    players[i] iprintlnbold(\"hi\");\n}",
      "explanation": "IW4 GSC does not support for...of iteration. Always use an indexed for loop with .size."
    },
    {
      "id": "AP-009",
      "category": "arrays",
      "title": "No array destructuring",
      "wrong": "const [first, second] = myArray;",
      "right": "first = myArray[0];\nsecond = myArray[1];",
      "explanation": "IW4 GSC does not support destructuring. Access array elements by index individually."
    },
    {
      "id": "AP-010",
      "category": "objects",
      "title": "No object literals — use spawnstruct()",
      "wrong": "data = { kills: 0, deaths: 0, score: 0 };",
      "right": "data = spawnstruct();\ndata.kills = 0;\ndata.deaths = 0;\ndata.score = 0;",
      "explanation": "IW4 GSC does not support object literal syntax {key: value}. Create a struct with spawnstruct() then assign properties."
    },
    {
      "id": "AP-011",
      "category": "objects",
      "title": "No new keyword — use spawnstruct()",
      "wrong": "obj = new Object();\nobj.x = 5;",
      "right": "obj = spawnstruct();\nobj.x = 5;",
      "explanation": "IW4 GSC does not have a `new` keyword. Use spawnstruct() to create plain data objects."
    },
    {
      "id": "AP-012",
      "category": "objects",
      "title": "Check property exists before accessing",
      "wrong": "if (player.customData.score > 0) {}",
      "right": "if (isDefined(player.customData) && isDefined(player.customData.score) && player.customData.score > 0) {}",
      "explanation": "Accessing an undefined property crashes IW4. Always guard with isDefined() before accessing nested properties."
    },
    {
      "id": "AP-013",
      "category": "objects",
      "title": "Deleting a property",
      "wrong": "delete player.tempData;",
      "right": "player.tempData = undefined;",
      "explanation": "IW4 GSC has no delete operator. Set the property to undefined to undefine it."
    },
    {
      "id": "AP-014",
      "category": "types",
      "title": "No null literal — use isDefined()",
      "wrong": "if (target == null) {\n    // handle missing target\n}",
      "right": "if (!isDefined(target)) {\n    // handle missing target\n}",
      "explanation": "IW4 GSC does not have a 'null' keyword. Use isDefined() or !isDefined() to check if a variable has a value."
    },
    {
      "id": "AP-015",
      "category": "types",
      "title": "No strict equality — use == and !=",
      "wrong": "if (x === 5) {}\nif (name !== \"allies\") {}",
      "right": "if (x == 5) {}\nif (name != \"allies\") {}",
      "explanation": "IW4 GSC does not support === or !==. Use == and != instead. All comparisons in IW4 are non-strict."
    },
    {
      "id": "AP-016",
      "category": "types",
      "title": "Converting types — use int() and float()",
      "wrong": "n = parseInt(strValue);\nf = parseFloat(strValue);",
      "right": "n = int(strValue);\nf = float(strValue);",
      "explanation": "Use IW4's built-in int() and float() functions for type conversion, not JavaScript's parseInt/parseFloat."
    },
    {
      "id": "AP-017",
      "category": "types",
      "title": "Math functions — use built-ins not Math.*",
      "wrong": "x = Math.floor(3.7);\ny = Math.abs(-5);\nz = Math.random();",
      "right": "x = int(3.7);\ny = abs(-5);\nz = randomfloat(1);",
      "explanation": "IW4 GSC has no Math object. Use int() for floor, abs() for absolute value, randomfloat()/randomint() for random numbers."
    },
    {
      "id": "AP-018",
      "category": "loops",
      "title": "Infinite loop pattern",
      "wrong": "while (true) {\n    // game loop\n    wait 0.05;\n}",
      "right": "for (;;)\n{\n    // game loop\n    wait 0.05;\n}",
      "explanation": "Both work in IW4, but for(;;) is the conventional infinite loop idiom in GSC. Always include a wait to avoid server freezing."
    },
    {
      "id": "AP-019",
      "category": "loops",
      "title": "No forEach or .map()/.filter()",
      "wrong": "results = players.filter(p => isAlive(p));",
      "right": "results = [];\nplayers = getplayers();\nfor (i = 0; i < players.size; i++)\n{\n    if (isAlive(players[i]))\n        results[results.size] = players[i];\n}",
      "explanation": "IW4 GSC has no functional array methods. Build result arrays manually with indexed for loops."
    },
    {
      "id": "AP-020",
      "category": "loops",
      "title": "Always wait inside infinite loops",
      "wrong": "for (;;)\n{\n    checkPlayers(); // no wait — server will freeze!\n}",
      "right": "for (;;)\n{\n    checkPlayers();\n    wait 0.05; // minimum server frame\n}",
      "explanation": "Any infinite loop MUST have at least one wait call per iteration. Without it, the server will freeze and disconnect all players."
    },
    {
      "id": "AP-021",
      "category": "events",
      "title": "waittill must be called on an entity",
      "wrong": "waittill(\"connected\");",
      "right": "level waittill(\"connected\", player);",
      "explanation": "waittill must always be prefixed with an entity (level, self, game, or a player entity). Bare waittill() is invalid."
    },
    {
      "id": "AP-022",
      "category": "events",
      "title": "waittill unpacks into local variables",
      "wrong": "self waittill(\"damage\");\n// can't access attacker",
      "right": "self waittill(\"damage\", amount, attacker, sMeansOfDeath);\n// now attacker is available",
      "explanation": "waittill() passes event data as additional local variables. List them after the event name string to capture them."
    },
    {
      "id": "AP-023",
      "category": "events",
      "title": "endon must be called on an entity",
      "wrong": "endon(\"disconnect\");",
      "right": "self endon(\"disconnect\");\n// or\nlevel endon(\"game_ended\");",
      "explanation": "endon must always be prefixed with an entity. It terminates the current thread when the specified event fires on that entity."
    },
    {
      "id": "AP-024",
      "category": "events",
      "title": "Use thread for async operations",
      "wrong": "// This blocks the calling function\nwatchAllPlayers();",
      "right": "// This runs concurrently\nlevel thread watchAllPlayers();",
      "explanation": "Use 'thread' to spawn non-blocking concurrent execution. Without it, the calling function is blocked until the callee returns."
    },
    {
      "id": "AP-025",
      "category": "events",
      "title": "notify broadcasts an event on an entity",
      "wrong": "notify(\"round_over\");",
      "right": "level notify(\"round_over\");\n// listeners: level waittill(\"round_over\")",
      "explanation": "notify must always be called on an entity. The entity is the channel — waittill listeners on the same entity will wake up."
    },
    {
      "id": "AP-026",
      "category": "entities",
      "title": "No 'this' — use 'self'",
      "wrong": "damagePlayer()\n{\n    this.health -= 10;\n}",
      "right": "damagePlayer()\n{\n    self.health -= 10;\n}",
      "explanation": "IW4 GSC has no 'this' keyword. When a function is called on an entity (e.g., player damagePlayer()), use 'self' to refer to that entity."
    },
    {
      "id": "AP-027",
      "category": "entities",
      "title": "Check if player is alive with isAlive()",
      "wrong": "if (player.health > 0) {\n    // player might still be in death animation\n}",
      "right": "if (isAlive(player)) {\n    // player is truly alive\n}",
      "explanation": "Use isAlive() instead of checking health > 0. Players can have health > 0 while still in the dying state."
    },
    {
      "id": "AP-028",
      "category": "entities",
      "title": "String concatenation with +",
      "wrong": 'msg = "Score: ".concat(self.score);',
      "right": 'msg = "Score: " + self.score;',
      "explanation": "IW4 GSC supports the + operator for string concatenation. There is no .concat() method."
    },
    {
      "id": "AP-029",
      "category": "entities",
      "title": "Printing to players — iprintlnbold vs iprintln",
      "wrong": "println(\"Round started!\");",
      "right": "// To all players:\nlevel.players = getplayers();\nfor (i = 0; i < level.players.size; i++)\n    level.players[i] iprintlnbold(\"Round started!\");\n// Or just to self:\nself iprintlnbold(\"Round started!\");",
      "explanation": "println() only prints to the server console. Use iprintln() for screen messages or iprintlnbold() for bold centered messages to players."
    },
    {
      "id": "AP-030",
      "category": "entities",
      "title": "Getting all players",
      "wrong": "// level.players might not exist or be stale\nfor (i = 0; i < level.players.size; i++) {}",
      "right": "players = getplayers();\nfor (i = 0; i < players.size; i++) {}",
      "explanation": "Always use getplayers() to get the current list of connected players. level.players may not be defined or up to date."
    }
  ]
}
```

### Step 2: Verify JSON is valid

```bash
python -c "import json; d=json.load(open('knowledge/gsc-anti-patterns.json')); print(f'{len(d[\"patterns\"])} patterns loaded')"
```

Expected: `30 patterns loaded`

### Step 3: Commit

```bash
git add knowledge/gsc-anti-patterns.json
git commit -m "feat: add gsc-anti-patterns.json with 30 wrong→right IW4 GSC pairs"
```

---

## Task 3: Add `gsc_anti_patterns` MCP tool

**Files:**
- Modify: `mcp-server/src/gsc/tools.ts`
- Test: `mcp-server/src/gsc/tools.test.ts`

**Context:** Same pattern as existing tools — load knowledge file with `getKnowledgeDir()`, cache it module-level, register with `server.registerTool()`.

### Step 1: Write failing tests

Add to `mcp-server/src/gsc/tools.test.ts`, as a new `describe("gsc_anti_patterns", ...)` block after the existing ones:

```typescript
describe("gsc_anti_patterns", () => {
  it("finds patterns by keyword", async () => {
    const result = await client.callTool({
      name: "gsc_anti_patterns",
      arguments: { query: "push" }
    });
    expect(result.isError).toBeFalsy();
    const text = getResultText(result as any);
    expect(text).toContain("arr.size");
  });

  it("finds patterns by category", async () => {
    const result = await client.callTool({
      name: "gsc_anti_patterns",
      arguments: { query: "array", category: "arrays" }
    });
    expect(result.isError).toBeFalsy();
    const text = getResultText(result as any);
    expect(text).toContain("arrays");
  });

  it("lists all categories with list=true", async () => {
    const result = await client.callTool({
      name: "gsc_anti_patterns",
      arguments: { list: true }
    });
    expect(result.isError).toBeFalsy();
    const text = getResultText(result as any);
    expect(text).toContain("syntax");
    expect(text).toContain("arrays");
    expect(text).toContain("events");
  });

  it("returns no results message for unknown query", async () => {
    const result = await client.callTool({
      name: "gsc_anti_patterns",
      arguments: { query: "xyzzy_nonexistent_pattern_abc" }
    });
    expect(result.isError).toBeFalsy();
    const text = getResultText(result as any);
    expect(text).toContain("No patterns found");
  });

  it("finds null check pattern", async () => {
    const result = await client.callTool({
      name: "gsc_anti_patterns",
      arguments: { query: "null" }
    });
    const text = getResultText(result as any);
    expect(text).toContain("isDefined");
  });
});
```

### Step 2: Run tests to verify they fail

```bash
cd mcp-server && npx vitest run src/gsc/tools.test.ts --reporter verbose 2>&1 | grep -E "PASS|FAIL|gsc_anti"
```

Expected: 5 FAIL with tool not found or no results

### Step 3: Add the tool to `tools.ts`

In `mcp-server/src/gsc/tools.ts`:

**a) Add module-level cache** (after the existing `templatesCache` declaration, around line 45):

```typescript
interface AntiPattern {
  id: string;
  category: string;
  title: string;
  wrong: string;
  right: string;
  explanation: string;
}

let antiPatternsCache: AntiPattern[] | null = null;

function loadAntiPatterns(): AntiPattern[] {
  if (antiPatternsCache) return antiPatternsCache;

  const filePath = getKnowledgeDir("gsc-anti-patterns.json");
  if (!filePath) {
    antiPatternsCache = [];
    return antiPatternsCache;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    antiPatternsCache = data.patterns ?? [];
    return antiPatternsCache!;
  } catch {
    antiPatternsCache = [];
    return antiPatternsCache;
  }
}
```

**b) Register the tool** (add at the end of `registerGscTools()`, after the last existing `server.registerTool(...)` call):

```typescript
  // --- Tool: gsc_anti_patterns ---
  server.registerTool(
    "gsc_anti_patterns",
    {
      title: "GSC Anti-Patterns Reference",
      description:
        "Search IW4 GSC anti-patterns: common mistakes from JS/BO3/modern languages " +
        "with correct IW4 equivalents. " +
        "Call this BEFORE writing code to check how to do something correctly in IW4. " +
        "Returns wrong→right pairs with explanations. " +
        "Use query='push' to find array append patterns, query='null' for null checks, etc.",
      inputSchema: {
        query: z.string().optional().describe(
          "Search term (e.g. 'push', 'null', 'object', 'loop', 'event'). " +
          "Not required if list=true."
        ),
        category: z.string().optional().describe(
          "Filter by category: syntax, arrays, objects, types, loops, events, entities"
        ),
        list: z.boolean().optional().default(false).describe(
          "If true, list all categories with entry counts instead of searching"
        ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ query, category, list }) => {
      const patterns = loadAntiPatterns();

      if (list || (!query && !category)) {
        // List categories
        const counts: Record<string, number> = {};
        for (const p of patterns) {
          counts[p.category] = (counts[p.category] ?? 0) + 1;
        }
        if (Object.keys(counts).length === 0) {
          return {
            content: [{ type: "text", text: "No anti-patterns loaded. Check knowledge/gsc-anti-patterns.json." }]
          };
        }
        let out = `📚 Anti-pattern categories (${patterns.length} total):\n\n`;
        for (const [cat, count] of Object.entries(counts).sort()) {
          out += `  **${cat}** — ${count} entries\n`;
        }
        out += "\nUse query='<term>' to search, or category='<name>' to filter.";
        return { content: [{ type: "text", text: out }] };
      }

      const q = query?.toLowerCase() ?? "";
      const cat = category?.toLowerCase();

      const matches = patterns.filter(p => {
        const inCat = cat ? p.category === cat : true;
        const inSearch = q
          ? p.title.toLowerCase().includes(q) ||
            p.wrong.toLowerCase().includes(q) ||
            p.right.toLowerCase().includes(q) ||
            p.explanation.toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q)
          : true;
        return inCat && inSearch;
      });

      if (matches.length === 0) {
        return {
          content: [{ type: "text", text: `No patterns found for '${query}'${cat ? ` in category '${cat}'` : ""}.\nUse list=true to see all categories.` }]
        };
      }

      let out = `Found ${matches.length} pattern(s):\n\n`;
      for (const p of matches.slice(0, 10)) {
        out += `### ${p.id}: ${p.title} [${p.category}]\n\n`;
        out += `**Wrong:**\n\`\`\`gsc\n${p.wrong}\n\`\`\`\n\n`;
        out += `**Right:**\n\`\`\`gsc\n${p.right}\n\`\`\`\n\n`;
        out += `**Why:** ${p.explanation}\n\n---\n\n`;
      }
      if (matches.length > 10) {
        out += `...and ${matches.length - 10} more. Narrow your query.`;
      }

      return { content: [{ type: "text", text: out }] };
    }
  );
```

### Step 4: Run tests to verify they pass

```bash
cd mcp-server && npx vitest run src/gsc/tools.test.ts --reporter verbose 2>&1 | tail -20
```

Expected: all tests PASS (including the new 5)

### Step 5: Commit

```bash
git add mcp-server/src/gsc/tools.ts mcp-server/src/gsc/tools.test.ts
git commit -m "feat: add gsc_anti_patterns tool with wrong→right IW4 pattern lookup"
```

---

## Task 4: Add 7 new templates to `knowledge/templates.json`

**Files:**
- Modify: `knowledge/templates.json`

No tests needed — templates are data, and the existing `gsc_template` tool + tests cover loading behavior.

### Step 1: Add templates

Open `knowledge/templates.json` and add these 7 entries to the existing JSON object:

```json
  "player_death": {
    "description": "Player death callback — runs when self dies, captures killer and weapon",
    "category": "callbacks",
    "variables": { "FUNC_NAME": "onPlayerDeath" },
    "code": "{{FUNC_NAME}}()\n{\n    self endon(\"disconnect\");\n    for (;;)\n    {\n        self waittill(\"death\", attacker, sHitLoc, sMeansOfDeath, sWeapon);\n        // attacker: the entity that killed self (may be level for environmental)\n        // sWeapon: weapon name string\n        // sHitLoc: hit location string\n        if (isDefined(attacker) && attacker != self)\n        {\n            // killed by another player\n        }\n        wait 1; // respawn delay\n    }\n}"
  },
  "player_damage": {
    "description": "Player damage modifier — reduce or block incoming damage",
    "category": "callbacks",
    "variables": { "MULTIPLIER": "0.5" },
    "code": "// Register in init or onPlayerConnect:\n// self thread watchPlayerDamage();\n\nwatchPlayerDamage()\n{\n    self endon(\"death\");\n    self endon(\"disconnect\");\n    for (;;)\n    {\n        self waittill(\"damage\", amount, attacker, sMeansOfDeath, sWeapon, sHitLoc);\n        // Reduce damage by multiplier (note: health is already decremented)\n        // To modify damage, you must restore health and re-apply:\n        healAmount = int(amount - (amount * {{MULTIPLIER}}));\n        if (healAmount > 0)\n            self.health += healAmount;\n    }\n}"
  },
  "chat_handler": {
    "description": "Chat command handler loop — listens for '!command' style messages",
    "category": "gameplay",
    "variables": { "PREFIX": "!" },
    "code": "watchChat()\n{\n    self endon(\"disconnect\");\n    for (;;)\n    {\n        self waittill(\"say\", message);\n        message = tolower(message);\n        if (message == \"{{PREFIX}}help\")\n        {\n            self iprintlnbold(\"Commands: {{PREFIX}}help\");\n        }\n        else if (message == \"{{PREFIX}}score\")\n        {\n            self iprintlnbold(\"Your score: \" + self.score);\n        }\n    }\n}"
  },
  "round_start_end": {
    "description": "Round lifecycle callbacks — fires on game start and end",
    "category": "gameplay",
    "code": "watchRound()\n{\n    level waittill(\"start_game\");\n    onRoundStart();\n    level waittill(\"game_ended\");\n    onRoundEnd();\n}\n\nonRoundStart()\n{\n    // Called when the round begins\n    level.roundTimer = gettime();\n    level thread announceRoundStart();\n}\n\nonRoundEnd()\n{\n    // Called when the round ends\n    elapsed = (gettime() - level.roundTimer) / 1000;\n    println(\"Round lasted \" + elapsed + \" seconds\");\n}\n\nannounceRoundStart()\n{\n    wait 1;\n    players = getplayers();\n    for (i = 0; i < players.size; i++)\n        players[i] iprintlnbold(\"Round started!\");\n}"
  },
  "timer_system": {
    "description": "Countdown timer running in a thread, notifies when done",
    "category": "utility",
    "variables": { "SECONDS": "60", "EVENT": "timer_done" },
    "code": "startCountdown(seconds)\n{\n    level.countdownActive = 1;\n    level thread runCountdown(seconds);\n}\n\nrunCountdown(seconds)\n{\n    level endon(\"game_ended\");\n    remaining = seconds;\n    while (remaining > 0)\n    {\n        wait 1;\n        remaining--;\n        if (remaining <= 10)\n        {\n            players = getplayers();\n            for (i = 0; i < players.size; i++)\n                players[i] iprintln(remaining + \"...\");\n        }\n    }\n    level.countdownActive = 0;\n    level notify(\"{{EVENT}}\");\n}"
  },
  "hud_element": {
    "description": "HUD text element — create, update, and destroy a screen element",
    "category": "hud",
    "variables": { "FONT_SCALE": "1.5" },
    "code": "createTimerHud()\n{\n    hud = newHudElem();\n    hud.x = 320;\n    hud.y = 30;\n    hud.alignX = \"center\";\n    hud.alignY = \"top\";\n    hud.horzAlign = \"center\";\n    hud.vertAlign = \"top\";\n    hud.fontScale = {{FONT_SCALE}};\n    hud.color = (1, 1, 1);\n    hud.alpha = 1;\n    hud setText(\"00:00\");\n    return hud;\n}\n\nupdateTimerHud(hud, seconds)\n{\n    minutes = int(seconds / 60);\n    secs = seconds % 60;\n    timeStr = minutes + \":\";\n    if (secs < 10) timeStr += \"0\";\n    timeStr += secs;\n    hud setText(timeStr);\n}\n\ndestroyHud(hud)\n{\n    if (isDefined(hud))\n        hud destroy();\n}"
  },
  "player_score": {
    "description": "Score and stat tracking — add points with optional kill/death tracking",
    "category": "gameplay",
    "code": "initPlayerStats()\n{\n    if (!isDefined(self.kills))  self.kills  = 0;\n    if (!isDefined(self.deaths)) self.deaths = 0;\n    if (!isDefined(self.score))  self.score  = 0;\n}\n\naddScore(points)\n{\n    if (!isDefined(self.score)) self.score = 0;\n    self.score += points;\n    self iprintln(\"+\" + points + \" pts\");\n}\n\nrecordKill(victim)\n{\n    if (!isDefined(self.kills)) self.kills = 0;\n    self.kills++;\n    self addScore(100);\n}\n\nrecordDeath()\n{\n    if (!isDefined(self.deaths)) self.deaths = 0;\n    self.deaths++;\n}"
  }
```

### Step 2: Verify JSON is valid

```bash
python -c "import json; d=json.load(open('knowledge/templates.json')); print(f'{len(d)} templates: {list(d.keys())}')"
```

Expected: `13 templates: ['player_connect', 'killstreak', ...]` (original 6 + 7 new)

### Step 3: Commit

```bash
git add knowledge/templates.json
git commit -m "feat: add 7 new GSC templates (player_death, damage, chat, round, timer, hud, score)"
```

---

## Task 5: Rewrite `skills/gsc-writer/SKILL.md`

**Files:**
- Modify: `skills/gsc-writer/SKILL.md`

### Step 1: Replace the entire file with the hardened version

```markdown
---
name: gsc-writer
description: >
  Use when writing, editing, or reviewing GSC (Game Script) files for IW4X/MW2.
  MANDATORY for all GSC tasks. Provides IW4-specific rules, a pre-flight checklist,
  and a strict lint-then-fix workflow using gsc_lint, gsc_lookup, and gsc_anti_patterns.
---

# GSC Writer — IW4/MW2 (CoD4 engine)

You are writing GSC for **IW4 (Call of Duty: Modern Warfare 2, 2009)**. IW4 uses an **older GSC dialect** that is NOT JavaScript, NOT Python, NOT C#, and NOT BO3 GSC. If you assume it works like any of those, you will produce broken scripts.

**The linter will catch your mistakes. Your job is to not make them in the first place.**

---

## Mandatory Workflow — Do This Every Time

### Before Writing (non-negotiable)

1. **If editing an existing file** — run `gsc_outline` first. Understand what functions exist before touching anything.
2. **For every function you plan to call** — run `gsc_lookup` to verify the exact signature.
3. **For any pattern you're unsure about** — run `gsc_anti_patterns` with a relevant keyword.

### While Writing

4. **Follow all rules in the Critical Rules section** — memorize or re-read them every session.
5. **Use `gsc_template`** with `list=true` to find scaffolds before writing from scratch.

### After Writing

6. **Run `gsc_lint` on every file you touched** — zero tolerance for errors. Re-write until clean.
7. **Run `gsc_fix`** if the linter reports fixable issues.
8. **Never claim a file is done** unless `gsc_lint` returns zero errors.

---

## Pre-Flight Checklist (Before Writing Each Function)

Answer YES to all before typing a single line:

- [ ] Did I run `gsc_outline` on the file I'm editing? (existing files only)
- [ ] Did I run `gsc_lookup` for every built-in I plan to use?
- [ ] Did I check `gsc_anti_patterns` for any pattern I'm unsure about?
- [ ] Does my function signature have NO `function` keyword?
- [ ] Do I have ZERO `var`, `let`, or `const` in my code?
- [ ] Do all my loops use indexed `for` with `.size`?
- [ ] Does every infinite loop have a `wait` call inside it?
- [ ] Does every `waittill` have an entity prefix?
- [ ] Am I using `isDefined()` instead of `null` checks?

---

## Critical Rules — IW4 GSC Dialect

### NEVER List (these are errors, the linter will reject them)

| Rule | WRONG | RIGHT |
|------|-------|-------|
| No `function` keyword | `function init() {}` | `init() {}` |
| No `var`/`let`/`const` | `var x = 5;` | `x = 5;` |
| No `.push()` | `arr.push(item)` | `arr[arr.size] = item;` |
| No `.length` | `arr.length` | `arr.size` |
| No `===`/`!==` | `x === 5` | `x == 5` |
| No ternary `?:` | `x > 0 ? a : b` | `if (x > 0) ... else ...` |
| No arrow functions | `(x) => x + 1` | write a named function |
| No `{key: val}` objects | `obj = {x: 1}` | `obj = spawnstruct(); obj.x = 1;` |
| No `null` | `if (x == null)` | `if (!isDefined(x))` |
| No `Math.*`/`parseInt` | `Math.floor(x)` | `int(x)` |
| No template literals | `` `hi ${name}` `` | `"hi " + name` |
| No `new` | `new Object()` | `spawnstruct()` |
| No `this.` | `this.health` | `self.health` |
| No `for...of`/`forEach` | `for (p of players)` | `for (i=0; i<players.size; i++)` |
| No `.concat()`/`.join()` | `"a".concat("b")` | `"a" + "b"` |

### Entity Rules

- **`self`** = the entity the current function is called on. Never `this`.
- **`level`** = shared global game state. Properties: `level.players`, `level.teamBased`, `level.time`, etc.
- **`game`** = game mode state dictionary. Access with `game["key"]`.
- **Entity methods** are called as `entity methodName(args)` — space, NOT dot for calls.
- **Check before access**: `if (isDefined(player.customProp))` before using it.

### Event System Rules

```gsc
// ALWAYS prefix waittill/notify/endon with an entity:
self waittill("damage", amount, attacker);  // ✓
waittill("damage");                          // ✗ — invalid

// ALWAYS include wait in infinite loops:
for (;;)
{
    doWork();
    wait 0.05;   // ✓ required
}

// Spawn threads for async work:
level thread watchGame();   // ✓ non-blocking
watchGame();                // — blocks calling function until return
```

### Array Rules

```gsc
// Creating an array (BOTH are valid):
arr = [];                   // empty array literal — OK in IW4
arr = array();              // also valid

// Append:
arr[arr.size] = newItem;   // ✓
arr.push(newItem);         // ✗

// Length:
count = arr.size;          // ✓
count = arr.length;        // ✗

// Iteration:
for (i = 0; i < arr.size; i++)   // ✓
for (item of arr)                 // ✗
```

### Object Rules

```gsc
// Creating objects:
data = spawnstruct();   // ✓
data.x = 1;
data.y = 2;

data = { x: 1, y: 2 }; // ✗ — invalid

// Null / undefined checks:
if (!isDefined(x)) {}   // ✓ — check if undefined
if (x == null) {}       // ✗ — null doesn't exist

// Deleting a property:
obj.prop = undefined;   // ✓
delete obj.prop;        // ✗
```

---

## File Structure

A valid IW4 GSC file looks like this:

```gsc
// Optional: include other scripts
#include maps\mp\gametypes\_hud_util;

// Entry function (no "function" keyword!)
init()
{
    level thread onPlayerConnect();
}

// Callback setup
onPlayerConnect()
{
    for (;;)
    {
        level waittill("connected", player);
        player thread onPlayerSpawn();
    }
}

// Per-player thread
onPlayerSpawn()
{
    self endon("disconnect");
    for (;;)
    {
        self waittill("spawned_player");
        // do stuff with self (the player)
    }
}
```

Key things to notice:
- No `function` keyword anywhere
- Every function body starts with `{` on a new line (IW4 convention)
- Infinite loops always have `wait` or `waittill` inside
- Threads have `endon("disconnect")` as first line

---

## Quick Validation Checklist

Before calling a file done, scan it for:

- [ ] Zero `function` keywords in function definitions
- [ ] Zero `var`/`let`/`const`
- [ ] Zero `.push()`/`.pop()`/`.length`
- [ ] Zero `===`/`!==`
- [ ] Zero `null` literals
- [ ] Zero `this.` references
- [ ] Every `waittill`/`notify`/`endon` has an entity prefix
- [ ] Every infinite loop has a `wait` or `waittill` inside
- [ ] `gsc_lint` returns zero errors
```

### Step 2: Verify the skill file was written

```bash
wc -l skills/gsc-writer/SKILL.md && head -5 skills/gsc-writer/SKILL.md
```

### Step 3: Commit

```bash
git add skills/gsc-writer/SKILL.md
git commit -m "feat: harden gsc-writer skill with pre-flight checklist and exhaustive NEVER table"
```

---

## Task 6: Update `docs/LINTER_ERRORS.md` and rebuild dist

**Files:**
- Modify: `docs/LINTER_ERRORS.md`
- Rebuild: `mcp-server/dist/index.js`

### Step 1: Add PAT-010–PAT-024 to the errors table

In `docs/LINTER_ERRORS.md`, find the errors table (the one with `PAT-001`) and add the 15 new rows:

```markdown
| PAT-010 | error   | `function` keyword used            | `function init() {}`             |
| PAT-011 | error   | var/let/const declaration          | `var x = 5;`                     |
| PAT-012 | error   | JS array method (.push/.pop)       | `arr.push(item)`                 |
| PAT-013 | error   | .length on array/string            | `arr.length`                     |
| PAT-014 | error   | Strict equality operator           | `x === 5`                        |
| PAT-015 | error   | Ternary operator                   | `x > 0 ? a : b`                  |
| PAT-016 | error   | Arrow function                     | `(x) => x + 1`                   |
| PAT-017 | error   | Object literal syntax              | `obj = {x: 1}`                   |
| PAT-018 | error   | null literal                       | `if (x == null)`                 |
| PAT-019 | error   | JavaScript global (Math/parseInt)  | `Math.floor(x)`                  |
| PAT-020 | error   | Template literal (backtick)        | `` `hi ${name}` ``               |
| PAT-021 | error   | new keyword                        | `new Object()`                   |
| PAT-022 | error   | this. reference                    | `this.health`                    |
| PAT-023 | error   | for...of or forEach                | `arr.forEach(fn)`                |
| PAT-024 | error   | JS string/array method             | `"a".concat("b")`                |
```

### Step 2: Rebuild dist

```bash
cd mcp-server && npm run build 2>&1 | tail -5
```

Expected: clean build, no TypeScript errors

### Step 3: Run the full test suite one final time

```bash
cd mcp-server && npx vitest run --reporter verbose 2>&1 | tail -30
```

Expected: all previously passing tests still pass, new tests pass

### Step 4: Final commit

```bash
cd ..
git add mcp-server/dist/index.js docs/LINTER_ERRORS.md
git commit -m "docs: document PAT-010–PAT-024, rebuild dist"
```

---

## Verification Checklist

Before declaring done:

- [ ] `gsc_lint` catches all 15 JS/BO3 patterns (run: `npx vitest run src/gsc/gsc.test.ts`)
- [ ] `gsc_anti_patterns` returns results for: `push`, `null`, `object`, `waittill`, `forEach`
- [ ] `gsc_template list=true` shows 13 templates including `player_death`, `chat_handler`
- [ ] `skills/gsc-writer/SKILL.md` includes the pre-flight checklist and NEVER table
- [ ] `npm run build` exits clean
- [ ] `npx vitest run` — all tests pass (excluding the 4 pre-existing IWD failures)
