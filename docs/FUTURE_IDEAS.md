# Future Ideas & Proposals

Ideas not on the immediate roadmap — worth pursuing in Phase 3 and beyond.

---

## Tool Ideas

### 1. Live Server Interaction (RCON)

Modern MCPs like Roblox allow LLMs to interact with running game sessions. The same pattern works here.

- **Tools**: `rcon_send(command)`, `rcon_read_log()`
- **Why**: The AI could inject test commands (`map_restart`, `fast_restart`, `give all`), read the live server console for GSC errors/crashes, and iteratively fix code without the user alt-tabbing to read the error screen.

### 2. FastFile (.ff) and BSP Asset Readers

Engines like Unity expose their scene hierarchy to MCPs. We can't do that live in Radiant, but we can parse compiled assets.

- **Tools**: `ff_get_rawfiles(ff_path)`, `bsp_get_entities(bsp_path)`
- **Why**: Writing a zombie mod script that needs spawn coordinates currently requires opening Radiant. Wrapping `OpenAssetTools` or `ZoneTool` to dump the entity string from a `.d3dbsp` lets the AI read coordinates and write the script autonomously.
- **References**: `OpenAssetTools` (https://github.com/Laupetin/OpenAssetTools), `ZoneTool` (https://github.com/ZoneTool/zonetool)

### 3. Semantic GSC Search (Local RAG)

Instead of standard `grep`, a semantic search over `iw4x-rawfiles`.

- **Tools**: `gsc_find_example(topic)`
- **Why**: Allows the AI to answer "how does Infinity Ward handle helicopter pathing?" using the actual base game scripts, preventing hallucinated modern constructs.
- **References**: `iw4x/iw4x-rawfiles` (https://github.com/iw4x/iw4x-rawfiles)

### 4. UI Layout Previewer

A `.menu` file structure validator and dimensional calculator.

- **Tools**: `menu_validate_layout(file_path)`
- **Why**: The hardest part of UI modding is absolute positioning (`rect x y w h`). A tool that calculates absolute math of nested `itemDef` macros catches overlapping elements or off-screen boundaries before loading the game.

---

## Skill Proposals

Skills are Claude Code slash commands that embed domain expertise for specific workflows.

### 1. gsc-script-master

- **Goal**: Prevent hallucinated or non-existent GSC syntax.
- **Why**: AI agents frequently hallucinate C++ OOP patterns or wrong built-ins. GSC has no compiler to catch this.
- **Content**: Point to `knowledge/gsc-builtins.json`, define strict GSC 1.0 syntax rules (`spawn()`, `endon()`, `notify()`, `wait`), enforce running `gsc_lint` before committing any `.gsc` files.

### 2. iw4-ui-engineer

- **Goal**: Master the text-based IW4 UI engine.
- **Why**: `.menu` syntax (`itemDef`, `menuDef`) is arcane and poorly documented.
- **Content**: Core UI definitions from `knowledge/menu-properties.json`, DVAR expression hooking, brace matching rules, `exp` macro formats.

### 3. userraw-sandbox-manager

- **Goal**: Establish the local-first "Development Mode" loop.
- **Why**: Editing `.iwd` files directly is risky. Active development should target `fs_game/userraw`.
- **Content**: Force deploying/modifying files in `userraw/` during iteration; console commands to verify changes (`vid_restart`, `map_restart`).

### 4. legacy-code-porter

- **Goal**: Standardize migrating community code to modern modular patterns.
- **Why**: Phase 4 focuses on porting OpenWarfare admin scripts and wrapping C#/C++ tools.
- **Content**: Guidelines for translating legacy CoD4/MW2 patterns to modern TypeScript (for MCP development); best practices for adapting monolithic GSC mods.

### 5. zonebuilder-compiler

- **Goal**: Automate FastFile compilation.
- **Why**: Compiling `.ff` FastFiles requires rigid CSV zone configurations.
- **Content**: Rules for valid ZoneBuilder `.csv` payloads (e.g., `rawfile,maps/mp/gametypes/_my_script.gsc`); CLI commands to compile the mod cleanly.
