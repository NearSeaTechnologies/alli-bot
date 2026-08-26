import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(import.meta.dirname, "..");

async function loadClient(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "alli-gateway-client-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const outfile = path.join(dir, "gateway-client.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/node-agent-coordinator/gateway/gateway-client.ts")],
    bundle: true, format: "esm", platform: "node", target: "node22", outfile, logLevel: "silent",
  });
  return import(pathToFileURL(outfile).href);
}

function makeClient(module) {
  return new module.CoordinatorGatewayClient({
    resolveConnection: async () => ({ baseUrl: "http://127.0.0.1:59999", token: "t".repeat(32) }),
    timing: module.createCoordinatorGatewayClientTiming(),
    onEvent: () => {},
  });
}

test("deleting an agent always settles instead of hanging the confirmation dialog", async (t) => {
  const module = await loadClient(t);
  process.env.SAND_AGENT_DELETE_TIMEOUT_MS = "150";
  t.after(() => { delete process.env.SAND_AGENT_DELETE_TIMEOUT_MS; });
  assert.equal(module.agentDeleteTimeoutMs(), 150);

  const realFetch = globalThis.fetch;
  // A host that accepts the request and never answers - exactly the wedged case.
  globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  t.after(() => { globalThis.fetch = realFetch; });

  const client = makeClient(module);
  const started = Date.now();
  await assert.rejects(
    () => client.dispatchCommand("deleteAgents", { ids: ["a"] }),
    (error) => {
      assert.match(String(error?.message ?? error), /deleteAgents did not finish within 150ms/);
      return true;
    },
  );
  assert.ok(Date.now() - started < 5_000, "delete must reject promptly, not hang");
});

test("the delete deadline falls back to its default without an override", async (t) => {
  const module = await loadClient(t);
  delete process.env.SAND_AGENT_DELETE_TIMEOUT_MS;
  assert.equal(module.agentDeleteTimeoutMs(), module.AGENT_DELETE_TIMEOUT_MS);
  assert.ok(module.AGENT_DELETE_TIMEOUT_MS >= 10_000, "deletion needs a realistic deadline");
});
