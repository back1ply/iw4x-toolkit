# GSC Menu HUD Knowledge & Anti-Patterns Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `gsc-menu-hud.json` knowledge file, `gsc_menu_hud` MCP query tool, and 18 menu-specific anti-patterns so LLMs stop writing broken GSC HUD menu code.

**Architecture:** New `knowledge/gsc-menu-hud.json` with three sections (positioning, properties, layering). A loader + query tool added to `mcp-server/src/knowledge/tools.ts`. 18 new entries (AP-031–AP-048, category `hud-menu`) appended to `knowledge/gsc-anti-patterns.json`. The `antiPatternsCache` in `gsc/tools.ts` is module-level and invalidation-free — new entries are picked up automatically. No changes to routing or server bootstrap.

**Tech Stack:** TypeScript, Node.js, `@modelcontextprotocol/sdk`, `zod`, Vitest

---

## Context: Key Files

| File | Role |
|---|---|
| `knowledge/gsc-menu-hud.json` | **Create** — new knowledge file |
| `knowledge/gsc-anti-patterns.json` | **Modify** — append 18 entries |
| `mcp-server/src/knowledge/tools.ts` | **Modify** — add loader + `gsc_menu_hud` tool |
| `mcp-server/src/index.ts` | **Modify** — re-export `loadMenuHud` |
| `mcp-server/src/index.test.ts` | **Modify** — add tool tests |
| `dist/` | **Rebuild** — `npm run build` in `mcp-server/` |

---

## Task 1: Create `knowledge/gsc-menu-hud.json`

**Files:**
- Create: `knowledge/gsc-menu-hud.json`

**Step 1: Write the file**

