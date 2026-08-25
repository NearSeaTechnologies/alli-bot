import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import * as esbuild from "esbuild";

import {
  LOCAL_DOCKER_KEEP_ALIVE_MS,
  SANDBOX_COMPUTER_KEEP_AWAKE_COMMAND,
  runSandboxComputerKeepAwake,
} from "../source/shared/sandbox-computer-always-on.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadBundled(entry) {
  const result = await esbuild.build({
    absWorkingDir: repoRoot,
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

test("keep-awake command disables sleep, DPMS, and power-off options", () => {
  assert.match(SANDBOX_COMPUTER_KEEP_AWAKE_COMMAND, /xset s off/);
  assert.match(SANDBOX_COMPUTER_KEEP_AWAKE_COMMAND, /xset -dpms/);
  assert.match(SANDBOX_COMPUTER_KEEP_AWAKE_COMMAND, /ShowHibernate -s false/);
  assert.match(SANDBOX_COMPUTER_KEEP_AWAKE_COMMAND, /ShowSuspend -s false/);
  assert.equal(LOCAL_DOCKER_KEEP_ALIVE_MS, 15_000);
});

test("keep-awake runner applies the command and skips guest-tool failures", async () => {
  const ran = [];
  assert.equal(await runSandboxComputerKeepAwake(async (command) => { ran.push(command); }), "applied");
  assert.equal(ran.length, 1);
  assert.equal(ran[0], SANDBOX_COMPUTER_KEEP_AWAKE_COMMAND);
  assert.equal(await runSandboxComputerKeepAwake(async () => { throw new Error("xset missing"); }), "skipped");
});

test("paused connector still throws when a caller forces pause, unpaused does not", async () => {
  const pause = await loadBundled("source/electron-main/box/box-client-pause.ts");
  const live = pause.wrapRemoteHostConnectorWithClientPause({ connect: async () => "up" }, () => false);
  assert.equal(await live.connect(), "up");
  const blocked = pause.wrapRemoteHostConnectorWithClientPause({ connect: async () => "up" }, () => true);
  await assert.rejects(() => blocked.connect(), { name: "SandClientPausedError" });
});

test("client pause control still honors the feature gate", async () => {
  const pause = await loadBundled("source/electron-main/box/box-client-pause.ts");
  let dropped = 0;
  const control = pause.createSandClientPauseControl(
    { checkFeatureGate: (name) => name === pause.SAND_CLIENT_PAUSE_GATE },
    { setGatewayPaused: async ({ paused }) => ({ paused }) },
    { dropObservedConnection: () => { dropped += 1; } },
  );
  assert.equal(control.isPaused(), true);
  control.noteGateMayHaveChanged();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dropped, 1);

  const off = pause.createSandClientPauseControl(
    { checkFeatureGate: () => false },
    { setGatewayPaused: async ({ paused }) => ({ paused }) },
    { dropObservedConnection: () => {} },
  );
  assert.equal(off.isPaused(), false);
});

test("loopback hibernate is a no-op and ensure keeps the desktop awake", async () => {
  const loopback = await readFile(path.join(repoRoot, "source", "host", "box", "loopback-sand-box.ts"), "utf8");
  assert.match(loopback, /async hibernate\(\): Promise<void> \{\}/);
  assert.match(loopback, /keepSandboxComputerAwake/);
  assert.doesNotMatch(loopback, /clearAgentWindowConnections\(this\.windowConnections/);
});

test("computer overlay keep-alive ensures once per agent, then on an interval", async () => {
  const controller = await readFile(path.join(repoRoot, "frontend", "src", "recovered", "features", "computer", "shell", "controller.ts"), "utf8");
  const model = await readFile(path.join(repoRoot, "frontend", "src", "recovered", "features", "computer", "shell", "model.ts"), "utf8");
  assert.match(model, /FOREVER_BOX_KEEP_ALIVE_MS = 60_000/);
  const resetAt = controller.indexOf("activeGeneration.current += 1");
  const resetEnd = controller.indexOf("}, [activeAgentId, fetchAsyncTasks, fetchSubagents, statusStore]);");
  assert.ok(resetAt >= 0 && resetEnd > resetAt);
  const resetEffect = controller.slice(resetAt, resetEnd);
  assert.match(resetEffect, /fetchAsyncTasks\(activeAgentId\);/);
  assert.doesNotMatch(resetEffect, /\bensure\(/);
  const keepAliveAt = controller.indexOf("const timer = window.setInterval(() => ensure(activeAgentId), FOREVER_BOX_KEEP_ALIVE_MS);");
  assert.ok(keepAliveAt >= 0);
  const keepAliveEffect = controller.slice(keepAliveAt - 120, keepAliveAt + 160);
  assert.match(keepAliveEffect, /if \(activeAgentId == null\) return;\s*ensure\(activeAgentId\);\s*const timer = window\.setInterval\(\(\) => ensure\(activeAgentId\), FOREVER_BOX_KEEP_ALIVE_MS\);/);
  assert.match(keepAliveEffect, /return \(\) => window\.clearInterval\(timer\);/);
});

test("local Docker VM stays running while selected and still stops when leaving local-docker", async () => {
  const localDocker = await readFile(path.join(repoRoot, "source", "electron-main", "box", "local-docker-host-connector.ts"), "utf8");
  assert.match(localDocker, /"--restart", "always"/);
  assert.doesNotMatch(localDocker, /unless-stopped/);
  assert.match(localDocker, /startLocalDockerKeepAlive/);
  const stopAt = localDocker.indexOf("export async function stopLocalDockerBox");
  assert.ok(stopAt >= 0);
  const stopBody = localDocker.slice(stopAt, stopAt + 700);
  assert.match(stopBody, /stopLocalDockerKeepAlive\(\)/);
  assert.match(stopBody, /\["stop", LOCAL_DOCKER_BOX_CONTAINER\]/);
});
