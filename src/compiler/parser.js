/**
 * C89 subset parser for PCVM C compiler.
 *
 * Recursive-descent parser with Pratt-style expression parsing.
 * Consumes tokens from a TokenStream and produces an AST.
 *
 * AST node types use a discriminated union pattern: every node has a `kind`
 * field (string enum) and a `loc` source location.
 */

import { TOKEN } from "./lexer.js";

/** @enum {string} AST node kinds */
export const AST = {
  PROGRAM: "Program",
  FUNCTION_DECL: "FunctionDecl",
  VAR_DECL: "VarDecl",
  BLOCK: "Block",
  IF_STMT: "IfStmt",
  WHILE_STMT: "WhileStmt",
  DO_WHILE_STMT: "DoWhileStmt",
  FOR_STMT: "ForStmt",
  RETURN_STMT: "ReturnStmt",
  BREAK_STMT: "BreakStmt",
  SWITCH_STMT: "SwitchStmt",
  CASE_STMT: "CaseStmt",
  DEFAULT_STMT: "DefaultStmt",
  GOTO_STMT: "GotoStmt",
  LABEL_STMT: "LabelStmt",
  EXPR_STMT: "ExprStmt",
  BINARY_EXPR: "BinaryExpr",
  UNARY_EXPR: "UnaryExpr",
  CALL_EXPR: "CallExpr",
  INT_LITERAL: "IntLiteral",
  FLOAT_LITERAL: "FloatLiteral",
  STRING_LITERAL: "StringLiteral",
  CHAR_LITERAL: "CharLiteral",
  IDENTIFIER: "Identifier",
  ASSIGN: "Assign",
  CAST: "Cast",
  TERNARY: "Ternary",
};

/** Type system for the C subset */
export const TYPE = {
  VOID: "void",
  CHAR: "char",
  SHORT: "short",
  INT: "int",
  LONG: "long",
  FLOAT: "float",
  DOUBLE: "double",
};

/** Map keyword tokens to types */
const KW_TO_TYPE = {
  [TOKEN.KW_VOID]: TYPE.VOID,
  [TOKEN.KW_CHAR]: TYPE.CHAR,
  [TOKEN.KW_SHORT]: TYPE.SHORT,
  [TOKEN.KW_INT]: TYPE.INT,
  [TOKEN.KW_LONG]: TYPE.LONG,
  [TOKEN.KW_FLOAT]: TYPE.FLOAT,
  [TOKEN.KW_DOUBLE]: TYPE.DOUBLE,
};

/** Size in bytes of each type */
export const TYPE_SIZE = {
  [TYPE.CHAR]: 1,
  [TYPE.SHORT]: 2,
  [TYPE.INT]: 4,
  [TYPE.LONG]: 4,
  [TYPE.FLOAT]: 4,
  [TYPE.DOUBLE]: 4,
};

/**
 * Check if a type is floating-point.
 * @param {string} type
 * @returns {boolean}
 */
export function isFloatType(type) {
  return type === TYPE.FLOAT || type === TYPE.DOUBLE;
}

/**
 * Symbol table entry.
 */
class Symbol {
  constructor(name, type, kind = "var", offset = 0, isStatic = false, isConst = false) {
    this.name = name;
    this.type = type;
    this.kind = kind;     // "var", "param", "func", "label"
    this.offset = offset;  // stack offset for locals, address for globals
    this.isStatic = isStatic;
    this.isConst = isConst;
    this.paramTypes = [];  // for functions
    this.returnType = null;
  }
}

/**
 * Scope — a single lexical scope. Each scope has a name → Symbol map
 * and a parent scope for name resolution.
 */
