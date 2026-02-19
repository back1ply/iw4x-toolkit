# Project Strategy: The "Hybrid" Worklfow

> **Vision**: Combine 2009's "Golden Era" knowledge with 2026's "Modern" tooling to create the ultimate AI modding assistant.

## The Challenge

Modding MW2 (IW4) in 2026 presents a unique challenge:
1.  **Lost Tools**: Official tools don't exist for MW2.
2.  **Scattered Knowledge**: Documentation is spread across 15 years of forum posts, dead wikis, and Wayback Machine snapshots.
3.  **Modern Expectations**: Agents (and users) expect 2026-era tooling (Linters, CI/CD, Hot-reloading), but the game engine is from 2009.

## Strategic Pillars

### 1. Engine Heritage (Cross-Title Knowledge)
The IW Engine is iterative. MW2 (IW4) is built directly on CoD4 (IW3).
-   **Strategy**: Use "Upstream" documentation to fill "Downstream" gaps.
-   **Tactic**: When MW2 documentation is missing, the agent should trust CoD4/WaW official documentation for:
    -   GSC Script syntax and built-in functions.
    -   FastFile asset structures (MenuDefs, WeaponFiles).
    -   *New*: Common error patterns (leaks, syntax errors) are identical. We can use CoD4 troubleshooting guides for MW2.

### 2. The "Userraw" Workflow (Local-First Development)
Directly editing `.iwd` files is risky and slow ("Production Mode"). Active development should utilize the engine's built-in override system ("Development Mode").
-   **Old Pattern**: `Read IWD -> Edit -> Write IWD`.
-   **New Pattern**: Extract assets to `fs_game/userraw`. The game loads these "loose files" with higher priority.
-   **Goal**: Build tools (`setup_workspace`, `deploy_mod`) that manage this environment, allowing for rapid iteration without constant archiving.
-   **Strategic Note**: In the wake of X Labs/H2M shutdowns (2023-2024), *decentralized, local-only* tooling is the only safe path for preservation. We do not rely on central servers.

### 3. "Compilers" for Scripting (Static Analysis)
Since we cannot verify code by running it (no unit test framework for GSC), we must verify it by *reading* it.
-   **Missing Piece**: GSC has no compiler. You find generic syntax errors only when the map fails to load.
-   **Asset Compilation**: **ZoneBuilder** (2017+) is the standard for building FastFiles. We should treat it as the "Linker" in our toolchain.
-   **Solution**: **GSC Linter**. A strict static analysis tool to catch:
    -   Syntax errors (Braces, Semi-colons).
    -   Logic errors (Undefined variables, invalid #includes).
    -   Type safety (Argument counts for built-ins).
    -   *New*: Hard Limit Checks (DVAR count < 4096, Entity count limits).

## Roadmap Priorities

1.  **DVAR Search**: Server-side filtering to access the 1,700+ DVAR knowledge base efficiently.
2.  **Knowledge Mining**: Systematically scraping CoD4/WaW wikis to build a `gsc-builtins` cheat sheet.
3.  **GSC Linter**: The core "safety net" for the agent.
4.  **Userraw Tooling**: Automating the workspace setup.
5.  *New*: **OpenWarfare Feature Porting**: Analyze the OpenWarfare source code to "port" its feature-rich administrative scripts to modern IW4x.
