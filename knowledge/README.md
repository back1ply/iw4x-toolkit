# Knowledge Base

This directory contains structured data used by the `iw4x-toolkit` MCP server to provide intelligent suggestions and validation.

## Files

### `dvars.json`
A comprehensive list of MW2 DVARs (Console Variables).
- **Source**: `bloodbourne/M2-dvars-list` + Engine Analysis
- **Usage**: Used by the `dvar_search` tool to find variables, types, and defaults.

### `gsc-builtins.json` *(Planned — not yet created)*
A definitions file for GSC (Game Script) built-in functions.
- **Status**: Research in progress. See `tasks/gsc-builtins-research.md` for collected data and next steps.
- **Source**: Manual compilation from X-Labs, CoD4x, and Zeroy wikis.
- **Schema**:
  ```json
  {
    "name": "function_name",
    "returnType": "void|int|float|string|entity|array|bool",
    "parameters": [
      { "name": "arg1", "type": "type", "optional": boolean }
    ],
    "engines": ["cod4", "iw4", "cod4x", "iw4x"], // Compatibility tags
    "description": "Short description of behavior.",
    "category": "category_name"
  }
  ```
- **Goal**: To serve as the source of truth for the future GSC Linter and Autocomplete features.

## Contributing
To add new functions:
1.  Verify the function exists in the target engine (CoD4x or IW4x).
2.  Add it to `gsc-builtins.json` following the schema.
3.  Ensure the `engines` array reasonably reflects where it is available.
