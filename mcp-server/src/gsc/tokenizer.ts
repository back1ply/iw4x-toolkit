/**
 * @file gsc/tokenizer.ts
 * GSC (Game Script) Tokenizer/Lexer
 * 
 * Adapted from Muhlex/vscode-gsc (MIT licensed)
 * https://github.com/Muhlex/vscode-gsc
 * 
 * Tokenizes GSC source code for linting and analysis.
 */

export enum TokenType {
  // Single-character tokens
  LEFT_BRACE = "LEFT_BRACE",     // {
  RIGHT_BRACE = "RIGHT_BRACE",   // }
  LEFT_PAREN = "LEFT_PAREN",     // (
  RIGHT_PAREN = "RIGHT_PAREN",   // )
  LEFT_BRACKET = "LEFT_BRACKET", // [
  RIGHT_BRACKET = "RIGHT_BRACKET", // ]
  COMMA = "COMMA",               // ,
  DOT = "DOT",                  // .
  SEMICOLON = "SEMICOLON",       // ;
  COLON = "COLON",              // :
  QUESTION = "QUESTION",        // ?
  AT = "AT",                    // @

  // Operators
  PLUS = "PLUS",                // +
  MINUS = "MINUS",              // -
  STAR = "STAR",                // *
  SLASH = "SLASH",              // /
  PERCENT = "PERCENT",          // %
  EQUAL = "EQUAL",              // =
  BANG = "BANG",                // !
  LESS = "LESS",                // <
  GREATER = "GREATER",          // >
  TILDE = "TILDE",              // ~
  AMPERSAND = "AMPERSAND",      // &
  PIPE = "PIPE",                // |
  CARET = "CARET",              // ^

  // Compound operators
  PLUS_EQUAL = "PLUS_EQUAL",   // +=
  MINUS_EQUAL = "MINUS_EQUAL",  // -=
  STAR_EQUAL = "STAR_EQUAL",    // *=
  SLASH_EQUAL = "SLASH_EQUAL",  // /=
  EQUAL_EQUAL = "EQUAL_EQUAL",  // ==
  BANG_EQUAL = "BANG_EQUAL",    // !=
  LESS_EQUAL = "LESS_EQUAL",    // <=
  GREATER_EQUAL = "GREATER_EQUAL", // >=
  AMPERSAND_AMPERSAND = "AMPERSAND_AMPERSAND", // &&
  PIPE_PIPE = "PIPE_PIPE",      // ||
  PLUS_PLUS = "PLUS_PLUS",       // ++
  MINUS_MINUS = "MINUS_MINUS",  // --

  // Literals
  IDENTIFIER = "IDENTIFIER",
  STRING = "STRING",
  NUMBER = "NUMBER",

  // Preprocessor
  HASH = "HASH",                // #

  // Keywords
  KEYWORD = "KEYWORD",

  // Special
  NEWLINE = "NEWLINE",
  COMMENT = "COMMENT",
  BLOCK_COMMENT = "BLOCK_COMMENT",
  EOF = "EOF",
  ERROR = "ERROR",
}

// GSC Keywords
export const GSC_KEYWORDS = new Set([
  "if", "else", "elseif", "for", "foreach", "while", "do",
  "switch", "case", "default", "break", "continue", "return",
  "wait", "waittill", "waittillmatch", "waittillframeend",
  "notify", "endon", "thread", "call", "spawn",
  "true", "false", "undefined", "isdefined", "isstring",
  "self", "level", "game", "super",
  "struct", "class", "enum", "const", "var", "using",
  "function", "funcdef", "code", "parsetime",
  // GSC-specific
  "player", "weapons", "maps", "scripts",
  // Common built-in functions (as keywords for now)
  "println", "print", "iprintln", "iprintlnbold",
  "getcvar", "setcvar", "getdvar", "setdvar",
  "getent", "getarray", "alloc",
]);

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  length: number;
  /** Exact source text of the token (quotes/escapes for strings, whole line for `#` directives). */
  raw: string;
}

export interface TokenizeResult {
  tokens: Token[];
  errors: TokenizeError[];
}

export interface TokenizeError {
  message: string;
  line: number;
  column: number;
  code?: string; // Error code for categorization
  suggestion?: string; // Fix suggestion
}

