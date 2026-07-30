/**
 * C89 subset preprocessor for PCVM C compiler.
 *
 * Handles:
 *   #define NAME value        — simple object-like macros (no parameters)
 *   #include "file"           — local include (relative to source file)
 *   #include <file>           — system include (/usr/include)
 *   #ifdef / #ifndef          — conditional compilation
 *   #else / #endif
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";

/**
 * Strip C-style comments from source. String/char literals are left untouched.
 * @param {string} source
 * @returns {string}
 */
function stripComments(source) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    if (source[i] === '"') {
      out += source[i++];
      while (i < source.length && source[i] !== '"') {
        if (source[i] === "\\") out += source[i++] + (source[i] || "");
        else out += source[i];
        i++;
      }
      if (i < source.length) out += source[i++];
      continue;
    }
    if (source[i] === "'") {
      out += source[i++];
      if (source[i] === "\\") out += source[i++] + (source[i] || "");
      else if (i < source.length) out += source[i];
      i++;
      if (i < source.length) out += source[i++];
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      if (i < source.length) out += source[i++];
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += source[i++];
  }
  return out;
}

/**
 * Read an included file, searching local then system paths.
 * @param {string} includePath
 * @param {string} sourceDir
 * @param {string[]} systemDirs
 * @returns {{source: string, path: string}}
 */
function resolveInclude(includePath, sourceDir, systemDirs = []) {
  if (includePath.startsWith('"')) {
    const clean = includePath.replace(/^"|"$/g, "");
    const local = resolve(sourceDir, clean);
    if (existsSync(local)) return { source: readFileSync(local, "utf-8"), path: local };
    throw new Error(`Preprocessor: cannot find include "${clean}"`);
  }
  if (includePath.startsWith("<")) {
    const clean = includePath.replace(/^<|>$/g, "");
    for (const dir of systemDirs) {
      const sys = resolve(dir, clean);
      if (existsSync(sys)) return { source: readFileSync(sys, "utf-8"), path: sys };
    }
    throw new Error(`Preprocessor: cannot find include <${clean}>`);
  }
  throw new Error(`Preprocessor: malformed #include: ${includePath}`);
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/**
 * Expand macros in a line of source text.
 * @param {string} text
 * @param {Map<string, string>} macros — name → body
 * @param {Set<string>} expanding — cycle guard
 * @returns {string}
 */
function expandMacros(text, macros, expanding = new Set()) {
  let result = text;
  for (const [name, body] of macros) {
    if (expanding.has(name)) continue;
    const re = new RegExp(`\\b${escapeRegex(name)}\\b`, "g");
    const expanded = result.replace(re, body);
    if (expanded !== result) {
      const next = new Set(expanding);
      next.add(name);
      result = expandMacros(expanded, macros, next);
    }
  }
  return result;
}

/**
 * Preprocess a single source string, returning the expanded source.
 *
 * @param {string} source — raw C source
 * @param {object} options
 * @param {string} options.sourceDir — directory of the source file (for #include "...")
 * @param {string[]} [options.systemDirs] — system include directories
 * @param {Map<string, string>} [options.defines] — predefined macros
 * @param {boolean} [options.recursive] — internal flag, don't set
 * @returns {string}
 */
export function preprocess(source, options = {}) {
  const { sourceDir = ".", systemDirs = [], defines = new Map(), recursive = false } = options;
  const macros = new Map(defines);
  const lines = stripComments(source).split("\n");
  const output = [];
  let skipToEndif = 0; // nesting depth while skipping due to #ifdef/#ifndef
  const skipStack = []; // what condition caused each skip level

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Preprocessor directives
    if (trimmed.startsWith("#")) {
      const parts = trimmed.slice(1).trim().split(/\s+/);
      const directive = parts[0];

      if (directive === "define") {
        if (skipToEndif > 0) continue;
        const rest = trimmed.slice(directive.length + 1).trim();
        const match = rest.match(/^(\w+)\s*(.*)$/);
        if (match) macros.set(match[1], (match[2] || "").trim());
        continue;
      }

      if (directive === "ifdef") {
        const name = parts[1];
        const condition = macros.has(name);
        if (skipToEndif > 0 || !condition) {
          skipToEndif++;
          skipStack.push("ifdef");
        }
        continue;
      }

      if (directive === "ifndef") {
        const name = parts[1];
        const condition = macros.has(name);
        if (skipToEndif > 0 || condition) {
          skipToEndif++;
          skipStack.push("ifndef");
        }
        continue;
      }

      if (directive === "else") {
        if (skipStack.length > 0 && skipToEndif > 0) {
          // Toggle: if we were skipping, stop; if we weren't, start
          if (skipToEndif === 1) {
            skipToEndif = 0;
          }
        }
        continue;
      }

      if (directive === "endif") {
        if (skipToEndif > 0) {
          skipToEndif--;
          if (skipStack.length > 0) skipStack.pop();
        }
        continue;
      }

      if (directive === "include") {
        if (skipToEndif > 0) continue;
        const includePath = trimmed.slice(directive.length + 1).trim();
        const included = resolveInclude(includePath, sourceDir, systemDirs);
        const expanded = preprocess(included.source, {
          ...options,
          sourceDir: dirname(included.path),
          recursive: true,
          defines: macros,
        });
        output.push(expanded);
        continue;
      }

      // Unknown directive — treat as a comment (or error in strict mode)
      continue;
    }

    // Skip lines inside a false #ifdef/#ifndef block
    if (skipToEndif > 0) continue;

    // Expand macros and emit
    const expanded = expandMacros(rawLine, macros);
    output.push(expanded);
  }

  return output.join("\n");
}