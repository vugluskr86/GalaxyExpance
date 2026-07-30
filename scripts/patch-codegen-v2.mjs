import { readFileSync, writeFileSync } from "fs";
const file = "src/compiler/codegen.js";
let code = readFileSync(file, "utf-8");

// Fix 1: STRING_LITERAL — replace with label-index-based reference
code = code.replace(
  /( {6}case AST\.STRING_LITERAL:\n {8}\/\/ Load address of string constant\n {8})this\.emit\(`LOAD_\$\{destReg\} \$\{node\.value\}`\);\n( {8}break;)/,
  `$1const idx = this.program.strings ? this.program.strings.indexOf(node.value) : -1;\n        const label = idx >= 0 ? \`__c_str\${idx}\` : \`__c_str\${this.stringLabelCounter++}\`;\n        this.emit(\`LOAD_\${destReg} \${label}\`);\n$2`
);

// Fix 2: emitStrings — use __c_str{i}
code = code.replace(
  /const label = this\.newStringLabel\(\);\n {6}this\.emit\(`\$\{label\}: \.string "\$\{escapeAsm\(strings\[i\]\)\}"`\);/,
  `this.emit(\`__c_str\${i}: .string "\${escapeAsm(strings[i])}"\`);`
);

writeFileSync(file, code, "utf-8");
console.log("OK: patched codegen.js v2");