# Technology Stack

**Analysis Date:** 2026-03-22

## Languages

**Primary:**
- TypeScript 5.7.0 - All source code in `mcp-server/src/`
- JavaScript (runtime via compiled TypeScript)

**Secondary:**
- JSON - Knowledge base files, configuration

## Runtime

**Environment:**
- Node.js 16+ (targets Node16 module resolution)
- ES2022 target with ESM (ES modules)

**Package Manager:**
- npm (package-lock.json expected)
- Lockfile: Present

## Frameworks

**Core:**
- Model Context Protocol (MCP) SDK `@modelcontextprotocol/sdk` v1.12.1 - MCP server framework for Claude integration
- Express.js (via SDK dependencies) - HTTP transport layer

**Testing:**
- Vitest 3.0.0 - Unit and integration test runner
- (See `.test.ts` files)

**Build/Dev:**
- esbuild 0.27.3 - JavaScript bundler (bundles src/index.ts → dist/index.js with ESM+CommonJS compatibility)
- TypeScript 5.7.0 compiler - Type checking and transpilation
- TypeDoc 0.27.0 - API documentation generator (config: `typedoc.json`)

## Key Dependencies

**Critical:**
- `@modelcontextprotocol/sdk` v1.12.1 - Enables MCP server functionality
  - Provides `McpServer`, `StdioServerTransport` for Claude integration
- `adm-zip` v0.5.16 - ZIP archive reading/writing for IWD files
  - Core dependency for all IWD file operations
- `zod` v3.23.0 - Runtime schema validation for tool parameters
  - Used in all tool parameter definitions (`z.object()`, `z.string()`, etc.)

**Infrastructure:**
- `@types/node` v22.0.0 - Node.js type definitions
- `@types/adm-zip` v0.5.7 - Type definitions for adm-zip

## Configuration

**Build:**
- `tsconfig.json` in `mcp-server/`:
  - Target: ES2022
  - Module: Node16 (ESM with CommonJS interop)
  - Strict mode: enabled
  - Declaration files: enabled
  - Source maps: enabled

**TypeScript:**
- `compilerOptions` settings in `mcp-server/tsconfig.json`:
  - strict: true
  - esModuleInterop: true
  - declaration: true
  - sourceMap: true

**Build Output:**
- `esbuild` command in package.json:
  - Bundles single entry point: `src/index.ts`
  - Output: `dist/index.js`
  - Format: ESM with CommonJS compatibility banner
  - No external dependencies (--bundle)

**NPM Scripts:**
- `npm run build` - Bundle TypeScript with esbuild
- `npm run dev` - Watch mode TypeScript compilation
- `npm test` - Run vitest unit/integration tests
- `npm run docs` - Generate TypeDoc API documentation
- `npm run docs:watch` - Watch mode for docs generation

## Platform Requirements

**Development:**
- Node.js v16 or higher
- TypeScript 5.7.0 (installed locally)
- npm or compatible package manager

**Production:**
- Node.js v16 or higher
- Single bundled file (`dist/index.js`)
- No external runtime dependencies beyond Node stdlib

---

*Stack analysis: 2026-03-22*