```json
{
  "version": "1.0.0",
  "meta": {
    "description": "HUD element reference for building custom script menus in CoD4/CoD4X and MW2/IW4X GSC",
    "games": ["CoD4", "CoD4X", "MW2", "IW4X"]
  },
  "sections": {
    "positioning": {
      "description": "How to position HUD elements on screen. The virtual resolution is always 640x480 regardless of the player's actual screen resolution.",
      "virtual_resolution": {
        "width": 640,
        "height": 480,
        "note": "All HUD coordinates are in this virtual space. 320,240 is screen center."
      },
      "setPoint": {
        "signature": "elem setPoint(align, relative, x, y)",
        "description": "Primary positioning API. Places the 'align' anchor of the element at offset (x,y) from the 'relative' point on the screen.",
        "parameters": {
          "align": "Which part of this element is the anchor point.",
          "relative": "Which point on the screen (or parent element) the offset is measured from.",
          "x": "Horizontal offset in virtual pixels. Negative = left.",
          "y": "Vertical offset in virtual pixels. Negative = up."
        },
        "alignment_strings": [
          "TOPLEFT", "TOP", "TOPRIGHT",
          "LEFT", "CENTER", "RIGHT",
          "BOTTOMLEFT", "BOTTOM", "BOTTOMRIGHT"
        ],
        "examples": [
          {
            "description": "Center an element on screen",
            "code": "elem setPoint(\"CENTER\", \"CENTER\", 0, 0);"
          },
          {
            "description": "Top-right corner with 10px inset",
            "code": "elem setPoint(\"TOPRIGHT\", \"TOPRIGHT\", -10, 10);"
          },
          {
            "description": "20px below screen center",
            "code": "elem setPoint(\"CENTER\", \"CENTER\", 0, 20);"
          },
          {
            "description": "Stack option text below a title element",
            "code": "optElem setPoint(\"TOP\", \"BOTTOM\", 0, 4);"
          }
        ]
      },
      "direct_properties": {
        "description": "Lower-level alternative to setPoint. Use when setPoint is unavailable or you need fine-grained control.",
        "x": { "type": "float", "description": "Horizontal offset from the horzAlign origin." },
        "y": { "type": "float", "description": "Vertical offset from the vertAlign origin." },
        "alignX": { "type": "string", "values": ["left", "center", "right"], "description": "Element's own horizontal anchor point." },
        "alignY": { "type": "string", "values": ["top", "middle", "bottom"], "description": "Element's own vertical anchor point." },
        "horzAlign": { "type": "string", "values": ["fullscreen", "left", "center", "right"], "description": "Screen edge used as the x origin." },
        "vertAlign": { "type": "string", "values": ["fullscreen", "top", "middle", "bottom"], "description": "Screen edge used as the y origin." }
      },
      "common_formulas": {
        "true_center": {
          "description": "Element at exact screen center",
          "code": "elem setPoint(\"CENTER\", \"CENTER\", 0, 0);"
        },
        "top_right_column": {
          "description": "Start of a right-aligned menu column",
          "code": "elem setPoint(\"TOPRIGHT\", \"TOPRIGHT\", 0, 0);"
        },
        "bottom_bar": {
          "description": "Full-width bar at the bottom of the screen",
          "code": "elem setPoint(\"BOTTOM\", \"BOTTOM\", 0, 0);"
        },
        "left_margin": {
          "description": "Left-aligned column with 10px margin",
          "code": "elem setPoint(\"TOPLEFT\", \"TOPLEFT\", 10, 10);"
        }
      }
    },
    "properties": {
      "description": "All settable properties on HUD elements created with newClientHudElem or createFontString.",
      "creation": {
        "newClientHudElem": {
          "signature": "elem = newClientHudElem(player)",
          "description": "Creates a HUD element visible only to one player. Use for rectangles, shaders, icons. MUST call setParent(level.uiParent) immediately after.",
          "note": "Called as a free function or on level — NOT on self. Do NOT call setText() on these elements. Use createFontString for text."
        },
        "createFontString": {
          "signature": "elem = self createFontString(fontName, fontScale)",
          "description": "Creates a text HUD element. Called ON the player (self). Use setText() to set content.",
          "note": "Do NOT call setShader() on text elements created this way."
        }
      },
      "visual": {
        "color": {
          "type": "vector",
          "syntax": "(R, G, B)",
          "range": "0.0 to 1.0 per channel",
          "default": "(1, 1, 1)",
          "examples": {
            "red": "(1, 0, 0)",
            "black": "(0, 0, 0)",
            "green": "(0, 1, 0)",
            "white": "(1, 1, 1)"
          },
          "wrong": "elem.color = \"red\";",
          "right": "elem.color = (1, 0, 0);"
        },
        "alpha": {
          "type": "float",
          "range": "0.0 (fully transparent) to 1.0 (fully opaque)",
          "default": "1.0",
          "example": "elem.alpha = 0.7;"
        },
        "sort": {
          "type": "float",
          "description": "Draw order. Higher values render on top of lower values.",
          "typical_values": {
            "background_dim": 1,
            "menu_panel": 2,
            "cursor_highlight": 3,
            "option_text": 4,
            "tooltip_overlay": 5
          },
          "note": "Elements with equal sort values have undefined draw order relative to each other."
        },
        "foreground": {
          "type": "bool",
          "default": "false",
          "description": "If true, renders in front of the 3D world. The element is always visible regardless of in-game geometry.",
          "example": "elem.foreground = true;"
        },
        "glowColor": {
          "type": "vector (R, G, B)",
          "description": "Text glow color. Only meaningful on text (createFontString) elements.",
          "example": "elem.glowColor = (1, 0.5, 0);"
        },
        "glowAlpha": {
          "type": "float",
          "range": "0.0 to 1.0",
          "description": "Text glow intensity. Only meaningful on text elements.",
          "example": "elem.glowAlpha = 0.8;"
        }
      },
      "text": {
        "font": {
          "type": "string",
          "valid_values": ["default", "bigfixed", "smallfixed", "hudfixed", "objective", "big", "small"],
          "wrong": "elem.font = \"Arial\";",
          "note": "Only these engine font names work. Any other string silently falls back to default or causes errors."
        },
        "fontscale": {
          "type": "float",
          "description": "Scale multiplier applied to the base font size.",
          "example": "elem.fontscale = 1.5;"
        },
        "label": {
          "type": "string",
          "description": "Localized string reference key (e.g. '@MPUI_KILLS'). Automatically reflects locale changes. Set via elem.label = &\"KEY\";"
        }
      },
      "geometry": {
        "width": {
          "description": "Set implicitly by setShader(material, width, height). NOT directly assignable as elem.width = N.",
          "wrong": "elem.width = 200;",
          "right": "elem setShader(\"white\", 200, 50);"
        },
        "height": {
          "description": "Set implicitly by setShader(material, width, height). NOT directly assignable.",
          "wrong": "elem.height = 50;",
          "right": "elem setShader(\"white\", 200, 50);"
        }
      },
      "required_setup": {
        "setParent": {
          "signature": "elem setParent(level.uiParent)",
          "description": "MANDATORY for newClientHudElem. Must be called immediately after creation. Without it, elements may not display or may clip incorrectly.",
          "example": "rect = newClientHudElem(self);\nrect setParent(level.uiParent);\nrect setShader(\"white\", 200, 300);"
        }
      }
    },
    "layering": {
      "description": "How to build layered visual menus with backgrounds, highlights, and text.",
      "shader_rect": {
        "signature": "elem setShader(\"white\", width, height)",
        "description": "Creates a solid-color filled rectangle using the engine's built-in blank texture. Color is then set via elem.color.",
        "correct_shader_name": "white",
        "wrong_shader_names": ["rect", "fill", "solidwhite", "box", "solid", "black"],
        "full_example": "bg = newClientHudElem(self);\nbg setParent(level.uiParent);\nbg setShader(\"white\", 200, 300);\nbg.color = (0, 0, 0);\nbg.alpha = 0.7;\nbg.sort = 1;\nbg setPoint(\"CENTER\", \"CENTER\", 0, 0);"
      },
      "sort_system": {
        "description": "Plan your sort layers before creating elements. Elements with higher sort values always render on top.",
        "layer_stack_example": [
          { "layer": "dim overlay",      "sort": 1, "description": "Large semi-transparent black rect over full screen" },
          { "layer": "menu panel",       "sort": 2, "description": "The menu background panel" },
          { "layer": "cursor highlight", "sort": 3, "description": "Colored bar showing the selected option" },
          { "layer": "option text",      "sort": 4, "description": "Text labels for each menu option" },
          { "layer": "title text",       "sort": 4, "description": "Menu title (same layer as option text is fine)" },
          { "layer": "tooltip/overlay",  "sort": 5, "description": "Any element that must appear over everything" }
        ]
      },
      "foreground_note": {
        "description": "foreground = true renders an element over the 3D world at all times. Useful so your menu stays visible mid-game, but can cause visual artifacts if overused."
      },
      "cleanup": {
        "description": "EVERY HUD element created must be explicitly destroyed when the menu closes. Skipping destroy() causes elements to persist and accumulate (visual and memory leak).",
        "guard_pattern": "self endon(\"disconnect\");\nself endon(\"death\");",
        "destroy_pattern": "if (isDefined(self.menuBg))     self.menuBg destroy();\nif (isDefined(self.menuTitle))  self.menuTitle destroy();\nif (isDefined(self.menuCursor)) self.menuCursor destroy();\nfor (i = 0; i < self.menuOpts.size; i++)\n    if (isDefined(self.menuOpts[i])) self.menuOpts[i] destroy();"
      },
      "cod4_vs_iw4x": {
        "description": "Key difference in input detection for script menus.",
        "iw4x_mw2": "notifyOnPlayerCommand(\"ev\", \"+actionslot 1\") then self waittill(\"ev\") — pure GSC, no .menu file needed.",
        "cod4_iw3": "Requires a compiled .menu file with scriptMenuResponse + waittill(\"menuresponse\", menu, response) in GSC. notifyOnPlayerCommand does NOT exist in stock CoD4.",
        "cod4x": "CoD4X (community client) backports notifyOnPlayerCommand from IW4, so IW4X-style pure-GSC menus work there too."
      }
    }
  }
}
```

