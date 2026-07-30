#!/usr/bin/env node
/**
 * Chrome DevTools Performance Trace Analyzer.
 *
 * Usage:
 *   node scripts/analyze-trace.mjs summary <trace.json> [--top N] [--min-dur ms]
 *   node scripts/analyze-trace.mjs frames <trace.json> [--threshold ms]
 *   node scripts/analyze-trace.mjs find <trace.json> <regex> [--context lines]
 *   node scripts/analyze-trace.mjs marks <trace.json>
 *
 * Works with the JSON format exported by Chrome DevTools Performance tab.
 * For large files (80 MB+) the JSON is loaded in one pass; peak memory ~400 MB.
 */

import { readFileSync } from "fs";

const USAGE = `
Usage:
  node scripts/analyze-trace.mjs summary <trace.json>  [--top N] [--min-dur ms]
  node scripts/analyze-trace.mjs frames <trace.json>    [--threshold ms]
  node scripts/analyze-trace.mjs find <trace.json> <regex> [--context N]
  node scripts/analyze-trace.mjs marks <trace.json>
`;

function parseArgs(args) {
  const opts = { command: null, file: null, top: 30, minDur: 0.05, threshold: 16, regex: null, context: 0 };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "summary" || arg === "frames" || arg === "find" || arg === "marks") {
      opts.command = arg;
      if (arg !== "frames" && arg !== "marks") opts.file = args[++i];
      else opts.file = args[++i];
    } else if (arg === "--top") opts.top = parseInt(args[++i], 10);
    else if (arg === "--min-dur") opts.minDur = parseFloat(args[++i]);
    else if (arg === "--threshold") opts.threshold = parseFloat(args[++i]);
    else if (arg === "--context") opts.context = parseInt(args[++i], 10);
    else if (!opts.regex && opts.command === "find") opts.regex = arg;
    else if (!opts.file) opts.file = arg;
    i++;
  }
  return opts;
}

function loadTrace(filepath) {
  console.error(`Loading ${filepath}...`);
  const raw = readFileSync(filepath, "utf-8");
  console.error(`Parsing JSON (${(raw.length / 1024 / 1024).toFixed(1)} MB)...`);
  const data = JSON.parse(raw);
  const events = data.traceEvents || data;
  console.error(`Loaded ${events.length} events.\n`);
  return events;
}

/**
 * Build a map of function name → total self-time (sum of dur for 'X' events).
 * Excludes V8 internal, compositor, and GPU threads.
 */
function computeSelfTime(events, minDurMs = 0) {
  const totals = new Map(); // name → { count, totalMs, maxMs, minMs }
  const minDurUs = minDurMs * 1000;

  for (const ev of events) {
    if (ev.ph !== "X") continue;       // complete events only
    if (!ev.dur || ev.dur < minDurUs) continue;
    const name = ev.name || "(anonymous)";
    // Skip framework internals
    if (name.startsWith("v8.") || name.startsWith("V8.")) continue;
    if (name === "RunTask" || name === "RunMicrotasks" || name === "TimerFire") continue;

    const ms = ev.dur / 1000;
    const entry = totals.get(name) || { count: 0, totalMs: 0, maxMs: 0, minMs: Infinity };
    entry.count++;
    entry.totalMs += ms;
    if (ms > entry.maxMs) entry.maxMs = ms;
    if (ms < entry.minMs) entry.minMs = ms;
    totals.set(name, entry);
  }
  return totals;
}

/**
 * Find all Animation Frame / requestAnimationFrame events that took longer than threshold.
 * Looks for 'X' events named "Animation Frame Fired" or similar.
 */
