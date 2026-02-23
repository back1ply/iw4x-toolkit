# Knowledge Base

This directory contains structured data used by the `iw4x-toolkit` MCP server to provide intelligent suggestions and validation.

## Files

### `dvars.json`
A comprehensive list of MW2 DVARs (Console Variables).
- **Source**: `bloodbourne/M2-dvars-list` + Engine Analysis
- **Usage**: Used by the `dvar_search` tool to find variables, types, and defaults.

### `gsc-builtins.json`
A definitions file for GSC (Game Script) built-in functions.
- **Status**: Available — v1.1.0, 80 functions compiled from X-Labs, CoD4x, and Zeroy wikis.
- **Source**: Manual compilation from X-Labs, CoD4x, and Zeroy wikis.
- **Schema**:
  ```json
  {
    "name": "function_name",
    "returnType": "void|int|float|string|entity|array|bool",
    "parameters": [
      { "name": "arg1", "type": "type", "optional": false }
    ],
    "engines": ["cod4", "iw4", "cod4x", "iw4x"],
    "description": "Short description of behavior.",
    "category": "category_name"
  }
  ```
- **Goal**: Source of truth for the GSC Linter (`gsc_lint`) and the `gsc_lookup` tool.

## Contributing
To add new functions:
1.  Verify the function exists in the target engine (CoD4x or IW4x).
2.  Add it to `gsc-builtins.json` following the schema.
3.  Ensure the `engines` array reasonably reflects where it is available.
