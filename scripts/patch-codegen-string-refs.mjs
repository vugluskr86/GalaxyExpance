import { readFileSync, writeFileSync } from "fs";
const file = "src/compiler/codegen.js";
let code = readFileSync(file, "utf-8");

// Fix 1: STRING_LITERAL — use label index, not raw string content
code = code.replace(
  /(      case AST\.STRING_LITERAL:\n        \/\/ Load address of string constant\n)        this\.emit\(`LOAD_\$\{destReg\} \$\{node\.value\}`\);\n(        break;)/s,
  `$1        const idx = this.program.strings ? this.program.strings.indexOf(node.value) : -1;\n        const label = idx >= 0 ? \`__c_str\${idx}\` : \`__c_str\${this.stringLabelCounter++}\`;\n        this.emit(\`LOAD_\${destReg} \${label}\`);\n$2`
);
// Note: uses two separate replaces to avoid complex regex

// Simpler approach
code = code.replace(
  "      case AST.STRING_LITERAL:\n        // Load address of string constant\n        this.emit(`LOAD_${destReg} ${node.value}`);\n        break;",
  "      case AST.STRING_LITERAL: {\n        const idx = this.program.strings ? this.program.strings.indexOf(node.value) : -1;\n        const label = idx >= 0 ? `__c_str${idx}` : `__c_str${this.stringLabelCounter++}`;\n        this.emit(`LOAD_${destReg} ${label}`);\n        break;\n      }"
);

// Fix 2: emitStrings — use __c_str{i}, not newStringLabel()
code = code.replace(
  "      const label = this.newStringLabel();\n      this.emit(`${label}: .string \"${escapeAsm(strings[i])}\"`);",
  "      this.emit(`__c_str${i}: .string \"${escapeAsm(strings[i])}\"`);"
);

writeFileSync(file, code, "utf-8");
console.log("OK: patched codegen.js — STRING_LITERAL → label ref, emitStrings → __c_str{i}");