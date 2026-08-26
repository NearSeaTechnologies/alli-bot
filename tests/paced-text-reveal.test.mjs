import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "alli-paced-text-"));
  const output = path.join(temporary, "paced-text-reveal.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/node-agent-coordinator/paced-text-reveal.ts")],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("paced reveal emits an empty streaming start then settles without dumping the whole answer", async () => {
  const loaded = await loadModule();
  try {
    const queued = [];
    const frames = [];
    const reveal = loaded.module.createPacedTextReveal({
      tickMs: 1,
      schedule: callback => {
        queued.push(callback);
        return queued.length;
      },
      emit: (text, streaming) => frames.push({ text, streaming }),
    });
    reveal.push("Hello there, this is a longer Alli Bot reply.");
    assert.equal(frames.length, 0);
    queued.shift()();
    assert.equal(frames.length, 1);
    assert.equal(frames[0].streaming, true);
    assert.ok(frames[0].text.length > 0);
    assert.ok(frames[0].text.length < "Hello there, this is a longer Alli Bot reply.".length);
    const finished = reveal.finish();
    while (queued.length > 0) queued.shift()();
    const text = await finished;
    assert.equal(text, "Hello there, this is a longer Alli Bot reply.");
    assert.equal(frames.at(-1).streaming, false);
    assert.equal(frames.at(-1).text, text);
    assert.ok(frames.length >= 3);
  } finally {
    await loaded.dispose();
  }
});

test("paced reveal keeps up with a fast model instead of trickling one word per tick", async () => {
  const loaded = await loadModule();
  try {
    const queued = [];
    const frames = [];
    const reveal = loaded.module.createPacedTextReveal({
      tickMs: 1,
      schedule: callback => { queued.push(callback); return queued.length; },
      emit: (text) => frames.push(text),
    });
    // ~1.4k characters of ordinary prose, the size of a real reply.
    const answer = "The quick brown fox jumps over the lazy dog. ".repeat(32);
    reveal.push(answer);
    queued.shift()();
    // A single tick must reveal far more than one word. The old first-boundary
    // snap emitted ~4-9 characters per tick, so replies crawled behind the model.
    assert.ok(frames[0].length >= 32, `first tick revealed only ${frames[0].length} chars`);
    // Whole words only - never split mid-word.
    assert.ok(answer.startsWith(frames[0]), "revealed text must be a prefix of the answer");
    assert.match(frames[0], /[ \n]$/, "reveal should stop on a word boundary");
    let ticks = 1;
    while (queued.length > 0 && ticks < 200) { queued.shift()(); ticks += 1; }
    const finished = reveal.finish();
    while (queued.length > 0) queued.shift()();
    assert.equal(await finished, answer);
    // At 16ms per frame, this many ticks must stay well under a second of wall clock.
    assert.ok(ticks <= 45, `took ${ticks} ticks to stream ${answer.length} chars`);
  } finally {
    await loaded.dispose();
  }
});
