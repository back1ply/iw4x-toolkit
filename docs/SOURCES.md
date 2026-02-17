# Sources and References

Research sources used to build the iw4x-toolkit, particularly the DVAR knowledge base and IWD format handling.

## DVAR Data Sources

### Primary — DVAR list with defaults

- **bloodbourne/M2-dvars-list**
  https://github.com/bloodbourne/M2-dvars-list
  Complete dump of 700+ MW2 DVARs with default values. Used as the primary data source for `knowledge/dvars.json`. All DVAR names and default values originate from this list.

### Renderer categories and subcategories

- **shit-ware/IW4 — devgui_renderer.cfg**
  https://github.com/shit-ware/IW4/blob/master/devgui_renderer.cfg
  IW4 developer GUI config file that organizes renderer DVARs into hierarchical categories (lighting, shadows, fog, post-processing, etc.). Used to inform subcategory assignments for `r_*` DVARs.

### DVAR type system, flags, and engine internals

- **COD Engine Research — DVARs (MW2)**
  https://codresearch.dev/index.php/DVARs_(MW2)
  Community wiki documenting the DVAR type system (bool, int, float, string, enum, color), flag definitions (CHEAT, ARCHIVE, LATCHED, etc.), and engine context (client vs server vs shared). Used for type inference and flag assignment on enriched DVARs.

### IW4X client documentation

- **IW4X Project**
  https://iw4x.org/
  The IW4X community client for MW2. General reference for understanding how DVARs behave in the IW4X context, which DVARs are unlocked/extended, and client-specific modifications.

## IWD Format References

### ZIP format specification

- **APPNOTE.TXT — .ZIP File Format Specification**
  https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
  IWD files are standard ZIP archives with a `.iwd` extension. The central directory structure (used for CRC-based diffing) and entry headers are defined here.

### IW engine file system

- **IW4X GitHub — fs_game implementation**
  https://github.com/iw4x/iw4x-client
  Reference for understanding how the IW4 engine loads IWD files, file priority order, and mod directory conventions (`mods/`, `userraw/`, `raw/`).

## GSC Scripting References (Phase 2)

These sources are collected for the planned GSC formatter and linter but are not yet used in Phase 1.

### GSC parser/grammar

- **xensik/gsc-tool**
  https://github.com/xensik/gsc-tool
  C++ GSC compiler/decompiler with Bison grammar files for IW engine script variants. Contains the most complete formal grammar for GSC across engine versions (IW3, IW4, IW5, T5, T6, etc.). Reference for building a recursive descent parser.

### GSC VSCode extension (TypeScript)

- **Muhlex/vscode-gsc**
  https://github.com/Muhlex/vscode-gsc
  TypeScript-based GSC language support for VSCode targeting IW3/IW4. Includes a tokenizer and basic parser. Closest existing reference for a TypeScript GSC formatter.

### Menu file format

- **aerosoul94/IWMenuDumper**
  https://github.com/aerosoul94/IWMenuDumper
  C tool for dumping IW engine menu files. Contains struct definitions for the menu file binary format and property types. Reference for the planned menu file validator.

## Engine Research (General)

- **Jeepcoders/Call-of-Duty-Dvars**
  https://github.com/Jeepcoders/Call-of-Duty-Dvars
  Cross-game DVAR collection covering CoD4 through MW3. Useful for cross-referencing DVARs that exist across engine versions.

- **IW4 Modding Wiki (archived)**
  Various community resources documenting IW4 engine behavior, GSC built-in functions, and modding techniques. Specific URLs vary as community wikis move frequently.

## Tools and Libraries Used

| Library | Purpose | URL |
|---------|---------|-----|
| `adm-zip` | ZIP/IWD read/write/update operations | https://github.com/cthackers/adm-zip |
| `@modelcontextprotocol/sdk` | MCP server framework for Claude Code | https://github.com/modelcontextprotocol/typescript-sdk |
| `zod` | Runtime schema validation for tool parameters | https://github.com/colinhacks/zod |