// Extended error codes for syntax errors
export const SyntaxErrorCode = {
  UNTERMINATED_STRING: "TOK-001",
  UNMATCHED_BRACKET: "TOK-002",
  UNMATCHED_PAREN: "TOK-003",
  UNMATCHED_BRACE: "TOK-004",
  INVALID_IDENTIFIER: "TOK-005",
  MALFORMED_PREPROCESSOR: "TOK-006",
  INVALID_CHARACTER: "TOK-007",
  UNTERMINATED_COMMENT: "TOK-008",
} as const;

// Opening brackets -> token type (also pushed onto the matching stack).
const OPENERS: Record<string, TokenType> = {
  "{": TokenType.LEFT_BRACE,
  "(": TokenType.LEFT_PAREN,
  "[": TokenType.LEFT_BRACKET,
};

// Closing brackets -> token type plus the data needed to report an unmatched close.
const CLOSERS: Record<string, { type: TokenType; open: string; code: string; suggestion: string }> = {
  "}": { type: TokenType.RIGHT_BRACE, open: "{", code: SyntaxErrorCode.UNMATCHED_BRACE, suggestion: "Remove this closing brace or check for extra braces" },
  ")": { type: TokenType.RIGHT_PAREN, open: "(", code: SyntaxErrorCode.UNMATCHED_PAREN, suggestion: "Remove this closing parenthesis or check for extra parentheses" },
  "]": { type: TokenType.RIGHT_BRACKET, open: "[", code: SyntaxErrorCode.UNMATCHED_BRACKET, suggestion: "Remove this closing bracket or check for extra brackets" },
};

// Single-character punctuation with no bracket tracking or compound form.
const SIMPLE_PUNCTUATION: Record<string, TokenType> = {
  ",": TokenType.COMMA,
  ".": TokenType.DOT,
  ";": TokenType.SEMICOLON,
  ":": TokenType.COLON,
  "?": TokenType.QUESTION,
  "~": TokenType.TILDE,
  "^": TokenType.CARET,
  "@": TokenType.AT,
};

// Two-character operators, keyed by the literal pair.
const TWO_CHAR_OPERATORS: Record<string, TokenType> = {
  "==": TokenType.EQUAL_EQUAL,
  "!=": TokenType.BANG_EQUAL,
  "<=": TokenType.LESS_EQUAL,
  ">=": TokenType.GREATER_EQUAL,
  "&&": TokenType.AMPERSAND_AMPERSAND,
  "||": TokenType.PIPE_PIPE,
  "++": TokenType.PLUS_PLUS,
  "--": TokenType.MINUS_MINUS,
  "+=": TokenType.PLUS_EQUAL,
  "-=": TokenType.MINUS_EQUAL,
  "*=": TokenType.STAR_EQUAL,
  "/=": TokenType.SLASH_EQUAL,
};

// Characters skipped between tokens (newlines + whitespace).
const SKIPPABLE = new Set(["\n", "\r", " ", "\t"]);

// Single-character operators.
const SINGLE_CHAR_OPERATORS: Record<string, TokenType> = {
  "=": TokenType.EQUAL,
  "!": TokenType.BANG,
  "<": TokenType.LESS,
  ">": TokenType.GREATER,
  "+": TokenType.PLUS,
  "-": TokenType.MINUS,
  "*": TokenType.STAR,
  "%": TokenType.PERCENT,
  "&": TokenType.AMPERSAND,
  "|": TokenType.PIPE,
};

export class GSCTokenizer {
  private source: string = "";
  private start: number = 0;
  private current: number = 0;
  private line: number = 1;
  private column: number = 0;
  private tokens: Token[] = [];
  private errors: TokenizeError[] = [];
  
  // Bracket tracking for validation
  private bracketStack: { type: TokenType; line: number; column: number }[] = [];
  private parenStack: { type: TokenType; line: number; column: number }[] = [];
  private braceStack: { type: TokenType; line: number; column: number }[] = [];

