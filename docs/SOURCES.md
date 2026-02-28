# Sources and References

Research sources for the iw4x-toolkit plugin — DVAR knowledge base, IWD/asset formats, GSC scripting, and the broader IW engine modding ecosystem.

IW4x is a **community client mod** for **Call of Duty: Modern Warfare 2 (2009)** that enables private multiplayer servers (since Activision shut down official IW4 servers). It runs on the **IW4 engine**, which itself evolved from the **IW3 engine** (CoD4: Modern Warfare) and shares design DNA with **T4** (CoD: World at War). The community modding ecosystem for IW4x grew directly out of the CoD4x and WaW modding communities — formats, DVARs, scripting conventions, and tooling are closely related across all three generations.

---

## IW4X — Project Resources

### Official

- **IW4x Homepage**
  https://iw4x.io/
  Official IW4x site. Links to documentation, Discord, and GitHub.

- **IW4x Client (Source)**
  https://github.com/iw4x/iw4x-client
  The main C++ client mod for MW2. Includes ZoneBuilder (`-zonebuilder` flag), DVAR unprotection, and modding support. 241 stars, updated February 2026.

- **IW4x Documentation**
  https://docs.iw4x.io/
  Official docs: quickstart, installation, bot warfare, server setup, and modding. Built with Astro Starlight, last updated October 2025.
  - Server hosting: https://docs.iw4x.io/hosting/server-hosting/

- **IW4x Rawfiles**
  https://github.com/iw4x/iw4x-rawfiles
  Stock GSC scripts used by the IW4x client. Primary reference for game script structure and IW4-specific built-in GSC usage. 70 stars, updated February 2026.

- **IW4x Open Formats**
  https://github.com/iw4x/iw4-open-formats
  C++ serializer/deserializer for IW4 asset formats. Static library for building IW4 tools; output assets can be read directly by IW4x ZoneBuilder. 11 stars, updated November 2025.

- **IW4x Wiki**
  https://github.com/iw4x/iw4x-wiki
  Official knowledge base. References Zeroy wiki, Modme, and Plutonium docs as canonical GSC scripting references.

- **IW4x Launcher**
  https://github.com/iw4x/launcher
  Cross-platform launcher for IW4x. Updated February 2026.

- **IW4x GitHub Organization**
  https://github.com/iw4x
  All repositories including the ones below.

- **iw4x/iw3x-port**
  https://github.com/iw4x/iw3x-port
  C++ tool for exporting and converting assets from CoD4 (IW3) to IW4. The `iw3xport.exe` used in the map porting workflow. 14 releases, v1.2.3 released September 2025.

- **iw4x/iw5x-port**
  https://github.com/iw4x/iw5x-port
  Map and asset converter for porting IW5 (MW3) content to IW4. Active.

- **iw4x/iw4x-map-porting-utility**
  https://github.com/iw4x/iw4x-map-porting-utility
  GUI middleware that unifies the CoD4→IW4 map porting workflow. Wraps iw3xport and ZoneBuilder: export assets from CoD4, build zone, output to `usermaps/`. 10 stars, updated October 2024.

- **iw4x/zonebuilder-wrapper**
  https://github.com/iw4x/zonebuilder-wrapper
  Thin wrapper around the IW4x client's built-in ZoneBuilder (`-zonebuilder` flag) for building IW4x-compatible zone files. Updated June 2025.

- **iw4x/iw4-server-configs**
  https://github.com/iw4x/iw4-server-configs
  Canonical prebuilt server configuration files: `DedicatedServer.bat/.sh`, `server.cfg`, `partyserver.cfg`. The starting-point config set referenced by the official server-hosting docs. 4 stars, updated February 2026.

- **IW4x Client — CHANGELOG.md**
  https://github.com/iw4x/iw4x-client/blob/main/CHANGELOG.md
  Full version history documenting every GSC built-in added by IW4x (`FileRead`, `FileWrite`, `HttpGet`, `OnPlayerSay`, `StorageSet`, `ReplaceFunc`, etc.) and every DVAR added per release. The authoritative inventory of IW4x-specific extensions.

### Community

- **shit-ware/IW4 (Raw Game Files)**
  https://github.com/shit-ware/IW4
  Extracted MW2 rawfiles — GSC scripts, menu files, weapon definitions, soundaliases, vision files, animscripts. Invaluable reference for IW4 internals. Also contains `devgui_renderer.cfg` used for DVAR subcategory assignments. **Note:** This is also the closest available substitute for an IW4 GSC decompiler — no public tool exists for decompiling IW4 GSC bytecode; these are the extracted source scripts.

- **Rex109/CoD4QOL**
  https://github.com/Rex109/CoD4QOL
  Quality-of-life plugin for CoD4 (IW3). Unlocks restricted console variables/DVARs, adds graphics customization (FOV, draw distance, fullbright), and includes a demo browser/manager. 16 releases, updated January 2026. Directly relevant since IW4 inherited many of CoD4's DVAR restrictions and plugin patterns.

- **FreeTheTech101/IW4-Dump-Files**
  https://github.com/FreeTheTech101/IW4-Dump-Files
  Near-complete IW4 raw file dump: GSC scripts, configs, weapon files, and CSV data, packaged for direct use with IW4x modding. 39 stars. Useful secondary reference alongside shit-ware/IW4.

- **Rackover/iw4scr**
  https://github.com/Rackover/iw4scr
  Scripts and raw config files for IW4/MW2 including per-map load scripts, default configs, and weapon/MP files. Secondary stock script reference.

- **IW4MAdmin**
  https://github.com/RaidMax/IW4M-Admin
  Definitive server administration tool supporting IW4x, Plutonium, CoD4x, H1-Mod, and more. Web interface, plugin system, player management, anti-cheat. 239 stars, latest release February 2026.