class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.symbols = new Map();
    this.nextLocalOffset = 0; // negative offset from frame pointer
  }

  /** Declare a new symbol in this scope. */
  declare(name, type, kind = "var", isStatic = false, isConst = false) {
    if (this.symbols.has(name)) {
      throw new Error(`Symbol '${name}' already declared in this scope`);
    }
    const offset = kind === "param" || kind === "var" ? this.nextLocalOffset : 0;
    if (kind === "var") this.nextLocalOffset += TYPE_SIZE[type] || 4;
    if (kind === "param") this.nextLocalOffset += 4; // params occupy a slot
    const sym = new Symbol(name, type, kind, offset, isStatic, isConst);
    this.symbols.set(name, sym);
    return sym;
  }

  /** Look up a symbol by name, checking parent scopes. */
  lookup(name) {
    if (this.symbols.has(name)) return this.symbols.get(name);
    return this.parent ? this.parent.lookup(name) : null;
  }

  /** Look up a symbol only in this scope. */
  localLookup(name) {
    return this.symbols.get(name) || null;
  }
}

/** Operator precedence (higher = binds tighter) */
const PREC = {
  ASSIGN: 1,
  TERNARY: 2,
  OR: 3,
  AND: 4,
  BIT_OR: 5,
  BIT_XOR: 6,
  BIT_AND: 7,
  EQ: 8,
  REL: 9,
  SHIFT: 10,
  ADD: 11,
  MUL: 12,
  PREFIX: 13,
  POSTFIX: 14,
};

/** Map token kinds to binary operator precedence */
const BINARY_PREC = {
  [TOKEN.EQ]: PREC.ASSIGN,
  [TOKEN.PLUS_EQ]: PREC.ASSIGN, [TOKEN.MINUS_EQ]: PREC.ASSIGN,
  [TOKEN.STAR_EQ]: PREC.ASSIGN, [TOKEN.SLASH_EQ]: PREC.ASSIGN,
  [TOKEN.PERCENT_EQ]: PREC.ASSIGN,
  [TOKEN.AMP_EQ]: PREC.ASSIGN, [TOKEN.PIPE_EQ]: PREC.ASSIGN,
  [TOKEN.CARET_EQ]: PREC.ASSIGN,
  [TOKEN.LT_LT_EQ]: PREC.ASSIGN, [TOKEN.GT_GT_EQ]: PREC.ASSIGN,
  [TOKEN.QUESTION]: PREC.TERNARY,
  [TOKEN.PIPE_PIPE]: PREC.OR,
  [TOKEN.AMP_AMP]: PREC.AND,
  [TOKEN.PIPE]: PREC.BIT_OR,
  [TOKEN.CARET]: PREC.BIT_XOR,
  [TOKEN.AMP]: PREC.BIT_AND,
  [TOKEN.EQ_EQ]: PREC.EQ, [TOKEN.BANG_EQ]: PREC.EQ,
  [TOKEN.LT]: PREC.REL, [TOKEN.LT_EQ]: PREC.REL,
  [TOKEN.GT]: PREC.REL, [TOKEN.GT_EQ]: PREC.REL,
  [TOKEN.LT_LT]: PREC.SHIFT, [TOKEN.GT_GT]: PREC.SHIFT,
  [TOKEN.PLUS]: PREC.ADD, [TOKEN.MINUS]: PREC.ADD,
  [TOKEN.STAR]: PREC.MUL, [TOKEN.SLASH]: PREC.MUL, [TOKEN.PERCENT]: PREC.MUL,
};

/**
 * The parser itself. Takes a TokenStream and produces an AST Program node.
 *
 * Usage:
 *   const tokens = lex(preprocessedSource);
 *   const stream = new TokenStream(tokens);
 *   const parser = new Parser(stream);
 *   const ast = parser.parseProgram();
 */
export class Parser {
  /**
   * @param {import("./lexer.js").TokenStream} ts
   */
  constructor(ts) {
    this.ts = ts;
    this.scope = new Scope();
    this.globalScope = this.scope;
    this.labels = new Map(); // function-local goto labels
    this.loopDepth = 0;
    this.switchDepth = 0;
    this.labelCounter = 0;
    this.stringLiterals = []; // all string literals collected for .DATA section
  }

  /** Generate a unique label name. */
  freshLabel(prefix = "L") {
    return `__${prefix}${this.labelCounter++}`;
  }

  /** Create an AST node. */
  node(kind, props = {}) {
    return { kind, loc: this.ts.current().loc, ...props };
  }

