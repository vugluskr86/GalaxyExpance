#!/usr/bin/env node
/**
 * Parse custom performance marks (sys-update, sys-draw, save) from a trace
 * and print summary statistics.
 *
 * Usage:
 *   node scripts/parse-perf-marks.mjs <trace.json> [--cut-first N]
 *
 * --cut-first N  Drop the first N frames (typically contain profiling
 *                overhead from DevTools itself, e.g. CpuProfiler::StartProfiling).
 */

import { readFileSync } from "fs";

function parseArgs(args) {
  const opts = { file: null, cutFirst: 0 };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--cut-first") opts.cutFirst = parseInt(args[++i], 10) || 0;
    else if (!opts.file) opts.file = arg;
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.file) {
    console.log("Usage: node scripts/parse-perf-marks.mjs <trace.json> [--cut-first N]");
    process.exit(1);
  }

  console.error(`Loading ${opts.file}...`);
  const raw = readFileSync(opts.file, "utf-8");
  console.error(`Parsing JSON (${(raw.length / 1024 / 1024).toFixed(1)} MB)...`);
  const data = JSON.parse(raw);
  const events = data.traceEvents || data;

  // Extract sys-* b/e marks
  const openMarks = new Map(); // pid:tid:name → ts
  const completed = []; // { name, startUs, endUs, durMs }

  for (const ev of events) {
    const name = ev.name || "";
    if (!name.startsWith("sys-") && name !== "save") continue;
    const key = `${ev.pid}:${ev.tid}:${name}`;

    if (ev.ph === "b") {
      openMarks.set(key, ev.ts);
    } else if (ev.ph === "e") {
      const start = openMarks.get(key);
      if (start !== undefined) {
        completed.push({ name, startUs: start, endUs: ev.ts, durMs: (ev.ts - start) / 1000 });
        openMarks.delete(key);
      }
    }
  }

  if (completed.length === 0) {
    console.log("No sys-* marks found. Did you run with window.__PERF_MARKS = true?");
    process.exit(0);
  }

  // Group by name
  const groups = {};
  for (const m of completed) {
    (groups[m.name] = groups[m.name] || []).push(m);
  }

  // Sort each group by time, drop first N if requested
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => a.startUs - b.startUs);
    if (opts.cutFirst > 0) {
      groups[key] = groups[key].slice(opts.cutFirst);
    }
  }

  // Print summary
  console.log(`\nPerformance marks summary (${completed.length} measurements):\n`);
  console.log("  Name            Count   Avg ms   P50 ms   P95 ms   P99 ms   Max ms");
  console.log("  ──────────────  ─────  ───────  ───────  ───────  ───────  ───────");

  const order = ["sys-update", "sys-draw", "save"];
  for (const name of order) {
    const arr = groups[name];
    if (!arr || arr.length === 0) continue;
    const durs = arr.map(m => m.durMs).sort((a, b) => a - b);
    const avg = durs.reduce((s, v) => s + v, 0) / durs.length;
    const p50 = percentile(durs, 0.50);
    const p95 = percentile(durs, 0.95);
    const p99 = percentile(durs, 0.99);
    const max = durs[durs.length - 1];
    console.log(
      `  ${name.padEnd(16)} ${String(arr.length).padStart(5)}  ${avg.toFixed(2).padStart(7)}  ${p50.toFixed(2).padStart(7)}  ${p95.toFixed(2).padStart(7)}  ${p99.toFixed(2).padStart(7)}  ${max.toFixed(1).padStart(7)}`
    );
  }

  // Print any other marks
  for (const [name, arr] of Object.entries(groups)) {
    if (order.includes(name)) continue;
    const durs = arr.map(m => m.durMs).sort((a, b) => a - b);
    const avg = durs.reduce((s, v) => s + v, 0) / durs.length;
    console.log(`  ${name.padEnd(16)} ${String(arr.length).padStart(5)}  ${avg.toFixed(2).padStart(7)}  —`);
  }

  // Long frame breakdown: how many frames exceed thresholds
  console.log("\n  Frame budget analysis:\n");
  const updateDurs = (groups["sys-update"] || []).map(m => m.durMs);
  const drawDurs = (groups["sys-draw"] || []).map(m => m.durMs);
  const totalDurs = [];
  for (let i = 0; i < Math.min(updateDurs.length, drawDurs.length); i++) {
    totalDurs.push(updateDurs[i] + drawDurs[i]);
  }

  if (totalDurs.length > 0) {
    const thresholds = [8, 16, 33, 50, 100];
    console.log("  Total frame (upd+draw) distribution:");
    for (const t of thresholds) {
      const count = totalDurs.filter(v => v > t).length;
      const pct = (count / totalDurs.length * 100).toFixed(1);
      console.log(`    >${String(t).padStart(3)}ms: ${String(count).padStart(4)} frames (${pct}%)`);
    }
    const avgTotal = totalDurs.reduce((s, v) => s + v, 0) / totalDurs.length;
    console.log(`\n  Average total frame: ${avgTotal.toFixed(1)}ms`);
  }

  // Print slowest 5% of frames with breakdown
  if (totalDurs.length > 0) {
    const sorted = totalDurs.map((v, i) => ({ i, total: v, update: updateDurs[i] || 0, draw: drawDurs[i] || 0 }))
      .sort((a, b) => b.total - a.total);
    const topN = Math.max(5, Math.ceil(totalDurs.length * 0.02));
    console.log(`\n  Slowest ${topN} frames (upd + draw breakdown):`);
    for (const f of sorted.slice(0, topN)) {
      console.log(`    #${f.i.toString().padStart(4)}  total ${f.total.toFixed(1).padStart(5)}ms  upd ${f.update.toFixed(1).padStart(5)}ms  draw ${f.draw.toFixed(1).padStart(5)}ms`);
    }
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

main();