---
name: gsc-writer
description: >
  Use when writing, editing, or reviewing GSC (Game Script) files for IW4X/MW2.
  MANDATORY for all GSC tasks. Provides IW4-specific rules, a pre-flight checklist,
  and a strict lint-then-fix workflow using gsc_lint, gsc_lookup, gsc_anti_patterns,
  and gsc_outline.
---

# GSC Writer — IW4/MW2 (CoD4 engine)

You are writing GSC for **IW4 (Call of Duty: Modern Warfare 2, 2009)**. IW4 uses an **older GSC dialect** that is NOT JavaScript, NOT Python, NOT C#, and NOT BO3 GSC. If you assume it works like any of those languages, you will produce broken scripts.

**The linter will catch your mistakes. Your job is to not make them in the first place.**

---

## Mandatory Workflow — Do This Every Time

### Before Writing (non-negotiable)

1. **If editing an existing file** — run `gsc_outline` first. Understand what functions exist before touching anything.
2. **For every function you plan to call** — run `gsc_lookup` to verify the exact signature.
3. **For any pattern you are unsure about** — run `gsc_anti_patterns` with a relevant keyword (e.g. `query="push"`, `query="null"`, `query="object"`).
4. **For scaffolding** — run `gsc_template` with `list=true` to find existing templates before writing from scratch.

### While Writing

5. Follow every rule in the Critical Rules section below. Read them before writing.

### After Writing

6. **Run `gsc_lint`** on every file you touched — zero tolerance for errors. Re-write until clean.
7. **Run `gsc_fix`** if the linter reports fixable issues, then lint again.
8. **Never claim a file is done** unless `gsc_lint` returns zero errors.

---

## Pre-Flight Checklist (Before Writing Each Function)

Answer YES to all before writing a single line:

- [ ] Did I run `gsc_outline` on the file I am editing? (existing files only)
- [ ] Did I run `gsc_lookup` for every built-in function I plan to use?
- [ ] Did I check `gsc_anti_patterns` for any pattern I am unsure about?
- [ ] Does my function signature have NO `function` keyword?
- [ ] Do I have ZERO `var`, `let`, or `const` in my code?
- [ ] Do all my array loops use indexed `for` with `.size`?
- [ ] Does every infinite loop have a `wait` or `waittill` inside it?
- [ ] Does every `waittill`, `notify`, and `endon` have an entity prefix?
- [ ] Am I using `isDefined()` instead of `null` checks?
- [ ] Am I using `spawnstruct()` instead of `{}` object literals?

---

## Critical Rules — IW4 GSC Dialect

### NEVER List — The Linter Will Reject These as Errors

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

---

### Entity Rules

- **`self`** = the entity the current function is called on. Never use `this`.
- **`level`** = shared global game state. Common fields: `level.players`, `level.teamBased`, `level.time`.
- **`game`** = game mode state. Access with `game["key"]`.
- **Entity method calls** use a space, not dot: `entity methodName(args)` — NOT `entity.methodName(args)`.
- **Always check before accessing**: `if (isDefined(player.customProp))` before using any custom property.

### Event System Rules

```gsc
// ALWAYS prefix waittill/notify/endon with an entity:
self waittill("damage", amount, attacker);  // correct
waittill("damage");                          // WRONG — missing entity

// ALWAYS include wait in infinite loops:
for (;;)
{
    doWork();
    wait 0.05;   // required — server freezes without this
}

// Spawn threads for async work:
level thread watchGame();   // non-blocking — correct
watchGame();                // blocks the calling function
```

### Array Rules

```gsc
// Append to array:
arr[arr.size] = newItem;   // correct
arr.push(newItem);         // WRONG

// Get length:
count = arr.size;          // correct
count = arr.length;        // WRONG

// Iterate:
for (i = 0; i < arr.size; i++)   // correct
for (item of arr)                 // WRONG
```

### Object Rules

```gsc
// Create objects:
data = spawnstruct();   // correct
data.x = 1;
data.y = 2;

data = { x: 1, y: 2 }; // WRONG — invalid syntax

// Null checks:
if (!isDefined(x)) {}   // correct
if (x == null) {}       // WRONG — null does not exist

// Remove a property:
obj.prop = undefined;   // correct
delete obj.prop;        // WRONG — no delete operator
```

---

## File Structure

A valid IW4 GSC file:

```gsc
// Optional includes
#include maps\mp\gametypes\_hud_util;

// Entry point — no function keyword
init()
{
    level thread onPlayerConnect();
}

onPlayerConnect()
{
    for (;;)
    {
        level waittill("connected", player);
        player thread onPlayerSpawn();
    }
}

onPlayerSpawn()
{
    self endon("disconnect");
    for (;;)
    {
        self waittill("spawned_player");
        // self is the player entity here
    }
}
```

Key points:
- No `function` keyword anywhere
- Opening `{` on a new line (IW4 convention)
- Infinite loops always have `wait` or `waittill`
- Threads begin with `self endon("disconnect")`

---

## Quick Validation Checklist

Before calling a file done, scan for:

- [ ] Zero `function` keywords in definitions
- [ ] Zero `var`/`let`/`const`
- [ ] Zero `.push()`/`.pop()`/`.length`
- [ ] Zero `===`/`!==`
- [ ] Zero `null` literals
- [ ] Zero `this.` references
- [ ] Every `waittill`/`notify`/`endon` has an entity prefix
- [ ] Every infinite loop has `wait` or `waittill` inside
- [ ] `gsc_lint` returns zero errors
