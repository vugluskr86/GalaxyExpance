#!/usr/bin/env node
/**
 * Compare two Chrome heap snapshots (.heapsnapshot).
 *
 * Groups objects by constructor name or type, shows size delta and
 * what objects appeared or disappeared between snapshots.
 *
 * Usage:
 *   node scripts/diff-heap-snapshots.mjs <snapshot1.heapsnapshot> <snapshot2.heapsnapshot> [--top N] [--min-delta KB]
 */

import { readFileSync } from "fs";

function parseArgs(args) {
  const opts = { s1: null, s2: null, top: 40, minDeltaKb: 4 };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--top") opts.top = parseInt(args[++i], 10) || 40;
    else if (arg === "--min-delta") opts.minDeltaKb = parseFloat(args[++i]) || 4;
    else if (!opts.s1) opts.s1 = arg;
    else if (!opts.s2) opts.s2 = arg;
  }
  return opts;
}

function loadSnapshot(filepath) {
  console.error(`Loading ${filepath}...`);
  const raw = readFileSync(filepath, "utf-8");
  const sizeMB = (raw.length / 1024 / 1024).toFixed(1);
  console.error(`Parsing JSON (${sizeMB} MB)...`);
  return JSON.parse(raw);
}

/**
 * Extract object summary from a snapshot: name → { count, totalSize, sizes[] }
 *
 * Uses the snapshot's own type enums for readability:
 *   node_types[0] = hidden, array, string, object, code, closure, regexp,
 *                    number, native, synthetic, concatenated string,
 *                    sliced string, symbol, bigint, object shape
 */
function summarize(snapshot) {
  const meta = snapshot.snapshot.meta;
  const nodeFields = meta.node_fields;   // ["type","name","id","self_size","edge_count","detachedness"]
  const nodeTypes = meta.node_types[0]; // type index → label string
  const nodes = snapshot.nodes;
  const strings = snapshot.strings;

  const FIELD_COUNT = nodeFields.length;
  const FI_TYPE = nodeFields.indexOf("type");
  const FI_NAME = nodeFields.indexOf("name");
  const FI_SELF_SIZE = nodeFields.indexOf("self_size");
  const FI_DETACHED = nodeFields.indexOf("detachedness");

  const summary = new Map(); // key → { count, totalSize, detachedCount, detachedSize }
  let totalObjects = 0, totalSize = 0;

  for (let i = 0; i < nodes.length; i += FIELD_COUNT) {
    const typeIdx = nodes[i + FI_TYPE];
    const nameIdx = nodes[i + FI_NAME];
    const selfSize = nodes[i + FI_SELF_SIZE] || 0;
    const detached = FI_DETACHED >= 0 ? nodes[i + FI_DETACHED] : 0;

    const typeLabel = nodeTypes[typeIdx] || `type_${typeIdx}`;
    const name = strings[nameIdx] || "(unnamed)";

    // Use constructor name for objects; type label for primitives
    const key = typeLabel === "object" || typeLabel === "array"
      ? `${typeLabel} ${name}`
      : typeLabel;

    const entry = summary.get(key) || { count: 0, totalSize: 0, detachedCount: 0, detachedSize: 0 };
    entry.count++;
    entry.totalSize += selfSize;
    if (detached > 0) {
      entry.detachedCount++;
      entry.detachedSize += selfSize;
    }
    totalObjects++;
    totalSize += selfSize;
    summary.set(key, entry);
  }

  return { summary, totalObjects, totalSize };
}

function fmtBytes(b) {
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + " MB";
  if (b >= 1024) return (b / 1024).toFixed(0) + " KB";
  return b + " B";
}

// ─── Main ──────────────────────────────────────────────────────────────────

const opts = parseArgs(process.argv.slice(2));
if (!opts.s1 || !opts.s2) {
  console.log("Usage: node scripts/diff-heap-snapshots.mjs <snap1.heapsnapshot> <snap2.heapsnapshot> [--top N] [--min-delta KB]");
  process.exit(1);
}

const s1 = loadSnapshot(opts.s1);
const s2 = loadSnapshot(opts.s2);

console.error("Analyzing snapshot 1...");
const r1 = summarize(s1);
console.error(`  ${r1.totalObjects} objects, ${fmtBytes(r1.totalSize)} total`);
// Show detached objects in snapshot 1
const detached1 = [...r1.summary.entries()]
  .filter(([, v]) => v.detachedCount > 0)
  .sort((a, b) => b[1].detachedSize - a[1].detachedSize);
if (detached1.length > 0) {
  console.error(`  Detected ${detached1.reduce((s, [, v]) => s + v.detachedCount, 0)} detached DOM elements in snapshot 1`);
  for (const [k, v] of detached1.slice(0, 5)) {
    console.error(`    ${k}: ${v.detachedCount} nodes, ${fmtBytes(v.detachedSize)}`);
  }
}

