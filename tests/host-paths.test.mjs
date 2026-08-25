import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { transform } from "esbuild";
import { readFile } from "node:fs/promises";

const repoRoot = path.resolve(import.meta.dirname, "..");

async function loadTs(relative) {
  const source = await readFile(path.join(repoRoot, relative), "utf8");
  const { code } = await transform(source, { format: "esm", loader: "ts", target: "es2022" });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

test("packaged production data lives under Application Support/Alli Bot", async () => {
  const names = await loadTs("source/shared/product-name.ts");
  const home = "/Users/alli";
  assert.equal(names.SAND_PRODUCT_VERSION, "1.0.0");
  assert.equal(names.getAlliSupportDir(home, "darwin"), "/Users/alli/Library/Application Support/Alli Bot");
  assert.equal(names.getAlliSandDataDir(home, "darwin"), "/Users/alli/Library/Application Support/Alli Bot/sand-data");
  assert.equal(names.getAlliLegacyGrokbotDir(home), "/Users/alli/.grokbot");
  assert.equal(names.getAlliSandDataDir(home, "linux"), "/Users/alli/.grokbot");
});
