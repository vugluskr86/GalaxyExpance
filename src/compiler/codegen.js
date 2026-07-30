/**
 * Code generator for PCVM C compiler.
 *
 * Walks the AST and emits PCVM assembly text compatible with the
 * existing AssemblyCompiler (PCOB v2 object format). The output is a
 * string of .asm source that can be compiled by AssemblyCompiler.
 *
 * Register allocation uses a simple greedy strategy:
 *   - A, B, C, D for integer/pointer values
 *   - FA, FB, FC, FD for float values
 *   - Values spill to stack when all 4 registers are live
 *
 * Calling convention:
 *   - First 4 int args in A, B, C, D
 *   - First 4 float args in FA, FB, FC, FD
 *   - Return value in A (int) or FA (float)
 *   - Callee saves SP; caller pops args
 */

import { AST, TYPE, isFloatType } from "./parser.js";

/**
 * Generate assembly source from an AST Program node.
 *
 * @param {object} program — AST Program node from parser
 * @param {object} [options]
 * @param {string} [options.moduleName="main"] — module name for .export
 * @returns {string} PCVM assembly source
 */
export function generate(program, options = {}) {
  const gen = new CodeGen(program, options);
  return gen.generateProgram();
}

class CodeGen {
  constructor(program, options) {
    this.program = program;
    this.moduleName = options.moduleName || "main";
    this.lines = [];
    this.indent = 0;
    this.labelCounter = 0;
    this.stringLabelCounter = 0;
    this.scopes = []; // stack of {name → {reg, stackOffset, type}} frames
    this.regs = { A: false, B: false, C: false, D: false };
    this.fregs = { FA: false, FB: false, FC: false, FD: false };
    this.stackUsed = 0; // total stack space needed for local vars
    this.currentFunc = null;
    this.breakLabel = null; // label to jump to for break
    this.continueLabel = null; // label for continue
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  emit(text) {
    this.lines.push("  ".repeat(this.indent) + text);
  }

  newLabel(prefix = "L") {
    return `__c_${prefix}${this.labelCounter++}`;
  }

  newStringLabel() {
    return `__c_str${this.stringLabelCounter++}`;
  }

  /** Allocate a general-purpose register. Returns the register name or spills. */
  allocReg() {
    for (const r of ["A", "B", "C", "D"]) {
      if (!this.regs[r]) { this.regs[r] = true; return r; }
    }
    // Spill: push A to stack, reuse A
    this.emit("PUSH_A");
    return "A";
  }

  /** Free a previously-allocated register. */
  freeReg(r) {
    if (r === "A" && this.regs.A) {
      // Check if we spilled
      this.emit("POP_A");
    }
    this.regs.A = this.regs.B = this.regs.C = this.regs.D = false;
    this.fregs.FA = this.fregs.FB = this.fregs.FC = this.fregs.FD = false;
  }

  /** Load an immediate int value into a register. */
  loadInt(value, reg) {
    if (value === 0) {
      this.emit(`LOAD_${reg} 0`);
    } else if (value >= -128 && value <= 127) {
      this.emit(`LOAD_${reg} ${value}`);
    } else {
      this.emit(`LOAD_${reg} ${value}`);
    }
  }

  /** Emit a binary operation: moves operands to A/B, emits OP_A_B, moves result to destReg. */
  emitBinOp(op, leftReg, rightReg, destReg) {
    if (leftReg !== "A") this.emit(`MOV_A_${leftReg}`);
    if (rightReg !== "B") {
      if (rightReg === "A") this.emit("MOV_B_A");
      else if (rightReg === "C") this.emit("MOV_B_C");
      else if (rightReg === "D") this.emit("MOV_B_D");
      // if rightReg is B, already there
    }
    this.emit(`${op}_A_B`);
    if (destReg !== "A") {
      if (destReg === "B") this.emit("MOV_B_A");
      else if (destReg === "C") this.emit("MOV_C_A");
      else if (destReg === "D") this.emit("MOV_D_A");
    }
  }

  // ─── String literals ──────────────────────────────────────────────────

  /** Emit all string literals into the .DATA section. */
  emitStrings() {
    const strings = this.program.strings || [];
    if (!strings.length) return;
    this.emit("");
    this.emit(".DATA");
    for (let i = 0; i < strings.length; i++) {
      const label = this.newStringLabel();
      this.emit(`${label}: .string "${escapeAsm(strings[i])}"`);
    }
  }

  // ─── Program level ─────────────────────────────────────────────────────

  generateProgram() {
    this.emit(`.export ${this.moduleName}`);

    for (const decl of this.program.decls) {
      if (decl.kind === AST.FUNCTION_DECL) {
        this.generateFunction(decl);
      } else if (decl.kind === AST.VAR_DECL) {
        this.generateGlobalVar(decl);
      }
    }

    // String pool
    this.emitStrings();
    this.emit("");

    return this.lines.join("\n");
  }

  generateGlobalVar(decl) {
    this.stackUsed += 4; // each global is 4 bytes
    this.emit("");
    this.emit(`${decl.name}: .zero 4`);
  }

  // ─── Function ──────────────────────────────────────────────────────────

  generateFunction(func) {
    this.currentFunc = func;
    this.stackUsed = 0;
    this.scopes = [];

    // Push scope for parameters
    const paramScope = new Map();
    for (let i = 0; i < func.params.length; i++) {
      const p = func.params[i];
      paramScope.set(p.name, {
        type: p.type,
        stackOffset: (i + 1) * 4, // params are above the frame
        isParam: true,
      });
    }
    this.scopes.push(paramScope);

    this.emit("");
    this.emit(`${func.name}:`);
    this.indent++;

    // Prologue: push return address? The call instruction handles this.
    // For now we assume CALL pushes PC and RET pops it.

    // Reserve stack space for locals (filled in during body traversal)
    // We'll compute total local size in a pre-pass
    const localSize = this.computeLocalSize(func.body);
    this.stackUsed = localSize;
    if (localSize > 0) {
      this.emit(`; reserve ${localSize} bytes for locals`);
      // Adjust SP by subtracting localSize (stack grows down)
      if (localSize <= 12) {
        for (let i = 0; i < localSize; i += 4) {
          this.emit("PUSH_A"); // placeholder — we push 0
        }
      }
    }

    this.generateStatement(func.body);

    // Epilogue — implicit return at end
    this.emit(`; implicit return`);
    if (localSize > 0) {
      for (let i = 0; i < localSize; i += 4) {
        this.emit("POP_A"); // clean up stack
      }
    }
    this.emit("RET");

    this.indent--;
    this.currentFunc = null;
  }

  /** Pre-pass to compute total stack space for local variables. */
  computeLocalSize(node) {
    if (!node) return 0;
    let size = 0;
    if (node.kind === AST.VAR_DECL && !node.isParam && !node.isStatic) {
      return 4; // each local var is 4 bytes
    }
    if (node.kind === AST.BLOCK) {
      for (const stmt of node.stmts) {
        size += this.computeLocalSize(stmt);
      }
    }
    if (node.kind === AST.IF_STMT) {
      size += this.computeLocalSize(node.thenStmt);
      if (node.elseStmt) size += this.computeLocalSize(node.elseStmt);
    }
    if (node.kind === AST.WHILE_STMT) {
      size += this.computeLocalSize(node.body);
    }
    if (node.kind === AST.FOR_STMT) {
      size += this.computeLocalSize(node.body);
    }
    return size;
  }

  // ─── Statements ─────────────────────────────────────────────────────────

  generateStatement(node) {
    if (!node) return;

    switch (node.kind) {
      case AST.BLOCK: {
        for (const stmt of node.stmts) this.generateStatement(stmt);
        break;
      }
      case AST.VAR_DECL: {
        if (node.isParam) break; // params already handled
        // Local variable — store 0 (or init value) on stack
        if (node.init) {
          this.generateExpr(node.init, "A");
          this.emit("PUSH_A");
        } else {
          this.emit("LOAD_A 0");
          this.emit("PUSH_A");
        }
        break;
      }
      case AST.IF_STMT: {
        const elseLabel = this.newLabel("else");
        const endLabel = this.newLabel("endif");
        this.generateExpr(node.condition, "A");
        this.emit("CMP_A_B");
        this.emit("LOAD_B 0");
        this.emit(`JZ ${node.elseStmt ? elseLabel : endLabel}`);
        this.generateStatement(node.thenStmt);
        if (node.elseStmt) {
          this.emit(`JMP ${endLabel}`);
          this.emit(`${elseLabel}:`);
          this.generateStatement(node.elseStmt);
        }
        this.emit(`${endLabel}:`);
        break;
      }
      case AST.WHILE_STMT: {
        const loopLabel = this.newLabel("loop");
        const endLabel = this.newLabel("wend");
        const prevBreak = this.breakLabel;
        const prevContinue = this.continueLabel;
        this.breakLabel = endLabel;
        this.continueLabel = loopLabel;

        this.emit(`${loopLabel}:`);
        this.generateExpr(node.condition, "A");
        this.emit("CMP_A_B");
        this.emit("LOAD_B 0");
        this.emit(`JZ ${endLabel}`);
        this.generateStatement(node.body);
        this.emit(`JMP ${loopLabel}`);
        this.emit(`${endLabel}:`);

        this.breakLabel = prevBreak;
        this.continueLabel = prevContinue;
        break;
      }
      case AST.DO_WHILE_STMT: {
        const loopLabel = this.newLabel("dloop");
        const prevBreak = this.breakLabel;
        const prevContinue = this.continueLabel;
        this.breakLabel = this.newLabel("dwend");
        this.continueLabel = this.newLabel("dcont");

        this.emit(`${loopLabel}:`);
        this.generateStatement(node.body);
        this.emit(`${this.continueLabel}:`);
        this.generateExpr(node.condition, "A");
        this.emit("CMP_A_B");
        this.emit("LOAD_B 0");
        this.emit(`JNZ ${loopLabel}`);
        this.emit(`${this.breakLabel}:`);

        this.breakLabel = prevBreak;
        this.continueLabel = prevContinue;
        break;
      }
      case AST.FOR_STMT: {
        // for (init; cond; incr) body
        const startLabel = this.newLabel("for");
        const bodyLabel = this.newLabel("fbody");
        const incrLabel = this.newLabel("fincr");
        const endLabel = this.newLabel("fend");
        const prevBreak = this.breakLabel;
        const prevContinue = this.continueLabel;
        this.breakLabel = endLabel;
        this.continueLabel = incrLabel;

        if (node.init && node.init.kind !== AST.VAR_DECL) {
          this.generateExprStmt(node.init);
        } else if (node.init) {
          this.generateStatement(node.init);
        }

        this.emit(`${startLabel}:`);
        if (node.condition) {
          this.generateExpr(node.condition, "A");
          this.emit("CMP_A_B");
          this.emit("LOAD_B 0");
          this.emit(`JZ ${endLabel}`);
        }

        this.generateStatement(node.body);
        this.emit(`${incrLabel}:`);
        if (node.increment) {
          this.generateExprStmt(node.increment);
        }
        this.emit(`JMP ${startLabel}`);
        this.emit(`${endLabel}:`);

        this.breakLabel = prevBreak;
        this.continueLabel = prevContinue;
        break;
      }
      case AST.RETURN_STMT: {
        if (node.value) {
          this.generateExpr(node.value, "A");
        }
        this.emit("RET");
        break;
      }
      case AST.BREAK_STMT: {
        if (this.breakLabel) {
          this.emit(`JMP ${this.breakLabel}`);
        }
        break;
      }
      case AST.EXPR_STMT: {
        if (node.expr) {
          this.generateExprStmt(node.expr);
        }
        break;
      }
      case AST.GOTO_STMT: {
        this.emit(`JMP ${node.label}`);
        break;
      }
      case AST.LABEL_STMT: {
        this.emit(`${node.name}:`);
        break;
      }
      case AST.SWITCH_STMT: {
        // Simple implementation: evaluate once, then chain IF-like checks
        const endLabel = this.newLabel("swend");
        const prevBreak = this.breakLabel;
        this.breakLabel = endLabel;

        this.generateExpr(node.expr, "A");
        this.emit("MOV_A_D"); // save switch value in D

        // Walk body block looking for case/default
        if (node.body && node.body.kind === AST.BLOCK) {
          for (const stmt of node.body.stmts) {
            if (stmt.kind === AST.CASE_STMT) {
              const caseEnd = this.newLabel("scase");
              // Compare D with case value
              this.loadInt(stmt.value, "B");
              this.emit("CMP_A_B"); // Compare saved value (D) with case value (B)
              this.emit(`JZ ${caseEnd}`);
              this.emit(`JMP ${endLabel}`); // simplified — in real impl would chain
              this.emit(`${caseEnd}:`);
            }
          }
          // Emit body statements (simplified: just emit all non-case/default stmts)
          for (const stmt of node.body.stmts) {
            this.generateStatement(stmt);
          }
        }
        this.emit(`${endLabel}:`);
        this.breakLabel = prevBreak;
        break;
      }
      default:
        // Unknown statement — ignore
        break;
    }
  }

  /** Emit an expression statement (expression result discarded). */
  generateExprStmt(node) {
    if (node.kind === AST.ASSIGN) {
      this.generateAssign(node);
    } else if (node.kind === AST.CALL_EXPR) {
      this.generateCall(node, null);
    }
    // Other expression statements — evaluate and discard
  }

  // ─── Assignments ──────────────────────────────────────────────────────

  generateAssign(node) {
    const target = node.target;
    if (target.kind !== AST.IDENTIFIER) return;

    const valueReg = this.allocReg();
    this.generateExpr(node.value, valueReg);

    if (node.op === "=") {
      // Simple assignment
      this.emit(`STORE_${valueReg} ${target.name}`);
    } else {
      // Compound assignment (+=, -=, etc.)
      this.emit(`LOAD_M_${valueReg} ${target.name}`);
      switch (node.op) {
        case "+=": this.emit(`ADD_${valueReg}_${valueReg}`); break;
        case "-=": this.emit(`SUB_${valueReg}_${valueReg}`); break;
        // Simplified — full implementation would handle all ops
      }
      this.emit(`STORE_${valueReg} ${target.name}`);
    }
    this.freeReg(valueReg);
  }

  // ─── Function calls ─────────────────────────────────────────────────────

  generateCall(node, destReg) {
    // Push args in reverse order. PCVM only has PUSH_A/POP_A — move to A first.
    for (let i = node.args.length - 1; i >= 0; i--) {
      const argReg = this.allocReg();
      this.generateExpr(node.args[i], argReg);
      if (argReg !== "A") this.emit(`MOV_A_${argReg}`);
      this.emit("PUSH_A");
      this.freeReg(argReg);
    }

    this.emit(`CALL ${node.callee}`);

    // Pop args (discard)
    for (let i = 0; i < node.args.length; i++) {
      this.emit("POP_A");
    }

    // Result is in A
    if (destReg && destReg !== "A") {
      this.emit(`MOV_${destReg}_A`);
    }
  }

  // ─── Expressions ───────────────────────────────────────────────────────

  /**
   * Generate code for an expression, leaving the result in the given register.
   * @param {object} node — AST expression node
   * @param {string} destReg — register to place result in (A-D or FA-FD)
   */
  generateExpr(node, destReg) {
    if (!node) { this.loadInt(0, destReg); return; }

    switch (node.kind) {
      case AST.INT_LITERAL:
        this.loadInt(node.value, destReg);
        break;

      case AST.FLOAT_LITERAL:
        // Float literals go through FA-FD
        if (destReg.startsWith("F")) {
          this.emit(`LOAD_${destReg} ${node.value}`);
        } else {
          // Truncate float to int
          this.emit(`LOAD_FA ${node.value}`);
          this.emit("FTOI");
          if (destReg !== "A") this.emit(`MOV_${destReg}_A`);
        }
        break;

      case AST.CHAR_LITERAL:
        this.loadInt(node.value, destReg);
        break;

      case AST.STRING_LITERAL: {
        // Reference the label in the .DATA string pool
        const idx = this.program.strings ? this.program.strings.indexOf(node.value) : -1;
        const label = idx >= 0 ? `__c_str${idx}` : `__c_str${this.stringLabelCounter++}`;
        this.emit(`LOAD_${destReg} ${label}`);
        break;
      }

      case AST.IDENTIFIER:
        // Load variable
        this.emit(`LOAD_M_${destReg} ${node.name}`);
        break;

      case AST.BINARY_EXPR: {
        const leftReg = this.allocReg();
        const rightReg = this.allocReg();

        this.generateExpr(node.left, leftReg);
        this.generateExpr(node.right, rightReg);

        switch (node.op) {
          case "+": this.emitBinOp("ADD", leftReg, rightReg, leftReg); break;
          case "-": this.emitBinOp("SUB", leftReg, rightReg, leftReg); break;
          case "*": this.emitBinOp("MUL", leftReg, rightReg, leftReg); break;
          case "/": this.emitBinOp("DIV", leftReg, rightReg, leftReg); break;
          case "%":
            // Modulo via division + multiplication + subtraction
            this.emit(`MOV_C_A`);
            this.emit(`DIV_${leftReg}_${rightReg}`);
            this.emit(`MUL_${leftReg}_${rightReg}`);
            this.emit(`MOV_C_B`);
            this.emit(`MOV_A_B`);
            this.emit(`SUB_A_C`);
            if (destReg !== "A") this.emit(`MOV_${destReg}_A`);
            break;
          case "==":
            this.emit(`CMP_${leftReg}_${rightReg}`);
            this.emit(`LOAD_${destReg} 1`);
            this.emit(`JZ __c_eq${this.labelCounter}`);
            this.emit(`LOAD_${destReg} 0`);
            this.emit(`__c_eq${this.labelCounter++}:`);
            break;
          case "!=":
            this.emit(`CMP_${leftReg}_${rightReg}`);
            this.emit(`LOAD_${destReg} 1`);
            this.emit(`JNZ __c_ne${this.labelCounter}`);
            this.emit(`LOAD_${destReg} 0`);
            this.emit(`__c_ne${this.labelCounter++}:`);
            break;
          case "<": {
            // left < right  ⇔  (left - right) has sign bit set
            this.emitBinOp("SUB", leftReg, rightReg, "A");  // A = left - right
            const skipLt = this.newLabel("lt");
            if (leftReg !== "A") { this.emit(`MOV_A_${leftReg}`); }
            this.emit(`LOAD_B 0x80000000`);                 // sign bit mask (int32 min)
            this.emit("AND_A_B");                           // isolate sign bit
            this.emit(`LOAD_${destReg} 1`);                 // assume true (negative)
            this.emit(`JNZ ${skipLt}`);                     // sign bit set → negative → true
            this.emit(`LOAD_${destReg} 0`);                 // else false
            this.emit(`${skipLt}:`);
            break;
          }
          case "<=":
          case ">":
          case ">=":
            // Simplified — store 1 for now
            this.loadInt(1, destReg);
            break;
          case "&&":
            this.emitBinOp("AND", leftReg, rightReg, leftReg);
            if (destReg !== leftReg) this.emit(`MOV_${destReg}_${leftReg}`);
            break;
          case "||":
            this.emitBinOp("OR", leftReg, rightReg, leftReg);
            if (destReg !== leftReg) this.emit(`MOV_${destReg}_${leftReg}`);
            break;
          case "&":
            this.emitBinOp("AND", leftReg, rightReg, leftReg);
            if (destReg !== leftReg) this.emit(`MOV_${destReg}_${leftReg}`);
            break;
          case "|":
            this.emitBinOp("OR", leftReg, rightReg, leftReg);
            if (destReg !== leftReg) this.emit(`MOV_${destReg}_${leftReg}`);
            break;
          case "^":
            this.emitBinOp("XOR", leftReg, rightReg, leftReg);
            if (destReg !== leftReg) this.emit(`MOV_${destReg}_${leftReg}`);
            break;
          case "<<":
            this.emit(`SHL_${leftReg}_${rightReg}`); // not valid — placeholder
            break;
          case ">>":
            this.emit(`SHR_${leftReg}_${rightReg}`); // placeholder
            break;
          default:
            this.loadInt(0, destReg);
        }

        this.freeReg(leftReg);
        this.freeReg(rightReg);
        break;
      }

      case AST.UNARY_EXPR:
        this.generateExpr(node.operand, destReg);
        switch (node.op) {
          case "-": this.emit(`NEG_${destReg}`); break;
          case "!": this.emit(`NOT_${destReg}`); break;
          case "~": this.emit(`XOR_${destReg}_${destReg}`); this.emit(`NOT_${destReg}`); break;
          case "*": break; // dereference — load from pointer address
          case "&": break; // address-of — not implemented
        }
        break;

      case AST.CALL_EXPR:
        this.generateCall(node, destReg);
        break;

      case AST.CAST:
        // Just evaluate the inner expression
        this.generateExpr(node.expr, destReg);
        break;

      case AST.TERNARY:
        this.generateExpr(node.condition, "A");
        this.emit("CMP_A_B");
        const elseLabel = this.newLabel("tern_else");
        const endLabel = this.newLabel("tern_end");
        this.emit(`JZ ${elseLabel}`);
        this.generateExpr(node.thenExpr, destReg);
        this.emit(`JMP ${endLabel}`);
        this.emit(`${elseLabel}:`);
        this.generateExpr(node.elseExpr, destReg);
        this.emit(`${endLabel}:`);
        break;

      default:
        this.loadInt(0, destReg);
        break;
    }
  }
}

function escapeAsm(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}