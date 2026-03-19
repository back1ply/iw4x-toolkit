# MCP Improvement Proposals

Proposed enhancements to the `iw4x-toolkit` MCP server. Sourced from two streams:
- **Restricted environment modding** (e.g. porting Bot Warfare into Promod, where many engine/script functions are stripped or redefined).
- **Post-integration feedback** from real modding sessions using the toolkit.

---

## The Core Problem

Modding for restricted environments like Promod involves a painful "game-crash-and-log" cycle:

1. Apply a change or stub.
2. Pack the mod.
3. Launch the game.
4. Wait for the engine to fail on an *Unknown Function* or *Already Defined* error.
5. Extract the log and repeat.

This trial-and-error process is the primary bottleneck for porting complex mods. The tools below are designed to eliminate it.

---

## Proposed Tools

### 1. Environment Symbol Oracle (`iwd_index_symbols`)

- **Functionality**: Scans all `.iwd` files in a game/mod directory and indexes every function definition (`func() { ... }`).
- **Result**: A searchable map of every function available in the base game and the target mod (e.g. Promod).
- **Impact**: Eliminates "Already Defined" errors. We would know exactly which functions exist before attempting to stub them.

### 2. Orphan Call Detector (`gsc_find_orphans`)

- **Functionality**: Statically analyzes a `.gsc` file and identifies every function call that is:
  - Not defined locally.
  - Not defined in any `#include` file.
  - Not found in the indexed Environment Symbol Map.
- **Impact**: Converts the "one crash at a time" cycle into a "batch fix." All 50 missing functions can be identified and fixed in a single build.
- **Note**: Extends the existing `gsc_lint` — consider whether this is a `gsc_lint` flag or a separate tool.

### 3. Cross-IWD Dependency Analysis (`mod_integrity_check`)

- **Functionality**: Scans all IWD files in a mod directory and reports any script calls that cannot be resolved by *any* of the indexed archives.
- **Benefit**: Reduces the manual effort of indexing multiple archives one-by-one. Provides a "safety score" for the entire mod.
- **Relationship**: Combines `iwd_index_symbols` + `gsc_find_orphans` into a single mod-wide pass.

### 4. Automatic Bridge Script Generator (`gsc_auto_stub` / `generate_compat_bridge`)

- **Functionality**: Based on `gsc_find_orphans` output, automatically generates a `_compat.gsc` with weak-redirection stubs or common proxy implementations (e.g. `waittill_any`, `isReallyAlive`, `isUsingRemote`).
- **Distinguishes**: Engine built-ins (which need stubs in `_bot_utility.gsc`) vs. script calls (which may need a stub or an include change).
- **Benefit**: Rapidly resolves common integration boilerplate — almost always required when merging legacy mods.

### 5. Case-Insensitive Collision Detection (Linter Enhancement)

- **Feature**: Enhancement to `gsc_lint`.
- **Description**: Detect when two functions are defined with the same name but different casing (e.g. `isReallyAlive` vs `isreallyalive`). GSC is case-insensitive, so this causes a script compile error.
- **Experimental result**: Current `gsc_lint` returns "No issues found!" for case-variant duplicates. This is a known gap.
- **Benefit**: Prevents invisible bugs and compile crashes when an AI or developer accidentally duplicates a function with different capitalization.

### 6. Modern GSC Linter (`gsc_lint_pro`)

- **Functionality**: An improved linter that understands modern GSC features used in high-end mods:
  - Function pointers: `[[ func_ptr ]]()`
  - Array literals and shorthand syntax.
  - Dynamic includes.
- **Impact**: Reduces false-positive noise. Current linter flags valid modern GSC as syntax errors, making it useless for finding real logic flaws in those files.

### 7. Cross-File Static Analysis

- **Feature**: Enhancement to `gsc_lint` (or a new `gsc_lint_project` mode).
- **Description**: Allow `gsc_lint` to read an active mod directory and warn about `::` calls to functions that no longer exist in the modified environment.
- **Experimental result**: `gsc_lint` caught syntax errors but did not warn that `buildweaponname` was missing from the broader project context — the error only appeared at game launch.
- **Benefit**: Catches cross-file dependency errors before the game is even launched.

### 8. Menu Logic Parser (`menu_response_lookup`)

- **Functionality**: Parse `.menu` files (UI layer) and identify what `scriptmenusResponse` events they send to the GSC engine.
- **Benefit**: Bridges the gap between UI interaction and GSC logic — makes it easier to understand how custom menus (like Promod's) trigger script events.
- **Relationship**: Complements the planned `2C: Menu File Validator` in the TODO roadmap.

### 9. GSC Call Graph Visualization (`gsc_visualize_flow`)

- **Functionality**: Generate a Mermaid or text-based call graph for a GSC file, showing how functions call each other and which external scripts they depend on.
- **Benefit**: Vital for understanding complex, undocumented mods with deeply nested function calls.

### 10. Live Server Log Streamer

- **Functionality**: Direct integration with the game engine's stdout to pipe compile errors into the AI context with file/line mapping.
- **Impact**: Instantly directs the developer to the exact line of a crash, without manual log extraction.

---

> [!TIP]
> Implementing the **Symbol Oracle** (`iwd_index_symbols`) and **Orphan Detector** (`gsc_find_orphans`) alone would reduce "Promod Cleanse" time from hours to minutes — a single comprehensive batch fix replaces the crash-and-repeat loop.


The tool can't create new IWDs from scratch. IWD files are just ZIP archives