**Step 2: Validate JSON parses correctly**

```bash
cd "F:/Shehab Projects/iw4x-toolkit"
python -c "import json; d=json.load(open('knowledge/gsc-menu-hud.json')); print('OK, sections:', list(d['sections'].keys()))"
```

Expected: `OK, sections: ['positioning', 'properties', 'layering']`

**Step 3: Commit**

```bash
git add knowledge/gsc-menu-hud.json
git commit -m "feat: add gsc-menu-hud.json — HUD positioning, properties, layering reference"
```

---

## Task 2: Add 18 menu anti-patterns to `gsc-anti-patterns.json`

**Files:**
- Modify: `knowledge/gsc-anti-patterns.json`

**Step 1: Append 18 entries after the last existing pattern (AP-030)**

The patterns array currently ends with AP-030. Append the following entries inside the `"patterns"` array, after the last `}` before the closing `]`:

```json
,
    {
      "id": "AP-031",
      "category": "hud-menu",
      "title": "Invented HUD creation function",
      "wrong": "elem = createHudElement(self);\nelem = spawnHudElem(self);\nelem = hudElem(self);",
      "right": "elem = newClientHudElem(self);\nelem setParent(level.uiParent);",
      "explanation": "The only valid HUD element creation function is newClientHudElem(player) for player-specific elements, or newHudElem() for all-player elements. Always call setParent(level.uiParent) immediately after."
    },
    {
      "id": "AP-032",
      "category": "hud-menu",
      "title": "Wrong shader name for solid rectangle",
      "wrong": "elem setShader(\"rect\", 200, 50);\nelem setShader(\"fill\", 200, 50);\nelem setShader(\"solidwhite\", 200, 50);",
      "right": "elem setShader(\"white\", 200, 50);\nelem.color = (0, 0, 0);\nelem.alpha = 0.8;",
      "explanation": "The built-in blank texture is named 'white'. Use setShader(\"white\", w, h) to create a solid rectangle, then control its color via elem.color. Names like 'rect', 'fill', 'solidwhite', 'box' do not exist."
    },
    {
      "id": "AP-033",
      "category": "hud-menu",
      "title": "Wrong button input event in IW4X",
      "wrong": "self waittill(\"keypress\", key);\nself waittill(\"button_pressed\", btn);\nself waittill(\"onButtonPress\", btn);",
      "right": "// IW4X / MW2: use notifyOnPlayerCommand\nself notifyOnPlayerCommand(\"menu_up\", \"+actionslot 3\");\nself notifyOnPlayerCommand(\"menu_down\", \"+actionslot 4\");\nself notifyOnPlayerCommand(\"menu_select\", \"+gostand\");\nfor (;;)\n{\n    self waittill(\"menu_up\");\n    // scroll up\n}",
      "explanation": "In IW4X/MW2, use notifyOnPlayerCommand(eventName, \"+action\") to bind game actions to custom notify events, then waittill on those events. The events 'keypress', 'button_pressed', 'onButtonPress' do not exist as built-in notifies."
    },
    {
      "id": "AP-034",
      "category": "hud-menu",
      "title": "openMenu() called on a HUD script menu",
      "wrong": "self openMenu(\"myCustomHudMenu\");\nself openMenu(\"scriptMenu\");",
      "right": "// HUD-element menus are NOT opened via openMenu().\n// Call your display function directly:\nself thread DisplayMenu(\"main\");",
      "explanation": "openMenu() only works with compiled native .menu files registered via precacheMenu(). HUD-element menus built with newClientHudElem are opened by directly calling your custom display/init function. openMenu() on a non-existent menu name silently does nothing."
    },
    {
      "id": "AP-035",
      "category": "hud-menu",
      "title": "closeMenu() called on a HUD script menu",
      "wrong": "self closeMenu();\nself closePopupMenu();",
      "right": "// Destroy every HUD element manually:\nif (isDefined(self.menuBg))     self.menuBg destroy();\nif (isDefined(self.menuTitle))  self.menuTitle destroy();\nif (isDefined(self.menuCursor)) self.menuCursor destroy();\nfor (i = 0; i < self.menuOpts.size; i++)\n    if (isDefined(self.menuOpts[i])) self.menuOpts[i] destroy();\nself.menuOpen = false;",
      "explanation": "closeMenu() and closePopupMenu() only affect native .menu file overlays. HUD-element menus must be closed by calling destroy() on every element you created. Missing this causes ghost elements to accumulate."
    },
    {
      "id": "AP-036",
      "category": "hud-menu",
      "title": "setText() called on a shader/rect element",
      "wrong": "bg = newClientHudElem(self);\nbg setShader(\"white\", 200, 50);\nbg setText(\"Menu Title\"); // wrong — bg is a rect",
      "right": "// Create a separate text element with createFontString:\ntitle = self createFontString(\"default\", 1.5);\ntitle setText(\"Menu Title\");\ntitle.sort = 3;",
      "explanation": "Elements created with newClientHudElem are for shaders/rectangles. Text must be created with self createFontString(font, scale). These are two separate element types. Calling setText() on a rect element does nothing."
    },
    {
      "id": "AP-037",
      "category": "hud-menu",
      "title": "Direct property assignment for HUD text",
      "wrong": "elem.text = \"Hello\";",
      "right": "elem setText(\"Hello\");",
      "explanation": "HUD element text is set via the setText() method, not by assigning to a .text property. Direct assignment is silently ignored."
    },
    {
      "id": "AP-038",
      "category": "hud-menu",
      "title": "Missing setParent after newClientHudElem",
      "wrong": "rect = newClientHudElem(self);\nrect setShader(\"white\", 200, 50);\nrect.color = (0, 0, 0);",
      "right": "rect = newClientHudElem(self);\nrect setParent(level.uiParent); // REQUIRED\nrect setShader(\"white\", 200, 50);\nrect.color = (0, 0, 0);",
      "explanation": "setParent(level.uiParent) is mandatory immediately after newClientHudElem(). Without it, the element may not render or may clip incorrectly. This is a silent failure."
    },
    {
      "id": "AP-039",
      "category": "hud-menu",
      "title": "Missing endon guards in menu thread",
      "wrong": "showMenu()\n{\n    // no endon guards\n    bg = newClientHudElem(self);\n    bg setParent(level.uiParent);\n    for (;;) { self waittill(\"menu_select\"); }\n}",
      "right": "showMenu()\n{\n    self endon(\"disconnect\");\n    self endon(\"death\");\n    bg = newClientHudElem(self);\n    bg setParent(level.uiParent);\n    for (;;) { self waittill(\"menu_select\"); }\n}",
      "explanation": "Menu threads run per-player. Without endon(\"disconnect\") and endon(\"death\"), the thread keeps running and HUD elements persist as ghosts after the player disconnects or dies. Always add both guards at the top of any player menu thread."
    },
    {
      "id": "AP-040",
      "category": "hud-menu",
      "title": "waittill menuresponse without a .menu file",
      "wrong": "// No .menu file opened, but waiting for menuresponse:\nfor (;;)\n{\n    self waittill(\"menuresponse\", menu, response);\n    // this never fires\n}",
      "right": "// menuresponse only fires when a native .menu file sends scriptMenuResponse.\n// First open the menu:\nself openMenu(game[\"myMenu\"]);\n// Then wait:\nself waittill(\"menuresponse\", menu, response);",
      "explanation": "The 'menuresponse' notify only fires when a compiled .menu file executes scriptMenuResponse. Pure HUD-element menus never trigger it. If you're building an HUD menu, use notifyOnPlayerCommand for input instead. If using native .menu files, call openMenu() first."
    },
    {
      "id": "AP-041",
      "category": "hud-menu",
      "title": "Invalid setPoint alignment strings",
      "wrong": "elem setPoint(\"top-left\", \"top-left\", 0, 0);\nelem setPoint(\"centerTop\", \"center\", 0, 0);\nelem setPoint(\"top_right\", \"screen\", 0, 0);",
      "right": "elem setPoint(\"TOPLEFT\", \"TOPLEFT\", 0, 0);\nelem setPoint(\"TOP\", \"CENTER\", 0, 0);\nelem setPoint(\"TOPRIGHT\", \"TOPRIGHT\", 0, 0);",
      "explanation": "setPoint() alignment strings are uppercase compound words with no separators: TOPLEFT, TOP, TOPRIGHT, LEFT, CENTER, RIGHT, BOTTOMLEFT, BOTTOM, BOTTOMRIGHT. Hyphenated, camelCase, or lowercase variants are invalid and cause silent positioning failures."
    },
    {
      "id": "AP-042",
      "category": "hud-menu",
      "title": "Missing default case in menuresponse switch (CoD4)",
      "wrong": "self waittill(\"menuresponse\", menu, response);\nswitch (response)\n{\n    case \"option1\":\n        doSomething();\n        break;\n    case \"option2\":\n        doOther();\n        break;\n    // no default — CRASHES CoD4\n}",
      "right": "self waittill(\"menuresponse\", menu, response);\nswitch (response)\n{\n    case \"option1\":\n        doSomething();\n        break;\n    case \"option2\":\n        doOther();\n        break;\n    default:\n        break; // required in CoD4/IW3\n}",
      "explanation": "In CoD4/IW3, a switch statement on a menuresponse value without a default: case will crash the script if an unexpected response arrives. Always include default: break; in menuresponse switch blocks."
    },
    {
      "id": "AP-043",
      "category": "hud-menu",
      "title": "wait 0 in button polling loop",
      "wrong": "for (;;)\n{\n    self waittill(\"menu_up\");\n    scrollUp();\n    wait 0; // can freeze or over-fire\n}",
      "right": "for (;;)\n{\n    self waittill(\"menu_up\");\n    scrollUp();\n    wait 0.05; // debounce: ~3 frames at 60fps\n}",
      "explanation": "wait 0 yields for exactly one server frame but provides no debounce for button input. In tight menu loops this can cause multiple triggers per button press or contribute to server freezes. Use wait 0.05 (50ms) as a minimum debounce delay after acting on input."
    },
    {
      "id": "AP-044",
      "category": "hud-menu",
      "title": "HUD elements not destroyed on menu close",
      "wrong": "closeMenu()\n{\n    self.menuOpen = false;\n    // forgot to destroy elements — they stay on screen\n}",
      "right": "closeMenu()\n{\n    self.menuOpen = false;\n    if (isDefined(self.menuBg))     self.menuBg destroy();\n    if (isDefined(self.menuTitle))  self.menuTitle destroy();\n    if (isDefined(self.menuCursor)) self.menuCursor destroy();\n    for (i = 0; i < self.menuOpts.size; i++)\n        if (isDefined(self.menuOpts[i])) self.menuOpts[i] destroy();\n}",
      "explanation": "HUD elements created with newClientHudElem and createFontString persist until explicitly destroyed. Failing to call destroy() on each element when closing the menu causes them to remain visible on screen and accumulate across menu opens. Always destroy every element in your close/cleanup function."
    },
    {
      "id": "AP-045",
      "category": "hud-menu",
      "title": "Invalid font name on HUD text element",
      "wrong": "elem.font = \"Arial\";\nelem.font = \"helvetica\";\nelem.font = \"courier\";",
      "right": "elem.font = \"default\";\n// Other valid names: bigfixed, smallfixed, hudfixed, objective, big, small",
      "explanation": "IW4 GSC only supports a fixed set of engine font names: default, bigfixed, smallfixed, hudfixed, objective, big, small. Arbitrary font names like 'Arial' silently fall back to the default font or cause errors. There is no way to load custom fonts."
    },
    {
      "id": "AP-046",
      "category": "hud-menu",
      "title": "HUD color set as a string instead of a vector",
      "wrong": "elem.color = \"red\";\nelem.color = \"#FF0000\";\nelem.color = \"(1, 0, 0)\";",
      "right": "elem.color = (1, 0, 0); // red\nelem.color = (0, 0, 0); // black\nelem.color = (1, 1, 1); // white",
      "explanation": "elem.color must be a 3-component GSC vector (R, G, B) with values from 0.0 to 1.0. String values are silently ignored. Parentheses in GSC denote a vector literal, not a function call."
    },
    {
      "id": "AP-047",
      "category": "hud-menu",
      "title": "notifyOnPlayerCommand used in CoD4/IW3",
      "wrong": "// In a CoD4 (IW3) script:\nself notifyOnPlayerCommand(\"menu_up\", \"+actionslot 3\");\nself waittill(\"menu_up\"); // notifyOnPlayerCommand doesn't exist in IW3",
      "right": "// CoD4/IW3: use a compiled .menu file for key detection.\n// In your .menu file:\n// execKey \"UPARROW\" { scriptMenuResponse \"up\"; }\n// In GSC:\nself openMenu(game[\"myMenu\"]);\nself waittill(\"menuresponse\", menu, response);\nif (response == \"up\") scrollUp();",
      "explanation": "notifyOnPlayerCommand() is an IW4/MW2 function. It does NOT exist in stock CoD4 (IW3). In CoD4, button detection for menus requires a compiled .menu file with execKey/scriptMenuResponse, and GSC listens via waittill('menuresponse',...). CoD4X (the community client) backports notifyOnPlayerCommand, so it works there."
    },
    {
      "id": "AP-048",
      "category": "hud-menu",
      "title": "openMenu() without precacheMenu() in init",
      "wrong": "// During gameplay, no prior precache:\nself openMenu(game[\"myMenu\"]); // silently fails or crashes",
      "right": "// In your init() / onPlayerConnect, before the menu is ever needed:\nprecacheMenu(game[\"myMenu\"]);\n// Later, during gameplay:\nself openMenu(game[\"myMenu\"]);",
      "explanation": "Native .menu files must be registered with precacheMenu(game[\"menuName\"]) during the init phase (before the game starts / in onPlayerConnect) before they can be opened. Calling openMenu() for an unregistered menu silently does nothing or causes a script error."
    }
```

