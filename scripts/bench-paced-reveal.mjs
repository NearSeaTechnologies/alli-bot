// Measures how long the transcript takes to *display* a reply, comparing the
// pacing algorithm as it shipped before 2026-08-25 with the current one.
// Both run on a simulated clock, so the result is deterministic.
//
//   npm run bench:reveal
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(import.meta.dirname, "..");

async function loadCurrent() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "alli-bench-"));
  const outfile = path.join(dir, "paced-text-reveal.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/node-agent-coordinator/paced-text-reveal.ts")],
    bundle: true, format: "esm", platform: "node", target: "node22", outfile, logLevel: "silent",
  });
  const module = await import(pathToFileURL(outfile).href);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

/** The algorithm exactly as it shipped before the fix: 24ms ticks, <=14 chars,
 *  and a snap to the FIRST word boundary, which capped it at about one word. */
function previousReveal({ emit, schedule }) {
  const tickMs = 24;
  let received = "", shown = "", timer = null, closed = false, finishing = null;
  const takeCount = (pending, flush) => {
    if (pending <= 0) return 0;
    if (flush) return Math.min(pending, Math.max(8, Math.ceil(pending / 16)));
    return Math.min(pending, Math.max(1, Math.min(14, Math.ceil(pending / 10))));
  };
  const advance = (flush) => {
    const pending = received.length - shown.length;
    if (pending <= 0) return false;
    let take = takeCount(pending, flush);
    const lookahead = received.slice(shown.length, shown.length + take + 10);
    const boundary = lookahead.search(/[\s.,!?;:]/);
    if (boundary > 0 && boundary <= take + 8) take = Math.min(pending, boundary + 1);
    shown = received.slice(0, shown.length + take);
    emit(shown, true);
    return shown.length < received.length;
  };
  const arm = () => {
    if (closed || timer != null || shown.length >= received.length) return;
    timer = schedule(() => { timer = null; if (closed) return; if (advance(false)) arm(); }, tickMs);
  };
  return {
    push(delta, accumulated) {
      if (closed) return;
      received = typeof accumulated === "string" ? accumulated : received + delta;
      arm();
    },
    finish() {
      if (finishing != null) return finishing;
      finishing = new Promise((resolve) => {
        const drain = () => {
          if (timer != null) { clearTimeout(timer); timer = null; }
          if (advance(true)) { timer = schedule(drain, tickMs); return; }
          closed = true; shown = received; emit(received, false); resolve(received);
        };
        drain();
      });
      return finishing;
    },
  };
}

async function measure(make, tickMs, answer) {
  const queue = [];
  const reveal = make({ emit: () => {}, schedule: (cb) => { queue.push(cb); return queue.length; }, tickMs });
  reveal.push(answer);
  let ticks = 0;
  while (queue.length > 0 && ticks < 1_000_000) { queue.shift()(); ticks += 1; }
  const finished = reveal.finish();
  while (queue.length > 0) { queue.shift()(); ticks += 1; }
  const text = await finished;
  if (text !== answer) throw new Error("reveal did not reproduce the answer exactly");
  const seconds = (ticks * tickMs) / 1000;
  return { ticks, seconds, rate: Math.round(answer.length / seconds) };
}

const current = await loadCurrent();
try {
  const answer = "The quick brown fox jumps over the lazy dog. ".repeat(32);
  console.log(`Displaying a ${answer.length}-character reply:\n`);
  const before = await measure(previousReveal, 24, answer);
  const after = await measure(current.module.createPacedTextReveal, 16, answer);
  const row = (label, r, tickMs) =>
    `  ${label.padEnd(10)} ${String(r.ticks).padStart(4)} frames x ${tickMs}ms = ${r.seconds.toFixed(2)}s  (${r.rate} chars/sec)`;
  console.log(row("before", before, 24));
  console.log(row("after", after, 16));
  console.log(`\n  ${(before.seconds / after.seconds).toFixed(0)}x faster to finish painting.`);
} finally {
  await current.dispose();
}
