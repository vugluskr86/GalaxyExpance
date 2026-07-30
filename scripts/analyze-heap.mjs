#!/usr/bin/env node
/**
 * Chrome Sampling Heap Profiler analyzer.
 *
 * Input: .heapprofile file exported from Chrome DevTools → Memory →
 *        Allocation sampling → Save.
 *
 * Output: top functions by total allocated memory (selfSize + children).
 *         Groups by script URL, filters V8/system noise.
 *
 * Usage:
 *   node scripts/analyze-heap.mjs <file.heapprofile> [--top N] [--min-kb K]
 *   node scripts/analyze-heap.mjs <file.heapprofile> --by-file
 *   node scripts/analyze-heap.mjs <file.heapprofile> --path <src/compiler/planet>
 */

import { readFileSync } from "fs";

function parseArgs(args) {
  const opts = { file: null, top: 30, minKb: 10, byFile: false, path: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--top") opts.top = parseInt(args[++i], 10) || 30;
    else if (arg === "--min-kb") opts.minKb = parseFloat(args[++i]) || 10;
    else if (arg === "--by-file") opts.byFile = true;
    else if (arg === "--path") opts.path = args[++i];
    else if (!opts.file && !arg.startsWith("--")) opts.file = arg;
  }
  return opts;
}

function loadProfile(filepath) {
  console.error(`Loading ${filepath}...`);
  const raw = readFileSync(filepath, "utf-8");
  console.error(`Parsing JSON (${(raw.length / 1024 / 1024).toFixed(1)} MB)...`);
  return JSON.parse(raw);
}

/**
 * Walk the tree and collect stats per function.
 * Returns a Map: key = "functionName @ url:line" → { selfBytes, totalBytes, count }
 */
function collectStats(root) {
  const stats = new Map();

  function walk(node, depth) {
    if (!node) return 0;

    const cf = node.callFrame || {};
    const name = cf.functionName || "(anonymous)";
    const url = simplifyUrl(cf.url || "");
    const line = cf.lineNumber > 0 ? cf.lineNumber : "";
    const key = `${name} @ ${url}${line ? ":" + line : ""}`;

    const selfSize = node.selfSize || 0;
    let childTotal = 0;
    if (node.children) {
      for (const child of node.children) {
        childTotal += walk(child, depth + 1);
      }
    }
    const totalSize = selfSize + childTotal;

    if (totalSize > 0) {
      const entry = stats.get(key) || { selfBytes: 0, totalBytes: 0, count: 0 };
      entry.selfBytes += selfSize;
      entry.totalBytes += totalSize;
      entry.count++;
      stats.set(key, entry);
    }

    return totalSize;
  }

  walk(root, 0);
  return stats;
}

/**
 * Aggregate by source file.
 */
function byFile(stats) {
  const files = new Map();
  for (const [key, s] of stats) {
    const url = key.split(" @ ")[1] || "?";
    const f = files.get(url) || { selfBytes: 0, totalBytes: 0, count: 0, topFuncs: [] };
    f.selfBytes += s.selfBytes;
    f.totalBytes += s.totalBytes;
    f.count += s.count;
    // Keep top 3 functions per file
    f.topFuncs.push({ name: key.split(" @ ")[0], totalBytes: s.totalBytes });
    f.topFuncs.sort((a, b) => b.totalBytes - a.totalBytes);
    if (f.topFuncs.length > 5) f.topFuncs = f.topFuncs.slice(0, 5);
    files.set(url, f);
  }
  return files;
}

function simplifyUrl(url) {
  if (!url || url === "") return "(native)";
  // Keep only relative paths
  const idx = url.indexOf("/src/");
  if (idx >= 0) return url.slice(idx);
  const idx2 = url.indexOf("/libc/");
  if (idx2 >= 0) return url.slice(idx2);
  const idx3 = url.indexOf("/system/");
  if (idx3 >= 0) return url.slice(idx3);
  // Remove query strings
  const q = url.indexOf("?");
  if (q >= 0) return url.slice(0, q);
  if (url.startsWith("http://")) return url.slice(url.indexOf("/", 8));
  return url;
}

function fmtBytes(b) {
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + " MB";
  if (b >= 1024) return (b / 1024).toFixed(0) + " KB";
  return b + " B";
}

function fmtPct(part, total) {
  if (total <= 0) return "   —";
  return ((part / total) * 100).toFixed(1).padStart(5) + "%";
}

// ─── Main ──────────────────────────────────────────────────────────────────

const opts = parseArgs(process.argv.slice(2));
if (!opts.file) {
  console.log("Usage: node scripts/analyze-heap.mjs <file.heapprofile> [--top N] [--min-kb K] [--by-file] [--path <substr>]");
  process.exit(1);
}