console.error("Analyzing snapshot 2...");
const r2 = summarize(s2);
console.error(`  ${r2.totalObjects} objects, ${fmtBytes(r2.totalSize)} total`);
const detached2 = [...r2.summary.entries()]
  .filter(([, v]) => v.detachedCount > 0)
  .sort((a, b) => b[1].detachedSize - a[1].detachedSize);
if (detached2.length > 0) {
  console.error(`  Detected ${detached2.reduce((s, [, v]) => s + v.detachedCount, 0)} detached DOM elements in snapshot 2`);
  for (const [k, v] of detached2.slice(0, 5)) {
    console.error(`    ${k}: ${v.detachedCount} nodes, ${fmtBytes(v.detachedSize)}`);
  }
}

// ── Compute delta ──
const allKeys = new Set([...r1.summary.keys(), ...r2.summary.keys()]);
const deltas = [];

for (const key of allKeys) {
  const a = r1.summary.get(key) || { count: 0, totalSize: 0 };
  const b = r2.summary.get(key) || { count: 0, totalSize: 0 };
  const dCount = b.count - a.count;
  const dSize = b.totalSize - a.totalSize;
  if (Math.abs(dSize) < opts.minDeltaKb * 1024 && Math.abs(dCount) < 2) continue;

  deltas.push({
    key,
    count1: a.count, count2: b.count, dCount,
    size1: a.totalSize, size2: b.totalSize, dSize,
  });
}

deltas.sort((a, b) => Math.abs(b.dSize) - Math.abs(a.dSize));

// ── Output ──
const totalDelta = r2.totalSize - r1.totalSize;
console.log(`\nHeap delta: ${totalDelta >= 0 ? "+" : ""}${fmtBytes(totalDelta)} (${r1.totalObjects} → ${r2.totalObjects} objects)\n`);

console.log("  Δ Size         Size1       Size2      Δ Count   Type");
console.log("  ─────────────  ──────────  ──────────  ────────  ────");

for (const d of deltas.slice(0, opts.top)) {
  const sign = d.dSize >= 0 ? "+" : "";
  console.log(
    `  ${sign}${fmtBytes(Math.abs(d.dSize)).padStart(12)}  ${fmtBytes(d.size1).padStart(10)}  ${fmtBytes(d.size2).padStart(10)}  ${(d.dCount >= 0 ? "+" : "") + d.dCount.toString().padStart(6)}  ${d.key}`
  );
}

// ── Summary categories ──
console.log("\n  ── By category ──");
const categories = {
  "HTML/Canvas": k => k.includes("HTML") || k.includes("Canvas") || k.includes("ImageData"),
  "Arrays": k => k.startsWith("array ") || k === "array",
  "Strings": k => k.startsWith("string") || k === "concatenated string" || k === "sliced string",
  "Objects (game)": k => k.includes("Scene") || k.includes("Ship") || k.includes("Planet") || k.includes("Star") || k.includes("System"),
  "Closures": k => k === "closure",
  "Detached DOM": k => {
    const v = deltas.find(e => e.key === k);
    return v && (r1.summary.get(k)?.detachedCount > 0 || r2.summary.get(k)?.detachedCount > 0);
  },
};

for (const [label, filter] of Object.entries(categories)) {
  const matches = deltas.filter(d => filter(d.key));
  if (matches.length === 0) continue;
  const totalDelta = matches.reduce((s, d) => s + d.dSize, 0);
  const sign = totalDelta >= 0 ? "+" : "";
  console.log(`  ${label.padEnd(18)} ${sign}${fmtBytes(Math.abs(totalDelta)).padStart(10)}  (${matches.length} types)`);
  for (const m of matches.slice(0, 3)) {
    console.log(`    ${(m.dSize >= 0 ? "+" : "") + fmtBytes(Math.abs(m.dSize)).padStart(11)}  ${m.key}`);
  }
}

// ── Top detached elements in snapshot 2 (potential leak) ──
if (detached2.length > 0 && detached2 !== detached1) {
  console.log("\n  ── Detached elements in snapshot 2 (may indicate leak) ──");
  const newDetached = detached2.filter(([k]) => {
    const v1 = r1.summary.get(k);
    return !v1 || v1.detachedCount === 0 || r2.summary.get(k).detachedCount > v1.detachedCount;
  });
  for (const [k, v] of newDetached.slice(0, 10)) {
    console.log(`    ${v.detachedCount.toString().padStart(5)} nodes  ${fmtBytes(v.detachedSize).padStart(10)}  ${k}`);
  }
}