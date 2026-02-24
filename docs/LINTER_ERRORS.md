# GSC Linter Error Codes

This document describes the error codes produced by the GSC linter in iw4x-toolkit.

## Error Code Reference

| Code     | Type    | Description                              | Example                          |
|----------|---------|------------------------------------------|----------------------------------|
| TOK-001  | error   | Tokenization error                       | Unterminated string, invalid char|
| TOK-002  | error   | Unmatched bracket                        | Missing closing ']'              |
| TOK-003  | error   | Unmatched parenthesis                    | Missing closing ')'              |
| TOK-004  | error   | Unmatched brace                          | Missing closing '}'              |
| TOK-005  | error   | Invalid identifier                       | Invalid characters in name      |
| TOK-006  | error   | Malformed preprocessor                   | Unknown #directive              |
| TOK-007  | error   | Invalid character                        | Unknown character in code       |
| TOK-008  | error   | Unterminated comment                    | Missing '*/' for block comment  |
| VAR-001  | warning | Potentially undefined variable           | Using variable before definition |
| FUN-001  | warning | Potentially undefined function           | Calling unknown function         |
| PAT-001  | warning | Suspicious pattern detected              | isDefined() without using result |
| PAT-010  | error   | `function` keyword in definition         | `function init() {}`             |
| PAT-011  | error   | var/let/const declaration                | `var x = 5;`                     |
| PAT-012  | error   | JS array method (.push/.pop)             | `arr.push(item)`                 |
| PAT-013  | error   | .length on array/string                  | `arr.length`                     |
| PAT-014  | error   | Strict equality operator                 | `x === 5`                        |
| PAT-015  | error   | Ternary operator                         | `x > 0 ? a : b`                  |
| PAT-016  | error   | Arrow function                           | `(x) => x + 1`                   |
| PAT-017  | error   | Object literal syntax                    | `obj = {x: 1}`                   |
| PAT-018  | error   | null literal                             | `if (x == null)`                 |
| PAT-019  | error   | JavaScript global (Math/parseInt)        | `Math.floor(x)`                  |
| PAT-020  | error   | Template literal (backtick)              | `` `hi ${name}` ``               |
| PAT-021  | error   | new keyword                              | `new Object()`                   |
| PAT-022  | error   | this. reference                          | `this.health`                    |
| PAT-023  | error   | for...of or forEach                      | `arr.forEach(fn)`                |
| PAT-024  | error   | JS string/array method                   | `"a".concat("b")`                |
| STY-001  | info    | Style suggestion                         | Line exceeds 200 characters     |
| STY-002  | info    | Style suggestion                         | Hardcoded value should be DVAR   |
| FLOW-001 | warning | Unreachable code detected                | Code after return/break/continue|

## Error Types

- **error**: Critical issues that prevent code from running
- **warning**: Potential bugs or issues that may cause problems
- **info**: Style suggestions and best practice recommendations

## Detailed Descriptions

### TOK-001: Tokenization Error

**Type:** error

The tokenizer encountered an invalid token or syntax that it cannot parse.

**Common causes:**
- Unterminated string literals
- Invalid characters in identifiers
- Malformed comments

**Example:**
```gsc
// Error: unterminated string
myString = "hello world;
```

**Fix:**
```gsc
// Add closing quote
myString = "hello world";
```

### TOK-002: Unmatched Bracket

**Type:** error

A closing bracket `]` was found without a matching opening bracket `[`.

**Common causes:**
- Extra closing bracket
- Typo in array access

**Example:**
```gsc
myArray = players[0];]
```

**Fix:**
```gsc
myArray = players[0];
```

### TOK-003: Unmatched Parenthesis

**Type:** error

A closing parenthesis `)` was found without a matching opening parenthesis `(`.

**Common causes:**
- Extra closing parenthesis
- Typo in function call

**Example:**
```gsc
println("hello");
```

**Fix:**
```gsc
println("hello");
```

### TOK-004: Unmatched Brace

**Type:** error

A closing brace `}` was found without a matching opening brace `{`.

**Common causes:**
- Extra closing brace
- Typo in code block

**Example:**
```gsc
function test() {
    println("test");
}}
```

**Fix:**
```gsc
function test() {
    println("test");
}
```

### TOK-008: Unterminated Comment

**Type:** error

A block comment `/*` was not properly closed with `*/`.

**Common causes:**
- Missing closing `*/`
- Comment accidentally spanning too far

**Example:**
```gsc
/* This comment never ends
```

**Fix:**
```gsc
/* This comment ends properly */
```

### VAR-001: Potentially Undefined Variable

**Type:** warning

A variable is being used that hasn't been defined in the current scope.

**Common causes:**
- Typos in variable names
- Using variables before declaration
- Missing function parameters

**Example:**
```gsc
function myFunc() {
    x = 5;  // Warning: 'x' not defined
}
```

**Fix:**
```gsc
function myFunc() {
    var x = 5;  // Define before use
}
```

### FUN-001: Potentially Undefined Function

**Type:** warning

A function is being called that hasn't been defined or imported.

