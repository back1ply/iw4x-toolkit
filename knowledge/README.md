# Knowledge Base

Reference data for MW2 / IW4X modding, used by the iw4x-toolkit commands and published for use by anything else.

| File | Contents | Used by |
|---|---|---|
| `dvars.json` | Console variables: type, default, flags, category, context, description, FPS impact | `dvar_search`, `dvar_integrity_check`, `iw4x://dvars` |
| `gsc-builtins.json` | GSC built-in functions: parameters, return type, category, description | `gsc_lookup`, `gsc_lint`, `gsc_find_orphans`, `iw4x://gsc-builtins` |
| `gsc-anti-patterns.json` | Common mistakes with the correct IW4 GSC equivalent | `gsc_anti_patterns` |
| `templates.json` | GSC code templates with `{{placeholder}}` variables | `gsc_template` |
| `gsc-menu-hud.json` | HUD element reference for script menus | `gsc_menu_hud` |

Current counts and download links are in [`llms.txt`](llms.txt). Each file has a JSON Schema in [`schemas/`](schemas/).

## Using the data elsewhere

Every file is served by jsDelivr from the public repository:

```
https://cdn.jsdelivr.net/gh/back1ply/iw4x-toolkit@master/knowledge/<file>
```

Replace `@master` with a release tag (e.g. `@v2.0.0`) for content that will not change under you.

## Editing

1. Edit the JSON. Shapes are defined in `mcp-server/src/knowledge/schemas.ts`.
   - `gsc-builtins.json` has two entry formats. Hand-curated entries use `parameters` and `engines`. Entries imported from [Muhlex/gsc-doc](https://github.com/Muhlex/gsc-doc) use `params`, `calledOn`, `scopes`, and `example`.
2. From `mcp-server/`, run:
   - `npm run knowledge` to regenerate `llms.txt` and `schemas/`
   - `npm run build` to embed the data in the toolkit
   - `npm test`, which validates every file against its schema and fails if the generated files are stale
