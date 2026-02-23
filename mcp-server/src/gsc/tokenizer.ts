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
    });

    // Validate bracket matching at the end
    this.validateBrackets();
    
    return { tokens: this.tokens, errors: this.errors };
  }

  /**
   * Validate that all brackets are matched
   * Only reports errors for UNEXPECTED closing brackets (too many)
   * Does NOT report missing closing brackets - that could be incomplete code
   */
  private validateBrackets(): void {
    // We only report errors for UNEXPECTED closing brackets (extra closing without opening)
    // We don't report missing opening brackets - the code might just be incomplete
    // The linter will handle more complex validation
    
    // Note: The bracketStack, parenStack, braceStack tracking during scanning
    // already handles detecting unexpected closing brackets (too many closing)
    
    // For unmatched opening brackets, we don't report them here because:
    // 1. The code could be incomplete
    // 2. The linter should handle more sophisticated validation
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
      return;
    }

    // Whitespace (skip)
    if (c === " " || c === "\t") {
      return;
    }

    // Comments
    if (c === "/") {
      if (this.peek() === "/") {
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
        this.advance();
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
        const value = this.source.substring(this.start + 2, this.current - 2);
        
        if (!foundEnd) {
          this.errors.push({
            message: "Unterminated block comment - missing '*/'",
            line: this.line,
            column: this.column - (this.current - this.start),
            code: SyntaxErrorCode.UNTERMINATED_COMMENT,
            suggestion: "Add '*/' to close the block comment",
          });
        }
        
        this.tokens.push({
          type: TokenType.BLOCK_COMMENT,
          value,
          line: this.line,
          column: this.column - (this.current - this.start),
          length: this.current - this.start,
        });
        return;
      }
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
      case "{": 
        this.addToken(TokenType.LEFT_BRACE); 
        this.braceStack.push({ type: TokenType.LEFT_BRACE, line: this.line, column: this.column - 1 });
        break;
      case "}": 
        this.addToken(TokenType.RIGHT_BRACE); 
        if (this.braceStack.length > 0) {
          this.braceStack.pop();
        } else {
          this.errors.push({
            message: `Unexpected '}' - no matching '{'`,
            line: this.line,
            column: this.column - 1,
            code: SyntaxErrorCode.UNMATCHED_BRACE,
            suggestion: "Remove this closing brace or check for extra braces",
          });
        }
        break;
      case "(": 
        this.addToken(TokenType.LEFT_PAREN); 
        this.parenStack.push({ type: TokenType.LEFT_PAREN, line: this.line, column: this.column - 1 });
        break;
      case ")": 
        this.addToken(TokenType.RIGHT_PAREN); 
        if (this.parenStack.length > 0) {
          this.parenStack.pop();
        } else {
          this.errors.push({
            message: `Unexpected ')' - no matching '('`,
            line: this.line,
            column: this.column - 1,
            code: SyntaxErrorCode.UNMATCHED_PAREN,
            suggestion: "Remove this closing parenthesis or check for extra parentheses",
          });
        }
        break;
      case "[": 
        this.addToken(TokenType.LEFT_BRACKET); 
        this.bracketStack.push({ type: TokenType.LEFT_BRACKET, line: this.line, column: this.column - 1 });
        break;
      case "]": 
        this.addToken(TokenType.RIGHT_BRACKET); 
        if (this.bracketStack.length > 0) {
          this.bracketStack.pop();
        } else {
          this.errors.push({
            message: `Unexpected ']' - no matching '['`,
            line: this.line,
            column: this.column - 1,
            code: SyntaxErrorCode.UNMATCHED_BRACKET,
            suggestion: "Remove this closing bracket or check for extra brackets",
          });
        }
        break;
      case ",": this.addToken(TokenType.COMMA); break;
      case ".": this.addToken(TokenType.DOT); break;
      case ";": this.addToken(TokenType.SEMICOLON); break;
      case ":": this.addToken(TokenType.COLON); break;
      case "?": this.addToken(TokenType.QUESTION); break;
      case "~": this.addToken(TokenType.TILDE); break;
      case "^": this.addToken(TokenType.CARET); break;
      case "@": this.addToken(TokenType.AT); break;
      default:
        if (c !== "\0" && c !== "\r" && c !== "\n") {
          this.errors.push({
            message: `Invalid character: '${c}'`,
            line: this.line,
            column: this.column - 1,
            code: SyntaxErrorCode.INVALID_CHARACTER,
            suggestion: "Remove or replace this character",
          });
        }
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
        value += "\n";
        this.advance();
        continue;
      }
      if (this.peek() === "\\" && !this.isAtEnd()) {
        this.advance();
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

  private scanNumber(): void {
    while (this.isDigit(this.peek())) {
      this.advance();
    }

    if (this.peek() === "." && this.isDigit(this.peekNext())) {
      this.advance();
      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    if (this.peek() === "x" || this.peek() === "X") {
      this.advance();
      while (this.isHexDigit(this.peek())) {
        this.advance();
      }
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

  private isValidIdentifier(text: string): boolean {
    if (!text || text.length === 0) return false;
    
    const firstChar = text[0];
    if (!this.isAlpha(firstChar) && firstChar !== "$" && firstChar !== "_") {
      return false;
    }
    
    for (let i = 1; i < text.length; i++) {
      const c = text[i];
      if (!this.isAlphaNumeric(c) && c !== "_" && c !== "$" && c !== "\\") {
        return false;
      }
    }
    
    return true;
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