  // ─── Top level ─────────────────────────────────────────────────────────

  /** program → (functionDecl | varDecl)* */
  parseProgram() {
    const decls = [];
    while (!this.ts.done) {
      const decl = this.parseTopLevelDecl();
      if (decl !== null) decls.push(decl);
    }
    return this.node(AST.PROGRAM, { decls, strings: this.stringLiterals });
  }

  /** Parse a single top-level declaration. */
  parseTopLevelDecl() {
    // Look ahead to distinguish function from variable declaration.
    // Both start with: type IDENTIFIER ...
    const type = this.parseTypeSpec();
    const nameTok = this.ts.expect(TOKEN.IDENTIFIER);

    if (this.ts.check(TOKEN.LPAREN)) {
      // Function declaration or prototype
      this.ts.next(); // consume '('
      const params = [];
      if (!this.ts.check(TOKEN.RPAREN)) {
        params.push(...this.parseParamList());
      }
      this.ts.expect(TOKEN.RPAREN);

      // Create function symbol
      const funcSym = this.scope.declare(nameTok.name, type, "func");
      funcSym.returnType = type;
      funcSym.paramTypes = params.map(p => p.type);

      // Forward declaration (prototype) without body
      if (this.ts.check(TOKEN.SEMICOLON)) {
        this.ts.next();
        return null; // skip prototype — definition comes later
      }

      // Parse body
      const body = this.parseBlock();

      return this.node(AST.FUNCTION_DECL, {
        name: nameTok.name,
        returnType: type,
        params,
        body,
      });
    }

    // Global variable declaration
    const sym = this.scope.declare(nameTok.name, type, "var", true);
    let init = null;
    if (this.ts.check(TOKEN.EQ)) {
      this.ts.next();
      init = this.parseExpression();
    }
    this.ts.expect(TOKEN.SEMICOLON);
    return this.node(AST.VAR_DECL, {
      name: nameTok.name,
      type,
      init,
      isStatic: true,
      isConst: false,
    });
  }

  // ─── Types ─────────────────────────────────────────────────────────────

  /** Parse a type specifier. Supports `static const int`, `const int`, `int`, `float*`, `void`, etc. */
  parseTypeSpec() {
    // Skip optional type qualifiers and storage class specifiers
    while (this.ts.check(TOKEN.KW_CONST) || this.ts.check(TOKEN.KW_STATIC))
      this.ts.next();

    const tok = this.ts.current();
    if (!KW_TO_TYPE[tok.kind]) {
      throw new Error(`Expected type at ${tok.loc.line}:${tok.loc.col}, got ${tok.kind}`);
    }
    this.ts.next();
    let typeName = KW_TO_TYPE[tok.kind];

    // Parse pointer indirection: `*` (zero or more)
    while (this.ts.check(TOKEN.STAR)) {
      this.ts.next();
      typeName = typeName + "*"; // pointer type encoding
    }

    return typeName;
  }

  // ─── Parameter list ────────────────────────────────────────────────────

  /** Parse comma-separated parameter declarations. Handles `(void)` as empty. */
  parseParamList() {
    // `(void)` means no parameters
    if (this.ts.check(TOKEN.KW_VOID) && this.ts.peek(1)?.kind === TOKEN.RPAREN) {
      this.ts.next(); // consume void — no params
      return [];
    }

    const params = [];
    do {
      const type = this.parseTypeSpec();
      const nameTok = this.ts.expect(TOKEN.IDENTIFIER);
      params.push(this.node(AST.VAR_DECL, {
        name: nameTok.name,
        type,
        init: null,
        isParam: true,
      }));
      // Declare in function scope (will be set up when we enter function body)
    } while (this.ts.check(TOKEN.COMMA) && this.ts.next());
    return params;
  }

  // ─── Statements ────────────────────────────────────────────────────────

