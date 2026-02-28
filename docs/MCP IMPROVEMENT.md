# MCP Improvement Proposal: Restricted Environment Modding

This document outlines proposed enhancements for the `iw4x-toolkit` MCP server to streamline the development cycle in restricted environments (like Promod), where many engine and script functions are stripped or redefined.

## The Problem
Currently, modding for Promod involves a "game-crash-and-log" cycle:
1.  Apply a change/stub.
2.  Pack the mod.
3.  Launch the game.
4.  Wait for the engine to fail on an *Unknown Function* or *Already Defined* error.
5.  Extract the log and repeat.

This trial-and-error process is the primary bottleneck for porting complex mods (like the Bot Mod) to Promod.

## Proposed Tools

### 1. Environment Symbol Oracle (`iwd_index_symbols`)
*   **Functionality**: Scans all `.iwd` files in the game directory (or specific search paths) and indexes every function definition (`func() { ... }`).
*   **Result**: A searchable database/map of every function available in the *base* game and the target mod (Promod).
*   **Impact**: Eliminates "Already Defined" errors. We would know exactly which functions exist in Promod's utility scripts before we attempt to stub them.

### 2. Orphan Call Detector (`gsc_find_orphans`)
*   **Functionality**: Statically analyzes a `.gsc` file and identifies every function call (`self someFunction()`) that:
    *   Is not defined locally.
    *   Is not defined in any `#include` file.
    *   Is not found in the indexed **Environment Symbol Map**.
*   **Impact**: Converts the "one crash at a time" cycle into a "batch fix." We can identify all 50 missing functions in a mod instantly and fix them in a single build.

### 3. Smart Stub Injector (`gsc_auto_stub`)
*   **Functionality**: Automatically creates weak-redirection stubs for functions flagged as orphans.
*   **Feature**: Can distinguish between engine built-ins (which need a stub in `_bot_utility.gsc`) and script calls (which might need a stub or an include change).

### 4. Modern GSC Linter (`gsc_lint_pro`)
*   **Functionality**: An improved linter that understands modern GSC features used in high-end mods:
    *   Function pointers: `[[ func_ptr ]]()`
    *   Array literals and shorthand syntax.
    *   Dynamic includes.
*   **Impact**: Reduces noise. Currently, standard linters flag valid modern GSC as "syntax errors," making them useless for finding real logic flaws.

### 5. Live Server Log Streamer
*   **Functionality**: Direct integration with the game engine's stdout to pipe compile errors directly into the AI context with file/line mapping.
*   **Impact**: Instantly directs the developer to the exact line of a crash without manual log extraction.

---

> [!TIP]
> Implementing the **Symbol Oracle** and **Orphan Detector** alone would reduce the "Promod Cleanse" time from hours to minutes by allowing for a single, comprehensive batch fix of all environmental incompatibilities.
