import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function rmTree(target) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error?.code === "ENOENT") return;
      if (error?.code !== "ENOTEMPTY" && error?.code !== "EBUSY") throw error;
      await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  await rm(target, { recursive: true, force: true });
}

async function loadModule() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "grok-inference-router-transcript-"));
  const output = path.join(temporary, "inference-router.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/node-agent-coordinator/inference-router.ts")],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rmTree(temporary) };
}

test("routed transcript preserves structured MCP mention rich text across reload", async () => {
  const loaded = await loadModule();
  try {
    const richText = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [
        { type: "mention", attrs: { id: "mcp:3213107", label: "Gmail" } },
        { type: "text", text: " what's new?" },
      ] }],
    });
    const store = loaded.module.parseInferenceRouterTranscriptStore({
      schemaVersion: 2,
      agents: {
        agent: [{
          provider: "codex",
          role: "user",
          content: "@Gmail what's new?",
          richText,
          id: "t1u",
          clientNonce: "nonce-1",
          timestampMs: 123,
        }],
      },
    });
    const projected = loaded.module.projectInferenceRouterTranscriptEntry(store.agents.agent[0]);
    assert.equal(projected.richText, richText);
    assert.deepEqual(JSON.parse(projected.richText).content[0].content[0], {
      type: "mention",
      attrs: { id: "mcp:3213107", label: "Gmail" },
    });
  } finally {
    await loaded.dispose();
  }
});

async function routedClaudeRouter(loaded, dispatchRemote) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "alli-local-roster-"));
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path.join(dataDir, "settings.json"), JSON.stringify({
    version: 1,
    mcpBoxServers: [],
    autoUpdateWhenIdleOptIn: false,
    egressTunnelEnabled: false,
    webauthnProxyEnabled: true,
    mcpCustomInstructions: {},
    mcpCustomInstructionsByServerId: {},
    mcpDisabledToolsByServerId: {},
    conciergeConsent: "unset",
    settingsMigrations: [],
    inferenceProvider: "claude-code",
  }));
  const router = loaded.module.createCoordinatorInferenceRouter({
    dataDir,
    postEvent() {},
    dispatchRemote,
  });
  return { dataDir, router };
}

test("local routing serves an Alli agent when the remote box is unavailable", async () => {
  const loaded = await loadModule();
  const { dataDir, router } = await routedClaudeRouter(loaded, async () => { throw new Error("gateway down"); });
  try {
    const listed = await router.dispatch("listAgents", {});
    assert.equal(listed.handled, true);
    assert.equal(listed.value[0].id, loaded.module.LOCAL_INFERENCE_AGENT_ID);
    assert.equal(listed.value[0].name, "Alli");
    const counted = await router.dispatch("countAgents", {});
    assert.equal(counted.value, 1);
  } finally {
    await loaded.dispose();
    await rmTree(dataDir);
  }
});

test("local routing does not inject a ghost Alli when the box already has agents", async () => {
  const loaded = await loadModule();
  const remote = [{ id: "b6e65ad6-0f1b-4739-b249-f88a99f8eec7", name: "Red" }];
  const { dataDir, router } = await routedClaudeRouter(loaded, async (method) => {
    if (method === "listAgents") return remote;
    if (method === "countAgents") return remote.length;
    throw new Error(`unexpected ${method}`);
  });
  try {
    const listed = await router.dispatch("listAgents", {});
    assert.equal(listed.handled, true);
    assert.deepEqual(listed.value.map((agent) => ({ id: agent.id, name: agent.name })), [
      { id: "b6e65ad6-0f1b-4739-b249-f88a99f8eec7", name: "Red" },
    ]);
    const counted = await router.dispatch("countAgents", {});
    assert.equal(counted.value, 1);
  } finally {
    await loaded.dispose();
    await rmTree(dataDir);
  }
});

test("local routing drops a box row that occupied alli-local instead of showing a ghost Alli", async () => {
  const loaded = await loadModule();
  const merged = loaded.module.mergeLocalInferenceAgents([
    { id: loaded.module.LOCAL_INFERENCE_AGENT_ID, name: "New Agent", path: "/home/box/sand-data/agents/alli-local/store.db" },
    { id: "4dd48f67-c212-468b-926c-d38fe0707d42", name: "Inbox Triage" },
  ]);
  assert.deepEqual(merged.map((agent) => ({ id: agent.id, name: agent.name })), [
    { id: "4dd48f67-c212-468b-926c-d38fe0707d42", name: "Inbox Triage" },
  ]);
  const event = loaded.module.mergeLocalInferenceRosterEvent({
    activeAgentId: "4dd48f67-c212-468b-926c-d38fe0707d42",
    agents: [{ id: "4dd48f67-c212-468b-926c-d38fe0707d42", name: "Inbox Triage" }],
  });
  assert.equal(event.activeAgentId, "4dd48f67-c212-468b-926c-d38fe0707d42");
  assert.equal(event.agents.length, 1);
  assert.equal(event.agents[0].name, "Inbox Triage");
});

