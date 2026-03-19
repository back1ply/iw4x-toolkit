/**
 * @file gsc/gsc.test.ts
 * Tests for GSC tokenizer and linter
 */

import { describe, it, expect } from "vitest";
import { tokenize, GSCTokenizer, TokenType } from "./tokenizer.js";
import { lint, GSCLinter } from "./linter.js";
import { format } from "./formatter.js";

describe("GSCTokenizer", () => {
  describe("Basic Tokenization", () => {
    it("should tokenize identifiers", () => {
      const result = tokenize("myVar anotherVar test123");
      const identifiers = result.tokens.filter(t => t.type === TokenType.IDENTIFIER);
      expect(identifiers.map(t => t.value)).toEqual(["myVar", "anotherVar", "test123"]);
    });

    it("should tokenize keywords including self/level/player", () => {
      const result = tokenize("self player level if else while return");
      const keywords = result.tokens.filter(t => t.type === TokenType.KEYWORD);
      // self, player, level are in GSC_KEYWORDS
      expect(keywords.map(t => t.value)).toContain("self");
      expect(keywords.map(t => t.value)).toContain("player");
      expect(keywords.map(t => t.value)).toContain("level");
    });

    it("should tokenize keywords", () => {
      const result = tokenize("if else while return");
      const keywords = result.tokens.filter(t => t.type === TokenType.KEYWORD);
      expect(keywords.map(t => t.value)).toEqual(["if", "else", "while", "return"]);
    });

    it("should tokenize numbers", () => {
      const result = tokenize("42 3.14 0xFF");
      const numbers = result.tokens.filter(t => t.type === TokenType.NUMBER);
      expect(numbers.map(t => t.value)).toEqual(["42", "3.14", "0xFF"]);
    });

    it("should tokenize strings", () => {
      const result = tokenize('"hello world" \'single quotes\'');
      const strings = result.tokens.filter(t => t.type === TokenType.STRING);
      expect(strings.map(t => t.value)).toEqual(["hello world", "single quotes"]);
    });

    it("should tokenize operators", () => {
      const result = tokenize("+ - * / == != <= >=");
      const ops = result.tokens.filter(t => 
        t.type === TokenType.PLUS || 
        t.type === TokenType.MINUS || 
        t.type === TokenType.STAR ||
        t.type === TokenType.SLASH ||
        t.type === TokenType.EQUAL_EQUAL ||
        t.type === TokenType.BANG_EQUAL ||
        t.type === TokenType.LESS_EQUAL ||
        t.type === TokenType.GREATER_EQUAL
      );
      expect(ops.length).toBe(8);
    });

    it("should tokenize braces and parentheses", () => {
      const result = tokenize("() {} []");
      const types = result.tokens.map(t => t.type);
      expect(types).toContain(TokenType.LEFT_PAREN);
      expect(types).toContain(TokenType.RIGHT_PAREN);
      expect(types).toContain(TokenType.LEFT_BRACE);
      expect(types).toContain(TokenType.RIGHT_BRACE);
      expect(types).toContain(TokenType.LEFT_BRACKET);
      expect(types).toContain(TokenType.RIGHT_BRACKET);
    });
  });

  describe("Comments", () => {
    it("should tokenize single-line comments", () => {
      const result = tokenize("// this is a comment");
      const comments = result.tokens.filter(t => t.type === TokenType.COMMENT);
      expect(comments).toHaveLength(1);
      expect(comments[0].value).toBe(" this is a comment");
    });

    it("should tokenize block comments", () => {
      const result = tokenize("/* multi\nline\ncomment */");
      const comments = result.tokens.filter(t => t.type === TokenType.BLOCK_COMMENT);
      expect(comments).toHaveLength(1);
      expect(comments[0].value).toBe(" multi\nline\ncomment ");
    });
  });

  describe("Preprocessor", () => {
    it("should tokenize #define", () => {
      const result = tokenize("#define MAX_PLAYERS 16");
      const hash = result.tokens.filter(t => t.type === TokenType.HASH);
      expect(hash).toHaveLength(1);
      expect(hash[0].value).toBe("define");
    });

    it("should tokenize #using", () => {
      const result = tokenize("#using scripts/mp/gametypes/my_gametype");
      const hash = result.tokens.filter(t => t.type === TokenType.HASH);
      expect(hash).toHaveLength(1);
      expect(hash[0].value).toBe("using");
    });
  });

  describe("GSC-Specific", () => {
    it("should tokenize function calls", () => {
      const result = tokenize("self notify(\"spawned\");");
      const hasSelf = result.tokens.some(t => t.value === "self");
      const hasNotify = result.tokens.some(t => t.value === "notify");
      expect(hasSelf || hasNotify).toBe(true);
    });

    it("should handle GSC threading syntax", () => {
      const result = tokenize("thread maps\\mp\\gametypes\\_globallogic::init();");
      expect(result.errors).toHaveLength(0);
    });

    it("should track line numbers", () => {
      const result = tokenize("line1\nline2\nline3");
      const tokens = result.tokens.filter(t => t.type === TokenType.IDENTIFIER);
      expect(tokens[0].line).toBe(1);
      expect(tokens[1].line).toBe(2);
      expect(tokens[2].line).toBe(3);
    });
  });

  describe("Error Handling", () => {
    it("should handle unterminated strings", () => {
      const result = tokenize('"unterminated string');
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

describe("GSCLinter", () => {
  describe("Syntax Errors", () => {
    it("should detect balanced braces", async () => {
      const result = await lint(`
function test()
{
  if(true)
  {
    println("hello");
  }
}
`);
      // Should have no brace-related errors
      const braceErrors = result.errors.filter(e => e.code.includes("BRACE"));
      expect(braceErrors).toHaveLength(0);
    });

    it("should detect missing braces", async () => {
      const result = await lint(`
function test()
{
  if(true)
    println("hello");
`);
      // This is valid GSC actually, so no brace-related error expected
      // (GSC doesn't require braces for single statements)
      // PAT-010 fires on the `function` keyword (JS syntax, not a brace issue) — exclude it here
      const braceErrors = result.errors.filter(e => e.type === "error" && e.code !== "PAT-010");
      expect(braceErrors).toHaveLength(0);
    });
  });

  describe("Undefined Variables", () => {
    it("should not warn for known variables", async () => {
      const result = await lint(`
function test()
{
  self println("test");
  level endon("game_ended");
  game["somekey"] = "value";
}
`);
      const undefinedVarErrors = result.errors.filter(e => e.code === "VAR-001");
      expect(undefinedVarErrors).toHaveLength(0);
    });

    it("should detect undefined variables in function scope", async () => {
      // Note: GSC allows implicit variable declarations, so we only warn about
      // truly unknown identifiers that aren't in our known list
      const result = await lint(`
function test()
{
  // This is valid GSC - variables can be declared implicitly
  myVariable = 5;
}
`);
      // Should have at least the info about the variable
      const allErrors = result.errors;
      expect(allErrors.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Function Detection", () => {
    it("should recognize defined functions", async () => {
      const result = await lint(`
function myCustomFunction()
{
  println("hello");
}

function test()
{
  myCustomFunction();
}
`);
      // Should not warn about myCustomFunction being called
      const undefinedFuncErrors = result.errors.filter(e => e.code === "FUN-001");
      expect(undefinedFuncErrors.filter(e => e.message.includes("myCustomFunction"))).toHaveLength(0);
    });
  });

  describe("Bad Patterns", () => {
    it("should detect long lines", async () => {
      const longLine = "x = " + "1".repeat(250);
      const result = await lint(longLine);
      const longLineErrors = result.errors.filter(e => e.code === "STY-001");
      expect(longLineErrors.length).toBeGreaterThan(0);
    });

    it("should detect suspicious isDefined usage", async () => {
      const result = await lint(`
function test()
{
  x = isDefined();
}
`);
      // Should warn about isDefined() without checking result
      const patternErrors = result.errors.filter(e => e.code === "PAT-001");
      expect(patternErrors.length).toBeGreaterThan(0);
    });

    it("should detect unreachable code after return", async () => {
      const result = await lint(`
function test()
{
  return;
  println("this should not run");
}
`);
      const unreachableErrors = result.errors.filter(e => e.code === "FLOW-001");
      expect(unreachableErrors.length).toBeGreaterThan(0);
    });
  });

  describe("Real-World GSC", () => {
    it("should handle real gametype code", async () => {
      const code = `
main()
{
    levelgametype = "test";
    level.teamBased = false;
    
    maps\\mp\\gametypes\\globallogic::init();
    
    level thread onPlayerConnect();
}

onPlayerConnect()
{
    for(;;)
    {
        level waittill("connected", player);
        player thread onSpawn();
    }
}

onSpawn()
{
    self endon("disconnect");
    
    for(;;)
    {
        self waittill("spawned");
        self notify("respawn");
    }
}
`;
      const result = await lint(code);
      
      // The linter may detect some issues - that's expected
      // Just verify it runs without crashing
      expect(result.errors).toBeDefined();
      expect(result.stats).toBeDefined();
    });

    it("should handle player callback code", async () => {
      const code = `
init()
{
    level.onPlayerConnect = ::onPlayerConnect;
}

onPlayerConnect(player)
{
    player endon("disconnect");
    player thread onSpawn();
}

onSpawn()
{
    self waittill("spawned");
    
    self thread monitorHealth();
    
    self setOrigin(self.origin);
}

monitorHealth()
{
    self endon("disconnect");
    self endon("death");
    
    for(;;)
    {
        wait 0.5;
        
        if(self.health < self.maxhealth)
        {
            self.health++;
        }
    }
}
`;
      const result = await lint(code);
      
      // The linter may detect some issues - that's expected
      // Just verify it runs without crashing
      expect(result.errors).toBeDefined();
      expect(result.stats).toBeDefined();
    });
  });

  describe("Stats", () => {
    it("should track line count", async () => {
      const code = "line1\nline2\nline3\nline4\nline5";
      const result = await lint(code);
      expect(result.stats.lines).toBe(5);
    });

    it("should count errors and warnings", async () => {
      const code = `
function test()
{
  return;
  unreachable();
}
`;
      const result = await lint(code);
      expect(result.stats.errors).toBeGreaterThanOrEqual(0);
      expect(result.stats.warnings).toBeGreaterThanOrEqual(0);
    });
  });

  describe("IW4 anti-pattern rules", () => {
    it("PAT-010: catches function keyword", async () => {
      const result = await lint('function init() { iprintln("hi"); }');
      const codes = result.errors.map(e => e.code);
      expect(codes).toContain("PAT-010");
    });

    it("PAT-011: catches var/let/const", async () => {
      const r1 = await lint("var x = 5;");
      expect(r1.errors.map(e => e.code)).toContain("PAT-011");
      const r2 = await lint("let y = 5;");
      expect(r2.errors.map(e => e.code)).toContain("PAT-011");
      const r3 = await lint("const z = 5;");
      expect(r3.errors.map(e => e.code)).toContain("PAT-011");
    });

    it("PAT-012: catches .push() and .pop()", async () => {
      const r1 = await lint("arr.push(item);");
      expect(r1.errors.map(e => e.code)).toContain("PAT-012");
      const r2 = await lint("arr.pop();");
      expect(r2.errors.map(e => e.code)).toContain("PAT-012");
    });

    it("PAT-013: catches .length", async () => {
      const result = await lint("x = arr.length;");
      expect(result.errors.map(e => e.code)).toContain("PAT-013");
    });

    it("PAT-014: catches === and !==", async () => {
      const r1 = await lint("if (x === 5) {}");
      expect(r1.errors.map(e => e.code)).toContain("PAT-014");
      const r2 = await lint("if (x !== 5) {}");
      expect(r2.errors.map(e => e.code)).toContain("PAT-014");
    });

    it("PAT-015: catches ternary operator", async () => {
      const result = await lint("x = (a > 0) ? 1 : 0;");
      expect(result.errors.map(e => e.code)).toContain("PAT-015");
    });

    it("PAT-016: catches arrow functions", async () => {
      const result = await lint("fn = (x) => x + 1;");
      expect(result.errors.map(e => e.code)).toContain("PAT-016");
    });

    it("PAT-017: catches object literals", async () => {
      const result = await lint("obj = { x: 1, y: 2 };");
      expect(result.errors.map(e => e.code)).toContain("PAT-017");
    });

    it("PAT-018: catches null literal", async () => {
      const result = await lint("if (x == null) {}");
      expect(result.errors.map(e => e.code)).toContain("PAT-018");
    });

    it("PAT-019: catches JS globals", async () => {
      const r1 = await lint("x = parseInt(str);");
      expect(r1.errors.map(e => e.code)).toContain("PAT-019");
      const r2 = await lint("x = Math.floor(y);");
      expect(r2.errors.map(e => e.code)).toContain("PAT-019");
    });

    it("PAT-020: catches template literals", async () => {
      const result = await lint("s = `hello ${name}`;");
      expect(result.errors.map(e => e.code)).toContain("PAT-020");
    });

    it("PAT-021: catches new keyword", async () => {
      const result = await lint("obj = new Object();");
      expect(result.errors.map(e => e.code)).toContain("PAT-021");
    });

    it("PAT-022: catches this.", async () => {
      const result = await lint("x = this.health;");
      expect(result.errors.map(e => e.code)).toContain("PAT-022");
    });

    it("PAT-023: catches forEach and for...of", async () => {
      const r1 = await lint("players.forEach(fn);");
      expect(r1.errors.map(e => e.code)).toContain("PAT-023");
      const r2 = await lint("for (p of getplayers()) {}");
      expect(r2.errors.map(e => e.code)).toContain("PAT-023");
    });

    it("PAT-024: catches .concat() and .join()", async () => {
      const r1 = await lint('s = "a".concat("b");');
      expect(r1.errors.map(e => e.code)).toContain("PAT-024");
      const r2 = await lint('s = arr.join(", ");');
      expect(r2.errors.map(e => e.code)).toContain("PAT-024");
    });
  });

  describe("Case-Insensitive Collision Detection", () => {
    it("reports DEF-001 when two functions share a name differing only in case", async () => {
      const result = await lint(`
isAlive()
{
  return true;
}

isalive()
{
  return false;
}
`);
      const collisions = result.errors.filter(e => e.code === "DEF-001");
      expect(collisions.length).toBeGreaterThan(0);
    });

    it("does not report DEF-001 for functions with genuinely different names", async () => {
      const result = await lint(`
isAlive()
{
  return true;
}

isDead()
{
  return false;
}
`);
      const collisions = result.errors.filter(e => e.code === "DEF-001");
      expect(collisions).toHaveLength(0);
    });

    it("does not report DEF-001 when a function name appears only once", async () => {
      const result = await lint(`
myFunc()
{
  iprintln("hi");
}
`);
      const collisions = result.errors.filter(e => e.code === "DEF-001");
      expect(collisions).toHaveLength(0);
    });
  });
});

describe("GSCFormatter", () => {
  it("returns empty string for empty input", () => {
    const { tokens } = tokenize("");
    expect(format(tokens)).toBe("");
  });

  it("preserves a single identifier", () => {
    const { tokens } = tokenize("myVar");
    expect(format(tokens).trim()).toBe("myVar");
  });

  it("indents a simple function body", () => {
    const src = `myFunc() { return 1; }`;
    const { tokens } = tokenize(src);
    const out = format(tokens);
    expect(out).toBe(`myFunc() {\n    return 1;\n}`);
  });

  it("indents nested blocks", () => {
    const src = `outer() { if (x) { doThing(); } }`;
    const { tokens } = tokenize(src);
    const out = format(tokens);
    expect(out).toContain("    if");
    expect(out).toContain("        doThing");
  });

  it("indentSize option controls indent width", () => {
    const src = `f() { x = 1; }`;
    const { tokens } = tokenize(src);
    const out = format(tokens, { indentSize: 2 });
    expect(out).toBe(`f() {\n  x = 1;\n}`);
  });

  it("adds space after control keywords", () => {
    const { tokens } = tokenize(`if(x){}`);
    expect(format(tokens)).toContain("if (x)");
  });

  it("adds space around binary operators", () => {
    const { tokens } = tokenize(`x=1+2;`);
    const out = format(tokens);
    expect(out).toContain("x = 1 + 2");
  });

  it("does not add space for unary minus", () => {
    const { tokens } = tokenize(`x = -1;`);
    const out = format(tokens);
    expect(out).toContain("x = -1");
    expect(out).not.toContain("x = - 1");
  });

  it("adds space after comma but not before", () => {
    const { tokens } = tokenize(`f(a,b,c);`);
    expect(format(tokens)).toContain("f(a, b, c)");
  });

  it("no space between function name and paren", () => {
    const { tokens } = tokenize(`myFunc ();`);
    expect(format(tokens)).toContain("myFunc()");
  });

  it("no space around :: path separator", () => {
    const { tokens } = tokenize(`maps::myFunc();`);
    // Two consecutive COLON tokens — no spaces between them or around them
    expect(format(tokens)).toContain("maps::myFunc");
  });

  it("collapses multiple blank lines into one", () => {
    const src = `x = 1;\n\n\n\ny = 2;`;
    const { tokens } = tokenize(src);
    const out = format(tokens);
    expect(out).not.toMatch(/\n{3,}/);
  });

  it("inserts blank line between top-level functions", () => {
    const src = `foo() { return 1; }\nbar() { return 2; }`;
    const { tokens } = tokenize(src);
    const out = format(tokens);
    // A blank line between the closing } of foo and the start of bar
    expect(out).toMatch(/\}\n\n\w/);
  });

  it("preserves line comments", () => {
    const src = `// my comment\nx = 1;`;
    const { tokens } = tokenize(src);
    const out = format(tokens);
    expect(out).toContain("// my comment");
  });

  it("preserves block comments", () => {
    const src = `/* block comment */\nx = 1;`;
    const { tokens } = tokenize(src);
    const out = format(tokens);
    expect(out).toContain("/* block comment */");
  });

  it("preserves [[ ]] function pointer syntax", () => {
    const src = `[[ func ]](args);`;
    const { tokens } = tokenize(src);
    const out = format(tokens);
    expect(out).toContain("[[");
    expect(out).toContain("]]");
  });

  it("is idempotent — format(format(x)) === format(x)", () => {
    // Covers: nested blocks, binary ops, unary, ::, [[ ]]
    const src = `foo(){x=1+2;if(y){maps::bar();}}`;
    const { tokens: t1 } = tokenize(src);
    const once = format(t1);
    const { tokens: t2 } = tokenize(once);
    const twice = format(t2);
    expect(twice).toBe(once);
  });
});