**Step 2: Verify JSON is valid**

```bash
cd "F:/Shehab Projects/iw4x-toolkit"
python -c "
import json
with open('knowledge/gsc-anti-patterns.json') as f:
    d = json.load(f)
total = len(d['patterns'])
menu = [p for p in d['patterns'] if p['category'] == 'hud-menu']
print(f'Total: {total}, hud-menu: {len(menu)}, last ID: {d[\"patterns\"][-1][\"id\"]}')
"
```

Expected: `Total: 48, hud-menu: 18, last ID: AP-048`

**Step 3: Commit**

```bash
git add knowledge/gsc-anti-patterns.json
git commit -m "feat: add 18 hud-menu anti-patterns (AP-031–AP-048)"
```

---

## Task 3: Add `gsc_menu_hud` loader + tool to `knowledge/tools.ts`

**Files:**
- Modify: `mcp-server/src/knowledge/tools.ts`

**Step 1: Write the failing test first** (see Task 4 — write tests before implementing)

Skip ahead to Task 4, write the tests, run them to confirm FAIL, then return here.

**Step 2: Add the loader and cache after the existing `gscRawCache` declaration (line ~55)**

Add after `let gscRawCache: RawCache | null = null;`:

```typescript
let menuHudCache: RawCache | null = null;

/**
 * Loads `gsc-menu-hud.json` as a raw JSON string.
 * Cached by mtime.
 */
export function loadMenuHud(): string {
  const filePath = getKnowledgeDir("gsc-menu-hud.json");
  if (!filePath) {
    return JSON.stringify({ error: "gsc-menu-hud.json not found" });
  }
  try {
    const mtime = fs.statSync(filePath).mtimeMs;
    if (menuHudCache && menuHudCache.mtime === mtime && !isCacheExpired(menuHudCache.cachedAt)) {
      return menuHudCache.raw;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    menuHudCache = { raw, mtime, cachedAt: Date.now() };
    return raw;
  } catch (e) {
    return JSON.stringify({ error: `Failed to load gsc-menu-hud.json: ${getErrMsg(e)}` });
  }
}
```