test("creating a bot always goes to the computer host so a real agent directory is minted", async () => {
  const loaded = await loadModule();
  const { dataDir, router } = await routedClaudeRouter(loaded, async () => { throw new Error("gateway down"); });
  try {
    const created = await router.dispatch("createAgent", { name: "New Bot", description: "", origin: "user" });
    assert.equal(created.handled, false);
  } finally {
    await loaded.dispose();
    await rmTree(dataDir);
  }
});

test("routed transcript rejects malformed rich text carriers", async () => {
  const loaded = await loadModule();
  try {
    const store = loaded.module.parseInferenceRouterTranscriptStore({
      schemaVersion: 2,
      agents: {
        agent: [{ provider: "codex", role: "user", content: "@Gmail", richText: {}, id: "t1u", timestampMs: 123 }],
      },
    });
    assert.deepEqual(store.agents.agent, []);
  } finally {
    await loaded.dispose();
  }
});

function pluginTool(plugin, toolName) {
  return {
    name: `${plugin}_${toolName}`,
    providerIdentifier: plugin,
    toolName,
    description: `${toolName} via ${plugin}`,
    inputSchema: { type: "object" },
  };
}

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const value = predicate();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(label);
}

test("plugin permission identity keeps Gmail, Slack, and Linear separate", async () => {
  const loaded = await loadModule();
  try {
    const gmail = loaded.module.pluginPermissionIdentity("mcp__grok_bot_plugins__search_threads", {
      providerIdentifier: "gmail",
      toolName: "search_threads",
    });
    const slack = loaded.module.pluginPermissionIdentity("post_message", {
      providerIdentifier: "slack",
      toolName: "post_message",
    });
    const linear = loaded.module.pluginPermissionIdentity("linear_create_issue", {
      providerIdentifier: "linear",
      toolName: "create_issue",
    });
    assert.equal(gmail.key, "plugin:gmail");
    assert.equal(slack.key, "plugin:slack");
    assert.equal(linear.key, "plugin:linear");
    assert.notEqual(gmail.key, slack.key);
    assert.match(gmail.target, /gmail/);
    assert.match(slack.target, /slack/);
    const claudeName = loaded.module.resolveRoutedPluginTool("mcp__grok_bot_plugins__gmail_search_threads", [
      pluginTool("gmail", "search_threads"),
      { name: "gmail_search_threads", providerIdentifier: "gmail", toolName: "search_threads" },
    ]);
    assert.equal(claudeName.providerIdentifier, "gmail");
    const sales = loaded.module.resolveRoutedPluginTool("mcp__grok_bot_plugins__user-Gmail--sales-list_labels", [
      { name: "user-Gmail--sales-list_labels", providerIdentifier: "user-Gmail--sales", toolName: "list_labels" },
    ]);
    assert.equal(sales.providerIdentifier, "user-Gmail--sales");
    assert.equal(loaded.module.pluginConnectorName(sales, "mcp__grok_bot_plugins__user-Gmail--sales-list_labels"), "Gmail");
    assert.deepEqual(loaded.module.pluginPermissionLabel(sales, "mcp__grok_bot_plugins__user-Gmail--sales-list_labels"), {
      catalog: "Gmail",
      account: "sales",
      label: "Gmail (sales)",
    });
    assert.equal(loaded.module.pluginPermissionLabel({ providerIdentifier: "user-Gmail--main", toolName: "search_threads" }, "search_threads").label, "Gmail (main)");
    assert.equal(loaded.module.pluginPermissionLabel({
      providerIdentifier: "user-Gmail",
      toolName: "list_labels",
      accountKey: "default",
    }, "list_labels").label, "Gmail");
    const listed = [
      { providerIdentifier: "user-Gmail", toolName: "list_labels", accountKey: "default", accountEmail: "pedro.pinho@alongside.team" },
      { providerIdentifier: "user-Gmail--sales", toolName: "list_labels", accountKey: "sales", accountEmail: "sales@alongside.team" },
    ];
    assert.equal(loaded.module.pluginPermissionLabel({
      providerIdentifier: "user-Gmail",
      toolName: "list_labels",
    }, "list_labels", null, [{ role: "user", content: "use pedro.pinho@alongside.team" }], listed).label, "Gmail (pedro.pinho@alongside.team)");
    assert.equal(loaded.module.pluginPermissionLabel({
      providerIdentifier: "user-Gmail",
      toolName: "list_labels",
    }, "list_labels", null, [{ role: "user", content: "email someone@else.com about the labels" }], listed).label, "Gmail");
    assert.equal(loaded.module.pluginPermissionLabel({
      providerIdentifier: "user-Gmail",
      toolName: "list_labels",
    }, "list_labels", { mailbox: "sales@alongside.team" }, [{ role: "user", content: "use pedro.pinho@alongside.team" }]).label, "Gmail (sales@alongside.team)");
    const hint = loaded.module.pluginAccountsHint([
      { name: "user-Gmail-list_labels", providerIdentifier: "user-Gmail", toolName: "list_labels" },
      { name: "user-Gmail--sales-list_labels", providerIdentifier: "user-Gmail--sales", toolName: "list_labels" },
    ]);
    assert.match(hint, /Gmail \(default, sales\)/);
  } finally {
    await loaded.dispose();
  }
});

