# Sources and References

Research sources for the iw4x-toolkit plugin — DVAR knowledge base, IWD/asset formats, GSC scripting, and the broader IW engine modding ecosystem.

IW4X targets **Call of Duty: Modern Warfare 2 (2009)** running on the **IW4 engine**. The IW engine lineage means many formats, DVARs, and scripting patterns are shared across titles from CoD4 (IW3) through Ghosts (IW6) and beyond.

---

## IW4X — Project Resources

### Official

- **IW4x Client (Source)**
  https://github.com/iw4x/iw4x-client
  The main C++ client mod for MW2. Includes ZoneBuilder, DVAR unprotection, and modding support. 5,000+ commits, actively maintained.

- **IW4x Documentation**
  https://docs.iw4x.io/
  Official docs covering quickstart, installation, bot warfare, and server setup.

- **IW4x Rawfiles**
  https://github.com/iw4x/iw4x-rawfiles
  Stock GSC scripts used by the IW4x client. Essential reference for game script structure.

- **IW4x Open Formats**
  https://github.com/iw4x/iw4-open-formats
  Open format specifications for IW4 assets.

- **IW4x GitHub Organization**
  https://github.com/iw4x
  All 20+ repositories including `iw3x-port`, `iw5x-port`, `zonebuilder-wrapper`, `img-format-helper`, and more.

### Community

- **shit-ware/IW4 (Raw Game Files)**
  https://github.com/shit-ware/IW4
  Extracted MW2 rawfiles — GSC scripts, menu files, weapon definitions, soundaliases, vision files, animscripts. Invaluable reference for IW4 internals. Also contains `devgui_renderer.cfg` used for DVAR subcategory assignments.

- **IW4MAdmin**
  https://github.com/RaidMax/IW4M-Admin
  Server administration tool supporting IW4x, Plutonium, CoD4x, and more. Web interface, plugin support, player management.

---

## DVAR Data Sources

### Primary — DVAR lists with defaults

- **bloodbourne/M2-dvars-list**
  https://github.com/bloodbourne/M2-dvars-list
  Complete dump of 700+ MW2 DVARs with default values. Primary data source for `knowledge/dvars.json`.

- **Jeepcoders/Call-of-Duty-Dvars**
  https://github.com/Jeepcoders/Call-of-Duty-Dvars
  Cross-game DVAR collection covering CoD4 through MW3. Useful for cross-referencing DVARs shared across engine versions.

- **X Labs Console Commands**
  https://xlabs-mirror.github.io/console_commands
  Console commands/DVARs table across IW4x, IW6x, and S1x with compatibility matrix.

### DVAR documentation and research

- **COD Engine Research — DVARs (MW2)**
  https://codresearch.dev/index.php/DVARs_(MW2)
  Community wiki documenting the DVAR type system (bool, int, float, string, enum, color), flag definitions (CHEAT, ARCHIVE, LATCHED), and engine context (client vs server vs shared).

- **MW2 Ultimate DVAR List (WeMod)**
  https://community.wemod.com/t/mw2-ultimate-dvar-list-updated-j-tags-only/1316
  Comprehensive MW2 DVAR list with descriptions covering gameplay, rendering, and more.

- **Ultimate DVAR List (Se7enSins)**
  https://www.se7ensins.com/forums/threads/ultimate-dvar-list-from-shaders-to-commands-to-dvar-lists-warning-big-lists.926425/
  Cross-game DVAR compilation including shaders, commands, and per-game lists.

- **CoD4 Custom DVARs Guide (Zeroy Wiki)**
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_4%3A_Custom_Dvars
  How to create, validate, and use custom DVARs in GSC scripts. Concepts apply to IW4.

### Renderer categories

- **shit-ware/IW4 — devgui_renderer.cfg**
  https://github.com/shit-ware/IW4/blob/master/devgui_renderer.cfg
  IW4 developer GUI config organizing renderer DVARs into hierarchical categories (lighting, shadows, fog, post-processing). Used for `r_*` subcategory assignments.

---

## IWD / ZIP Format

- **APPNOTE.TXT — .ZIP File Format Specification**
  https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
  IWD files are standard ZIP archives with a `.iwd` extension. Central directory structure (used for CRC-based diffing) and entry headers defined here.