function findLongFrames(events, thresholdMs = 16) {
  const frames = [];
  const thresholdUs = thresholdMs * 1000;

  for (const ev of events) {
    if (ev.ph !== "X") continue;
    if (!ev.dur || ev.dur < thresholdUs) continue;
    const name = ev.name || "";
    // Chrome frame markers
    if (
      name.includes("Animation Frame") ||
      name === "Frame" ||
      name === "BeginMainFrame" ||
      name === "DrawFrame" ||
      name === "Composite" ||
      name === "RasterTask"
    ) {
      frames.push({ name, ms: ev.dur / 1000, ts: ev.ts, pid: ev.pid, tid: ev.tid });
    }
  }
  return frames.sort((a, b) => b.ms - a.ms);
}

/**
 * Find execution blocks (nested X events) on the renderer main thread where
 * the root task (top-level call) exceeded thresholdMs.  This catches long
 * rAF callbacks that are not explicitly named "Animation Frame".
 *
 * Approach: walk sorted X events on the renderer thread, track stack depth,
 * and report any outermost event whose dur >= threshold.
 */
function findLongTasks(events, thresholdMs = 16) {
  const thresholdUs = thresholdMs * 1000;
  // Collect all X events with position info, then sort by ts
  const xs = [];
  for (const ev of events) {
    if (ev.ph !== "X" || !ev.dur) continue;
    xs.push({ name: ev.name || "?", ts: ev.ts, end: ev.ts + ev.dur, dur: ev.dur, pid: ev.pid, tid: ev.tid });
  }
  xs.sort((a, b) => a.ts - b.ts);

  const long = [];
  const stack = []; // active intervals
  for (const ev of xs) {
    // Pop intervals that ended before this one starts
    while (stack.length && stack[stack.length - 1].end <= ev.ts) {
      const top = stack.pop();
      // If this was an outermost interval (stack is now empty at that level) and long enough
      if (top.dur >= thresholdUs) {
        long.push({ name: top.name, ms: top.dur / 1000, ts: top.ts });
      }
    }
    if (stack.length === 0 && ev.dur >= thresholdUs) {
      // This is a root-level long task
      long.push({ name: ev.name, ms: ev.dur / 1000, ts: ev.ts });
    }
    stack.push(ev);
  }
  // Drain remaining stack
  while (stack.length) {
    const top = stack.pop();
    if (top.dur >= thresholdUs) {
      long.push({ name: top.name, ms: top.dur / 1000, ts: top.ts });
    }
  }
  return long.sort((a, b) => b.ms - a.ms);
}

/**
 * Search for events whose name matches a regex.  Prints the event + optional
 * surrounding events for context.
 */