**Common causes:**
- Typos in function names
- Missing function definitions
- Calling functions from other files without proper includes

**Example:**
```gsc
function myFunc() {
    doSomthing();  // Warning: 'doSomthing' not defined (typo)
}
```

**Fix:**
```gsc
function myFunc() {
    doSomething();  // Correct spelling
}
```

### PAT-001: Suspicious Pattern Detected

**Type:** warning

Code contains a pattern that is likely a bug or anti-pattern.

**Common patterns detected:**
- `isDefined()` called without using the result

**Example:**
```gsc
function myFunc() {
    isDefined(self.someValue);  // Warning: result not used
}
```

**Fix:**
```gsc
function myFunc() {
    if (isDefined(self.someValue)) {
        // Use the result
    }
}
```

### STY-001: Line Exceeds Maximum Length

**Type:** info

A line exceeds the recommended maximum length of 200 characters.

**Why it matters:**
- Improves readability
- Better for side-by-side diff viewing
- Follows common code style conventions

**Example:**
```gsc
// A very long line that exceeds 200 characters and makes the code harder to read especially when viewing diffs or in split-screen editors
```

**Fix:** Break the line into multiple lines:
```gsc
// Break into multiple lines for readability
var longStatement = "value1" + "value2" + "value3" 
    + "value4" + "value5";
```

### STY-002: Hardcoded Value Should Be DVAR

**Type:** info

A hardcoded string that looks like a configuration value should potentially be a DVAR.

**Why it matters:**
- DVARs can be changed without recompiling
- Easier to configure for different environments
- Follows IW4x modding best practices

**Example:**
```gsc
gameType = "DM";  // Info: consider using a DVAR
```

**Fix:**
```gsc
gameType = getDvar("g_gametype", "DM");
```

### FLOW-001: Unreachable Code Detected

**Type:** warning

Code exists after a `return`, `break`, or `continue` statement that will never be executed.

**Common causes:**
- Code added after a return statement
- Forgotten break statements in switch cases
- Logic errors in control flow

**Example:**
```gsc
function myFunc() {
    return 5;
    x = 10;  // Warning: unreachable code
}
```

**Fix:** Remove or reorganize the unreachable code:
```gsc
function myFunc() {
    x = 10;
    return 5;
}
```

## Disabling Checks

The linter supports the following options to disable specific checks:

### Disable Undefined Variable/Function Checks

```typescript
// When calling the linter
const result = lint(sourceCode, { checkUndefined: false });
```

This disables:
- VAR-001 (undefined variables)
- FUN-001 (undefined functions)

### Disable Pattern Checks

```typescript
// When calling the linter
const result = lint(sourceCode, { checkPatterns: false });
```

This disables:
- PAT-001 (suspicious patterns)

### Disable All Optional Checks

```typescript
// Minimal linting (only tokenization errors)
const result = lint(sourceCode, { 
    checkUndefined: false, 
    checkPatterns: false 
});
```

## Integration with MCP Tools

The linter is available through the `gsc_lint` MCP tool:

```
gsc_lint(path="path/to/file.gsc", check_undefined=true, check_patterns=true)
```

Or lint content directly:

```
gsc_lint(content="function main() { ... }", check_undefined=true, check_patterns=true)
```

## Best Practices

1. **Fix errors first**: Always address `error` type issues before warnings or info
2. **Review warnings carefully**: Warnings often indicate real bugs
3. **Use info as guidelines**: Style suggestions improve code quality but aren't critical
4. **Run linter early**: Catch issues during development, not in production
5. **Configure appropriately**: Disable checks that don't apply to your use case

## Auto-Fix Functionality

The linter includes an auto-fix function that can automatically fix common syntax errors:

```typescript
import { lint, fix } from './gsc/linter.js';

// First, lint to see errors
const result = await lint(sourceCode);
console.log(result.errors);

// Then try to auto-fix common errors
const fixResult = fix(sourceCode);
if (fixResult.fixed) {
    console.log('Fixes applied:', fixResult.fixesApplied);
    console.log('Fixed code:', fixResult.fixedCode);
}
```

### What can be auto-fixed:
- Unterminated strings (adds missing closing quote)
- Missing closing braces (adds missing `}`)

### What requires manual fixing:
- Unmatched parentheses `()`
- Unmatched brackets `[]`
- Other syntax errors

The auto-fix function returns:
- `fixed`: boolean indicating if any fixes were applied
- `original`: the original source code
- `fixedCode`: the fixed source code (if fixes were applied)
- `fixesApplied`: array of strings describing what was fixed

## Anti-Pattern Detection

The linter detects 15 IW4-specific anti-patterns (PAT-010 to PAT-024) that fire as errors.
These catch common mistakes made by LLMs trained on JavaScript or BO3 GSC.

For a searchable reference of wrong→right code pairs, use the `gsc_anti_patterns` MCP tool:
- `gsc_anti_patterns(query="push")` — array append pattern
- `gsc_anti_patterns(query="null")` — null check pattern
- `gsc_anti_patterns(list=true)` — list all categories
