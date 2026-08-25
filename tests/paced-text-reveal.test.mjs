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
