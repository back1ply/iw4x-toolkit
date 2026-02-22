# Phase 1: GSC Quality Foundation — Implementation Plan

**Priority**: #1 for vibe coding GSC scripts  
**Goal**: Enable LLMs to write high-quality, valid GSC code with confidence

---

## Key Decision: Borrow from Muhlex

We will adapt the tokenizer from **Muhlex/vscode-gsc** (MIT licensed, TypeScript, IW3/IW4):

- **Source**: https://github.com/Muhlex/vscode-gsc
- **Strategy**: Study Muhlex's tokenizer, adapt for MCP server
- **Why**: Same language = easiest integration

---

## 1. GSC Linter — TOP PRIORITY

### Purpose
Detect syntax errors, undefined variables, bad patterns — before the script runs in-game.

### Technical Approach
Adapt Muhlex's tokenizer + add custom linting rules for vibe coding.

### Implementation Tasks

```markdown
### 1.1 Study Muhlex Tokenizer
- [ ] Clone/examine Muhlex/vscode-gsc repo
- [ ] Understand token types (keywords, identifiers, operators, strings)
- [ ] Understand GSC-specific syntax (#using, #insert, #define)
- [ ] Identify what's reusable vs IW4-specific

### 1.2 Adapt Tokenizer for MCP
- [ ] Create `mcp-server/src/gsc/tokenizer.ts`
- [ ] Port token definitions
- [ ] Add line/column tracking for error reporting
- [ ] Handle GSC-specific edge cases

### 1.3 Syntax Validation
- [ ] Brace matching ({ } )
- [ ] Parenthesis matching ( )
- [ ] Semicolon detection
- [ ] String literal balance
- [ ] Report errors with line numbers

### 1.4 Static Analysis (Vibe Coding Rules)
- [ ] Undefined variable detection (check against known builtins + #includes)
- [ ] Undefined function calls (validate against gsc-builtins.json)
- [ ] Unreachable code after return/break/continue
- [ ] Infinite loop detection (no wait/endon)

### 1.5 Bad Patterns (Anti-Patterns)
- [ ] Nested wait loops without endon termination
- [ ] Missing thread/notify cleanup
- [ ] Direct entity access without isDefined check
- [ ] Hardcoded strings that should be DVARs

### 1.6 MCP Tool: `gsc_lint`
- [ ] Input: path to .gsc file
- [ ] Output: list of errors/warnings with line numbers
- [ ] Integrate with existing MCP server
- [ ] Test with real IW4x scripts
```

### Reference Sources
- **Muhlex/vscode-gsc** — https://github.com/Muhlex/vscode-gsc — Tokenizer source
- **xensik/gsc-tool** — https://github.com/xensik/gsc-tool — Grammar reference
- `knowledge/gsc-builtins.json` — For validating function calls

---

## 2. userraw/ File Operations

### Purpose
Read/write GSC files in the loose-file structure (preferred over IWD editing).

### Technical Approach
Standard filesystem operations with path validation for IW4X structure.

### Implementation Tasks

```markdown
### 2.1 Path Resolution
- [ ] Detect `fs_game` location (config or env var)
- [ ] Resolve userraw/ paths correctly
- [ ] Validate path doesn't escape fs_game

### 2.2 MCP Tools
- [ ] `userraw_read` — Read GSC/ASC files with glob support
- [ ] `userraw_write` — Create with atomic write + backup
- [ ] `userraw_list` — List files with summary mode

### 2.3 MCP Tool: `gsc_template`
- [ ] List available templates
- [ ] Generate from template with variables
- [ ] Inject into userraw/ structure
```

### IW4X Directory Structure
```
fs_game/
  userraw/
    maps/
      mp/gametypes/
    scripts/
    weapons/
```

---

## 3. Template Snippets

### Purpose
Common GSC patterns the LLM can generate from — reduces boilerplate errors.

### Implementation Tasks

```markdown
### 3.1 Template Library Structure
- [ ] JSON/YAML format for templates
- [ ] Categories: gametypes, utilities, menus, weapons
- [ ] Variables: {{player}}, {{weapon}}, {{timeout}}, etc.

### 3.2 Initial Templates
- [ ] player_connect callback
- [ ] killstreak reward
- [ ] weapon pickup handling
- [ ] menu response handler
- [ ] simple gametype (CTF/DM)
- [ ] array utility functions

### 3.3 MCP Tool: `gsc_template`
- [ ] List available templates
- [ ] Generate from template with variables
- [ ] Inject into userraw/ structure
```

---

## 4. GSC Builtins Lookup (Supporting)

### Purpose
Help LLM find correct functions to use.

### Implementation Tasks

```markdown
### 4.1 Expand knowledge/gsc-builtins.json
- [ ] Use leafized/GSC-Functions as reference
- [ ] Add missing MW2-specific functions
- [ ] Add parameter counts
- [ ] Add return types where known

### 4.2 MCP Tool: `gsc_lookup`
- [ ] Search by function name
- [ ] Search by description
- [ ] Return signature + example usage
```

### Reference Sources
- **leafized/GSC-Functions** — https://github.com/leafized/GSC-Functions

---

## 5. DVAR Reference (Lower Priority)

### Purpose
Document game variables.

### Already Done
- [x] 1,731 DVARs in knowledge/dvars.json
- [x] DVAR search tool exists

### Remaining
- [ ] Expand manual descriptions (89/1731 enriched)
- [ ] Prioritize: network, shadow, sound DVARs

---

## Execution Order

```
1. Study Muhlex tokenizer (download, read code, understand)
   ↓
2. Adapt tokenizer to mcp-server/src/gsc/tokenizer.ts
   ↓
3. Basic Syntax Validation (brace matching, etc.)
   ↓
4. GSC Linter MCP tool
   ↓
5. userraw/ file tools
   ↓
6. Template library
   ↓
7. GSC Builtins expansion (using leafized)
```

---

## Files to Create/Modify

| File | Action | Source |
|------|--------|--------|
| `mcp-server/src/gsc/tokenizer.ts` | New — adapted from Muhlex | Muhlex/vscode-gsc |
| `mcp-server/src/gsc/linter.ts` | New — static analyzer | Custom + xensik reference |
| `mcp-server/src/gsc/tools.ts` | New — register gsc_lint, gsc_lookup, gsc_template | New |
| `mcp-server/src/userraw/tools.ts` | New — userraw file operations | Custom |
| `knowledge/gsc-builtins.json` | Expand | leafized/GSC-Functions |
| `knowledge/templates/` | New — template library | Custom |
| `mcp-server/src/index.ts` | Wire up new tools | Modify |

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `adm-zip` | IWD operations (existing) |
| `zod` | Validation (existing) |
| No new deps for tokenizer | Adapted from Muhlex |

---

## Next Steps

1. **Download Muhlex** — Clone https://github.com/Muhlex/vscode-gsc
2. **Study tokenizer** — Understand how it works
3. **Port to MCP** — Create adapted version for iw4x-toolkit
4. **Add linting rules** — Beyond syntax, add vibe coding best practices

---

*Phase 1 plan v2 — with Muhlex borrowing strategy*