- **IW4MAdmin Plugin Store**
  https://store.raidmax.org/
  Official plugin marketplace for IW4MAdmin. Hosts subscribable plugins: Discord bridge, Weapon Restrict, Votify, VPN Detection, Ping Limiter, Dynamic Map Reservoir, Cron Manager, and more — each with setup instructions.

- **Ayymoss/BanHub**
  https://github.com/Ayymoss/BanHub
  IW4MAdmin plugin for global reputation-based ban sharing between server communities, with an appeals system. 5 stars.

- **Zwambro/iw4madmin-plugin-iw4todiscord**
  https://github.com/Zwambro/iw4madmin-plugin-iw4todiscord
  IW4MAdmin plugin that forwards ban, report, chat, and server-status events to Discord webhooks. 5 stars.

- **Muhlex/iw4x-gsc**
  https://github.com/Muhlex/iw4x-gsc
  GSC-based server admin command system for IW4x. In-game `!commands`, kick, ban, map change, DVAR management via chat or RCON. Useful reference for GSC-based server management patterns.

---

## AlterWare

AlterWare is the primary active hub for IW4-SP, IW5-Mod (MW3), IW6-Mod (Ghosts), and S1-Mod (Advanced Warfare). X Labs (which originally maintained IW4x, IW6x, S1x) shut down in May 2023 — AlterWare absorbed/continued those projects.

- **AlterWare Website**
  https://alterware.dev/
  Hub for IW4-SP, IW5-Mod, IW6-Mod, S1-Mod clients. 16,500+ Discord members.

- **AlterWare Documentation**
  https://alterware.dev/docs
  Installation guides for all AlterWare-distributed clients. Note: no scripting/GSC content — modding guides live on the forum.

- **AlterWare Forum**
  https://forum.alterware.dev/
  Active modding and support forum.
  - IW4x Mod Guide (General Overview): https://forum.alterware.dev/t/iw4x-mod-guide-general-overview/846
  - IW5-Mod Guide: https://forum.alterware.dev/t/iw5-mod-mod-guide-general-overview/905
  - IW4x FAQ (setplayerdata, prestige commands): https://forum.alterware.dev/t/iw4x-frequently-asked-questions/845
  - MW2 Mods Collection: https://forum.alterware.dev/t/mods-collection-for-mw2/726

- **AlterWare Gitea (Source repos)**
  https://git.alterware.dev/alterware/
  Self-hosted Gitea: `iw4x-sp`, `iw6-mod`, `s1-mod`, `alterware-launcher`, `master-server`, `IW5-arena`, `jump-gsc`, `t7-rawfiles`. All updated January–February 2026.

- **X Labs Mirror (archived 2023-05-24)**
  https://xlabs-mirror.github.io/
  Archived snapshot of the defunct X Labs documentation. Historical reference only.
  - GSC Functions: https://xlabs-mirror.github.io/gsc_functions — only tabular reference for IW4x-specific extended built-ins (GetPing, GetIP, IsBot, StorageSet, etc.)
  - Console Commands: https://xlabs-mirror.github.io/console_commands — per-client DVAR/command compatibility matrix
  - IW4x Server Support: https://xlabs-mirror.github.io/support_iw4x_server — server setup guide (archived)
  - IW4x Mod Guide: https://xlabs-mirror.github.io/mod_guide — mod folder structure (archived, superseded by AlterWare forum guide)

---

## DVAR Data Sources

### Primary — DVAR lists with defaults

- **bloodbourne/M2-dvars-list**
  https://github.com/bloodbourne/M2-dvars-list
  Complete dump of 700+ MW2 DVARs with default values. Primary data source for `knowledge/dvars.json`.

- **Jeepcoders/Call-of-Duty-Dvars**
  https://github.com/Jeepcoders/Call-of-Duty-Dvars
  Cross-game DVAR collection covering CoD4 through MW3. Useful for cross-referencing DVARs shared across engine versions.

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
  Modern open-source fastfile Linker/Unlinker. Supports IW3, IW4, IW5, T5, T6. 175 stars, v0.26.1 released January 2026. Very actively maintained.
  Docs: https://openassettools.dev/guide/components.html

- **ZoneTool**
  https://github.com/ZoneTool/zonetool
  Fastfile linker for IW3, IW4, IW5. Supports most asset types. Compatible with IW4x and Plutonium IW5.

- **Aurora Docs — ZoneTool Basics**
  https://docs.auroramod.dev/zonetool-basics
  Practical guide to ZoneTool commands (loadzone, dumpzone, dumpmap) with examples for porting assets between games.

- **XLabsProject/iw4-zone-asset-finder**
  https://github.com/XLabsProject/iw4-zone-asset-finder
  Searches IW4 assets by type/name across all zone files and builds minimal `zone_source.csv` dependency lists. Essential for finding which zones contain a given asset.

- **CoD FF Tools**
  https://github.com/primetime43/CoD-FF-Tools
  GUI FastFile editor for CoD4, WaW, MW2 across PS3, Xbox 360, PC.

---

## Map Making (CoD4 / IW3)

MW2/IW4 has no official mod tools — the community repurposes the CoD4 (IW3) mod tools, since both games share the Radiant map editor format and zone_source conventions.

- **CoD4 Mod Tools (Official SDK)**
  https://github.com/promod/CoD4-Mod-Tools
  Original Infinity Ward CoD4 Mod Tools v1.1 archived on GitHub. Includes:
  - `CoD4Radiant.exe` — Quake-lineage brush map editor
  - `CoD4CompileTools.exe` — BSP + light compilation frontend
  - `MoDBuilder.exe` — IWD/mod packaging
  - `CoD2_EffectsEd.exe` — visual effects (`.efx`) editor
  - `XModelExport.mll` / `XAnimExport.mll` — Maya plugins for model/animation export
  - `zone_source/` templates, `raw/` game data, `deffiles/` asset definitions
  ModDB download (603 MB): https://www.moddb.com/games/call-of-duty-4-modern-warfare/downloads/mod-tools-sdk
  **Requires CoD4 v1.4+.** Not on Steam — downloaded separately.

