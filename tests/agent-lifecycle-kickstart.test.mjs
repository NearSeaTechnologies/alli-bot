import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "alli-kickstart-"));
  const output = path.join(temporary, "agent-lifecycle.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/host/extensions/transcript/agent-lifecycle.ts")],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    packages: "bundle",
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

function stubLifecycle(AgentLifecycle) {
  let introductionPending = true;
  const queued = [];
  const runs = [];
  const session = {
    id: "agent-1",
    db: {
      getIntroductionPending: () => introductionPending,
      setIntroductionPending: (value) => {
        introductionPending = value;
      },
      getTranscriptEntries: () => [],
      getAgentPurpose: () => undefined,
    },
  };
  const tm = {
    sessions: {
      activeSession: session,
      resolveBackgroundSession: async () => session,
    },
    groupChat: {
      isGroupSession: () => false,
      isRemoteRoomSession: () => false,
    },
    execution: { canExecute: true },
    runLifecycle: {
      inFlightRunCounts: new Map(),
      lastRequestIdBySession: new Map(),
      beginSessionRun: () => {},
      endSessionRun: () => {},
      enqueueExclusiveRun: (_agentId, task) => {
        queued.push(task);
        return Promise.resolve();
      },
    },
    runnerRegistry: {
      getRunner: () => ({
        run: async () => {
          runs.push("intro");
          return { sentMessageCount: 1, aborted: false, quiescedForUpgrade: false };
        },
      }),
    },
    turnRuntime: { activeRequestSources: new Map() },
    roster: { emitAgentUpdate: async () => {} },
    telemetry: { reportAgentError: () => {} },
    trayErrors: { pushError: () => {} },
    automationRuntime: { ensureHiddenTurnReply: async () => false },
    upgradeResume: { markAgentResumePending: () => {} },
  };
  return { lifecycle: new AgentLifecycle(tm), queued, runs };
}

test("kickstartAgent enqueues one intro when called twice before the queue drains", async () => {
  const loaded = await loadModule();
  try {
    const { lifecycle, queued, runs } = stubLifecycle(loaded.module.AgentLifecycle);
    assert.equal(await lifecycle.kickstartAgent("agent-1", true), true);
    assert.equal(await lifecycle.kickstartAgent("agent-1", true), true);
    assert.equal(queued.length, 1);
    await queued[0]();
    assert.equal(runs.length, 1);
  } finally {
    await loaded.dispose();
  }
});
