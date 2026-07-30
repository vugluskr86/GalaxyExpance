/**
 * C89 subset lexer for PCVM C compiler.
 *
 * Tokenises the preprocessed C source into a stream of tokens with line/column
 * positions for error reporting. Comments are already stripped by the
 * preprocessor; the lexer only handles the language proper.
 *
 * Token types follow a simple enum + payload pattern rather than a class
 * hierarchy so the parser can switch on `kind` with zero allocation per token.
 * All tokens carry a `loc` object {line, col} as their first payload field.
 */

/** @enum {string} */
export const TOKEN = {
  // Keywords
  KW_INT: "KW_INT",
  KW_CHAR: "KW_CHAR",
  KW_SHORT: "KW_SHORT",
  KW_LONG: "KW_LONG",
  KW_FLOAT: "KW_FLOAT",
  KW_DOUBLE: "KW_DOUBLE",
  KW_VOID: "KW_VOID",
  KW_IF: "KW_IF",
  KW_ELSE: "KW_ELSE",
  KW_WHILE: "KW_WHILE",
  KW_DO: "KW_DO",
  KW_FOR: "KW_FOR",
  KW_RETURN: "KW_RETURN",
  KW_SWITCH: "KW_SWITCH",
  KW_CASE: "KW_CASE",
  KW_DEFAULT: "KW_DEFAULT",
  KW_BREAK: "KW_BREAK",
  KW_GOTO: "KW_GOTO",
  KW_STATIC: "KW_STATIC",
  KW_CONST: "KW_CONST",
  KW_SIZEOF: "KW_SIZEOF",
  KW_TYPEDEF: "KW_TYPEDEF",

  // Literals
  INT_LITERAL: "INT_LITERAL",       // {loc, value: number, suffix: string}
  FLOAT_LITERAL: "FLOAT_LITERAL",   // {loc, value: number}
  STRING_LITERAL: "STRING_LITERAL", // {loc, value: string}
  CHAR_LITERAL: "CHAR_LITERAL",     // {loc, value: number (charCode)}

  // Identifiers
  IDENTIFIER: "IDENTIFIER",         // {loc, name: string}

  // Operators and punctuation — single-character and multi-character
  PLUS: "+",           MINUS: "-",
  STAR: "*",           SLASH: "/",
  PERCENT: "%",
  EQ: "=",             EQ_EQ: "==",
  BANG: "!",           BANG_EQ: "!=",
  LT: "<",             LT_EQ: "<=",
  GT: ">",             GT_EQ: ">=",
  AMP: "&",            AMP_AMP: "&&",
  PIPE: "|",           PIPE_PIPE: "||",
  CARET: "^",
  TILDE: "~",
  LT_LT: "<<",         GT_GT: ">>",
  PLUS_EQ: "+=",       MINUS_EQ: "-=",
  STAR_EQ: "*=",       SLASH_EQ: "/=",
  PERCENT_EQ: "%=",    AMP_EQ: "&=",
  PIPE_EQ: "|=",       CARET_EQ: "^=",
  LT_LT_EQ: "<<=",     GT_GT_EQ: ">>=",
  PLUS_PLUS: "++",     MINUS_MINUS: "--",
  ARROW: "->",

  // Delimiters
  LPAREN: "(",         RPAREN: ")",
  LBRACE: "{",         RBRACE: "}",
  LBRACKET: "[",       RBRACKET: "]",
  SEMICOLON: ";",      COMMA: ",",
  COLON: ":",          QUESTION: "?",

  // Special
  END: "END",                      // end of input
};

const KEYWORDS = {
  "int": TOKEN.KW_INT,       "char": TOKEN.KW_CHAR,
  "short": TOKEN.KW_SHORT,   "long": TOKEN.KW_LONG,
  "float": TOKEN.KW_FLOAT,   "double": TOKEN.KW_DOUBLE,
  "void": TOKEN.KW_VOID,
  "if": TOKEN.KW_IF,         "else": TOKEN.KW_ELSE,
  "while": TOKEN.KW_WHILE,   "do": TOKEN.KW_DO,
  "for": TOKEN.KW_FOR,       "return": TOKEN.KW_RETURN,
  "switch": TOKEN.KW_SWITCH, "case": TOKEN.KW_CASE,
  "default": TOKEN.KW_DEFAULT, "break": TOKEN.KW_BREAK,
  "goto": TOKEN.KW_GOTO,
  "static": TOKEN.KW_STATIC, "const": TOKEN.KW_CONST,
  "sizeof": TOKEN.KW_SIZEOF, "typedef": TOKEN.KW_TYPEDEF,
};