  /**
   * Tokenize GSC source code
   */
  tokenize(source: string): TokenizeResult {
    this.source = source;
    this.start = 0;
    this.current = 0;
    this.line = 1;
    this.column = 0;
    this.tokens = [];
    this.errors = [];
    
    // Initialize bracket tracking stacks
    this.bracketStack = [];
    this.parenStack = [];
    this.braceStack = [];

    while (!this.isAtEnd()) {
      this.start = this.current;
      try {
        this.scanToken();
      } catch (e) {
        this.errors.push({
          message: e instanceof Error ? e.message : "Unknown error",
          line: this.line,
          column: this.column,
          code: SyntaxErrorCode.INVALID_CHARACTER,
          suggestion: "Check for invalid characters in your code",
        });
        this.advance();
      }
    }

    this.tokens.push({
      type: TokenType.EOF,
      value: "",
      line: this.line,
      column: this.column,
      length: 0,
      raw: "",
    });

    // Note: unmatched closing brackets are reported during scanning. Unmatched
    // *opening* brackets are intentionally not reported here — the code may be
    // incomplete and the linter handles deeper validation.
    return { tokens: this.tokens, errors: this.errors };
  }

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private advance(): string {
    const char = this.source[this.current];
    this.current++;
    if (char === "\n") {
      this.line++;
      this.column = 0;
    } else {
      this.column++;
    }
    return char;
  }

  private peek(): string {
    if (this.isAtEnd()) return "\0";
    return this.source[this.current];
  }

  private peekNext(): string {
    if (this.current + 1 >= this.source.length) return "\0";
    return this.source[this.current + 1];
  }

  private addToken(type: TokenType, value?: string): void {
    const raw = this.source.substring(this.start, this.current);
    this.tokens.push({
      type,
      value: value ?? raw,
      line: this.line,
      column: this.column - (this.current - this.start),
      length: this.current - this.start,
      raw,
    });
  }

  private scanToken(): void {
    const c = this.advance();

    if (SKIPPABLE.has(c)) return; // newline / whitespace
    if (c === "/") { this.scanSlash(); return; }
    if (c === '"' || c === "'") { this.scanString(c); return; }
    if (this.isDigit(c)) { this.scanNumber(); return; }
    if (this.isAlpha(c)) { this.scanIdentifier(); return; }
    if (c === "#") { this.scanPreprocessor(); return; }
    if (this.scanPunctuation(c)) return;
    this.scanOperator(c);
  }

  /** Handle `/` — line comment, block comment, `/=`, or bare `/`. */
  private scanSlash(): void {
    if (this.peek() === "/") { this.scanLineComment(); return; }
    if (this.peek() === "*") { this.scanBlockComment(); return; }
    if (this.peek() === "=") { this.advance(); this.addToken(TokenType.SLASH_EQUAL); return; }
    this.addToken(TokenType.SLASH);
  }

  private scanLineComment(): void {
    while (this.peek() !== "\n" && !this.isAtEnd()) this.advance();
    this.pushSpan(TokenType.COMMENT, this.source.substring(this.start + 2, this.current));
  }

  private scanBlockComment(): void {
    this.advance(); // consume the '*'
    let foundEnd = false;
    while (!this.isAtEnd()) {
      if (this.peek() === "*" && this.peekNext() === "/") {
        this.advance();
        this.advance();
        foundEnd = true;
        break;
      }
      this.advance();
    }
    if (!foundEnd) {
      this.errors.push({
        message: "Unterminated block comment - missing '*/'",
        line: this.line,
        column: this.column - (this.current - this.start),
        code: SyntaxErrorCode.UNTERMINATED_COMMENT,
        suggestion: "Add '*/' to close the block comment",
      });
    }
    this.pushSpan(TokenType.BLOCK_COMMENT, this.source.substring(this.start + 2, this.current - 2));
  }

  /** Push a token spanning start..current with an explicit value. */
  private pushSpan(type: TokenType, value: string): void {
    this.addToken(type, value);
  }

  /** Handle punctuation (brackets + simple single-char tokens). Returns false if `c` isn't punctuation. */
  private scanPunctuation(c: string): boolean {
    if (OPENERS[c]) { this.openBracket(c); return true; }
    if (CLOSERS[c]) { this.closeBracket(c); return true; }
    const simple = SIMPLE_PUNCTUATION[c];
    if (simple) { this.addToken(simple); return true; }
    return false;
  }

  private stackFor(c: string): { type: TokenType; line: number; column: number }[] {
    if (c === "{" || c === "}") return this.braceStack;
    if (c === "(" || c === ")") return this.parenStack;
    return this.bracketStack;
  }

  private openBracket(c: string): void {
    const type = OPENERS[c];
    this.addToken(type);
    this.stackFor(c).push({ type, line: this.line, column: this.column - 1 });
  }