test("connected plugins run without a blocking Allow click", async () => {
  const loaded = await loadModule();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "alli-plugin-permission-"));
  const { writeFile } = await import("node:fs/promises");
  const tools = [
    pluginTool("gmail", "search_threads"),
    pluginTool("gmail", "create_label"),
    pluginTool("slack", "post_message"),
    pluginTool("linear", "create_issue"),
  ];
  const events = [];
  const executed = [];
  try {
    await writeFile(path.join(dataDir, "settings.json"), JSON.stringify({
      version: 1,
      mcpBoxServers: [],
      autoUpdateWhenIdleOptIn: false,
      egressTunnelEnabled: false,
      webauthnProxyEnabled: true,
      mcpCustomInstructions: {},
      mcpCustomInstructionsByServerId: {},
      mcpDisabledToolsByServerId: {},
      conciergeConsent: "unset",
      settingsMigrations: [],
      inferenceProvider: "grok",
    }));
    const router = loaded.module.createCoordinatorInferenceRouter({
      dataDir,
      composeDelayMs: 0,
      permissionTimeoutMs: 500,
      postEvent(_family, payload) { events.push(payload); },
      dispatchRemote: async (method, args) => {
        if (method === "listAgents") return [];
        if (method === "getAgentTranscriptTail") return { entries: [] };
        if (method === "listRoutedMcpTools") return tools;
        if (method === "executeRoutedMcpTool") {
          executed.push(args);
          return { ok: true, tool: args.toolName };
        }
        throw new Error(`unexpected ${method}`);
      },
      runProvider: async (_provider, _messages, options) => {
        for (const tool of tools) await options.executeTool(tool, {}, `call-${tool.name}`);
        return "used plugins";
      },
    });
    void router.dispatch("sendPrompt", { agentId: loaded.module.LOCAL_INFERENCE_AGENT_ID, prompt: "check mail, slack, and linear" });
    await waitFor(() => executed.length === 4, "expected every connected plugin tool to run");
    assert.deepEqual(executed.map(row => row.providerIdentifier), ["gmail", "gmail", "slack", "linear"]);
    const permissionAsks = events.filter(payload =>
      payload?.type === "appended" && payload.entry?.message?.type === "auto-review-approval"
    );
    assert.equal(permissionAsks.length, 3, "Gmail should notice once, then Slack and Linear");
    assert.equal(permissionAsks[0].entry.message.approval.status, "approved");
    assert.match(permissionAsks[0].entry.message.approval.reason, /Using Gmail/);
    const connectors = events.filter(payload => payload?.type === "appended" && payload.entry?.message?.type === "connector");
    assert.equal(connectors.length, 0, "already-connected plugins must not prompt to add another account");
  } finally {
    await loaded.dispose();
    await rmTree(dataDir);
  }
});

