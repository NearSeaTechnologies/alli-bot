import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { transform } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("logged-out Alli Bot still gets a local coordinator account slot", async () => {
  const source = await readFile(path.join(repoRoot, "source/electron-main/coordinator/coordinator-account-runtime.ts"), "utf8");
  const { code } = await transform(source, { format: "esm", loader: "ts", target: "es2022" });
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  assert.equal(module.coordinatorAccountSlot({ kind: "logged-out" }), module.LOCAL_INFERENCE_ACCOUNT_SLOT);
  assert.equal(module.coordinatorAccountSlot({ kind: "logged-in", email: "pedro@alongside.team" }), "pedro@alongside.team");
});
