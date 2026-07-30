#!/usr/bin/env node
/**
 * PCVM C Compiler CLI driver.
 *
 * Usage:
 *   node scripts/compile-c.mjs source.c [-o output.asm] [-I include_dir] [--lib]
 *
 * Pipeline: C source → preprocessor → lexer → parser → codegen → AssemblyCompiler → .obj
 *
 * When --lib is passed the output is a library object without a main entry point.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { preprocess } from "../src/compiler/preprocessor.js";
import { lex, TokenStream } from "../src/compiler/lexer.js";
import { Parser } from "../src/compiler/parser.js";
import { generate } from "../src/compiler/codegen.js";
import { AssemblyCompiler } from "../src/game/toolchain.js";

function parseArgs(args) {
  const options = { input: null, output: null, includes: [], lib: false, help: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-o" && args[i + 1]) {
      options.output = args[++i];
    } else if (arg === "-I" && args[i + 1]) {
      options.includes.push(args[++i]);
    } else if (arg === "--lib") {
      options.lib = true;
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (!arg.startsWith("-") && !options.input) {
      options.input = arg;
    }
  }

  return options;
}

function main() {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  if (opts.help || !opts.input) {
    console.log("PCVM C Compiler v1.0");
    console.log("");
    console.log("Usage: node scripts/compile-c.mjs source.c [-o output.asm] [-I dir] [--lib]");
    console.log("");
    console.log("Options:");
    console.log("  -o FILE      Output assembly file (default: source.asm)");
    console.log("  -I DIR       Add include directory (repeatable)");
    console.log("  --lib        Compile as library (no main entry point)");
    console.log("  -h, --help   Show this help");
    process.exit(0);
  }

  const sourceDir = dirname(resolve(opts.input));
  const systemDirs = [
    resolve("libc/include"),
    resolve("system/unix/include"),
    ...opts.includes,
  ];

  // Make sure system include dirs exist (for in-game use they may not)
  const validSystemDirs = systemDirs.filter(dir => existsSync(dir));

  console.log(`Compiling ${opts.input}...`);

  // 1. Read source
  const source = readFileSync(opts.input, "utf-8");

  // 2. Preprocess
  console.log("  Preprocessing...");
  const preprocessed = preprocess(source, {
    sourceDir,
    systemDirs: validSystemDirs,
  });

  // 3. Lex
  console.log("  Lexing...");
  const tokens = lex(preprocessed);
  const stream = new TokenStream(tokens);

  // 4. Parse
  console.log("  Parsing...");
  const parser = new Parser(stream);
  const ast = parser.parseProgram();

  // 5. Codegen → assembly text
  console.log("  Generating assembly...");
  const asmSource = generate(ast, { moduleName: opts.lib ? "lib" : "main" });

  // 6. Write .asm
  const asmPath = opts.output || opts.input.replace(/\.c$/i, ".asm");
  writeFileSync(asmPath, asmSource, "utf-8");
  console.log(`  Assembly written to ${asmPath}`);

  // 7. Assemble to .obj
  console.log("  Assembling...");
  const assembler = new AssemblyCompiler();
  try {
    const objBinary = assembler.compile(asmSource, asmPath);
    const objPath = asmPath.replace(/\.asm$/i, ".obj");
    writeFileSync(objPath, JSON.stringify(objBinary), "utf-8");
    console.log(`  Object written to ${objPath}`);
  } catch (e) {
    console.error(`  Assembly error: ${e.message}`);
    console.log(`  Assembly source kept at ${asmPath} for debugging`);
    process.exit(1);
  }

  console.log("Done.");
}

main();