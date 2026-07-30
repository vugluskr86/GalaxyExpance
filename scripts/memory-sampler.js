/**
 * Memory profiler snippet for Chrome DevTools console.
 *
 * Copy-paste the entire file into DevTools console while the game is running,
 * or load it via:
 *   const s = document.createElement('script');
 *   s.src = '/scripts/memory-sampler.js'; document.head.appendChild(s);
 *
 * Commands:
 *   mem.start(5000)   — start polling every N ms (default 5000)
 *   mem.stop()        — stop polling
 *   mem.table()       — print log as console.table
 *   mem.copy()        — copy JSON log to clipboard (paste into Excel/Sheets)
 *   mem.snapshot()    — force GC + measure baseline
 *   mem.measure(n)    — run N scene transitions and measure delta
 */

(() => {
  if (window._memSampler) { console.log("Memory sampler already loaded. Use mem.start() or mem.help()"); return; }

  const sampler = {
    _pollId: null,
    _log: [],
    _startTime: 0,

    help() {
      console.log(
        "Memory Sampler commands:\n" +
        "  mem.start(ms)   — start polling (default 5000ms)\n" +
        "  mem.stop()      — stop polling\n" +
        "  mem.table()     — print log as table\n" +
        "  mem.copy()      — copy JSON to clipboard\n" +
        "  mem.snapshot()  — force GC + measure\n" +
        "  mem.measure(n)  — run N scene transitions, measure delta\n"
      );
    },

    start(intervalMs = 5000) {
      if (!performance.memory) {
        console.error("performance.memory not available. Enable chrome://flags/#memory-internals or use Chrome.");
        return;
      }
      if (this._pollId) this.stop();
      this._startTime = Date.now();
      this._log = [];
      console.log(`Memory sampler started (every ${intervalMs}ms). Output in #npPerf.`);

      const tick = () => {
        const m = performance.memory;
        const mb = (v) => (v / 1024 / 1024).toFixed(1);
        const used = m.usedJSHeapSize;
        const total = m.totalJSHeapSize;
        const limit = m.jsHeapSizeLimit;
        const pct = (used / limit * 100).toFixed(1);
        const elapsed = ((Date.now() - this._startTime) / 1000).toFixed(0);

        const entry = { elapsed: +elapsed, usedMB: +mb(used), totalMB: +mb(total), pct: +pct };
        this._log.push(entry);

        const npPerf = document.getElementById("npPerf");
        if (npPerf) {
          npPerf.textContent = `HEAP: ${mb(used)}MB / ${mb(total)}MB = ${pct}% | t=${elapsed}s`;
        }

        // Warn if heap is >50% of limit
        if (used / limit > 0.5) {
          console.warn(`⚠ Heap ${pct}% of limit (${mb(used)}MB / ${mb(limit)}MB) at t=${elapsed}s`);
        }

        this._pollId = setTimeout(tick, intervalMs);
      };

      this._pollId = setTimeout(tick, intervalMs);
    },

    stop() {
      if (this._pollId) { clearTimeout(this._pollId); this._pollId = null; }
      console.log("Memory sampler stopped. Run mem.table() to see log, mem.copy() to export.");
    },

    table() {
      if (this._log.length === 0) { console.log("No data. Run mem.start() first."); return; }
      console.table(this._log);
      // Show trend
      const first = this._log[0].usedMB;
      const last = this._log[this._log.length - 1].usedMB;
      const delta = last - first;
      const trend = delta > 5 ? `📈 +${delta.toFixed(1)}MB (LEAK?)` :
                    delta < -5 ? `📉 ${delta.toFixed(1)}MB (GC running)` :
                    `➡ ${delta.toFixed(1)}MB (stable)`;
      console.log(`Trend over ${this._log.length} samples: ${trend}`);
    },

    copy() {
      if (this._log.length === 0) { console.log("No data."); return; }
      const json = JSON.stringify(this._log, null, 2);
      navigator.clipboard.writeText(json).then(
        () => console.log(`Copied ${this._log.length} samples to clipboard.`),
        () => console.error("Clipboard write failed. Use copy(JSON.stringify(mem._log)) instead.")
      );
    },

    snapshot() {
      if (typeof gc === "function") { gc(); gc(); }
      setTimeout(() => {
        if (!performance.memory) { console.error("performance.memory not available"); return; }
        const m = performance.memory;
        const mb = (v) => (v / 1024 / 1024).toFixed(1);
        console.log(
          `Snapshot after forced GC:\n` +
          `  JS heap: ${mb(m.usedJSHeapSize)}MB / ${mb(m.totalJSHeapSize)}MB (limit ${mb(m.jsHeapSizeLimit)}MB)`
        );
      }, 100);
    },

    /**
     * Measure heap delta across N scene transitions.
     * Usage: mem.measure(5) — will go back→system 5 times, measuring heap each time.
     */
    /**
     * Measure heap delta across N scene transitions with forced GC.
     * First 2 cycles are "warmup" (discarded).  After each transition we force
     * GC to measure the *settled* heap — the heap that refuses to shrink.
     *
     * Output columns:
     *   before — heap after GC, before transition
     *   peak   — heap right after transition (before GC kicks in)
     *   after  — heap after GC post-transition (settled)
     *   leaked — settled heap minus previous settled (cumulative leak)
     */
    async measure(cycles = 5) {
      const hasGc = typeof gc === "function";
      if (!hasGc) {
        console.warn("⚠ Forced GC not available. Run Chrome with --js-flags=--expose-gc for accurate results.");
      }
      if (!performance.memory) { console.error("performance.memory not available"); return; }

      const mb = (v) => (v / 1024 / 1024).toFixed(1);
      const mgr = window._pixelCosmosMgr;
      if (!mgr?.returnToShip) { console.error("Scene manager not found (window._pixelCosmosMgr)"); return; }

      console.log(`Measuring heap across ${cycles} transitions (2 warmup + ${cycles - 2} measured)...`);

      const gcForce = async () => {
        if (hasGc) { gc(); gc(); }
        await new Promise(r => setTimeout(r, 200));
      };

      const readHeap = () => performance.memory.usedJSHeapSize;

      let prevSettled = 0;
      const results = [];

      for (let i = 0; i < cycles; i++) {
        await gcForce();
        const before = readHeap();

        // Transition
        mgr.returnToShip();
        await new Promise(r => setTimeout(r, 800));

        const peak = readHeap();

        await gcForce();
        const after = readHeap();

        const churnMB = (peak - before) / 1024 / 1024;
        const signCh = churnMB >= 0 ? "+" : "";
        const settledMB = after / 1024 / 1024;
        const leakedMB = i > 0 ? (after - prevSettled) / 1024 / 1024 : 0;
        const signLk = leakedMB >= 0 ? "+" : "";
        prevSettled = after;

        const isWarmup = i < 2;
        results.push({
          cycle: i + 1,
          warmup: isWarmup,
          before: mb(before),
          peak: mb(peak),
          settled: mb(after),
          churnMB: +churnMB.toFixed(1),
          leakedMB: +leakedMB.toFixed(1)
        });

        console.log(
          `  ${isWarmup ? "♨ warmup" : "● measrd"} #${i + 1}: ` +
          `settled=${mb(after)}MB  churn=${signCh}${churnMB.toFixed(1)}MB  ` +
          (i > 0 ? `leaked=${signLk}${leakedMB.toFixed(1)}MB` : "")
        );
      }

      console.table(results.map(r => ({
        cycle: r.cycle + (r.warmup ? " ♨" : ""),
        settled: r.settled,
        churn: "+" + r.churnMB + "MB",
        leaked: r.cycle > 1 ? (r.leakedMB >= 0 ? "+" : "") + r.leakedMB + "MB" : "—"
      })));

      const measured = results.filter(r => !r.warmup);
      if (measured.length > 0) {
        const avgChurn = measured.reduce((s, r) => s + r.churnMB, 0) / measured.length;
        const totalLeaked = measured[measured.length - 1].leakedMB;
        const firstSettled = parseFloat(measured[0].settled);
        const lastSettled = parseFloat(measured[measured.length - 1].settled);
        const settledGrowth = lastSettled - firstSettled;

        console.log(
          `\n  Summary:` +
          `\n    Avg churn per transition: +${avgChurn.toFixed(1)}MB (garbage created)` +
          `\n    Settled heap growth:      +${settledGrowth.toFixed(1)}MB (not reclaimed after GC)` +
          `\n    Cumulative leaked:        ${totalLeaked >= 0 ? "+" : ""}${totalLeaked.toFixed(1)}MB`
        );

        const verdict = settledGrowth > 3
          ? `🔴 LIKELY LEAK: settled heap grows ${settledGrowth.toFixed(0)}MB — objects survive GC`
          : avgChurn > 10
            ? `🟡 HIGH CHURN: ${avgChurn.toFixed(0)}MB garbage per transition — frequent GC pauses`
            : `🟢 STABLE: churn ${avgChurn.toFixed(0)}MB, settled growth ${settledGrowth.toFixed(0)}MB`;
        console.log(`    Verdict: ${verdict}`);
      }
    },

    /**
     * Quick diagnostic: DOM nodes, canvas count, detached elements.
     */
    analyze() {
      const canvases = document.querySelectorAll("canvas");
      const detached = [];
      // A canvas not in the DOM but still referenced = leak candidate
      const allCanvases = [];
      try {
        // Count OffscreenCanvas instances (approximate)
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        document.body.appendChild(iframe);
        const nativeOC = iframe.contentWindow.OffscreenCanvas;
        document.body.removeChild(iframe);
        console.log(`  Canvas elements in DOM: ${canvases.length}`);
        console.log(`  Total DOM nodes: ${document.querySelectorAll("*").length}`);
      } catch (e) { /* ignore */ }

      // Check for large arrays / objects on key suspects
      const mgr = window._pixelCosmosMgr;
      if (mgr?.stack) {
        console.log(`  Scene stack depth: ${mgr.stack.length}`);
        for (let i = 0; i < mgr.stack.length; i++) {
          const s = mgr.stack[i];
          const name = s?.constructor?.name || "?";
          const keys = s ? Object.keys(s).length : 0;
          const npcs = s?.npcs?.length || 0;
          const planets = s?.S?.planets?.length || 0;
          console.log(`    [${i}] ${name}  keys=${keys}  planets=${planets}  npcs=${npcs}`);
        }
      }

      if (performance.memory) {
        const m = performance.memory;
        const mb = (v) => (v / 1024 / 1024).toFixed(1);
        console.log(
          `\n  JS Heap: ${mb(m.usedJSHeapSize)}MB / ${mb(m.totalJSHeapSize)}MB ` +
          `(limit ${mb(m.jsHeapSizeLimit)}MB)`
        );
      }

      console.log("\n  Next step: Chrome → Memory → Heap snapshot → compare 2 snapshots");
      console.log("  Or: mem.start(5000) and watch the trend for 2-3 minutes");
    }
  };

  window._memSampler = sampler;
  window.mem = sampler;

  console.log(
    "🧠 Memory sampler loaded. Commands: mem.start(), mem.stop(), mem.table(), mem.copy(), mem.snapshot(), mem.measure(N)\n" +
    "   Start monitoring: mem.start(5000)"
  );
})();