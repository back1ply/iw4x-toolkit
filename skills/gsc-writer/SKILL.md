---
name: gsc-writer
description: >
  Use when writing, editing, or reviewing GSC (Game Script) files for IW4X/MW2.
  Provides IW4-specific syntax rules, common LLM mistakes to avoid, and a
  mandatory lint-then-fix workflow using the gsc_lint and gsc_lookup MCP tools.
---

# GSC Writer — IW4/MW2 (CoD4 engine)

You are writing GSC for **IW4 (Call of Duty: Modern Warfare 2, 2009)**, the same engine as CoD4 (IW3). IW4 uses an **older GSC dialect** that differs significantly from BO3/BO4 GSC. Follow this skill exactly or you will produce broken scripts.

---

## Mandatory Workflow

For every GSC write or edit:

1. **Before writing** — if the function name is unfamiliar, call `gsc_lookup` to verify the signature
2. **Write the code** — following all rules below
3. **After writing** — call `gsc_lint` on the file/content to catch errors
4. **Fix all errors** — re-lint until clean (zero errors, ideally zero warnings)
5. **Never claim the file is done** unless `gsc_lint` returns no errors

If `gsc_lint` is unavailable, manually audit against the Critical Rules checklist.

---

## Critical Rules — IW4 GSC Dialect

These are the rules that differ most from languages an LLM was trained on. Getting any of these wrong **silently breaks** the script.

### 1. No `function` keyword for definitions

```gsc
// WRONG — this is BO3+ syntax, NOT IW4
function init() { }
function onPlayerSpawn() { }

// CORRECT — IW4 style (same as CoD4)
init()
{
}

onPlayerSpawn()
{
}
```

### 2. No `var` / `let` / `const`

Variables are declared by assignment. Scope is per-function.

```gsc
// WRONG
var players = [];
let count = 0;

// CORRECT
players = [];
count = 0;
```

### 3. No `null` — use `undefined`

```gsc
// WRONG
if (player == null) { }
player = null;

// CORRECT
if (!isdefined(player)) { }
player = undefined;
```

### 4. Arrays: use `.size`, not `.length`; use index append, not `.push()`

```gsc
// WRONG
players.push(player);
count = players.length;

// CORRECT
players[players.size] = player;
count = players.size;
```

### 5. `wait` is a statement, not a function call

```gsc
// Both work, but statement form is conventional
wait 0.05;       // conventional IW4 style
wait(0.05);      // also valid
```

### 6. File path function references use backslashes and `::`

```gsc
// Call a function from another file
maps\mp\_utility::isBadGuy(entity);

// Store a function reference (no call)
level.spawnFunc = maps\mp\gametypes\tdm::spawnPlayer;

// Call via stored reference
[[level.spawnFunc]]();
```

### 7. `#include` uses backslashes, no quotes

```gsc
// WRONG
#include "maps/mp/_utility.gsc";
#include "maps\\mp\\_utility";

// CORRECT
#include maps\mp\_utility;
```

### 8. Infinite event loops — `for(;;)` with `waittill`

The correct pattern for a persistent listener:

```gsc
watchConnects()
{
    for(;;)
    {
        level waittill("connected", player);
        player thread onPlayerConnect();
    }
}
```

**Never** use `while(true)` for event loops — use `for(;;)`.
**Never** poll in a loop without a `waittill` or `wait` — this freezes the server.

### 9. Thread model — `thread` spawns a concurrent function

```gsc
// Spawn a function as a thread (non-blocking)
level thread watchConnects();
player thread onPlayerSpawn();

// This runs synchronously (blocking):
onPlayerSpawn();   // waits for it to return
```

### 10. `self` is the entity the thread was spawned on

```gsc
onPlayerSpawn()
{
    // 'self' here is whatever entity called `thread onPlayerSpawn()`
    self.health = 100;
    self iprintln("You spawned!");
}
```

### 11. Always `endon("disconnect")` first in player-threaded functions

```gsc
onPlayerSpawn()
{
    self endon("disconnect");   // MUST be first — cleans up if player leaves
    self endon("death");        // also end on death if applicable

    self waittill("spawned");
    // ... rest of logic
}
```

### 12. Entity method calls — entity before function name

```gsc
// WRONG
iprintln(player, "Hello");
setModel(player, "model_name");

// CORRECT
player iprintln("Hello");
player setModel("model_name");

// Or with self
self iprintln("Hello");
self setModel("model_name");
```

### 13. Boolean literals are lowercase

```gsc
// WRONG
level.teamBased = True;
level.teamBased = TRUE;

// CORRECT
level.teamBased = true;
level.teamBased = false;
```

### 14. Ternary operator does NOT exist in IW4

```gsc
// WRONG
value = (x > 0) ? x : 0;

// CORRECT
if (x > 0)
    value = x;
else
    value = 0;
```

### 15. Struct/object literals do NOT exist — use spawnstruct()

```gsc
// WRONG
data = { name: "test", value: 5 };

// CORRECT
data = spawnstruct();
data.name = "test";
data.value = 5;
```

---

## Safety Patterns

### Always guard entity property access

```gsc
// WRONG — crashes if entity is undefined
if (entity.health > 0) { }

// CORRECT
if (isdefined(entity) && entity.health > 0) { }
```

### Persistent arrays on level — always initialize in init()

```gsc
init()
{
    level.players = [];
    level.activeStreaks = [];
}
```

### Clean up threads when player disconnects

Every player-threaded function should begin with:

```gsc
self endon("disconnect");
```

---

## File Structure

A typical GSC file:

```gsc
// Optional includes
#include maps\mp\_utility;
#include maps\mp\gametypes\_globallogic;

// Entry point — called by the gametype or _callbacksetup
init()
{
    level thread onPlayerConnect();
}

onPlayerConnect()
{
    for(;;)
    {
        level waittill("connected", player);
        player thread setupPlayer();
    }
}

setupPlayer()
{
    self endon("disconnect");

    self waittill("spawned");
    // player is now spawned and ready
}
```

---

## Common Mistakes Quick Reference

| Mistake | Fix |
|---------|-----|
| `function myFunc() {}` | `myFunc() {}` |
| `var x = 5;` | `x = 5;` |
| `arr.push(item)` | `arr[arr.size] = item;` |
| `arr.length` | `arr.size` |
| `x == null` | `!isdefined(x)` |
| `x = null` | `x = undefined;` |
| `while(true)` | `for(;;)` |
| `{key: value}` | `spawnstruct()` + property assignment |
| `x ? a : b` | `if/else` |
| `#include "maps/mp/_utility.gsc"` | `#include maps\mp\_utility;` |
| calling entity method: `setModel(ent, "m")` | `ent setModel("m")` |
| forgetting `endon("disconnect")` | add it as first line of player thread |

---

## Using the MCP Tools

- **`gsc_lookup`** — before writing a function call you're unsure about, look it up
- **`gsc_lint`** — run after every write; fix all errors before proceeding
- **`gsc_template`** — scaffold common patterns (player_connect, killstreak, menu_response, etc.)

Example workflow:
```
1. User: "write a killstreak mod"
2. You: call gsc_template(template="killstreak") to get the scaffold
3. Customize the template
4. Call gsc_lint(content=<your code>) to validate
5. Fix any errors, re-lint
6. Return the clean, validated code
```
