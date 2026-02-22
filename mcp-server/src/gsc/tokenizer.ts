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
}

export interface TokenizeResult {
  tokens: Token[];
  errors: TokenizeError[];
}

export interface TokenizeError {
  message: string;
  line: number;
  column: number;
}

export class GSCTokenizer {
  private source: string = "";
  private start: number = 0;
  private current: number = 0;
  private line: number = 1;
  private column: number = 0;
  private tokens: Token[] = [];
  private errors: TokenizeError[] = [];

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

    while (!this.isAtEnd()) {
      this.start = this.current;
      try {
        this.scanToken();
      } catch (e) {
        this.errors.push({
          message: e instanceof Error ? e.message : "Unknown error",
          line: this.line,
          column: this.column,
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
    });

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
    if (value === undefined) {
      value = this.source.substring(this.start, this.current);
    }
    this.tokens.push({
      type,
      value,
      line: this.line,
      column: this.column - (this.current - this.start),
      length: this.current - this.start,
    });
  }

  private scanToken(): void {
    const c = this.advance();

    // Handle newlines
    if (c === "\n" || c === "\r") {
      return; // Skip newlines but track line number
    }

    // Whitespace (skip)
    if (c === " " || c === "\t" || c === "\r") {
      return;
    }

    // Comments
    if (c === "/") {
      if (this.peek() === "/") {
        // Line comment
        while (this.peek() !== "\n" && !this.isAtEnd()) {
          this.advance();
        }
        const value = this.source.substring(this.start + 2, this.current);
        this.tokens.push({
          type: TokenType.COMMENT,
          value,
          line: this.line,
          column: this.column - (this.current - this.start),
          length: this.current - this.start,
        });
        return;
      }
      if (this.peek() === "*") {
        // Block comment
        this.advance(); // consume *
        while (!this.isAtEnd()) {
          if (this.peek() === "*" && this.peekNext() === "/") {
            this.advance(); // consume *
            this.advance(); // consume /
            break;
          }
          this.advance();
        }
        const value = this.source.substring(this.start + 2, this.current - 2);
        this.tokens.push({
          type: TokenType.BLOCK_COMMENT,
          value,
          line: this.line,
          column: this.column - (this.current - this.start),
          length: this.current - this.start,
        });
        return;
      }
      // Division operator
      if (this.peek() === "=") {
        this.advance();
        this.addToken(TokenType.SLASH_EQUAL);
        return;
      }
      this.addToken(TokenType.SLASH);
      return;
    }

    // Strings
    if (c === '"' || c === "'") {
      this.scanString(c);
      return;
    }

    // Numbers
    if (this.isDigit(c)) {
      this.scanNumber();
      return;
    }

    // Identifiers and keywords
    if (this.isAlpha(c)) {
      this.scanIdentifier();
      return;
    }

    // Preprocessor
    if (c === "#") {
      this.scanPreprocessor();
      return;
    }

    // Single-character tokens
    switch (c) {
      case "{": this.addToken(TokenType.LEFT_BRACE); break;
      case "}": this.addToken(TokenType.RIGHT_BRACE); break;
      case "(": this.addToken(TokenType.LEFT_PAREN); break;
      case ")": this.addToken(TokenType.RIGHT_PAREN); break;
      case "[": this.addToken(TokenType.LEFT_BRACKET); break;
      case "]": this.addToken(TokenType.RIGHT_BRACKET); break;
      case ",": this.addToken(TokenType.COMMA); break;
      case ".": this.addToken(TokenType.DOT); break;
      case ";": this.addToken(TokenType.SEMICOLON); break;
      case ":": this.addToken(TokenType.COLON); break;
      case "?": this.addToken(TokenType.QUESTION); break;
      case "~": this.addToken(TokenType.TILDE); break;
      case "^": this.addToken(TokenType.CARET); break;
      case "@": this.addToken(TokenType.AT); break;
      default:
        // Operator handling continues below
        break;
    }

    // Two-character operators
    if (!this.isAtEnd()) {
      const second = this.peek();
      const combined = c + second;

      switch (combined) {
        case "==": this.advance(); this.addToken(TokenType.EQUAL_EQUAL); break;
        case "!=": this.advance(); this.addToken(TokenType.BANG_EQUAL); break;
        case "<=": this.advance(); this.addToken(TokenType.LESS_EQUAL); break;
        case ">=": this.advance(); this.addToken(TokenType.GREATER_EQUAL); break;
        case "&&": this.advance(); this.addToken(TokenType.AMPERSAND_AMPERSAND); break;
        case "||": this.advance(); this.addToken(TokenType.PIPE_PIPE); break;
        case "++": this.advance(); this.addToken(TokenType.PLUS_PLUS); break;
        case "--": this.advance(); this.addToken(TokenType.MINUS_MINUS); break;
        case "+=": this.advance(); this.addToken(TokenType.PLUS_EQUAL); break;
        case "-=": this.advance(); this.addToken(TokenType.MINUS_EQUAL); break;
        case "*=": this.advance(); this.addToken(TokenType.STAR_EQUAL); break;
        case "/=": this.advance(); this.addToken(TokenType.SLASH_EQUAL); break;
        default:
          // Single-character operators
          switch (c) {
            case "=": this.addToken(TokenType.EQUAL); break;
            case "!": this.addToken(TokenType.BANG); break;
            case "<": this.addToken(TokenType.LESS); break;
            case ">": this.addToken(TokenType.GREATER); break;
            case "+": this.addToken(TokenType.PLUS); break;
            case "-": this.addToken(TokenType.MINUS); break;
            case "*": this.addToken(TokenType.STAR); break;
            case "%": this.addToken(TokenType.PERCENT); break;
            case "&": this.addToken(TokenType.AMPERSAND); break;
            case "|": this.addToken(TokenType.PIPE); break;
          }
      }
    }
  }

  private scanString(quote: string): void {
    let value = "";
    while (this.peek() !== quote && !this.isAtEnd()) {
      if (this.peek() === "\n") {
        // Multiline strings are allowed in GSC
        value += "\n";
        this.advance();
        continue;
      }
      // Escape sequences
      if (this.peek() === "\\" && !this.isAtEnd()) {
        this.advance(); // consume backslash
        const escaped = this.peek();
        switch (escaped) {
          case "n": value += "\n"; break;
          case "t": value += "\t"; break;
          case "r": value += "\r"; break;
          case "\\": value += "\\"; break;
          case quote: value += quote; break;
          default: value += escaped;
        }
        this.advance();
        continue;
      }
      value += this.advance();
    }

    if (this.isAtEnd()) {
      this.errors.push({
        message: `Unterminated string`,
        line: this.line,
        column: this.column,
      });
      this.addToken(TokenType.STRING, value);
      return;
    }

    this.advance(); // closing quote
    this.addToken(TokenType.STRING, value);
  }

  private scanNumber(): void {
    while (this.isDigit(this.peek())) {
      this.advance();
    }

    // Look for a fractional part
    if (this.peek() === "." && this.isDigit(this.peekNext())) {
      this.advance(); // consume the "."
      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    // Look for hexadecimal
    if (this.peek() === "x" || this.peek() === "X") {
      this.advance();
      while (this.isHexDigit(this.peek())) {
        this.advance();
      }
    }

    this.addToken(TokenType.NUMBER);
  }

  private scanIdentifier(): void {
    while (this.isAlphaNumeric(this.peek())) {
      this.advance();
    }

    const text = this.source.substring(this.start, this.current);

    // Check if it's a keyword
    const type = GSC_KEYWORDS.has(text) ? TokenType.KEYWORD : TokenType.IDENTIFIER;
    this.addToken(type, text);
  }

  private scanPreprocessor(): void {
    // Read the preprocessor directive
    while (this.isAlpha(this.peek()) && !this.isAtEnd()) {
      this.advance();
    }

    // Get the directive (without the #)
    const directive = this.source.substring(this.start + 1, this.current);

    // Read the rest of the line as the argument
    let argument = "";
    while (this.peek() !== "\n" && !this.isAtEnd()) {
      argument += this.advance();
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

/**
 * Convenience function to tokenize GSC source
 */
export function tokenize(source: string): TokenizeResult {
  const tokenizer = new GSCTokenizer();
  return tokenizer.tokenize(source);
}
