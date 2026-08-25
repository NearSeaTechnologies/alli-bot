import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { transform } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routerSourcePath = path.join(repoRoot, "frontend/src/recovered/features/settings/overlay/router.ts");

async function loadRouterModule() {
  const source = await readFile(routerSourcePath, "utf8");
  const { code: output } = await transform(source, { format: "esm", loader: "ts", target: "es2022" });
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("router provider preference defaults to Claude and round-trips every provider", async () => {
  const router = await loadRouterModule();
  assert.deepEqual(router.ROUTER_PROVIDERS.map(({ id }) => id), ["claude-code", "codex", "grok"]);
  assert.equal(router.parseRouterProviderPreference(null), "claude-code");
  assert.equal(router.parseRouterProviderPreference("not-json"), "claude-code");
  assert.equal(router.parseRouterProviderPreference(JSON.stringify({ schemaVersion: 1, provider: "unknown" })), "claude-code");
  assert.equal(router.parseRouterProviderPreference(JSON.stringify({ schemaVersion: 1, provider: "cursor" })), "claude-code");

  let stored = null;
  const persistence = {
    async read(key) {
      assert.equal(key, router.ROUTER_PROVIDER_PERSISTENCE_KEY);
      return stored;
    },
    async write(key, value) {
      assert.equal(key, router.ROUTER_PROVIDER_PERSISTENCE_KEY);
      stored = value;
    }
  };
  for (const provider of router.ROUTER_PROVIDERS) {
    await router.saveRouterProvider(persistence, provider.id);
    assert.equal(await router.loadRouterProvider(persistence), provider.id);
  }
});

test("local inference providers keep the renderer transport connected", async () => {
  const source = await readFile(path.join(repoRoot, "source/shared/inference-router.ts"), "utf8");
  const { code } = await transform(source, { format: "esm", loader: "ts", target: "es2022" });
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  assert.equal(module.rendererTransportState("claude-code", false), "connected");
  assert.equal(module.rendererTransportState("codex", false), "connected");
  assert.equal(module.rendererTransportState("grok", false), "connected");
  assert.equal(module.rendererTransportState("cursor", false), "down");
  assert.equal(module.rendererTransportState("cursor", true), "connected");
});

test("host timeline wakes skip routed providers that cannot run on this machine", async () => {
  const source = await readFile(path.join(repoRoot, "source/shared/inference-router.ts"), "utf8");
  const { code } = await transform(source, { format: "esm", loader: "ts", target: "es2022" });
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  assert.equal(module.shouldSkipRoutedHostWake("claude-code", false), true);
  assert.equal(module.shouldSkipRoutedHostWake("claude-code", true), false);
  assert.equal(module.shouldSkipRoutedHostWake("cursor", false), false);
});

test("settings registry exposes Router with the native settings icon contract", async () => {
  const source = await readFile(path.join(repoRoot, "frontend/src/recovered/features/settings/overlay/view.tsx"), "utf8");
  assert.match(source, /\{ id: "router", label: "Router", icon: "git-branch" \}/);
});