**Step 3: Add the `gsc_menu_hud` tool registration inside `registerKnowledgeTools`, after the `dvar_search` tool closing `);`**

```typescript
  // --- Tool: gsc_menu_hud ---
  server.registerTool(
    "gsc_menu_hud",
    {
      title: "GSC Menu HUD Reference",
      description:
        "Reference for building HUD-element script menus in CoD4/CoD4X and MW2/IW4X GSC. " +
        "Covers the positioning system (setPoint), all HUD element properties, " +
        "background/layering patterns, and CoD4 vs IW4X input differences. " +
        "Call this before writing any HUD menu code. " +
        "Topics: positioning, properties, layering, setPoint, fonts, sort, color, all.",
      inputSchema: {
        topic: z.string().describe(
          "Topic to look up. One of: 'positioning', 'properties', 'layering', " +
          "'setPoint', 'fonts', 'sort', 'color', 'all', or any property name."
        ),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ topic }) => {
      const raw = loadMenuHud();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return errResult("Failed to parse gsc-menu-hud.json");
      }
      if ("error" in data) {
        return errResult(String(data.error));
      }

      const sections = data.sections as Record<string, unknown>;
      const t = topic.toLowerCase().trim();

      // Direct section match
      if (t === "all") {
        return okResult(JSON.stringify(sections, null, 2));
      }
      if (t === "positioning" || t === "properties" || t === "layering") {
        return okResult(JSON.stringify(sections[t], null, 2));
      }

      // Sub-topic shortcuts
      if (t === "setpoint") {
        const pos = sections.positioning as Record<string, unknown>;
        return okResult(JSON.stringify(pos.setPoint, null, 2));
      }
      if (t === "fonts" || t === "font") {
        const props = sections.properties as Record<string, unknown>;
        const text = props.text as Record<string, unknown>;
        return okResult(JSON.stringify(text.font, null, 2));
      }
      if (t === "sort") {
        const layer = sections.layering as Record<string, unknown>;
        return okResult(JSON.stringify(layer.sort_system, null, 2));
      }
      if (t === "color" || t === "colour") {
        const props = sections.properties as Record<string, unknown>;
        const vis = props.visual as Record<string, unknown>;
        return okResult(JSON.stringify(vis.color, null, 2));
      }
      if (t === "alpha") {
        const props = sections.properties as Record<string, unknown>;
        const vis = props.visual as Record<string, unknown>;
        return okResult(JSON.stringify(vis.alpha, null, 2));
      }
      if (t === "cleanup" || t === "destroy") {
        const layer = sections.layering as Record<string, unknown>;
        return okResult(JSON.stringify(layer.cleanup, null, 2));
      }
      if (t === "foreground") {
        const props = sections.properties as Record<string, unknown>;
        const vis = props.visual as Record<string, unknown>;
        return okResult(JSON.stringify(vis.foreground, null, 2));
      }

      // Generic property search across all sections
      const results: Record<string, unknown> = {};
      for (const [sectionName, section] of Object.entries(sections)) {
        const found = findInSection(section as Record<string, unknown>, t);
        if (found !== null) results[sectionName] = found;
      }
      if (Object.keys(results).length > 0) {
        return okResult(JSON.stringify(results, null, 2));
      }

      return okResult(
        `No match found for topic '${topic}'.\n` +
        `Valid topics: positioning, properties, layering, setPoint, fonts, sort, color, alpha, foreground, cleanup, all.\n` +
        `Or use any property name (e.g. 'fontscale', 'glowAlpha').`
      );
    },
  );
```