  /** Parse a block: { statement* } */
  parseBlock() {
    this.ts.expect(TOKEN.LBRACE);
    const stmts = [];
    // Push new scope for this block
    const prevScope = this.scope;
    this.scope = new Scope(prevScope);
    const prevLabels = this.labels;
    this.labels = new Map();

    while (!this.ts.check(TOKEN.RBRACE) && !this.ts.done) {
      stmts.push(this.parseStatement());
    }
    this.ts.expect(TOKEN.RBRACE);

    this.scope = prevScope;
    this.labels = prevLabels;
    return this.node(AST.BLOCK, { stmts });
  }

  /** Parse a single statement. */
  parseStatement() {
    const tok = this.ts.current();

    // Variable declaration: [const] type IDENTIFIER [= expr];
    if (KW_TO_TYPE[tok.kind] || tok.kind === TOKEN.KW_CONST) {
      return this.parseLocalVarDecl();
    }

    switch (tok.kind) {
      case TOKEN.LBRACE: return this.parseBlock();
      case TOKEN.KW_IF: return this.parseIfStmt();
      case TOKEN.KW_WHILE: return this.parseWhileStmt();
      case TOKEN.KW_DO: return this.parseDoWhileStmt();
      case TOKEN.KW_FOR: return this.parseForStmt();
      case TOKEN.KW_RETURN: return this.parseReturnStmt();
      case TOKEN.KW_BREAK: return this.parseBreakStmt();
      case TOKEN.KW_SWITCH: return this.parseSwitchStmt();
      case TOKEN.KW_GOTO: return this.parseGotoStmt();
      case TOKEN.SEMICOLON: this.ts.next(); return this.node(AST.EXPR_STMT, { expr: null });

      default:
        // Check for label: IDENTIFIER :
        if (tok.kind === TOKEN.IDENTIFIER && this.ts.peek(1)?.kind === TOKEN.COLON) {
          return this.parseLabelStmt();
        }
        // Expression statement
        return this.parseExprStmt();
    }
  }

  /** if (expr) stmt [else stmt] */
  parseIfStmt() {
    this.ts.next(); // if
    this.ts.expect(TOKEN.LPAREN);
    const condition = this.parseExpression();
    this.ts.expect(TOKEN.RPAREN);
    const thenStmt = this.parseStatement();
    let elseStmt = null;
    if (this.ts.check(TOKEN.KW_ELSE)) {
      this.ts.next();
      elseStmt = this.parseStatement();
    }
    return this.node(AST.IF_STMT, { condition, thenStmt, elseStmt });
  }

  /** while (expr) stmt */
  parseWhileStmt() {
    this.ts.next();
    this.ts.expect(TOKEN.LPAREN);
    const condition = this.parseExpression();
    this.ts.expect(TOKEN.RPAREN);
    this.loopDepth++;
    const body = this.parseStatement();
    this.loopDepth--;
    return this.node(AST.WHILE_STMT, { condition, body });
  }

  /** do stmt while (expr); */
  parseDoWhileStmt() {
    this.ts.next();
    this.loopDepth++;
    const body = this.parseStatement();
    this.loopDepth--;
    this.ts.expect(TOKEN.KW_WHILE);
    this.ts.expect(TOKEN.LPAREN);
    const condition = this.parseExpression();
    this.ts.expect(TOKEN.RPAREN);
    this.ts.expect(TOKEN.SEMICOLON);
    return this.node(AST.DO_WHILE_STMT, { body, condition });
  }

  /** for ([init]; [cond]; [incr]) stmt */
  parseForStmt() {
    this.ts.next();
    this.ts.expect(TOKEN.LPAREN);

    // init
    let init = null;
    if (!this.ts.check(TOKEN.SEMICOLON)) {
      if (KW_TO_TYPE[this.ts.current().kind]) {
        init = this.parseLocalVarDecl();
      } else {
        init = this.parseExpression();
        this.ts.expect(TOKEN.SEMICOLON);
      }
    } else {
      this.ts.next();
    }

    // condition
    let condition = null;
    if (!this.ts.check(TOKEN.SEMICOLON)) {
      condition = this.parseExpression();
    }
    this.ts.expect(TOKEN.SEMICOLON);

    // increment
    let increment = null;
    if (!this.ts.check(TOKEN.RPAREN)) {
      increment = this.parseExpression();
    }
    this.ts.expect(TOKEN.RPAREN);

    this.loopDepth++;
    const body = this.parseStatement();
    this.loopDepth--;

    return this.node(AST.FOR_STMT, { init, condition, increment, body });
  }

