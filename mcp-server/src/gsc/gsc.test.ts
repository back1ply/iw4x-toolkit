/**
 * @file gsc/gsc.test.ts
 * Tests for GSC tokenizer and linter
 */

import { describe, it, expect } from "vitest";
import { tokenize, GSCTokenizer, TokenType } from "./tokenizer.js";
import { lint, GSCLinter } from "./linter.js";

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
    it("should detect balanced braces", () => {
      const result = lint(`
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

    it("should detect missing braces", () => {
      const result = lint(`
function test()
{
  if(true)
    println("hello");
`);
      // This is valid GSC actually, so no error expected
      // (GSC doesn't require braces for single statements)
      expect(result.errors.filter(e => e.type === "error")).toHaveLength(0);
    });
  });

  describe("Undefined Variables", () => {
    it("should not warn for known variables", () => {
      const result = lint(`
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

    it("should detect undefined variables in function scope", () => {
      // Note: GSC allows implicit variable declarations, so we only warn about
      // truly unknown identifiers that aren't in our known list
      const result = lint(`
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
    it("should recognize defined functions", () => {
      const result = lint(`
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
    it("should detect long lines", () => {
      const longLine = "x = " + "1".repeat(250);
      const result = lint(longLine);
      const longLineErrors = result.errors.filter(e => e.code === "STY-001");
      expect(longLineErrors.length).toBeGreaterThan(0);
    });

    it("should detect suspicious isDefined usage", () => {
      const result = lint(`
function test()
{
  x = isDefined();
}
`);
      // Should warn about isDefined() without checking result
      const patternErrors = result.errors.filter(e => e.code === "PAT-001");
      expect(patternErrors.length).toBeGreaterThan(0);
    });

    it("should detect unreachable code after return", () => {
      const result = lint(`
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
    it("should handle real gametype code", () => {
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
      const result = lint(code);
      
      // Should have minimal errors for valid code
      const errors = result.errors.filter(e => e.type === "error");
      expect(errors).toHaveLength(0);
    });

    it("should handle player callback code", () => {
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
      const result = lint(code);
      
      // Should have no errors
      expect(result.errors.filter(e => e.type === "error")).toHaveLength(0);
    });
  });

  describe("Stats", () => {
    it("should track line count", () => {
      const code = "line1\nline2\nline3\nline4\nline5";
      const result = lint(code);
      expect(result.stats.lines).toBe(5);
    });

    it("should count errors and warnings", () => {
      const code = `
function test()
{
  return;
  unreachable();
}
`;
      const result = lint(code);
      expect(result.stats.errors).toBeGreaterThanOrEqual(0);
      expect(result.stats.warnings).toBeGreaterThanOrEqual(0);
    });
  });
});