**Step 4: Add the `findInSection` helper function** — add this before `registerKnowledgeTools`:

```typescript
/**
 * Recursively searches a nested object for a key matching the search term.
 * Returns the value if found, null otherwise.
 */
function findInSection(
  obj: Record<string, unknown>,
  term: string,
): Record<string, unknown> | null {
  const results: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.toLowerCase() === term) {
      results[key] = value;
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nested = findInSection(value as Record<string, unknown>, term);
      if (nested !== null) results[key] = nested;
    }
  }
  return Object.keys(results).length > 0 ? results : null;
}
```

**Step 5: Run tests (from Task 4) — expect PASS**

```bash
cd "F:/Shehab Projects/iw4x-toolkit/mcp-server"
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|gsc_menu_hud)"
```

Expected: all `gsc_menu_hud` tests PASS.

**Step 6: Commit**

```bash
git add mcp-server/src/knowledge/tools.ts
git commit -m "feat: add gsc_menu_hud tool to knowledge/tools.ts"
```

---

## Task 4: Write tests for `gsc_menu_hud`

**Files:**
- Modify: `mcp-server/src/index.test.ts`
- Modify: `mcp-server/src/index.ts` (re-export `loadMenuHud`)

**Step 1: Add `loadMenuHud` re-export to `index.ts`**

