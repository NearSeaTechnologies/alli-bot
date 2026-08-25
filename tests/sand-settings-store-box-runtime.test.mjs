import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(import.meta.dirname, "..");

async function loadSettingsStore(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "alli-settings-store-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const outfile = path.join(dir, "sand-settings-store.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source", "shared", "node", "settings", "sand-settings-store.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "es2022",
    outfile,
    logLevel: "silent",
  });
  return { module: await import(pathToFileURL(outfile).href), dir };
}

test("the sandbox computer is the only box runtime and legacy runtimes migrate to it", async (t) => {
  const { module, dir } = await loadSettingsStore(t);
  // Files without the current `version` are treated as empty by parseSettings; fixtures must carry it.
  const { SETTINGS_VERSION } = module;
  const settingsPath = path.join(dir, "settings.json");

  for (const legacy of ["local-docker", "remote"]) {
    await writeFile(settingsPath, JSON.stringify({ version: SETTINGS_VERSION, boxRuntime: legacy, themePreference: "dark" }));
    const store = new module.SandSettingsStore(settingsPath);
    assert.equal(store.getBoxRuntime(), "sandbox", `${legacy} must not override the sandbox runtime`);
    store.migrateLegacyBoxRuntime();
    const raw = JSON.parse(await readFile(settingsPath, "utf8"));
    assert.equal(raw.boxRuntime, "sandbox", `${legacy} must be rewritten on disk`);
    assert.equal(raw.themePreference, "dark", "migration must keep unrelated settings");
  }

  await writeFile(settingsPath, JSON.stringify({ version: SETTINGS_VERSION, boxRuntime: "sandbox", themePreference: "light" }));
  const before = await readFile(settingsPath, "utf8");
  new module.SandSettingsStore(settingsPath).migrateLegacyBoxRuntime();
  assert.equal(await readFile(settingsPath, "utf8"), before, "an already-sandbox file is left untouched");

  await rm(settingsPath);
  const fresh = new module.SandSettingsStore(settingsPath);
  fresh.migrateLegacyBoxRuntime();
  assert.equal(existsSync(settingsPath), false, "migration must not create a settings file");
  assert.equal(fresh.getBoxRuntime(), "sandbox");
});
