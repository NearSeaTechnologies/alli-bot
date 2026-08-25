import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { NODE_ESBUILD_LOADERS } from "../scripts/lib/clean-build.mjs";
import { sourceGraph } from "../scripts/audit-runtime-composition.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("primary preload sourceGraph includes the 0.24 motion CSS as a text input", async () => {
  assert.deepEqual(NODE_ESBUILD_LOADERS, { ".css": "text" });
  const cleanBuild = await readFile(path.join(repoRoot, "scripts", "lib", "clean-build.mjs"), "utf8");
  const audit = await readFile(path.join(repoRoot, "scripts", "audit-runtime-composition.mjs"), "utf8");
  assert.match(cleanBuild, /loader: NODE_ESBUILD_LOADERS/);
  assert.match(audit, /loader = NODE_ESBUILD_LOADERS/);
  const graph = await sourceGraph("source/electron-preload/runtime/primary.ts");
  assert.ok(
    graph.inputs.includes("frontend/src/production/motion-024.css"),
    `expected motion-024.css in sourceGraph inputs, got ${JSON.stringify(graph.inputs)}`,
  );
  assert.ok(graph.inputs.includes("source/electron-preload/motion-024-overlay.ts"));
});