  private closeBracket(c: string): void {
    const info = CLOSERS[c];
    this.addToken(info.type);
    const stack = this.stackFor(c);
    if (stack.length > 0) {
      stack.pop();
      return;
    }
    this.errors.push({
      message: `Unexpected '${c}' - no matching '${info.open}'`,
      line: this.line,
      column: this.column - 1,
      code: info.code,
      suggestion: info.suggestion,
    });
  }

  /** Handle operators (compound first, then single), or report an invalid character. */
  private scanOperator(c: string): void {
    if (!this.isAtEnd()) {
      const twoChar = TWO_CHAR_OPERATORS[c + this.peek()];
      if (twoChar) {
        this.advance();
        this.addToken(twoChar);
        return;
      }
    }
    const single = SINGLE_CHAR_OPERATORS[c];
    if (single) {
      this.addToken(single);
      return;
    }
    if (c !== "\0") {
      this.errors.push({
        message: `Invalid character: '${c}'`,
        line: this.line,
        column: this.column - 1,
        code: SyntaxErrorCode.INVALID_CHARACTER,
        suggestion: "Remove or replace this character",
      });
    }
  }

  private scanString(quote: string): void {
    let value = "";
    while (this.peek() !== quote && !this.isAtEnd()) {
      if (this.peek() === "\\") {
        value += this.scanEscape(quote);
        continue;
      }
      value += this.advance(); // newlines included verbatim
    }

    if (this.isAtEnd()) {
      this.errors.push({
        message: `Unterminated string - missing closing '${quote}'`,
        line: this.line,
        column: this.column,
        code: SyntaxErrorCode.UNTERMINATED_STRING,
        suggestion: `Add closing '${quote}' to complete the string`,
      });
      this.addToken(TokenType.STRING, value);
      return;
    }

    this.advance();
    this.addToken(TokenType.STRING, value);
  }

  /** Consume a `\x` escape (backslash already at peek) and return the decoded text. */
  private scanEscape(quote: string): string {
    this.advance(); // consume backslash
    const escaped = this.peek();
    this.advance(); // consume escaped char
    switch (escaped) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "\\": return "\\";
      case quote: return quote;
      default: return escaped;
    }
  }

  private consumeWhile(pred: (c: string) => boolean): void {
    while (pred(this.peek())) this.advance();
  }

  private scanNumber(): void {
    this.consumeWhile(this.isDigit);
    if (this.peek() === "." && this.isDigit(this.peekNext())) {
      this.advance();
      this.consumeWhile(this.isDigit);
    }
    if (this.peek() === "x" || this.peek() === "X") {
      this.advance();
      this.consumeWhile(this.isHexDigit);
    }
    this.addToken(TokenType.NUMBER);
  }

  private scanIdentifier(): void {
    while (this.isAlphaNumeric(this.peek()) || this.peek() === "\\") {
      this.advance();
    }

    const text = this.source.substring(this.start, this.current);

    // Skip identifier validation - let the linter handle semantic analysis
    // The tokenizer should just tokenize, not validate identifier rules

    const type = GSC_KEYWORDS.has(text) ? TokenType.KEYWORD : TokenType.IDENTIFIER;
    this.addToken(type, text);
  }

  private scanPreprocessor(): void {
    while (this.isAlpha(this.peek()) && !this.isAtEnd()) {
      this.advance();
    }

    const directive = this.source.substring(this.start + 1, this.current);

    // Note: We don't validate preprocessor directives here because:
    // 1. There are many valid directives in GSC
    // 2. Some mods use custom directives
    // 3. The linter should handle directive validation if needed

    while (this.peek() !== "\n" && !this.isAtEnd()) {
      this.advance();
    }

    this.addToken(TokenType.HASH, directive);
  }

  private isDigit(c: string): boolean {
    return c >= "0" && c <= "9";
  }

  private isHexDigit(c: string): boolean {
    return (c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
  }

  private isAlpha(c: string): boolean {
    return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_" || c === "$";
  }

  private isAlphaNumeric(c: string): boolean {
    return this.isAlpha(c) || this.isDigit(c);
  }
}

export function tokenize(source: string): TokenizeResult {
  const tokenizer = new GSCTokenizer();
  return tokenizer.tokenize(source);
}
