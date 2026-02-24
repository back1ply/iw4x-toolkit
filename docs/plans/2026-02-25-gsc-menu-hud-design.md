# GSC Menu HUD Knowledge & Anti-Patterns — Design

**Date:** 2026-02-25
**Status:** Approved

---

## Problem

LLMs write broken GSC menu code for CoD4/CoD4X and MW2/IW4X. Failure modes span all layers: invented functions, wrong events, wrong property syntax, broken positioning, missing cleanup, and CoD4 vs IW4X API confusion.

## Scope

- **Primary target:** Script menus — custom in-game menus built entirely in GSC using HUD elements (`newClientHudElem`, `setShader`, `setText`, input loops).
- **Secondary:** Enough `.menu` file awareness to stop LLMs conflating the two systems.
- **Priority knowledge areas:** positioning system, HUD element properties, background/layering.

---

## Approach: B — New knowledge file + query tool + anti-patterns

Three deliverables:

1. `knowledge/gsc-menu-hud.json` — structured reference for HUD menu building
2. `gsc_menu_hud` MCP tool — queryable by topic/property name
3. ~18 new entries in `knowledge/gsc-anti-patterns.json` — menu-specific wrong→right pairs

Follows the exact same pattern as `gsc-builtins.json` + `gsc_anti_patterns`.

---

## 1. `knowledge/gsc-menu-hud.json`

### Schema

```
{
  "version": "1.0.0",
  "meta": { "description": "...", "games": ["CoD4", "CoD4X", "MW2", "IW4X"] },
  "sections": {
    "positioning": { ... },
    "properties": { ... },
    "layering": { ... }
  }
}
```

### `positioning` section

- **Virtual resolution:** 640×480 always, regardless of actual screen resolution.
- **Primary API:** `elem setPoint(align, relative, x, y)`
  - `align`: which part of the element is the anchor point
  - `relative`: which screen region/point to measure from
  - Both use compound strings: `"TOPLEFT"`, `"TOP"`, `"TOPRIGHT"`, `"LEFT"`, `"CENTER"`, `"RIGHT"`, `"BOTTOMLEFT"`, `"BOTTOM"`, `"BOTTOMRIGHT"`
- **Direct properties** (lower-level alternative): `x`, `y`, `alignX`, `alignY`, `horzAlign`, `vertAlign`
- **Common formulas:** true screen-center, top-right column layout, bottom-anchored bar, offset from another element

### `properties` section

Creation functions:
- `newClientHudElem(player)` → for rectangles/shaders
- `createFontString(font, scale)` → for text elements (called as `self createFontString(...)`)

Visual properties: `color` (vector `(R,G,B)`), `alpha` (0.0–1.0), `sort` (float), `foreground` (bool), `glowColor`, `glowAlpha`

Text properties: `font` (valid names only: `"default"`, `"bigfixed"`, `"smallfixed"`, `"hudfixed"`, `"objective"`, `"big"`, `"small"`), `fontscale`

Geometry: `width`/`height` set via `setShader(material, w, h)`, not assignable directly

Required setup: `setParent(level.uiParent)` — mandatory call after creation; elements may not display without it

### `layering` section

- `setShader("white", w, h)` creates a colored rectangle — `"white"` is the built-in blank texture
- Color applied on top of shader: `elem.color = (0,0,0); elem.alpha = 0.7;`
- `sort` values: background ~1, highlight bar ~2, text ~3, top overlay ~5+
- `foreground = true` renders element over the 3D world
- Example 4-layer stack: dim overlay (sort 1) → bg box (sort 2) → cursor bar (sort 3) → option text (sort 4)

---

## 2. `gsc_menu_hud` MCP Tool

**Input:** `{ topic: string }`

**Supported topic values:**
- `"positioning"` → full positioning section
- `"properties"` → all HUD element properties
- `"layering"` → shader/sort/layering section
- `"setPoint"` → positioning API detail
- `"fonts"` → valid font names
- `"sort"` → sort value reference
- `"all"` → full file
- Any specific property name (e.g., `"color"`, `"alpha"`) → returns that property's entry

**Returns:** Relevant JSON section(s) as formatted text.

Same implementation pattern as `gsc_anti_patterns` tool in `mcp-server/src/index.ts`.

---

## 3. Menu Anti-Patterns (~18 new entries)

Added to `knowledge/gsc-anti-patterns.json`. Covers:

| Wrong | Right | Category |
|---|---|---|
| `createHudElement()` / `spawnHudElem()` | `newClientHudElem(self)` | Wrong function |
| `setShader("rect", w, h)` / `setShader("fill", w, h)` | `setShader("white", w, h)` | Wrong shader name |
| `waittill("button_pressed", btn)` | `notifyOnPlayerCommand("ev", "+action")` + `waittill("ev")` | Wrong event |
| `self openMenu("myScriptMenu")` on HUD menu | `self thread DisplayMenu(...)` | Wrong system |
| `self closeMenu()` on HUD menu | manually `destroy()` each element | Wrong system |
| `setText()` called on a rect element | use `createFontString` for text | Wrong element type |
| `elem.text = "foo"` | `elem setText("foo")` | Wrong property access |
| Missing `setParent(level.uiParent)` | call `setParent` after creation | Missing required call |
| Missing `endon("disconnect")` in menu thread | prevents ghost elements on DC | Missing guard |
| `waittill("menuresponse", ...)` with no `.menu` file | only fires from native `.menu` system | Wrong system |
| `setPoint("top-left", ...)` / `"centerTop"` | valid: `"TOPLEFT"`, `"CENTER"`, etc. | Wrong alignment string |
| Missing `default:` in `menuresponse` switch | required in CoD4 — crashes without it | CoD4 gotcha |
| `wait 0` in input polling loop | `wait 0.05` (zero-wait can freeze) | Timing |
| Not destroying elements on menu close | call `destroy()` on every element | Missing cleanup |
| `elem.font = "Arial"` | use engine font names: `"default"`, `"bigfixed"`, etc. | Invalid value |
| `elem.color = "red"` | `elem.color = (1, 0, 0)` — vector not string | Wrong type |
| `notifyOnPlayerCommand` in CoD4/IW3 | not available in IW3 — use `.menu` + `menuresponse` | CoD4 vs IW4X |
| Missing `precacheMenu()` before `openMenu()` | `precacheMenu(game["mymenu"])` in init | Missing required call |

---

## CoD4 vs MW2/IW4X Key Differences (inform anti-patterns)

| | CoD4 / IW3 | MW2 / IW4X |
|---|---|---|
| Key detection | `.menu` file + `waittill("menuresponse", ...)` | `notifyOnPlayerCommand("ev", "+action")` + `waittill("ev")` |
| HUD-only menus | Requires `.menu` for input | Fully possible without `.menu` |
| `notifyOnPlayerCommand` | Not available (CoD4X backports it) | Native |
| `childthread` / `call` | Not available | Available |
| `default:` in switch | Crash if missing | Recommended |

---

## Files Changed

| File | Change |
|---|---|
| `knowledge/gsc-menu-hud.json` | New file |
| `knowledge/gsc-anti-patterns.json` | +18 entries |
| `mcp-server/src/index.ts` | New `gsc_menu_hud` tool |
| `mcp-server/src/index.test.ts` | Tests for new tool |
| `dist/` | Rebuilt |
