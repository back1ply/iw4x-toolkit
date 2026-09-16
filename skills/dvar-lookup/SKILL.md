---
name: dvar-lookup
description: Search and reference MW2/IW4X DVARs by name, category, or FPS impact. Use when the user asks about game settings, DVARs, FPS optimization, or server configuration for IW4X/MW2.
---

# DVAR Lookup

The MW2/IW4X DVAR knowledge base lists every known DVAR with its type, default, flags, category, and FPS impact rating.

## How to search

**By name or description** — use `dvar_search` (filters server-side, returns the top 20):

- MCP tool: `dvar_search` with `query` and optional `category`
- CLI: `iw4x-toolkit dvar_search --query fog --category renderer` (add `--json` for structured output)

**By FPS impact, context, or anything else** — load the full list and filter it yourself:

1. **Get the data**: read the `iw4x://dvars` MCP resource with `ReadMcpResourceTool`, or, without MCP, read `knowledge/dvars.json` from the plugin directory
2. **Parse the JSON** — the `dvars` array contains all entries
3. **Filter** based on the user's query:
   - **By name**: Match against `name` field (supports partial match, e.g. "fog" matches `r_fog`)
   - **By category**: Filter by `category` field (e.g. "renderer", "shadow_map", "effects", "sound", "server")
   - **By FPS impact**: Filter by `fps_impact` field ("high", "medium", "low", "none")
   - **By context**: Filter by `context` field ("client", "server", "shared")

## DVAR entry schema

```json
{
  "name": "r_fullbright",
  "type": "bool",
  "default": "0",
  "flags": ["CHEAT"],
  "category": "renderer",
  "subcategory": "lighting",
  "context": "client",
  "description": "Disables all lighting calculations, everything fully lit",
  "fps_impact": "high"
}
```

## Categories

Key categories: `renderer`, `shadow_map`, `effects`, `client_game`, `client`, `server`, `script`, `player`, `movement`, `perks`, `sound`, `physics`, `ragdoll`, `network`, `ui`, `hud`, `compass`, `aim_assist`

## FPS optimization guide

When users ask about FPS optimization, present DVARs sorted by impact (high → medium → low). For each high-impact DVAR, suggest a safe FPS-boosting value:

| DVAR | Default | FPS Value | Impact |
|------|---------|-----------|--------|
| `com_maxfps` | 85 | 0 (uncapped) or 250 | high |
| `r_vsync` | 0 | 0 | high |
| `r_aaSamples` | 2 | 1 | high |
| `r_picmip` | 0 | 2-3 | high |
| `sm_enable` | 1 | 0 | high |
| `sm_sunEnable` | 1 | 0 | high |
| `r_glow` | 1 | 0 | medium |
| `r_distortion` | 1 | 0 | medium |
| `r_dof_enable` | 1 | 0 | medium |
| `r_specular` | 1 | 0 | medium |
| `r_texFilterAnisoMax` | 4 | 1 | medium |
| `fx_drawClouds` | 1 | 0 | medium |
| `ragdoll_enable` | 1 | 0 | medium |
| `dynEnt_active` | 1 | 0 | medium |
| `cg_brass` | 1 | 0 | low |
| `fx_marks` | 1 | 0 | low |
| `r_drawDecals` | 1 | 0 | low |

## Formatting results

Present results in a clear table format:

```
| DVAR | Type | Default | Category | FPS Impact |
|------|------|---------|----------|------------|
| r_fog | bool | 1 | renderer/fog | medium |
```

Include the description for enriched DVARs. For DVARs without descriptions, the name and category usually make the purpose clear.

## Important notes

- DVARs with `CHEAT` flag require `sv_cheats 1` to change
- Some DVARs require map restart or game restart to take effect
- Renderer DVARs (`r_*`) are client-side only
- Script DVARs (`scr_*`) are server-side and affect gameplay rules
- Always warn users about cheat-flagged DVARs in competitive/online play