function findByName(events, regex, contextLines = 0) {
  const re = new RegExp(regex, "i");
  const matches = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const name = ev.name || "";
    if (!re.test(name)) continue;
    matches.push({ index: i, event: ev });
  }

  const outputs = [];
  for (const m of matches) {
    const ev = m.event;
    let line = `[${m.index}] ${ev.ph || "?"} ${ev.name} `;
    if (ev.dur) line += `${(ev.dur / 1000).toFixed(2)}ms `;
    line += `ts=${ev.ts} pid=${ev.pid} tid=${ev.tid}`;
    if (ev.args) {
      const args = Object.entries(ev.args).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v).slice(0, 80) : v}`).join(" ");
      if (args) line += ` | ${args}`;
    }
    outputs.push(line);

    if (contextLines > 0) {
      const start = Math.max(0, m.index - contextLines);
      const end = Math.min(events.length, m.index + contextLines + 1);
      for (let j = start; j < end; j++) {
        if (j === m.index) continue;
        const ctx = events[j];
        if (ctx.ph === "M") continue;
        outputs.push(`  ctx[${j}] ${ctx.ph || "?"} ${ctx.name || "?"} ${ctx.dur ? (ctx.dur / 1000).toFixed(2) + "ms" : ""}`);
      }
    }
  }
  return outputs;
}

/**
 * Extract performance.mark / performance.measure events (our custom marks).
 */
function extractMarks(events) {
  const marks = [];
  for (const ev of events) {
    if (ev.ph === "R" || ev.ph === "n" || ev.ph === "b" || ev.ph === "e") {
      // ph=R is measure, ph=b/e are mark begin/end
      const name = ev.name || "";
      if (name.startsWith("sys-") || name === "save") {
        marks.push(ev);
      }
    }
    // Also look for console.timeStamp (ph=I, name starts with "sys-")
    if (ev.ph === "I" && ev.name && ev.name.startsWith("sys-")) {
      marks.push(ev);
    }
  }
  return marks;
}

// ─── Main ──────────────────────────────────────────────────────────────────

const opts = parseArgs(process.argv.slice(2));

if (!opts.command || !opts.file) {
  console.log(USAGE);
  process.exit(1);
}

const events = loadTrace(opts.file);

switch (opts.command) {
  case "summary": {
    const totals = computeSelfTime(events, opts.minDur);
    const sorted = [...totals.entries()]
      .sort((a, b) => b[1].totalMs - a[1].totalMs)
      .slice(0, opts.top);

    console.log(`Top ${opts.top} functions by self-time (min ${opts.minDur}ms):\n`);
    console.log("  Total ms   Count   Avg ms   Max ms   Function");
    console.log("  ─────────  ─────  ───────  ───────  ────────");
    for (const [name, s] of sorted) {
      console.log(
        `  ${s.totalMs.toFixed(1).padStart(9)}  ${String(s.count).padStart(5)}  ${(s.totalMs / s.count).toFixed(2).padStart(7)}  ${s.maxMs.toFixed(1).padStart(7)}  ${name}`
      );
    }
    const grandTotal = [...totals.values()].reduce((s, v) => s + v.totalMs, 0);
    console.log(`\n  Grand total: ${grandTotal.toFixed(0)}ms across ${totals.size} unique functions`);
    break;
  }

  case "frames": {
    const threshold = opts.threshold || 16;
    console.log(`Frames/tasks > ${threshold}ms:\n`);

    // Combine long frames (by name) and long tasks (by structure)
    const long = findLongTasks(events, threshold);
    if (long.length === 0) {
      console.log("  No long tasks found. Trying frame-name search...");
      const byName = findLongFrames(events, threshold);
      for (const f of byName.slice(0, 40)) {
        const rel = (f.ts / 1000).toFixed(0);
        console.log(`  ${f.ms.toFixed(1).padStart(7)}ms  t=${rel}s  ${f.name}`);
      }
    } else {
      for (const f of long.slice(0, 40)) {
        const rel = (f.ts / 1000).toFixed(0);
        console.log(`  ${f.ms.toFixed(1).padStart(7)}ms  t=${rel}s  ${f.name}`);
      }
      console.log(`\n  Total long tasks: ${long.length}`);
    }
    break;
  }

  case "find": {
    if (!opts.regex) { console.log("Missing regex argument"); process.exit(1); }
    const results = findByName(events, opts.regex, opts.context);
    console.log(`Found ${results.length} events matching /${opts.regex}/:\n`);
    for (const line of results.slice(0, 200)) {
      console.log(line);
    }
    if (results.length > 200) console.log(`\n  ... and ${results.length - 200} more (use --context for details)`);
    break;
  }

  case "marks": {
    const marks = extractMarks(events);
    if (marks.length === 0) {
      console.log("No custom performance marks found. Did you run with window.__PERF_MARKS = true?");
      console.log("Looking for any mark/measure events...");
      for (const ev of events) {
        if (ev.ph === "R" || ev.ph === "b" || ev.ph === "e") {
          console.log(`  ${ev.ph} ${ev.name} ts=${ev.ts} ${ev.dur ? (ev.dur / 1000).toFixed(2) + "ms" : ""}`);
        }
      }
    } else {
      console.log(`Found ${marks.length} custom marks:\n`);
      for (const m of marks) {
        const ms = m.dur ? (m.dur / 1000).toFixed(2) + "ms" : "mark";
        console.log(`  ${m.ph} ${m.name.padEnd(18)} ${ms.padStart(10)}  ts=${m.ts}`);
      }
    }
    break;
  }
}