const ID_START = /[A-Za-z_]/;
const ID_CONT  = /[A-Za-z0-9_]/;
const DIGIT    = /[0-9]/;
const HEX_DIGIT = /[0-9A-Fa-f]/;
const WS       = /[ \t\r\n]/;

/**
 * Produce a flat array of token objects from the given source string.
 * Whitespace is skipped; invalid characters throw a SyntaxError with line/col.
 *
 * @param {string} source
 * @returns {Array<{kind: string, loc: {line: number, col: number}, [key]: any}>}
 */
export function lex(source) {
  const tokens = [];
  let pos = 0;
  let line = 1;
  let col = 1;

  const loc = () => ({ line, col });

  /** Advance one character and return it. */
  const advance = () => {
    const ch = source[pos];
    pos++;
    if (ch === "\n") { line++; col = 1; }
    else { col++; }
    return ch;
  };

  /** Peek at the current character without consuming it. */
  const peek = (offset = 0) => pos + offset < source.length ? source[pos + offset] : "";

  /** Consume characters while predicate(ch) is truthy, returning the run. */
  const takeWhile = (predicate) => {
    let result = "";
    while (pos < source.length && predicate(peek())) result += advance();
    return result;
  };

  /** Skip whitespace. */
  const skipWS = () => { while (pos < source.length && WS.test(peek())) advance(); };

  /** Read a // line comment (already stripped by preprocessor, but handle defensively). */
  const skipLineComment = () => {
    while (pos < source.length && peek() !== "\n") advance();
  };

  /** Read a /* block comment */
  const skipBlockComment = () => {
    advance(); advance(); // skip /*
    while (pos < source.length) {
      if (peek() === "*" && peek(1) === "/") { advance(); advance(); return; }
      advance();
    }
    throw lexError(loc(), "unterminated block comment");
  };

  /** Read an integer literal (decimal or hex). */
  const readNumber = (startCol) => {
    const start = pos - 1; // already consumed the first digit
    let value = "";

    if (peek(-1) === "0" && (peek() === "x" || peek() === "X")) {
      // Hex literal
      advance(); // consume 'x'
      value = takeWhile(ch => HEX_DIGIT.test(ch));
      if (!value) throw lexError({ line, col: startCol }, "malformed hex literal");
      return makeToken(TOKEN.INT_LITERAL, { line, col: startCol },
        { value: parseInt(value, 16), suffix: "" });
    }

    // Decimal literal — may be int or float
    value = peek(-1);
    value += takeWhile(ch => DIGIT.test(ch));

    // Float: decimal point or exponent
    if (peek() === "." && DIGIT.test(peek(1))) {
      value += advance(); // '.'
      value += takeWhile(ch => DIGIT.test(ch));
      if (peek() === "e" || peek() === "E") {
        value += advance();
        if (peek() === "+" || peek() === "-") value += advance();
        const expDigits = takeWhile(ch => DIGIT.test(ch));
        if (!expDigits) throw lexError({ line, col }, "malformed float exponent");
        value += expDigits;
      }
      return makeToken(TOKEN.FLOAT_LITERAL, { line, col: startCol },
        { value: parseFloat(value) });
    }
    if ((peek() === "e" || peek() === "E") && peek(1) !== "+" && peek(1) !== "-" && !DIGIT.test(peek(1))) {
      // "e" alone is not a float — fall through to int
    } else if (peek() === "e" || peek() === "E") {
      value += advance();
      if (peek() === "+" || peek() === "-") value += advance();
      const expDigits = takeWhile(ch => DIGIT.test(ch));
      if (!expDigits) throw lexError({ line, col }, "malformed float exponent");
      value += expDigits;
      return makeToken(TOKEN.FLOAT_LITERAL, { line, col: startCol },
        { value: parseFloat(value) });
    }

    return makeToken(TOKEN.INT_LITERAL, { line, col: startCol },
      { value: parseInt(value, 10), suffix: "" });
  };

  /** Read a string literal. */
  const readString = () => {
    const startCol = col;
    let value = "";
    while (pos < source.length) {
      const ch = advance();
      if (ch === '"') return makeToken(TOKEN.STRING_LITERAL, { line, col: startCol }, { value });
      if (ch === "\\") {
        const esc = advance();
        switch (esc) {
          case "n": value += "\n"; break;
          case "t": value += "\t"; break;
          case "r": value += "\r"; break;
          case "\\": value += "\\"; break;
          case '"': value += '"'; break;
          case "0": value += "\0"; break;
          case "x": {
            let hex = "";
            for (let i = 0; i < 2 && HEX_DIGIT.test(peek()); i++) hex += advance();
            value += String.fromCharCode(parseInt(hex, 16));
            break;
          }
          default: value += esc;
        }
      } else {
        value += ch;
      }
    }
    throw lexError({ line, col: startCol }, "unterminated string literal");
  };

  /** Read a character literal. */
  const readChar = () => {
    const startCol = col;
    let value;
    const ch = advance();
    if (ch === "\\") {
      const esc = advance();
      switch (esc) {
        case "n": value = 10; break;
        case "t": value = 9; break;
        case "r": value = 13; break;
        case "\\": value = 92; break;
        case "'": value = 39; break;
        case "0": value = 0; break;
        case "x": {
          let hex = "";
          for (let i = 0; i < 2 && HEX_DIGIT.test(peek()); i++) hex += advance();
          value = parseInt(hex, 16);
          break;
        }
        default: value = esc.charCodeAt(0);
      }
    } else {
      value = ch.charCodeAt(0);
    }
    if (advance() !== "'") throw lexError({ line, col: startCol }, "unterminated character literal");
    return makeToken(TOKEN.CHAR_LITERAL, { line, col: startCol }, { value });
  };

  /** Read an identifier or keyword. */
  const readIdentifier = () => {
    const startCol = col;
    const name = peek(-1) + takeWhile(ch => ID_CONT.test(ch));
    const kind = KEYWORDS[name] || TOKEN.IDENTIFIER;
    return makeToken(kind, { line, col: startCol }, { name });
  };

  /** Make a token object. */
  const makeToken = (kind, loc, extra = {}) => ({ kind, loc, ...extra });

  /** Create a syntax error. */
  const lexError = (loc, message) => {
    return new SyntaxError(`Lexer error at ${loc.line}:${loc.col}: ${message}`);
  };

  // ─── Main loop ──────────────────────────────────────────────────────────

  while (pos < source.length) {
    skipWS();
    if (pos >= source.length) break;

    const ch = peek();
    const startLine = line;
    const startCol = col;

    // Comments (handled here for robustness; preprocessor should strip them)
    if (ch === "/" && peek(1) === "/") { skipLineComment(); continue; }
    if (ch === "/" && peek(1) === "*") { skipBlockComment(); continue; }

    // Numbers
    if (DIGIT.test(ch)) { advance(); tokens.push(readNumber(startCol)); continue; }
    if (ch === "." && DIGIT.test(peek(1))) {
      // Float starting with decimal point
      advance(); // '.'
      let value = "." + takeWhile(ch => DIGIT.test(ch));
      if (peek() === "e" || peek() === "E") {
        value += advance();
        if (peek() === "+" || peek() === "-") value += advance();
        value += takeWhile(ch => DIGIT.test(ch));
      }
      tokens.push(makeToken(TOKEN.FLOAT_LITERAL, { line: startLine, col: startCol },
        { value: parseFloat(value) }));
      continue;
    }

    // Strings and chars
    if (ch === '"') { advance(); tokens.push(readString()); continue; }
    if (ch === "'") { advance(); tokens.push(readChar()); continue; }

    // Identifiers and keywords
    if (ID_START.test(ch)) { advance(); tokens.push(readIdentifier()); continue; }

    // Operators and delimiters
    advance(); // consume ch
    const next = peek();

    // Two-character operators
    if (ch === "=" && next === "=") { advance(); tokens.push(makeToken(TOKEN.EQ_EQ, loc())); continue; }
    if (ch === "!" && next === "=") { advance(); tokens.push(makeToken(TOKEN.BANG_EQ, loc())); continue; }
    if (ch === "<" && next === "=") { advance(); tokens.push(makeToken(TOKEN.LT_EQ, loc())); continue; }
    if (ch === ">" && next === "=") { advance(); tokens.push(makeToken(TOKEN.GT_EQ, loc())); continue; }
    if (ch === "&" && next === "&") { advance(); tokens.push(makeToken(TOKEN.AMP_AMP, loc())); continue; }
    if (ch === "|" && next === "|") { advance(); tokens.push(makeToken(TOKEN.PIPE_PIPE, loc())); continue; }
    if (ch === "<" && next === "<") {
      advance();
      if (peek() === "=") { advance(); tokens.push(makeToken(TOKEN.LT_LT_EQ, loc())); }
      else tokens.push(makeToken(TOKEN.LT_LT, loc()));
      continue;
    }
    if (ch === ">" && next === ">") {
      advance();
      if (peek() === "=") { advance(); tokens.push(makeToken(TOKEN.GT_GT_EQ, loc())); }
      else tokens.push(makeToken(TOKEN.GT_GT, loc()));
      continue;
    }
    if (ch === "+" && next === "=") { advance(); tokens.push(makeToken(TOKEN.PLUS_EQ, loc())); continue; }
    if (ch === "-" && next === "=") { advance(); tokens.push(makeToken(TOKEN.MINUS_EQ, loc())); continue; }
    if (ch === "*" && next === "=") { advance(); tokens.push(makeToken(TOKEN.STAR_EQ, loc())); continue; }
    if (ch === "/" && next === "=") { advance(); tokens.push(makeToken(TOKEN.SLASH_EQ, loc())); continue; }
    if (ch === "%" && next === "=") { advance(); tokens.push(makeToken(TOKEN.PERCENT_EQ, loc())); continue; }
    if (ch === "&" && next === "=") { advance(); tokens.push(makeToken(TOKEN.AMP_EQ, loc())); continue; }
    if (ch === "|" && next === "=") { advance(); tokens.push(makeToken(TOKEN.PIPE_EQ, loc())); continue; }
    if (ch === "^" && next === "=") { advance(); tokens.push(makeToken(TOKEN.CARET_EQ, loc())); continue; }
    if (ch === "+" && next === "+") { advance(); tokens.push(makeToken(TOKEN.PLUS_PLUS, loc())); continue; }
    if (ch === "-" && next === "-") { advance(); tokens.push(makeToken(TOKEN.MINUS_MINUS, loc())); continue; }
    if (ch === "-" && next === ">") { advance(); tokens.push(makeToken(TOKEN.ARROW, loc())); continue; }

    // Single-character tokens
    const single = {
      "+": TOKEN.PLUS,    "-": TOKEN.MINUS,    "*": TOKEN.STAR,
      "/": TOKEN.SLASH,   "%": TOKEN.PERCENT,  "=": TOKEN.EQ,
      "!": TOKEN.BANG,    "<": TOKEN.LT,       ">": TOKEN.GT,
      "&": TOKEN.AMP,     "|": TOKEN.PIPE,     "^": TOKEN.CARET,
      "~": TOKEN.TILDE,
      "(": TOKEN.LPAREN,  ")": TOKEN.RPAREN,
      "{": TOKEN.LBRACE,  "}": TOKEN.RBRACE,
      "[": TOKEN.LBRACKET,"]": TOKEN.RBRACKET,
      ";": TOKEN.SEMICOLON, ",": TOKEN.COMMA,
      ":": TOKEN.COLON,   "?": TOKEN.QUESTION,
    };
    if (single[ch]) {
      tokens.push(makeToken(single[ch], { line: startLine, col: startCol }));
      continue;
    }

    throw lexError({ line: startLine, col: startCol }, `unexpected character '${ch}'`);
  }

  tokens.push(makeToken(TOKEN.END, loc()));
  return tokens;
}

/**
 * Token stream wrapper used by the parser. Provides lookahead and consume
 * methods that advance through the flat token array.
 */
export class TokenStream {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  /** Peek at the current token. */
  current() { return this.tokens[this.pos]; }

  /** Peek at the next token without consuming. */
  peek(offset = 0) { return this.tokens[this.pos + offset]; }

  /** Consume and return the current token, advancing the stream. */
  next() { return this.tokens[this.pos++]; }

  /** True if the current token matches the given kind. */
  check(kind) { return this.current().kind === kind; }

  /** Consume and return the current token if it matches; otherwise throw. */
  expect(kind) {
    if (this.check(kind)) return this.next();
    const t = this.current();
    throw new SyntaxError(
      `Parser error at ${t.loc.line}:${t.loc.col}: expected ${kind}, got ${t.kind}`
    );
  }

  /** Return true if the stream is at the end. */
  get done() { return this.current().kind === TOKEN.END; }

  /** Number of remaining tokens. */
  get remaining() { return this.tokens.length - this.pos; }
}