In `mcp-server/src/index.ts`, find the existing re-export line:
```typescript
export { loadDvars, loadGscBuiltins } from "./knowledge/tools.js";
```
Change it to:
```typescript
export { loadDvars, loadGscBuiltins, loadMenuHud } from "./knowledge/tools.js";
```

**Step 2: Add import to test file**

In `mcp-server/src/index.test.ts`, find:
```typescript
import {
  ...
  loadDvars,
  loadGscBuiltins,
  ...
} from "./index.js";
```
Add `loadMenuHud` to the import list.

**Step 3: Add test suite** — append before the final closing of the file:

```typescript
// ---------------------------------------------------------------------------
// Unit tests — loadMenuHud
// ---------------------------------------------------------------------------

describe("loadMenuHud", () => {
  it("returns valid JSON with the three expected sections", () => {
    const raw = loadMenuHud();
    const data = JSON.parse(raw) as { sections: Record<string, unknown> };
    expect(data.sections).toHaveProperty("positioning");
    expect(data.sections).toHaveProperty("properties");
    expect(data.sections).toHaveProperty("layering");
  });
});

// ---------------------------------------------------------------------------
// Integration tests — gsc_menu_hud tool
// ---------------------------------------------------------------------------

describe("gsc_menu_hud tool", () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    cleanup = async () => {
      await client.close();
    };
  });

  afterAll(async () => {
    await cleanup?.();
  });

  it("returns positioning section for topic='positioning'", async () => {
    const result = await client.callTool({
      name: "gsc_menu_hud",
      arguments: { topic: "positioning" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("setPoint");
    expect(text).toContain("640");
  });

  it("returns layering section for topic='layering'", async () => {
    const result = await client.callTool({
      name: "gsc_menu_hud",
      arguments: { topic: "layering" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("white");
    expect(text).toContain("sort");
  });

  it("returns properties section for topic='properties'", async () => {
    const result = await client.callTool({
      name: "gsc_menu_hud",
      arguments: { topic: "properties" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("newClientHudElem");
    expect(text).toContain("createFontString");
  });

  it("returns font list for topic='fonts'", async () => {
    const result = await client.callTool({
      name: "gsc_menu_hud",
      arguments: { topic: "fonts" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("bigfixed");
    expect(text).toContain("smallfixed");
  });

  it("returns sort reference for topic='sort'", async () => {
    const result = await client.callTool({
      name: "gsc_menu_hud",
      arguments: { topic: "sort" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("sort");
  });

  it("returns setPoint details for topic='setPoint'", async () => {
    const result = await client.callTool({
      name: "gsc_menu_hud",
      arguments: { topic: "setPoint" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("TOPLEFT");
    expect(text).toContain("CENTER");
  });

  it("returns color details for topic='color'", async () => {
    const result = await client.callTool({
      name: "gsc_menu_hud",
      arguments: { topic: "color" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("vector");
  });

  it("returns full data for topic='all'", async () => {
    const result = await client.callTool({
      name: "gsc_menu_hud",
      arguments: { topic: "all" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("positioning");
    expect(text).toContain("properties");
    expect(text).toContain("layering");
  });

  it("returns helpful error for unknown topic", async () => {
    const result = await client.callTool({
      name: "gsc_menu_hud",
      arguments: { topic: "nonexistent_xyz" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("No match found");
    expect(text).toContain("Valid topics");
  });
});
```

