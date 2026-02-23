# GSC Linter Error Codes

This document describes the error codes produced by the GSC linter in iw4x-toolkit.

## Error Code Reference

| Code     | Type    | Description                              | Example                          |
|----------|---------|------------------------------------------|----------------------------------|
| TOK-001  | error   | Tokenization error                       | Unterminated string, invalid char|
| VAR-001  | warning | Potentially undefined variable           | Using variable before definition |
| FUN-001  | warning | Potentially undefined function           | Calling unknown function         |
| PAT-001  | warning | Suspicious pattern detected              | isDefined() without using result |
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