  /** return [expr]; */
  parseReturnStmt() {
    this.ts.next();
    let value = null;
    if (!this.ts.check(TOKEN.SEMICOLON)) {
      value = this.parseExpression();
    }
    this.ts.expect(TOKEN.SEMICOLON);
    return this.node(AST.RETURN_STMT, { value });
  }

  /** break; */
  parseBreakStmt() {
    this.ts.next();
    this.ts.expect(TOKEN.SEMICOLON);
    if (this.loopDepth === 0 && this.switchDepth === 0) {
      throw new Error(`break outside of loop or switch at ${this.ts.current().loc.line}`);
    }
    return this.node(AST.BREAK_STMT, {});
  }

  /** switch (expr) stmt */
  parseSwitchStmt() {
    this.ts.next();
    this.ts.expect(TOKEN.LPAREN);
    const expr = this.parseExpression();
    this.ts.expect(TOKEN.RPAREN);
    this.switchDepth++;
    const body = this.parseStatement(); // block containing cases
    this.switchDepth--;
    return this.node(AST.SWITCH_STMT, { expr, body });
  }

  /** goto LABEL; */
  parseGotoStmt() {
    this.ts.next();
    const nameTok = this.ts.expect(TOKEN.IDENTIFIER);
    this.ts.expect(TOKEN.SEMICOLON);
    return this.node(AST.GOTO_STMT, { label: nameTok.name });
  }

  /** LABEL: */
  parseLabelStmt() {
    const nameTok = this.ts.next(); // IDENTIFIER
    this.ts.expect(TOKEN.COLON);
    this.labels.set(nameTok.name, true);
    return this.node(AST.LABEL_STMT, { name: nameTok.name });
  }

  /** Local variable declaration. */
  parseLocalVarDecl() {
    const type = this.parseTypeSpec();
    const nameTok = this.ts.expect(TOKEN.IDENTIFIER);
    let init = null;
    let isConst = false;
    let isStatic = false;

    if (this.ts.check(TOKEN.EQ)) {
      this.ts.next();
      init = this.parseExpression();
    }
    this.ts.expect(TOKEN.SEMICOLON);

    // Declare in current scope
    this.scope.declare(nameTok.name, type, "var", false, false);

    return this.node(AST.VAR_DECL, {
      name: nameTok.name,
      type,
      init,
      isStatic: false,
      isConst: false,
    });
  }

  /** Expression statement: expr; */
  parseExprStmt() {
    const expr = this.parseExpression();
    this.ts.expect(TOKEN.SEMICOLON);
    return this.node(AST.EXPR_STMT, { expr });
  }

  // ─── Expressions (Pratt parser) ─────────────────────────────────────────

  /** Top-level expression entry point. */
  parseExpression() {
    return this.parseExpr(0);
  }

  /** Pratt parser core. */
  parseExpr(minPrec) {
    let left = this.parsePrefix();

    while (true) {
      const tok = this.ts.current();
      const prec = BINARY_PREC[tok.kind];
      if (prec === undefined || prec < minPrec) break;

      // Ternary is special — right-associative, parsed inline
      if (tok.kind === TOKEN.QUESTION) {
        this.ts.next();
        const thenExpr = this.parseExpression();
        this.ts.expect(TOKEN.COLON);
        const elseExpr = this.parseExpr(PREC.TERNARY);
        left = this.node(AST.TERNARY, { condition: left, thenExpr, elseExpr });
        continue;
      }

      // Assignment is right-associative
      const isAssign = prec === PREC.ASSIGN;
      const nextPrec = isAssign ? prec : prec + 1;

      this.ts.next(); // consume operator
      const right = this.parseExpr(nextPrec);

      if (isAssign) {
        left = this.node(AST.ASSIGN, { target: left, op: tok.kind, value: right });
      } else {
        left = this.node(AST.BINARY_EXPR, { left, op: tok.kind, right });
      }
    }
    return left;
  }