- **iw3xo-radiant (xoxor4d)**
  https://github.com/xoxor4d/iw3xo-radiant
  Project page: https://xoxor4d.github.io/projects/iw3xo-radiant/
  DLL mod dropped into CoD4 mod tools `bin/` that replaces the stock Radiant UI with an ImGui-based interface. Adds PhysX simulation, live-link between game and editor, in-editor BSP/light compilation, effects editor, model/prefab browser, and dozens of QoL fixes. The definitive enhanced CoD4 Radiant. Nightly builds available.

- **Zeroy Wiki — CoD4 Modding Tutorial**
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_4:_Modding_Tutorial
  Covers the Radiant → BSP compile → AssetManager → EffectsEd workflow for CoD4 maps and effects.

- **Zeroy Wiki — Import Models**
  https://wiki.zeroy.com/index.php?title=Call_of_duty_4:_Import_models
  Full Maya → `xmodel_export` → AssetManager pipeline including animated models, the `VERSION 8` → `VERSION 6` fix, and XAnim workflow.

---

## GSC Scripting

> **IW4 GSC decompiler gap:** No public tool exists for decompiling IW4 (MW2 2009) GSC bytecode. `xensik/gsc-tool` does not support IW4 (issue [#251](https://github.com/xensik/gsc-tool/issues/251), open since Feb 2025). The `shit-ware/IW4` rawfile dump is the only available source of IW4 game scripts.

### Documentation and references

- **Zeroy Wiki — CoD Script Handbook**
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_4:_CoD_Script_Handbook
  The most thorough GSC tutorial available. Variables, operators, functions, loops, arrays, entities, threading. CoD4-era but the GSC language is essentially identical in IW4. Last edited December 2023.

- **Zeroy Wiki — GSC Introduction**
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_4:_Introduction
  GSC language introduction. Prefer this over the wiki's "Scripting Reference" index page, which is largely a stub.

- **Plutonium — GSC Language Guide**
  https://plutonium.pw/docs/modding/gsc/
  Official Plutonium GSC language overview. The most authoritative modern GSC intro available.
  - How-to: https://plutonium.pw/docs/modding/gsc/how-to-gsc/
  - New features (Plutonium extensions): https://plutonium.pw/docs/modding/gsc/new-scripting-features/

- **CoD4x — In-repo Script Documentation**
  https://github.com/callofduty4x/CoD4x_Server/tree/master/scriptdocumentation
  CoD4x-specific GSC extensions documented in the server repo. Since IW4 evolved from IW3/CoD4, CoD4x additions are often analogous to IW4x extensions. 391 stars, updated December 2025.

- **X Labs GSC Functions (archived)**
  https://xlabs-mirror.github.io/gsc_functions
  Tabular reference for IW4x-specific extended built-in functions — `GetPing`, `GetIP`, `Exec`, `PrintConsole`, `ToUpper`, `IsBot`, `StorageSet`, etc. with per-client columns. The only structured reference for these extended builtins.

- **xerxes-at/iw4xscriptdoc**
  https://github.com/xerxes-at/iw4xscriptdoc
  WIP MW2 and IW4x GSC documentation in HTML format; forked from M-itch/codscriptdoc. Documents both vanilla MW2 functions and IW4x-added builtins with descriptions and signatures.

- **505e06b2/MW2-GSC-Documentation**
  https://github.com/505e06b2/MW2-GSC-Documentation
  MW2 GSC scripting reference covering types, built-in functions, and common patterns. 14 stars. Companion examples repo included.

- **Zeroy Wiki — CoD4 Scripting Reference (index)**
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_4:_Scripting_Reference
  Master index of all CoD4 scripting sub-pages: AI, Animation, Client, Damage, DVARs, HUD, Player, Weapons, etc. Function signatures carry over heavily to IW4/MW2.

- **Zeroy Wiki — CoD4 Scripting Reference: Weapons**
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_4:_Scripting_Reference_-_Weapons
  All weapon-related GSC functions with signatures: `GetAmmoCount`, `WeaponClipSize`, `MagicBullet`, `WeaponType`, etc.

- **Zeroy Wiki — CoD5 Scripting Reference**
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_5:_Scripting_Reference
  WaW scripting reference index covering the same module structure as CoD4. WaW functions are largely identical to MW2/IW4.

- **Zeroy Wiki — CoD4 Modding hub**
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_4:_Modding
  Master hub listing all CoD4 modding tutorials: scripting guides, model import, weapons, Radiant tips, and technical references. Best starting index for adjacent CoD4 content that applies to IW4.

- **Zeroy Wiki — CoD4 Scripting Reference: HUD** ⭐
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_4:_Scripting_Reference_-_Hud
  Canonical HUD function reference. Lists all HUD element functions with signatures: `NewClientHudElem`, `NewHudElem`, `NewTeamHudElem`, `SetText`, `SetShader`, `SetPoint`, `SetTimer`, `SetTimerUp`, `SetTenthsTimer`, `SetValue`, `SetClock`, `SetPlayerNameString`, `SetGameTypeString`, `SetWayPoint`, `FadeOverTime`, `MoveOverTime`, `ScaleOverTime`, `SetPulseFX`, `Destroy`, `Reset`, and more.

- **Zeroy Wiki — CoD4 Scripting Reference: Player**
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_4:_Scripting_Reference_-_Player
  Complete player entity function index with signatures — all methods callable on player entities.

- **Zeroy Wiki — CoD4 Scripting Reference: Entity**
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_4:_Scripting_Reference_-_Entity
  Complete entity function index: `GetEnt`, `GetEntArray`, `SetModel`, `IsTouching`, `ShowToPlayer`, `Hide`/`Show`, etc.

- **Zeroy Wiki — CoD5 Scripting Syntax and Grammar**
  https://wiki.zeroy.com/index.php?title=Call_of_Duty_5:_Scripting_Syntax_And_Grammar
  Detailed GSC syntax reference: what GSC is, file locations, variables/arrays/structs, execution flow, threads, and notifiers. Directly applicable to IW4 (same engine generation).

- **Zeroy Wiki — Category: Call of Duty 4**
  https://wiki.zeroy.com/index.php?title=Category:Call_of_Duty_4
  Full category listing all CoD4 wiki articles including `HUD/Key description`, `Scripting Hints`, `Scripting Brushes`, `Introduction to animation`, and many sub-topics not indexed elsewhere.

- **IW4x Wiki — GSC Reference** ⭐
  https://wiki.iw4x.dev/read/iw4x---overview/gsc.md
  Official IW4x documentation GSC page. Has a dedicated **HUD section** explicitly covering `newHudElem`, `createFontString`, `setPoint`, `setShader`, `setValue`, `setTimer`, and full HUD element property list. Also documents all IW4x-specific GSC extensions. The most IW4-targeted HUD reference available.

- **Modme Wiki — Scripting Guide**
  https://wiki.modme.co/wiki/black_ops_3/guides/Scripting-guide.html
  Community-driven modding wiki covering GSC fundamentals: arrays, entities, self/level, field access. Nominally BO3 but covers patterns identical to IW4 — cited by the IW4x overview page itself as a reference.

- **UGX-Mods Scripting Guide**
  https://wiki.ugx-mods.com/Modding/World-at-War-Modtools/Script/Scripting-Guide
  WaW/BO1 scripting guide — syntax, loops, CoD utility functions, entity management. Highly applicable to IW4 GSC.

- **UGX-Mods Script Database**
  https://www.ugx-mods.com/script/
  Searchable database of community-contributed GSC scripts. Covers WaW/BO1 custom zombies and multiplayer scripting with browsable categories and source downloads.

- **Se7enSins CoD4 Scripting Reference**
  https://www.se7ensins.com/forums/threads/reference-cod4-scripting-reference.467704/
  Practical GSC reference: variables, operators, if/else, loops, functions, arrays, switch, notify/endon/waittill.

- **Plutonium GSC Resources Thread**
  https://forum.plutonium.pw/topic/198/resource-gsc-resources-and-helpful-links
  Curated list of GSC resources linking to CabConModding, UGX, Zeroy Wiki, ZombieModding.

### HUD Element Scripting — Tutorials and Threads

Key community tutorials focused on `createFontString` / `newHudElem` / `setPoint` / `setShader` patterns.

- **ItsMods — "Creating a HUD Element/Text (Basics)"** ⭐
  https://www.itsmods.com/forum/Thread-Tutorial-Creating-a-HUD-Element-Text-Basics.html
  The most complete HUD-specific tutorial available. Covers `createFontString` (font/fontScale), `setPoint` (4-argument alignment system, all point keywords), `setText`, color codes, `createIcon`/`setShader`, hint messages, killfeed text (`iPrintLn`/`AllClientsPrint`), and notifications. CoD4/MW2 focused.

- **ItsMods — ".Gsc Modding for Beginners"**
  https://www.itsmods.com/forum/Thread-Tutorial-Gsc-Modding-for-Beginners.html
  105,000-view sticky beginner tutorial thread for MW2 GSC basics. 88 replies.

- **ItsMods — Modding Tutorials index**
  https://www.itsmods.com/forum/Forum-Modding-Tutorials.html
  Multi-part GSC tutorial series: functions, for/while loops, foreach/continue/return, if/else, switch, operations. MW2-targeted, progressive difficulty.

- **CoDJumper — "Scripting for Dummies" (Drofder2004)** ⭐
  https://www.codjumper.com/forums/viewtopic.php?t=4011
  Canonical CoD GSC tutorial (originally 2006). Covers variables, functions, loops, waittill/notify/endon, arrays. CoD4-focused; widely referenced across the entire modding community.

- **CoDJumper — Scripting / Function Reference list**
  https://www.codjumper.com/forums/viewtopic.php?t=2940
  Community-assembled function list including all HUD functions (`newClientHudElem`, `newHudElem`, `setText`, `setShader`, `setTenthsTimer`, `setTimer`, `scaleOverTime`, `fadeOverTime`) and all HUD element properties (`archived`, `x`, `y`, `alignX`, `alignY`, `font`, `fontScale`, `sort`, `alpha`). Raw reference format.

- **CoDJumper — "Adding a timer to codjumper mod"**
  https://www.codjumper.com/forums/viewtopic.php?t=14813
  Working stopwatch HUD implementation: `newClientHudElem`, positional properties, `font`, `fontScale`, `.label` for localized strings.

- **CoDJumper — "Hud .label"**
  https://www.codjumper.com/forums/viewtopic.php?t=14360
  Technical thread on the `.label` HUD property (localized string binding) and `setPlayerNameString`. Documents `newClientHudElem` property setup in detail.

- **Plutonium Forum — "Showing my GSC mod to help beginners"**
  https://forum.plutonium.pw/topic/16815/resource-showing-my-gsc-mod-to-help-beginners
  Annotated MW2 GSC mod for beginners demonstrating `#include maps\mp\gametypes\_hud_util`, `createFontString`, `setPoint`, `setText`, `createServerFontString`, and timer/killstreak HUD patterns in a complete working mod context.

- **killtube.org — "[Tutorial] Hud elements"**
  https://killtube.org/archive/index.php/t-1618.html
  Technical CoD4 scripting thread on HUD elements: `.label`/`setPlayerNameString`, `setValue` vs direct field assignment, `newHudElem`, and edge cases like `endon` on disconnect for HUD threads.

- **killtube.org — Scripting forum archive**
  https://killtube.org/archive/index.php/f-26.html
  Archive of killtube.org's CoD scripting subforum. Contains numerous CoD4/CoD2 GSC threads on HUD elements, fontscale limits, custom shaders, sprint HUDs, and weapon functions.

### Tools

- **xensik/gsc-tool**
  https://github.com/xensik/gsc-tool
  GSC compiler/decompiler supporting IW5–IW9, S1–S4, H1–H2, T6–T9. 299 stars. Contains the most complete formal Bison grammar for GSC.
  **Note:** IW4 (MW2 2009) is not currently supported — see issue [#251](https://github.com/xensik/gsc-tool/issues/251).

- **xensik/menu-tool**
  https://github.com/xensik/menu-tool
  Parses and dumps IW engine legacy `.menu` files (the pre-LUI menu format). IW4 support is listed as WIP. 10 stars. From the same author as gsc-tool.

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
  GSC/CSC decompiler for BO2 and BO3 only. 66 stars. Not applicable to IW4.

- **Kyasuta/bo2_gsc_compiler**
  https://github.com/Kyasuta/bo2_gsc_compiler
  Compiler for Black Ops 2 GSC scripts. 6 stars, updated February 2026. T6-specific, not applicable to IW4.

### Script collections

- **INeedBots/iw4_bot_warfare**
  https://github.com/ineedbots/iw4_bot_warfare
  Bot Warfare mod for MW2/IW4x. Well-documented with DVAR references and waypoint systems. Also has versions for CoD4x, T6, IW5.

- **SyndiShanX/Synergy-MW2-GSC-Menu**
  https://github.com/SyndiShanX/Synergy-MW2-GSC-Menu
  GSC-based in-game mod menu for MW2/IW4x. Reference for GSC menu structure, player/lobby manipulation functions, and common mod menu patterns.

- **DoktorSAS** (GitHub)
  https://github.com/DoktorSAS
  Mapvote scripts for T6, IW5, H1, IW6, plus large GSC code collection across IW3–T7.

- **Muhlex/iw4x-ttt**
  https://github.com/Muhlex/iw4x-ttt
  Trouble in Terrorist Town gamemode for MW2/IW4x written in pure GSC. Demonstrates advanced IW4x-specific scripting for a complete custom gamemode.

- **justinabellera/retro-pack**
  https://github.com/justinabellera/retro-pack
  Multi-title GSC mod menu covering IW4x (MW2), Plutonium IW5/T5/T6, IW6x, H2M-Mod, and HMW-Mod. Includes trickshot, class editor, and teleport features. Good cross-client scripting reference.

- **505e06b2/EbinModz**
  https://github.com/505e06b2/EbinModz
  MW2 GSC mod menu based on GodlyModz V4 with custom game modes. Now archived. Companion to iw4x-EbinMenu — shows menu scripting patterns in a standalone mod format.

- **Draakoor/h2m-gscscripts**
  https://github.com/Draakoor/h2m-gscscripts
  Large collection of GSC scripts for h2m-mod (MWR) and IW4x (133 commits). Covers weapon restriction, anti-camp, bot scripts, and killstreak mods — cross-compatible with IW4x.

- **Xevrac/h2m_gscs**
  https://github.com/Xevrac/h2m_gscs
  h2m/IW4x GSC utilities: nuke-ends-game logic, bot quota scripts, and server-side quality-of-life patches. 9 stars.

- **kyletimmermans/flashback**
  https://github.com/kyletimmermans/flashback
  MW2 GSC mod menu targeting Xbox 360 TU6 with a button-bind era aesthetic. Useful reference for vanilla/console-era menu scripting patterns.

- **volkv/CoD4-Default-GSC-Scripts** ⭐
  https://github.com/volkv/CoD4-Default-GSC-Scripts
  Complete unmodified CoD4 MP GSC dump including `_hud.gsc`, `_hud_util.gsc`, `_killcam.gsc`, `_rank.gsc`, and all gametype scripts. 9 stars. Primary reference for vanilla HUD elem usage patterns.

- **Joelrau/IW4x_DeathRun**
  https://github.com/Joelrau/IW4x_DeathRun
  DeathRun mod for IW4x. GSC-heavy with HUD elements for timers and player status. Contains `createFontString`/`setPoint` usage. 9 stars.

- **simonlfc/MONACO**
  https://github.com/simonlfc/MONACO
  IW4x bolts-only sniper mod with custom scoring HUD, popup timers, and score overlays using `createFontString` and `newClientHudElem`. 13 stars. Good HUD scripting reference.

- **sortileges/iw4cine**
  https://github.com/sortileges/iw4cine
  Cinematic mod for MW2/IW4x in pure GSC. Heavily uses IW4x-specific builtins including custom HUD display of cinematic controls and state. 27 stars.

- **sortileges/iw4mods**
  https://github.com/sortileges/iw4mods
  Collection of IW4x mods including `alpha` (MW2 Alpha 482 HUD concept) and custom `ui` mod — directly HUD-relevant.

- **hosseinpourziyaie/MW2_SCRIPTS**
  https://github.com/hosseinpourziyaie/MW2_SCRIPTS
  IW4 GSC server-side scripts including server branding with `createFontString` HUD overlays. Practical real-world usage examples.

- **Zoro-6191/cod4-advanced-scripts**
  https://github.com/Zoro-6191/cod4-advanced-scripts
  CoD4 GSC collection including AFK detector with `newClientHudElem`/`setShader` status icon overlay, spray system, and ping display. 17 stars.

- **thamidu/COD4-HUDs-Creator**
  https://github.com/thamidu/COD4-HUDs-Creator
  Tool that generates server-side GSC HUD code for CoD4. Directly HUD-focused — produces `newClientHudElem` boilerplate from a visual config.

- **BraXi/CoD4_DeathRun_1.2_Mod**
  https://github.com/BraXi/CoD4_DeathRun_1.2_Mod
  Official source of the 2012 CoD4 DeathRun Mod v1.2.1beta. Rich HUD scripting: countdown timers, per-player status displays, and activator HUD elements.

- **dan2k3k4/bp-cod4**
  https://github.com/dan2k3k4/bp-cod4
  OpenWarfare-based CoD4 mod (16 stars) with a well-commented `_hud_util.gsc` showing `setParent`, `setPoint`, and reusable HUD element helper functions.

- **plutoniummod/iw5-scripts**
  https://github.com/plutoniummod/iw5-scripts
  Official Plutonium MW3 (IW5) scripts dump. Same engine generation as IW4 — `_utility.gsc` includes `createFontString` wrappers useful for cross-referencing the IW4/IW5 HUD API surface.

- **Resxt/Plutonium-IW5-Scripts**
  https://github.com/Resxt/Plutonium-IW5-Scripts
  Community GSC scripts for Plutonium MW3 (IW5). Practical reference for IW5 server-side scripting patterns.

- **InfinityLoader/IL-GSC**
  https://github.com/InfinityLoader/IL-GSC
  Decompiled and formatted GSC/CSC files from multiple CoD titles (MW3 PC and Xbox SP/MP). Includes `_utility.gsc` with `createFontString` and HUD helpers.

- **SyndiShanX/COD-GSC-Source**
  https://github.com/SyndiShanX/COD-GSC-Source
  Dumped and formatted GSC/CSC files for multiple CoD titles from the same author as Synergy-MW2-GSC-Menu. Includes decompiled `_utility.gsc` and HUD helper scripts across games.

- **Call-of-Duty-Scripts/CoD4MW**
  https://github.com/Call-of-Duty-Scripts/CoD4MW
  CoD4 Modern Warfare script and UI collection.

- **ZECxR3ap3r/gc_server**
  https://github.com/ZECxR3ap3r/gc_server
  IW4-targeted server mod for a custom slasher gametype. Uses `createFontString`/`setPoint` for the gametype HUD.

---

## Menu File Format

- **aerosoul94/IWMenuDumper**
  https://github.com/aerosoul94/IWMenuDumper
  IW Engine Menu Asset Decompiler. Decompiles compiled menu files from MW2 (IW4) and MW3 (IW5). Source includes `iw4.h`/`iw5.h` with menu structure definitions.

- **xensik/menu-tool**
  https://github.com/xensik/menu-tool
  WIP parser/dumper for IW engine legacy menu scripts. IW3/IW4/IW5/IW6 all listed as targets. 10 stars.

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

- **Tom Crowley — xAnim Extractor**
  http://tom-crowley.co.uk/downloads/
  Maya plugin for importing CoD animations. Supports CoD2, CoD4, CoD5, CoD BO. Maya versions 6.0 through 2012 (32/64-bit). Also hosts a FastFile Extractor and IWI/DDS Converter. 20,000+ downloads, released 2014.

- **CoD4 Mod Tools — Maya Plugins**
  https://github.com/promod/CoD4-Mod-Tools
  Official `XModelExport.mll` and `XAnimExport.mll` Maya plugins for exporting models and animations into CoD format. Includes `xanim_export/` example files.

### D3DBSP maps

- **Zeroy Wiki — d3dbsp Format**
  https://wiki.zeroy.com/index.php/Call_of_Duty_2:_d3dbsp
  Lump-by-lump documentation: Materials (72 bytes per entry with flags), Lightmaps, Light Grid Hash, Brushes, Planes, Vertices. Applicable across IW engine versions.

- **Husky**
  https://github.com/Scobalula/Husky
  BSP/map geometry extractor. Reads live game memory while a map is loaded and exports vertex/face geometry as `.obj` + `.mtl` + a `.map` file with static model placements. Directly supports MW2 (IW4), MW3, WaW, BO1, BO2, BO3, MWR, MW2019, and more. 119 stars. Pair with Greyhound for textures.

### Sound / Audio

- **XLabsProject/snd-alias-converter**
  https://github.com/XLabsProject/snd-alias-converter
  Converts sound alias CSV files between ZoneTool and ZoneBuilder formats. Small utility for IW4 soundalias format interoperability.

- **shit-ware/IW4 — soundaliases/**
  https://github.com/shit-ware/IW4
  Raw MW2 soundalias CSV files — the text-based alias definitions that map sound events to audio files. Primary reference for IW4 sound system structure.

### Asset extraction

- **Greyhound**
  https://github.com/Scobalula/Greyhound
  Asset extractor for IW engine titles. XModels, XAnims, XImages, XEffects, Raw Files, Sounds across CoD4 through WWII. 429 stars.
  Docs: https://scobalula.github.io/Greyhound/

- **Kobra**
  https://github.com/VenomModding/Kobra
  Fork of Greyhound adding XEffect and GDT support.

- **GameImageUtil**
  https://github.com/Scobalula/GameImageUtil
  Image format processor for CoD mod tools. Handles normal map splitting, specular/albedo fusion, BC5 XY mode. 75 stars. **Archived January 2024** — read-only. Primarily targets IW7/IW8-era formats; relevant for cross-porting assets from newer CoD titles into IW4 mods.

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

The IW engine modding ecosystem spans many titles. IW4x grew out of the CoD4x (IW3) and WaW (T4) communities — formats, DVARs, and scripting patterns are closely shared across these projects.

| Game | Code | Client | Year | Repository |
|------|------|--------|------|------------|
| Call of Duty | COD1 | cod.pm | 2003 | — |
| Call of Duty: United Offensive | CODUO | cod.pm | 2004 | — |
| Call of Duty 2 | COD2 | cod.pm | 2005 | — |
| Call of Duty 4: Modern Warfare | IW3/COD4 | CoD4x | 2007 | https://github.com/callofduty4x/CoD4x_Server |
| Call of Duty: World at War | T4 | Plutonium | 2008 | https://github.com/plutoniummod/t4-scripts |
| World at War Zombies | T4ZM | Plutonium | 2008 | https://github.com/plutoniummod/t4-scripts |
| Call of Duty: Modern Warfare 2 | IW4 | **IW4x** | 2009 | https://github.com/iw4x/iw4x-client |
| Call of Duty: Black Ops | T5 | Plutonium | 2010 | https://github.com/plutoniummod/t5-scripts |
| Black Ops Zombies | T5ZM | Plutonium | 2010 | https://github.com/plutoniummod/t5-scripts |
| Call of Duty: Modern Warfare 3 | IW5 | Plutonium | 2011 | https://github.com/plutoniummod/iw5-scripts |
| Call of Duty: Black Ops II | T6 | Plutonium | 2012 | https://github.com/plutoniummod/t6-scripts |
| Black Ops II Zombies | T6ZM | Plutonium | 2012 | https://github.com/plutoniummod/t6-scripts |
| Call of Duty: Ghosts | IW6 | AlterWare | 2013 | https://git.alterware.dev/alterware/iw6-mod |
| Call of Duty: Advanced Warfare | S1 | AlterWare | 2014 | https://git.alterware.dev/alterware/s1-mod |
| Call of Duty: Black Ops III | T7 | AlterWare | 2015 | https://git.alterware.dev/alterware/t7-rawfiles |
| Call of Duty: Modern Warfare Remastered | H1 | Aurora | 2016 | https://github.com/auroramod/h1-mod |
| Call of Duty: Infinite Warfare | IW7 | Aurora | 2016 | https://github.com/auroramod/iw7-mod |
| HMW / H2M-Mod | HMW/H2M | Horizon | 2020 | — |

### Mod client hubs

- **AlterWare** — https://alterware.dev/ — IW4-SP, IW5-Mod, IW6-Mod, S1-Mod, T7x. Self-hosted Gitea at https://git.alterware.dev/alterware/
- **Plutonium** — https://forum.plutonium.pw/ — T4, T5, T6, IW5. Official docs at https://plutonium.pw/docs/
- **CoD4x** — https://cod4x.ovh/ — CoD4 server/client modding. The direct ancestor community to IW4x.
- **Aurora** — https://github.com/auroramod — H1-Mod (MWR) and IW7-Mod. Docs at https://docs.auroramod.dev/

---

## Engine Research (General)

- **IW Engine (Wikipedia)**
  https://en.wikipedia.org/wiki/IW_(game_engine)
  Overview of all IW engine versions from IW 3.0 through IW 9.0. Maps engine versions to game titles.

- **CoD Engine Research Wiki**
  https://codresearch.dev/index.php/Main_Page
  Goes well beyond DVARs — covers fastfile/zone format, PAK files, per-game asset type tables (IW4, IW5, T5, T6 etc.) with hex IDs and pool sizes, reverse-engineered C struct definitions (e.g. `SndCurve`, `GfxWorld`), and save data structures. Admin-only editing; contact `redeyex32` on Discord for contributions.

- **OpenIW4/OpenIW4**
  https://github.com/OpenIW4/OpenIW4
  An attempt to reverse engineer and reimplement the IW4 engine in C++. Documents IW4MP internal functions and data structures. 29 stars, 244 commits, WTFPL license. The closest thing to a public IW4 network protocol and engine internals reference.

- **Activision Research Publications**
  https://research.activision.com/publications
  Official technical papers: rendering, lighting, networking. Includes "Rendering of COD:IW" (Michal Drobot), "Raytraced Shadows in COD:MW".

- **momo5502's Blog**
  https://momo5502.com/posts/
  Technical blog by a core IW4x developer. Reverse engineering deep dives on IW engine internals and beyond.
  - IW4/MW2 network exploit research: https://momo5502.com/posts/2017-12-14-game-hacking-reinvented-a-poc-cod-hack/
  - BO3 integrity checks: https://momo5502.com/posts/2022-11-17-reverse-engineering-integrity-checks-in-black-ops-3/

- **Nukem9/LinkerMod**
  https://github.com/Nukem9/LinkerMod
  Enhancements for Black Ops (T5) mod tools — linker features, custom asset utilities, Radiant support for new maps. 129 stars, 1,201 commits. **T5 only, not IW4** — relevant as an adjacent modtools enhancement reference and for the detours hooking patterns used by IW3/IW4 tools.

- **DevRaw — Modding Tools Directory**
  https://www.devraw.net/resources
  Curated list of CoD modding tools: Greyhound, Husky, HydraX, Cordycep, Kobra, GameImageUtil, SExCOD, VKRadiant, and more. BO3-focused but covers multi-game tools.

- **Zeroy BO3 Script Explorer**
  https://bo3explorer.zeroy.com/
  Browsable HTML explorer for Black Ops 3 GSC source code. BO3-specific, but documents the full GSC function namespace in a searchable format useful for cross-referencing shared function names and patterns across CoD titles.

---

## Community Wikis and Forums

- **PCGamingWiki — Call of Duty: Modern Warfare 2** — https://www.pcgamingwiki.com/wiki/Call_of_Duty:_Modern_Warfare_2 — Documents config file locations, DVAR tweaks (FOV, monkeytoy unlock), IW4x and IW4x-SP client entries, save paths, and known PC issues/fixes.
- **Zeroy Wiki** — https://wiki.zeroy.com/ — The most comprehensive CoD modding wiki. CoD1 through BO1: fastfile format, d3dbsp, scripting, mapping, weapons, menus. Last edited December 2023.
- **Plutonium Docs** — https://plutonium.pw/docs/ — Official Plutonium documentation including GSC language guide, how-to scripting, and new features.
- **Plutonium Forum** — https://forum.plutonium.pw/ — T4/T5/T6/IW5 modding, scripting help, resource threads.
- **AlterWare Forum** — https://forum.alterware.dev/ — IW4x-SP/IW5/IW6/S1 modding guides and support.
  - IW4x perks revert guide (OMA/Painkiller): https://forum.alterware.dev/t/how-to-revert-iw4xs-changes-to-one-man-army-oma-painkiller-juiced/712 — Shows how `userraw` GSC overrides work to surgically patch stock IW4x behavior.
- **CoD4x Forum** — https://cod4x.ovh/ — CoD4 server/client support, scripting, plugin releases. Direct ancestor community to IW4x.
- **r/IW4x** — https://www.reddit.com/r/IW4x/ — Active Reddit community for IW4x/MW2 with modding questions, guides, and community resources.
- **CabConModding** — https://cabconmodding.com/ — Large English-language modding forum. 24,000+ BO2 threads, MW scripting section, BO3 mods.
  - MW2 Scripts subforum: https://cabconmodding.com/forums/call-of-duty-modern-warfare-2-scripts.38/
  - MW2 Mods subforum: https://cabconmodding.com/forums/call-of-duty-modern-warfare-2-mods.37/
- **UnknownCheats — MW2/IW4x** — https://www.unknowncheats.me/forum/call-of-duty-6-modern-warfare-2-a/ — Game research forum with IW4x releases including offset dumps, internal mod menus, and DLL injection examples. Useful for understanding runtime function addresses.
- **NamelessNoobs** — https://namelessnoobs.com/ — Long-running IW4x/MW2 server community (since 2015) hosting servers for CoD4, MW2, MW3, and BO2. Their developers have written IW4x-specific GSC scripting guides on the AlterWare forum.
- **UGX-Mods Wiki** — https://wiki.ugx-mods.com/ — Zombies-focused modding wiki with scripting guides and zone management.
- **ZombieModding** — https://zombiemodding.com/ — Custom zombies community (WaW-era). 434,000+ members.
- **Modme Wiki** — https://wiki.modme.co/ — BO3 modding wiki with scripting guides.
- **Se7enSins** — https://www.se7ensins.com/forums/ — DVAR lists, scripting references, weapon modding.
- **ItsMods** — https://www.itsmods.com/forum/ — MW2/CoD4 modding forum with extensive GSC tutorials including the most complete HUD elem scripting guide available. See HUD tutorial thread linked above.
- **CoDJumper** — https://www.codjumper.com/forums/ — CoD4 modding and jump community. Custom menus, scripting tutorials. Forum has a comprehensive function reference thread and multiple HUD scripting threads.
- **killtube.org** — https://killtube.org/ — Legacy CoD2/CoD4 scripting community. Archived forum contains GSC threads on HUD elements, fontscale edge cases, and custom shaders not documented elsewhere.
- **NextGenUpdate — MW2 Forums** — https://nextgenupdate.com/forums/call-duty-modern-warfare-2/ — MW2 modding forum with subforums for mods, patches, maps, and GSC scripting. Legacy community resource predating IW4x.
- **X Labs Mirror (archived)** — https://xlabs-mirror.github.io/ — Archived IW4x/IW6x/S1x documentation (2023). GSC function reference and console commands tables preserved here.

---

## Mod Downloads / Community Hosting

Platforms hosting publicly released IW4x/MW2 mods and assets.

- **GameBanana — MW2 (2009)**
  https://gamebanana.com/games/3291
  Community mod hub for MW2 (2009): texture mods, camo packs, ReShade presets, and IW4x-compatible skin mods. Includes tutorials and modding discussions.

- **ModDB — MW2**
  https://www.moddb.com/games/call-of-duty-modern-warfare-2/downloads
  Community mod releases for MW2: camo packs, SP/Spec-Ops mods, and the official v1.2.211 update patch. Browse versioned downloads with installation notes.

- **ModDB — Bot Warfare mod page**
  https://www.moddb.com/mods/bot-warfare
  Official ModDB hub for Bot Warfare across MW2/IW4x, MW3/Plutonium, CoD4x, and WaW. Includes versioned downloads, installation guides, and user-reported bug workarounds.

- **Nexus Mods — MW2 (2009)**
  https://www.nexusmods.com/games/codmw2
  Nexus Mods page for the 2009 MW2: ReShade presets and SP/Spec-Ops mods. Smaller catalogue than GameBanana for this title but another accessible discovery point.

---

## Tools and Libraries Used

| Library | Version | Purpose | URL |
|---------|---------|---------|-----|
| `@modelcontextprotocol/sdk` | ^1.12.1 | MCP server framework | https://github.com/modelcontextprotocol/typescript-sdk |
| `adm-zip` | ^0.5.16 | ZIP/IWD read/write operations | https://github.com/cthackers/adm-zip |
| `zod` | ^3.23.0 | Schema validation for tool parameters | https://github.com/colinhacks/zod |
| `vitest` | ^3.0.0 | Test framework | https://github.com/vitest-dev/vitest |