test("Claude plugin bridge runs Slack without a blocking Allow click", async () => {
  const loaded = await loadModule();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "alli-claude-plugin-permission-"));
  const { writeFile } = await import("node:fs/promises");
  const tools = [pluginTool("gmail", "search_threads"), pluginTool("slack", "post_message")];
  const events = [];
  const executed = [];
  try {
    await writeFile(path.join(dataDir, "settings.json"), JSON.stringify({
      version: 1,
      mcpBoxServers: [],
      autoUpdateWhenIdleOptIn: false,
      egressTunnelEnabled: false,
      webauthnProxyEnabled: true,
      mcpCustomInstructions: {},
      mcpCustomInstructionsByServerId: {},
      mcpDisabledToolsByServerId: {},
      conciergeConsent: "unset",
      settingsMigrations: [],
      inferenceProvider: "claude-code",
    }));
    const router = loaded.module.createCoordinatorInferenceRouter({
      dataDir,
      composeDelayMs: 0,
      permissionTimeoutMs: 500,
      postEvent(_family, payload) { events.push(payload); },
      dispatchRemote: async (method, args) => {
        if (method === "listAgents") return [];
        if (method === "getAgentTranscriptTail") return { entries: [] };
        if (method === "listRoutedMcpTools") return tools;
        if (method === "executeRoutedMcpTool") {
          executed.push(args);
          return { result: { case: "success", value: { content: [] } } };
        }
        throw new Error(`unexpected ${method}`);
      },
      runProvider: async (_provider, _messages, options) => {
        const rpc = async (method, params) => {
          const response = await fetch(options.mcpServerUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          });
          return await response.json();
        };
        await rpc("initialize", {});
        await rpc("tools/list", {});
        await rpc("tools/call", { name: "slack_post_message", arguments: { text: "hi" } });
        return "used slack";
      },
    });
    await router.dispatch("sendPrompt", { agentId: loaded.module.LOCAL_INFERENCE_AGENT_ID, prompt: "post to slack" });
    await waitFor(() => executed.some(row => row.providerIdentifier === "slack"), "expected Slack to execute");
    assert.equal(executed.length, 1);
    assert.equal(executed[0].toolName, "post_message");
  } finally {
    await loaded.dispose();
    await rmTree(dataDir);
  }
});

test("routed answers open a streaming typing bubble then settle the same message", async () => {
  const loaded = await loadModule();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "alli-stream-reveal-"));
  const { writeFile } = await import("node:fs/promises");
  const events = [];
  const queued = [];
  try {
    await writeFile(path.join(dataDir, "settings.json"), JSON.stringify({
      version: 1,
      mcpBoxServers: [],
      autoUpdateWhenIdleOptIn: false,
      egressTunnelEnabled: false,
      webauthnProxyEnabled: true,
      mcpCustomInstructions: {},
      mcpCustomInstructionsByServerId: {},
      mcpDisabledToolsByServerId: {},
      conciergeConsent: "unset",
      settingsMigrations: [],
      inferenceProvider: "grok",
    }));
    const router = loaded.module.createCoordinatorInferenceRouter({
      dataDir,
      composeDelayMs: 0,
      schedule: callback => {
        queued.push(callback);
        return queued.length;
      },
      postEvent(_family, payload) { events.push(payload); },
      dispatchRemote: async method => {
        if (method === "listAgents") return [];
        if (method === "getAgentTranscriptTail") return { entries: [] };
        if (method === "listRoutedMcpTools") return [];
        throw new Error(`unexpected ${method}`);
      },
      runProvider: async (_provider, _messages, options) => {
        options.onTextDelta("Hello from Alli.", "Hello from Alli.");
        return "Hello from Alli.";
      },
    });
    const pump = () => { while (queued.length > 0) queued.shift()(); };
    void router.dispatch("sendPrompt", { agentId: loaded.module.LOCAL_INFERENCE_AGENT_ID, prompt: "hi" });
    const opened = await waitFor(() => {
      pump();
      return events.find(payload =>
        payload?.type === "appended"
        && payload.entry?.kind === "send-message"
        && payload.entry.message?.type === "text"
        && payload.entry.streaming === true
        && payload.entry.message.content === ""
      );
    }, "expected an empty streaming typing bubble");
    assert.equal(opened.entry.id, "t0s0");
    const settled = await waitFor(() => {
      pump();
      return events.find(payload =>
        payload?.type === "updated"
        && payload.entry?.id === "t0s0"
        && payload.entry.streaming === false
        && payload.entry.message?.content === "Hello from Alli."
      );
    }, "expected the same bubble to settle");
    assert.equal(settled.entry.id, opened.entry.id);
    const assistantAppends = events.filter(payload =>
      payload?.type === "appended" && payload.entry?.kind === "send-message" && payload.entry.message?.type === "text"
    );
    assert.equal(assistantAppends.length, 1);
  } finally {
    await loaded.dispose();
    await rmTree(dataDir);
  }
});