- **IW4x Client — fs_game implementation**
  https://github.com/iw4x/iw4x-client
  Reference for how the IW4 engine loads IWD files, file priority order, and mod directory conventions (`mods/`, `userraw/`, `raw/`).

---

## FastFile / Zone Format

- **Zeroy Wiki — CoD4 FastFile Format**
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_4:_FastFile_Format
  Deep technical documentation of the .ff format: header structure, 33 asset index types (xmodel, material, shader, image, weapon, rawfile, stringtable, etc.), data block formats, separator conventions.

- **Zeroy Wiki — CoD5 FastFile Format**
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_5:_FastFile_Format
  WaW fastfile structure: header (48 bytes), index records, content blocks, ZLIB decompression.

- **OpenAssetTools (OAT)**
  https://github.com/Laupetin/OpenAssetTools
  Modern open-source fastfile Linker/Unlinker. Supports IW3, IW4, IW5, T5, T6. 2,900+ commits, actively developed.
  Docs: https://openassettools.dev/guide/components.html

- **ZoneTool**
  https://github.com/ZoneTool/zonetool
  Fastfile linker for IW3, IW4, IW5. Supports most asset types. Compatible with IW4x and Plutonium IW5.

- **Aurora Docs — ZoneTool Basics**
  https://docs.auroramod.dev/zonetool-basics
  Practical guide to ZoneTool commands (loadzone, dumpzone, dumpmap) with examples for porting assets between games.

- **CoD FF Tools**
  https://github.com/primetime43/CoD-FF-Tools
  GUI FastFile editor for CoD4, WaW, MW2 across PS3, Xbox 360, PC.

---

## GSC Scripting

### Documentation and references

- **Zeroy Wiki — CoD Script Handbook**
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_4:_CoD_Script_Handbook
  The most thorough GSC tutorial available. Variables, operators, functions, loops, arrays, entities, threading.

- **Zeroy Wiki — Scripting Reference**
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_4:_Scripting_Reference_-_String
  Categorized function reference: AI, Animation, Array, Client, Damage, Debug, DVARs, Effects, Entity, HUD, Level, Math, Menus, Player, Sound, Spawn, Weapons.

- **X Labs GSC Functions**
  https://xlabs-mirror.github.io/gsc_functions
  Custom GSC functions added by X Labs clients (IW4x, IW6x, S1x) — `GetPing`, `GetIP`, `Exec`, `PrintConsole`, `ToUpper`, etc.

- **UGX-Mods Scripting Guide**
  https://wiki.ugx-mods.com/Modding/World-at-War-Modtools/Script/Scripting-Guide
  WaW/BO1 scripting guide — syntax, loops, CoD utility functions, entity management. Highly applicable to IW4 GSC.

- **Se7enSins CoD4 Scripting Reference**
  https://www.se7ensins.com/forums/threads/reference-cod4-scripting-reference.467704/
  Practical GSC reference: variables, operators, if/else, loops, functions, arrays, switch, notify/endon/waittill.

- **Plutonium GSC Resources Thread**
  https://forum.plutonium.pw/topic/198/resource-gsc-resources-and-helpful-links
  Curated list of GSC resources linking to CabConModding, UGX, Zeroy Wiki, ZombieModding.

### Tools

- **xensik/gsc-tool**
  https://github.com/xensik/gsc-tool
  The definitive GSC compiler/decompiler. Supports IW3–IW8, S1–S4, H1–H2, T4–T9 across PC and consoles. Modes: `asm`, `disasm`, `comp`, `decomp`, `parse`. Contains the most complete formal Bison grammar for GSC.

- **VSCode GSC Extension**
  https://marketplace.visualstudio.com/items?itemName=mjkzy.vscode-gsc-ultimate
  Full language support for `.GSC`/`.GSH` — syntax highlighting, completion, diagnostics, go-to-definition, hover info. Supports CoD1 through MWIII.

- **Muhlex/vscode-gsc**
  https://github.com/Muhlex/vscode-gsc
  TypeScript-based GSC language support for VSCode targeting IW3/IW4. Includes a tokenizer and basic parser.