const profile = loadProfile(opts.file);
const root = profile.head;
if (!root) { console.error("Invalid profile: no 'head' node"); process.exit(1); }

const stats = collectStats(root);

// Filter
const minBytes = opts.minKb * 1024;
let entries = [...stats.entries()].filter(([, s]) => s.totalBytes >= minBytes);

// Skip noise
const skipPrefixes = [
  "(root)", "(program)", "(idle)", "(garbage collector)",
  "v8::", "Builtins_", "Builtin_", "Stub_", "CEntry",
  "Array", "_Array", "String", "_String", "JSON",
];
entries = entries.filter(([key]) => !skipPrefixes.some(p => key.startsWith(p)));

// Path filter
if (opts.path) {
  entries = entries.filter(([key]) => key.toLowerCase().includes(opts.path.toLowerCase()));
  console.log(`Filtered to path "${opts.path}": ${entries.length} entries\n`);
}

if (opts.byFile) {
  // ── By file ──
  const files = byFile(stats);
  let fileEntries = [...files.entries()].filter(([, s]) => s.totalBytes >= minBytes);
  fileEntries.sort((a, b) => b[1].totalBytes - a[1].totalBytes);

  const grandTotal = fileEntries.reduce((s, [, v]) => s + v.totalBytes, 0);
  console.log(`Top files by total allocated memory:\n`);
  console.log("  Total        Self       Funcs   Top functions in file");
  console.log("  ───────────  ─────────  ──────  ──────────────────────");
  for (const [url, s] of fileEntries.slice(0, opts.top)) {
    const topNames = s.topFuncs.slice(0, 3).map(f => `${f.name}(${fmtBytes(f.totalBytes)})`).join(", ");
    console.log(
      `  ${fmtBytes(s.totalBytes).padStart(11)}  ${fmtBytes(s.selfBytes).padStart(9)}  ${String(s.count).padStart(6)}  ${url}\n` +
      `                                              ${topNames}`
    );
  }
  console.log(`\n  Grand total: ${fmtBytes(grandTotal)} across ${fileEntries.length} files`);
} else {
  // ── By function ──
  entries.sort((a, b) => b[1].totalBytes - a[1].totalBytes);

  // Calculate grand total for percentages
  const grandTotal = entries.reduce((s, [, v]) => s + v.totalBytes, 0);

  console.log(`Top ${opts.top} functions by total allocated memory (min ${opts.minKb}KB):\n`);
  console.log("  Total        Self       Calls   %Total  Function");
  console.log("  ───────────  ─────────  ──────  ──────  ────────");

  for (const [key, s] of entries.slice(0, opts.top)) {
    console.log(
      `  ${fmtBytes(s.totalBytes).padStart(11)}  ${fmtBytes(s.selfBytes).padStart(9)}  ${String(s.count).padStart(6)}  ${fmtPct(s.totalBytes, grandTotal)}  ${key}`
    );
  }

  console.log(`\n  Grand total: ${fmtBytes(grandTotal)} across ${entries.length} functions`);
}

// Quick analysis
console.log("\n  ── Quick analysis ──");
const renderEntries = entries.filter(([k]) => k.includes("/src/gen/planet") || k.includes("render"));
const starEntries = entries.filter(([k]) => k.includes("star") || k.includes("/src/gen/star"));
const canvasEntries = entries.filter(([k]) => k.includes("canvas") || k.includes("Canvas") || k.includes("ImageData"));
const saveEntries = entries.filter(([k]) => k.includes("save") || k.includes("capture") || k.includes("persist"));

if (renderEntries.length > 0) {
  const total = renderEntries.reduce((s, [, v]) => s + v.totalBytes, 0);
  console.log(`  Planet rendering:   ${fmtBytes(total)} in ${renderEntries.length} functions`);
  for (const [k, s] of renderEntries.slice(0, 5)) console.log(`    ${fmtBytes(s.totalBytes).padStart(9)}  ${k}`);
}
if (starEntries.length > 0) {
  const total = starEntries.reduce((s, [, v]) => s + v.totalBytes, 0);
  console.log(`  Star rendering:     ${fmtBytes(total)} in ${starEntries.length} functions`);
}
if (canvasEntries.length > 0) {
  const total = canvasEntries.reduce((s, [, v]) => s + v.totalBytes, 0);
  console.log(`  Canvas/ImageData:   ${fmtBytes(total)} in ${canvasEntries.length} functions`);
  for (const [k, s] of canvasEntries.slice(0, 5)) console.log(`    ${fmtBytes(s.totalBytes).padStart(9)}  ${k}`);
}
if (saveEntries.length > 0) {
  const total = saveEntries.reduce((s, [, v]) => s + v.totalBytes, 0);
  console.log(`  Savegame:           ${fmtBytes(total)} in ${saveEntries.length} functions`);
}