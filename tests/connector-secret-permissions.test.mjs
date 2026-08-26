import assert from "node:assert/strict";
import { chmodSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(import.meta.dirname, "..");

async function loadStore(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "alli-connector-secrets-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const outfile = path.join(dir, "connector-secret-store.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/host/extensions/session/connector-secret-store.ts")],
    bundle: true, format: "esm", platform: "node", target: "node22", outfile, logLevel: "silent",
  });
  return { module: await import(pathToFileURL(outfile).href), dir };
}

const mode = (p) => statSync(p).mode & 0o777;

test("connector credentials are written owner-only", async (t) => {
  const { module, dir } = await loadStore(t);
  const root = path.join(dir, "secrets");
  const store = new module.SandConnectorSecretStore(root);

  assert.equal(store.setSecret("agent-1", "gmail", "refreshToken", "s3cret"), true);
  const file = store.filePath("agent-1", "gmail");

  // These files hold connector credentials; world- or group-readable is a leak.
  assert.equal(mode(file), 0o600, `expected 0600, got ${mode(file).toString(8)}`);
  assert.equal(mode(path.dirname(file)), 0o700, `expected dir 0700, got ${mode(path.dirname(file)).toString(8)}`);
  assert.equal(store.getSecret("agent-1", "gmail", "refreshToken"), "s3cret");
});

test("a credential file inherited from an older build is repaired on next write", async (t) => {
  const { module, dir } = await loadStore(t);
  const root = path.join(dir, "secrets");
  const store = new module.SandConnectorSecretStore(root);
  const file = store.filePath("agent-2", "slack");

  // Simulate what older builds left behind: world-readable secrets.
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ token: "old" }), "utf8");
  chmodSync(file, 0o644);
  chmodSync(path.dirname(file), 0o755);
  assert.equal(mode(file), 0o644);

  store.setSecret("agent-2", "slack", "token", "new");
  assert.equal(mode(file), 0o600, "existing loose credentials must be tightened");
  assert.equal(mode(path.dirname(file)), 0o700);
  assert.equal(store.getSecret("agent-2", "slack", "token"), "new");
});

test("the host machine-id secret is written owner-only", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "alli-host-secrets-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const outfile = path.join(dir, "host-secret-store.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/host/host-secret-store.ts")],
    bundle: true, format: "esm", platform: "node", target: "node22", outfile, logLevel: "silent",
  });
  const module = await import(pathToFileURL(outfile).href);
  const file = path.join(dir, "host-secrets.json");

  await module.writeMachineId(file, "abc-123");
  assert.equal(mode(file), 0o600, `expected 0600, got ${mode(file).toString(8)}`);
  assert.equal(await module.readMachineId(file), "abc-123");

  // A file left 0644 by an older build is tightened on the next write.
  chmodSync(file, 0o644);
  await module.writeMachineId(file, "def-456");
  assert.equal(mode(file), 0o600);
});
