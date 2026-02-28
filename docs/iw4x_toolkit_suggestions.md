# Suggestions for iw4x-toolkit MCP

The following suggestions are based on the integration of Bot Warfare into Promod and the use of the `iw4x-toolkit` MCP during that process.

## Current Strengths

- **`iwd_index_symbols` & `gsc_find_orphans`**: Invaluable for identifying missing dependencies and "undefined function" crashes.
- **`iwd_list` & `iwd_read`**: Extremely efficient for exploring archives without full extraction.
- **`gsc_lint`**: Catches syntax errors earlier than the game engine.

## Proposed Improvements & Additions

### 1. Cross-IWD Dependency Analysis

- **Feature**: `mod_integrity_check`
- **Description**: Automatically scan all IWD files in a specific mod directory and report any script calls that cannot be resolved by _any_ of the indexed archives.
- **Benefit**: Reduces the manual effort of indexing multiple archives one-by-one and provides a "safety score" for the entire mod.

### 2. Case-Insensitive Collision Detection (Linter)

- **Feature**: `gsc_lint` enhancement
- **Description**: Detect when two functions are defined with the same name but different casing (e.g., `isReallyAlive` and `isreallyalive`). Since GSC is case-insensitive, this causes a script compile error.
- **Experimental Result**: Testing `gsc_lint` against a file with duplicate (and case-variant duplicate) functions currently returns "No issues found!". Catching this at compile-time would prevent game crashes.
- **Benefit**: Prevents "invisible" bugs and compile crashes that occur when an AI or developer accidentally duplicates a function with different capitalization.

### 2. DVAR Value Validation & Search

- **Feature**: `dvar_integrity_check`
- **Description**: Scan GSC files for `getDvar`/`getDvarInt` calls and cross-reference them with a database of known MW2/IW4x DVARs.
- **Benefit**: Helps identify typos in DVAR names or settings that are no longer supported in modern IW4x versions.

### 3. Automatic "Bridge" Script Generator

- **Feature**: `generate_compat_bridge`
- **Description**: Based on the output of `gsc_find_orphans`, automatically generate a `_compat.gsc` containing stubs or common proxy implementations (e.g., `waittill_any`, `isReallyAlive`, `isUsingRemote`).
- **Benefit**: Rapidly resolves common integration boilerplate, which is almost always required when merging legacy mods.

### 4. Menu (.menu) Logic Parser

- **Feature**: `menu_response_lookup`
- **Description**: Parse `.menu` files (UI) and identify what `scriptmenusResponse` they send to the GSC engine.
- **Benefit**: Bridges the gap between UI interaction and GSC logic, making it easier to understand how custom menus (like Promod's) trigger script events.

### 5. GSC Call Graph Visualization

- **Feature**: `gsc_visualize_flow`
- **Description**: Generate a Mermaid or text-based call graph for a specific GSC file, showing how functions call each other and which external scripts they depend on.
- **Benefit**: Vital for understanding complex, undocumented mods with deeply nested function calls.