- **leafized/GSC-Functions**
  https://github.com/leafized/GSC-Functions
  Compilation of GSC functions and game script dumps for IW4, IW6, T4, T5, T6, T7, T8, S2.

- **ZoneTool/gsc-asm**
  https://github.com/ZoneTool/gsc-asm
  GSC assembler/disassembler for IW5.

- **Cerberus (BO2/BO3 GSC Decompiler)**
  https://github.com/Scobalula/Cerberus-Repo

### Script collections

- **INeedBots/iw4_bot_warfare**
  https://github.com/ineedbots/iw4_bot_warfare
  Bot Warfare mod for MW2/IW4x. Well-documented with DVAR references and waypoint systems. Also has versions for CoD4x, T6, IW5.

- **DoktorSAS** (GitHub)
  https://github.com/DoktorSAS
  Mapvote scripts for T6, IW5, H1, IW6, plus large GSC code collection across IW3–T7.

---

## Menu File Format

- **aerosoul94/IWMenuDumper**
  https://github.com/aerosoul94/IWMenuDumper
  IW Engine Menu Asset Decompiler. Decompiles compiled menu files from MW2 (IW4) and MW3 (IW5). Source includes `iw4.h`/`iw5.h` with menu structure definitions.

- **shit-ware/IW4 — ui_mp/ Menu Files**
  https://github.com/shit-ware/IW4
  Raw `.menu` files for MW2's entire UI — class editor, scoreboard, options, HUD elements.

- **Zeroy Wiki — Menu Modding Basics**
  https://wiki.zeroy.com/index.php/Call_of_Duty_5:_Menu_Modding_Basics
  menuDef structure, itemDef blocks, scriptMenuResponse, RECT coordinates, window backgrounds. Directly applicable to IW4.

- **iw4x-EbinMenu**
  https://github.com/505e06b2/iw4x-EbinMenu
  Example of a full scriptmenu mod for IW4x with native look. Includes working `ui_mp/` menu files.

---

## Asset Formats

### IWI textures

- **IW4x img-format-helper**
  https://github.com/iw4x/img-format-helper
  Image format helper tool from the IW4x organization. IWI is the proprietary image format used across all IW engine games (IWI → DDS → edit → DDS → IWI).

### XModel / XAnim

- **CoD Asset Importer (Blender)**
  https://github.com/mauserzjeh/cod-asset-importer
  Blender add-on for importing CoD assets. Supports CoD1 through BO1 — xmodel, xmodelsurfs, xmodelparts, xanim, materials, images, d3dbsp maps.

### D3DBSP maps

- **Zeroy Wiki — d3dbsp Format**
  https://wiki.zeroy.com/index.php/Call_of_Duty_2:_d3dbsp
  Lump-by-lump documentation: Materials (72 bytes per entry with flags), Lightmaps, Light Grid Hash, Brushes, Planes, Vertices. Applicable across IW engine versions.

### Asset extraction

- **Greyhound**
  https://github.com/Scobalula/Greyhound
  Asset extractor for IW engine titles. XModels, XAnims, XImages, XEffects, Raw Files, Sounds across CoD4 through WWII.
  Docs: https://scobalula.github.io/Greyhound/

- **Kobra**
  https://github.com/VenomModding/Kobra
  Fork of Greyhound adding XEffect and GDT support.

### Weapon files

