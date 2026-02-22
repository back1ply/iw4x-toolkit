# Tool Borrowing Analysis: What to Take from Each

## 1. Muhlex/vscode-gsc
**URL**: https://github.com/Muhlex/vscode-gsc  
**Language**: TypeScript  
**Target**: IW3/IW4  
**License**: MIT

### What it provides:
- **Tokenizer (Lexer)** — Breaks GSC into tokens
- **Basic Parser** — AST structure for GSC
- **VSCode integration** — How to expose to an editor

### What we can borrow:
| Component | Use |
|-----------|-----|
| `tokenizer.ts` | Core lexer — adapt directly for MCP |
| Token types | Define GSC token enum (keywords, operators, etc.) |
| Error handling | How to report parse errors with line/column |
| IW3/IW4 dialect | Game-specific syntax differences |

### Why it's valuable:
**Same language** (TypeScript) = easiest to integrate. Direct code reuse.

---

## 2. xensik/gsc-tool
**URL**: https://github.com/xensik/gsc-tool  
**Language**: C++  
**Target**: IW3–IW8, S1–S4, H1–H2, T4–T9  
**License**: Open source (check repo)

### What it provides:
- **Formal Grammar** (Bison) — Complete GSC syntax definition
- **Compiler/Decompiler** — Full pipeline
- **Disassembler** — For compiled bytecode
- **IW3–IW8 support** — Most comprehensive

### What we can borrow:
| Component | Use |
|-----------|-----|
| Grammar rules | Define what makes valid GSC |
| AST design | How to structure the tree |
| IW4-specific quirks | Game-version differences |
| Error messages | What to report and how |

### Why it's valuable:
**Most complete reference**. The Bison grammar is the "source of truth" for GSC syntax.

---

## 3. leafized/GSC-Functions
**URL**: https://github.com/leafized/GSC-Functions  
**Language**: JSON/Data files  
**Target**: IW4, IW6, T4–T8

### What it provides:
- **Function lists** — Complete GSC function catalogs
- **Parameter counts** — How many args each function takes
- **Return types** — What functions return

### What we can borrow:
| Component | Use |
|-----------|-----|
| `knowledge/gsc-builtins.json` expansion | Add missing functions |
| IW4-specific functions | MW2-only functions |
| Cross-version comparison | See what changed between games |

### Why it's valuable:
**Knowledge base** — Fills in the gaps in your current `gsc-builtins.json`.

---

## Summary: What to Take

| Source | What to Borrow | Priority |
|--------|---------------|----------|
| **Muhlex** | Tokenizer code, TypeScript implementation | HIGH |
| **xensik** | Grammar rules, AST design, validation logic | HIGH |
| **leafized** | Function definitions for `gsc-builtins.json` | MEDIUM |

### Implementation Path

1. **Start with Muhlex tokenizer** — Fastest path to working lexer
2. **Add xensik grammar rules** — For validation/parsing depth
3. **Enrich with leafized** — For complete function coverage

---

## Alternative: Use as Reference Only

If you prefer to build fresh:
- Study Muhlex → understand tokenizer architecture
- Study xensik → understand full grammar
- Build custom TypeScript implementation

This takes longer but gives full control.

---

*What's your preference?*
