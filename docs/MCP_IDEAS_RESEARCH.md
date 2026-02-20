# MCP Tool Suggestions for iw4x-toolkit

Based on a review of the current `iw4x-toolkit` capabilities (which heavily focus on `.iwd` file operations) and modern trends in MCP usage for game development (like the Unity, Godot, and Roblox MCPs), here are suggestions to expand the toolkit into a true "AI Lead Programmer" for the IW engine.

## 1. Live Server Interaction (The "Roblox Client Control" Model)
Modern MCPs (like Roblox and Hytale) allow LLMs to interact with *running* game sessions.
*   **The Idea**: An RCON (Remote Console) MCP tool.
*   **Tools**: `rcon_send(command)`, `rcon_read_log()`.
*   **Why**: Instead of just writing code and hoping it works, the AI could inject test commands (`map_restart`, `fast_restart`, `give all`), read the live server console log for GSC script errors/crashes, and iteratively fix its own code without you having to manually alt-tab and read the error screen.

## 2. Static Analysis & Type Checking (The "Dart/Flutter MCP" Model)
The web search highlighted that MCPs are excellent for wrapping static analysis tools. Since GSC has no native compiler, we have to build our own.
*   **The Idea**: The GSC Linter you mentioned in `TODO.md` is spot on, but we should expose it to the MCP immediately upon writing a file.
*   **Tools**: `gsc_analyze(file_path)`
*   **Why**: When the AI uses `write_to_file` on a `.gsc` document, it should autonomously call `gsc_analyze` to check for missing `#include` statements, typo'd built-in functions (checking against `gsc-builtins.json`), or bad DVAR assignments.

## 3. Asset Parsing & "Read-Only" Visiblity
Engines like Unity expose their scene hierarchy to the MCP. We can't do that live in Radiant, but we *can* parse compiled assets.
*   **The Idea**: FastFile (`.ff`) and BSP (`.d3dbsp`) readers.
*   **Tools**: `ff_get_rawfiles(ff_path)`, `bsp_get_entities(bsp_path)`
*   **Why**: If I am writing a zombiemod script and need to know the origin coordinates to spawn a mystery box, I currently have to ask you to open Radiant. If we have a tool that wraps `OpenAssetTools` or `ZoneTool` to dump the entity string from a `.d3dbsp`, I can read the coordinates myself and write the script autonomously.

## 4. Semantic Knowledge Retrieval (The "Local RAG" Model)
*   **The Idea**: A specialized semantic search for the `iw4x-rawfiles` (the decompiled base game scripts).
*   **Tools**: `gsc_find_example(topic)`
*   **Why**: Instead of standard `grep`, a tool that uses local embeddings to search the base game scripts for "how does Infinity Ward handle helicopter pathing?" This acts as the ultimate reference guide, allowing the AI to perfectly mimic 2009 programming patterns without hallucinating modern constructs.

## 5. UI Layout Previewer (Headless)
*   **The Idea**: A `.menu` file structure validator and basic dimensional calculator.
*   **Tools**: `menu_validate_layout(file_path)`
*   **Why**: The hardest part of UI modding in COD is the absolute positioning (`rect x y w h`). A tool that calculates the absolute math of nested `itemDef` macros would allow the AI to catch overlapping elements or off-screen boundaries *before* you load the game.