**Step 4: Run tests — expect FAIL (tool doesn't exist yet)**

```bash
cd "F:/Shehab Projects/iw4x-toolkit/mcp-server"
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|gsc_menu_hud|✓|✗|×)"
```

Expected: tests fail with "tool not found" or TypeScript error on `loadMenuHud`.

**Step 5: Implement (Task 3), then rerun — expect PASS**

**Step 6: Commit**

```bash
git add mcp-server/src/index.ts mcp-server/src/index.test.ts
git commit -m "test: add gsc_menu_hud tool tests"
```

---

## Task 5: Build dist and final verification

**Files:**
- Rebuild: `dist/`

**Step 1: Build**

```bash
cd "F:/Shehab Projects/iw4x-toolkit/mcp-server"
npm run build 2>&1 | tail -5
```

Expected: exits 0, no TypeScript errors.

**Step 2: Run full test suite**

```bash
cd "F:/Shehab Projects/iw4x-toolkit/mcp-server"
npm test 2>&1 | tail -10
```

Expected: all tests pass (previously 27 + 10 new = 37 tests).

**Step 3: Quick smoke test — verify tool is listed**

```bash
cd "F:/Shehab Projects/iw4x-toolkit/mcp-server"
node -e "
import('./dist/index.js').then(m => {
  const tools = m.server.listTools ? m.server.listTools() : '(check manually)';
  console.log('Server loaded OK');
}).catch(e => console.error('FAIL:', e.message));
"
```

Expected: `Server loaded OK`

**Step 4: Commit dist**

```bash
cd "F:/Shehab Projects/iw4x-toolkit"
git add dist/
git commit -m "chore: rebuild dist — gsc_menu_hud tool + menu anti-patterns"
```

---

## Acceptance Criteria

- [ ] `knowledge/gsc-menu-hud.json` exists with `positioning`, `properties`, `layering` sections
- [ ] `gsc_menu_hud` tool registered and queryable by topic
- [ ] `gsc-anti-patterns.json` has 48 total patterns (AP-001–AP-048), 18 new `hud-menu` entries
- [ ] All tests pass (37 total)
- [ ] `dist/` rebuilt with no TypeScript errors
- [ ] `gsc_anti_patterns` tool with `category="hud-menu"` returns the 18 new entries
