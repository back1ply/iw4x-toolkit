# Contributing to iw4x-toolkit

Thank you for your interest in contributing to iw4x-toolkit! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+
- TypeScript 5.7+

### Getting Started

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/iw4x-toolkit.git
   cd iw4x-toolkit
   ```

2. Install dependencies:
   ```bash
   cd mcp-server
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Run tests:
   ```bash
   npm test
   ```

## Project Structure

```
iw4x-toolkit/
├── dist/                 # Compiled output — committed for marketplace installs
├── mcp-server/           # MCP server implementation
│   ├── src/
│   │   ├── index.ts      # Entry point
│   │   ├── utils.ts      # Shared utilities
│   │   ├── iwd/          # IWD archive tools
│   │   ├── gsc/          # GSC language tools
│   │   └── knowledge/    # DVAR/GSC knowledge
│   ├── src/**/*.test.ts  # Tests live alongside source files (e.g. tools.test.ts next to tools.ts)
│   └── package.json
├── knowledge/            # Knowledge base JSON files
├── docs/                 # Documentation
├── tasks/                # Task notes and lessons learned
└── skills/               # Claude Code skills
```

## Code Style

### TypeScript

- Use strict mode (enabled in tsconfig.json)
- Prefer `interface` over `type` for object shapes
- Use explicit return types for public functions
- Use ESM imports with `.js` extensions for local modules

### Naming Conventions

- **Files**: kebab-case (e.g., `read-tools.ts`)
- **Functions**: camelCase (e.g., `openIwd`)
- **Classes**: PascalCase (e.g., `GSCLinter`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `IWD_CACHE_MAX`)
- **Types/Interfaces**: PascalCase (e.g., `McpResult`)

### Error Handling

Use the `Result<T>` type for operations that can fail:

```typescript
function openIwd(path: string): Result<AdmZip> {
  if (!exists(path)) {
    return err("File not found");
  }
  return ok(zip);
}

// Usage:
const result = openIwd(path);
if (!result.ok) return errResult(result.error);
const { value: zip } = result;
```

## Testing

### Running Tests

```bash
npm test                    # Run all tests
npm test -- --reporter=verbose  # Verbose output
npm test -- --filter="iwd"  # Run specific tests
```

### Writing Tests

- Use Vitest framework
- Place tests next to the source file (e.g., `tools.ts` → `tools.test.ts`)
- Use descriptive test names
- Test both success and error paths

Example:
```typescript
describe("myFunction", () => {
  it("returns expected value for valid input", () => {
    expect(myFunction("valid")).toBe("expected");
  });

  it("returns error for invalid input", () => {
    expect(myFunction("invalid")).toBeNull();
  });
});
```

## Pull Request Process

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes, following code style guidelines

3. Add/update tests for your changes

4. Ensure all tests pass:
   ```bash
   npm test
   ```

5. Commit with clear messages:
   ```bash
   git commit -m "feat: add new tool for X"
   ```

6. Push and create a pull request

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Adding/updating tests
- `chore:` Maintenance tasks

## Adding New Tools

1. Create the tool in the appropriate module (e.g., `src/iwd/read-tools.ts`)
2. Define Zod schema for input validation
3. Add MCP annotations (`readOnlyHint`, `destructiveHint`, etc.)
4. Write comprehensive tests
5. Update documentation

## Questions?

Open an issue for bugs, feature requests, or questions.