  /** Parse a prefix expression (literal, identifier, unary, paren, cast). */
  parsePrefix() {
    const tok = this.ts.current();

    // Literals
    if (tok.kind === TOKEN.INT_LITERAL) {
      this.ts.next();
      return this.node(AST.INT_LITERAL, { value: tok.value });
    }
    if (tok.kind === TOKEN.FLOAT_LITERAL) {
      this.ts.next();
      return this.node(AST.FLOAT_LITERAL, { value: tok.value });
    }
    if (tok.kind === TOKEN.STRING_LITERAL) {
      this.ts.next();
      const idx = this.stringLiterals.length;
      this.stringLiterals.push(tok.value);
      return this.node(AST.STRING_LITERAL, { value: tok.value, index: idx });
    }
    if (tok.kind === TOKEN.CHAR_LITERAL) {
      this.ts.next();
      return this.node(AST.CHAR_LITERAL, { value: tok.value });
    }

    // Identifier
    if (tok.kind === TOKEN.IDENTIFIER) {
      this.ts.next();
      const name = tok.name;

      // Function call?
      if (this.ts.check(TOKEN.LPAREN)) {
        this.ts.next();
        const args = [];
        if (!this.ts.check(TOKEN.RPAREN)) {
          do { args.push(this.parseExpression()); }
          while (this.ts.check(TOKEN.COMMA) && this.ts.next());
        }
        this.ts.expect(TOKEN.RPAREN);
        return this.node(AST.CALL_EXPR, { callee: name, args });
      }

      return this.node(AST.IDENTIFIER, { name });
    }

    // Unary operators
    if (tok.kind === TOKEN.MINUS || tok.kind === TOKEN.PLUS ||
        tok.kind === TOKEN.BANG || tok.kind === TOKEN.TILDE ||
        tok.kind === TOKEN.STAR || tok.kind === TOKEN.AMP) {
      this.ts.next();
      const operand = this.parseExpr(PREC.PREFIX);
      return this.node(AST.UNARY_EXPR, { op: tok.kind, operand });
    }

    // Prefix ++ / --
    if (tok.kind === TOKEN.PLUS_PLUS || tok.kind === TOKEN.MINUS_MINUS) {
      this.ts.next();
      const operand = this.parseExpr(PREC.PREFIX);
      return this.node(AST.UNARY_EXPR, { op: tok.kind, operand, prefix: true });
    }

    // sizeof(type) or sizeof expr
    if (tok.kind === TOKEN.KW_SIZEOF) {
      this.ts.next();
      if (KW_TO_TYPE[this.ts.current().kind]) {
        const type = this.parseTypeSpec();
        this.ts.expect(TOKEN.RPAREN);
        // sizeof(type) — always returns 4 for our types
        return this.node(AST.INT_LITERAL, { value: TYPE_SIZE[type] || 4 });
      }
      // sizeof expr — not implemented, fallback
      const expr = this.parseExpr(PREC.PREFIX);
      return this.node(AST.INT_LITERAL, { value: 4 });
    }

    // Parenthesised expression or cast
    if (tok.kind === TOKEN.LPAREN) {
      // Look ahead to distinguish cast from parenthesised expression
      const next = this.ts.peek(1);
      if (KW_TO_TYPE[next?.kind] && this.ts.peek(2)?.kind !== TOKEN.IDENTIFIER) {
        // Likely a cast
        this.ts.next(); // (
        const type = this.parseTypeSpec();
        this.ts.expect(TOKEN.RPAREN);
        const expr = this.parseExpr(PREC.PREFIX);
        return this.node(AST.CAST, { type, expr });
      }

      this.ts.next();
      const expr = this.parseExpression();
      this.ts.expect(TOKEN.RPAREN);
      return expr;
    }

    throw new Error(`Unexpected token ${tok.kind} at ${tok.loc.line}:${tok.loc.col}`);
  }
}