- **shit-ware/IW4 — weapons/mp/**
  https://github.com/shit-ware/IW4
  Raw MW2 weapon definition files. Text files defining all weapon properties (damage, range, fire rate, animations, sounds, effects).

- **HGMServers/cod-client-weapons**
  https://github.com/HGMServers/cod-client-weapons
  Developer weapon names (console codenames) for CoD4x, IW4x, IW5, T5, T4, IW6x. Essential for scripting weapon spawns.

- **Zeroy Wiki — Weapons Modding**
  https://wiki.zeroy.com/index.php/Call_of_Duty_4:_Weapons_Modding
  Tutorial on modifying weapon files: fireType, clipSize, maxAmmo, damage values. Shows IWD packaging for weapon mods.

---

## Related Mod Clients

The IW engine modding ecosystem spans many titles. Formats, DVARs, and scripting patterns are often shared or evolved across these projects.

| Game | Client | Repository |
|------|--------|------------|
| CoD4: Modern Warfare | CoD4x | https://github.com/callofduty4x/CoD4x_Server |
| CoD: World at War | Plutonium T4 | https://github.com/plutoniummod/t4-scripts |
| CoD: Modern Warfare 2 | **IW4x** | https://github.com/iw4x/iw4x-client |
| CoD: Modern Warfare 3 | Plutonium IW5 | https://github.com/plutoniummod/iw5-scripts |
| CoD: Black Ops | Plutonium T5 | https://github.com/plutoniummod/t5-scripts |
| CoD: Black Ops 2 | Plutonium T6 | https://github.com/plutoniummod/t6-scripts |
| CoD: Black Ops 3 | T7x (AlterWare) | https://git.alterware.dev/alterware/t7-rawfiles |
| CoD: Ghosts | IW6x (AlterWare) | https://git.alterware.dev/alterware/iw6-mod |
| CoD: Advanced Warfare | S1x (AlterWare) | https://git.alterware.dev/alterware/s1-mod |
| CoD4: Remastered | H1-Mod | https://github.com/auroramod/h1-mod |
| MW2: Campaign Remastered | H2-Mod | https://github.com/alicealys/h2-mod |

### Mod client hubs

- **AlterWare** — https://alterware.dev/ — Hub for IW4-SP, IW5-Mod, IW6-Mod, S1-Mod, T7x
- **Plutonium** — https://forum.plutonium.pw/ — T4, T5, T6, IW5
- **CoD4x** — https://cod4x.ovh/ — CoD4 server/client modding

---

## Engine Research (General)

- **IW Engine (Wikipedia)**
  https://en.wikipedia.org/wiki/IW_(game_engine)
  Overview of all IW engine versions from IW 3.0 through IW 9.0. Maps engine versions to game titles.

- **Activision Research Publications**
  https://research.activision.com/publications
  Official technical papers: rendering, lighting, networking. Includes "Rendering of COD:IW" (Michal Drobot), "Raytraced Shadows in COD:MW".

- **momo5502's Blog**
  https://momo5502.com/posts/2022-11-17-reverse-engineering-integrity-checks-in-black-ops-3/
  Reverse engineering deep dives by a core developer behind IW4x, H1-Mod, and other projects.

- **DevRaw — Modding Tools Directory**
  https://www.devraw.net/resources
  Curated list of CoD modding tools: Greyhound, Husky, HydraX, Cordycep, Kobra, GameImageUtil, SExCOD, VKRadiant, and more.

---

## Community Wikis and Forums

- **Zeroy Wiki** — https://wiki.zeroy.com/ — The most comprehensive CoD modding wiki. CoD1 through BO1: fastfile format, d3dbsp, scripting, mapping, weapons, menus.
- **UGX-Mods Wiki** — https://wiki.ugx-mods.com/ — Zombies-focused modding wiki with scripting guides and zone management.
- **Modme Wiki** — https://wiki.modme.co/ — BO3 modding wiki with scripting guides.
- **Se7enSins** — https://www.se7ensins.com/forums/ — DVAR lists, scripting references, weapon modding.
- **CoDJumper** — https://www.codjumper.com/forums/ — CoD4 modding and jump community. Custom menus, scripting tutorials.
- **AlterWare Forum** — https://forum.alterware.dev/ — IW4/IW5/IW6/S1 modding guides and support.
- **X Labs Mirror (archived)** — https://xlabs-mirror.github.io/ — Archived IW4x/IW6x/S1x documentation, mod guides, GSC function reference.

---

## Tools and Libraries Used

| Library | Version | Purpose | URL |
|---------|---------|---------|-----|
| `@modelcontextprotocol/sdk` | ^1.12.1 | MCP server framework | https://github.com/modelcontextprotocol/typescript-sdk |
| `adm-zip` | ^0.5.16 | ZIP/IWD read/write operations | https://github.com/cthackers/adm-zip |
| `zod` | ^3.23.0 | Schema validation for tool parameters | https://github.com/colinhacks/zod |
| `vitest` | ^3.0.0 | Test framework | https://github.com/vitest-dev/vitest |
