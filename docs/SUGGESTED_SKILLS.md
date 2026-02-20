# Suggested Skills for iw4x-toolkit Development

Based on the project's strategy and roadmap (combining 2009's Engine logic with 2026's tooling), here are 5 suggested custom AI skills to accelerate development.

## 1. gsc-script-master (The Engine Logic Guide)
* **Goal**: Prevent hallucinated or non-existent syntax.
* **Why**: GSC has no compiler, and AI agents frequently hallucinate C++ object-oriented patterns or incorrect built-in functions.
* **Content**:
  * Point to the planned `knowledge/gsc-builtins.json` reference.
  * Define strict GSC 1.0 syntax rules (e.g., proper use of `spawn()`, `endon()`, `notify()`, `wait`).
  * Enforce running the `gsc_lint` tool (once Phase 2 is complete) before committing any `.gsc` files.

## 2. iw4-ui-engineer (MenuDef & UI Scripting)
* **Goal**: Master the text-based UI engine.
* **Why**: Text-AI excels at scripting `.menu` files, but the specific syntax (`itemDef`, `menuDef`) is arcane.
* **Content**:
  * Map out core UI definitions using the planned `knowledge/menu-properties.json`.
  * Demonstrate syntax for hooking DVAR expressions to UI elements.
  * Define rules for correct brace matching and executing `exp` macro formats.

## 3. userraw-sandbox-manager (The Iteration Workflow)
* **Goal**: Establish the local-first "Development Mode" loop.
* **Why**: Directly editing `.iwd` files is risky and slow. Active development should prioritize extracting assets to `fs_game/userraw`.
* **Content**:
  * Override default behavior to force deploying/modifying files directly in the `userraw/` directory during rapid iterations.
  * Outline the console commands required to verify changes (e.g., `vid_restart`, `map_restart`).

## 4. legacy-code-porter (GSC / C# Porting)
* **Goal**: Standardize migrating community code to modern modular toolkits.
* **Why**: Phase 4 focuses on porting features (like OpenWarfare admin scripts) and potentially wrapping C#/C++ implementations (like ZoneTool).
* **Content**:
  * Guidelines for translating legacy CoD4/MW2 engine patterns to modern TypeScript (for MCP development).
  * Best practices for safely adapting older monolithic GSC mods into the cleaner `iw4x-toolkit` standards.

## 5. zonebuilder-compiler (Asset Pipeline)
* **Goal**: Automate FastFile compilation.
* **Why**: Compiling `.ff` FastFiles requires rigid CSV zone configurations.
* **Content**:
  * Rules for writing valid ZoneBuilder `.csv` payloads (e.g., `ignore,code_post_gfx_mp`, `rawfile,maps/mp/gametypes/_my_script.gsc`).
  * Explicit CLI/terminal execution commands to compile the mod cleanly.
