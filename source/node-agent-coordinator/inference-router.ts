import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { zodToJsonSchema } from "zod-to-json-schema";

import { runRoutedProviderText } from "../host/extensions/inference/provider-session.js";
import type { SandInferenceProvider } from "../shared/inference-router.js";
import { DEFAULT_MCP_ACCOUNT_KEY, emailFromPluginInput, lastEmailFromConversation, matchingConnectedAccountEmail } from "../shared/mcp.js";
import { sandWidgetSchema, type SandWidget } from "../shared/sand-widgets.js";
import { SandSettingsStore } from "../shared/node/settings/sand-settings-store.js";
import { createPacedTextReveal } from "./paced-text-reveal.js";
import { createRoutedMcpBridge } from "./routed-mcp-bridge.js";

function jsonSchemaFromZod(schema: typeof sandWidgetSchema): Record<string, unknown> {
  const json = zodToJsonSchema(schema, { $refStrategy: "none" }) as Record<string, unknown>;
  const { $schema: _schema, ...rest } = json;
  return rest;
}

type StoredEntry = {
  readonly provider: Exclude<SandInferenceProvider, "cursor">;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly richText?: string;
  readonly id: string;
  readonly clientNonce?: string;
  readonly reactions?: readonly { readonly emoji: string; readonly by: string }[];
  readonly timestampMs: number;
};
type Store = { readonly schemaVersion: 2; readonly agents: Readonly<Record<string, readonly StoredEntry[]>> };

const EMPTY_STORE: Store = { schemaVersion: 2, agents: {} };

export const LOCAL_INFERENCE_AGENT_ID = "alli-local";

export function createLocalInferenceAgent(nowMs = Date.now()): Record<string, unknown> {
  return {
    id: LOCAL_INFERENCE_AGENT_ID,
    name: "Alli",
    description: "",
    title: "",
    avatarDataUrl: null,
    avatarVersion: null,
    avatarShape: null,
    avatarColor: null,
    createdAt: nowMs,
    updatedAt: nowMs,
    path: "",
    isActive: true,
    isRunning: false,
    isComposingMessage: false,
    lastEntry: null,
    lastMessageId: null,
    lastMessagePreview: null,
    newestEntryId: null,
    hasUnread: false,
    unreadCount: 0,
    lastViewedAt: 0,
    lastActivityAt: 0,
    awaitingUserResponse: null,
    notificationsEnabled: false,
    notifyOnUpdatesEnabled: true,
    isHiddenFromSidebar: false,
    origin: "user",
    isGroup: false,
    memberIds: [],
    conversationPartnerIds: [],
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value != null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function routedPluginToolRows(value: unknown): Record<string, any>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(raw => {
    const row = asRecord(raw);
    if (row == null || typeof row.name !== "string" || row.name.length === 0) return [];
    return [row];
  });
}

export function resolveRoutedPluginTool(toolName: string, tools: readonly Record<string, any>[], definition?: Record<string, unknown> | null): Record<string, any> | null {
  if (definition != null && typeof definition.providerIdentifier === "string" && typeof definition.toolName === "string") return definition;
  const stripped = toolName.replace(/^mcp__grok_bot_plugins__/, "");
  return tools.find(tool => {
    const name = typeof tool.name === "string" ? tool.name : "";
    const native = typeof tool.toolName === "string" ? tool.toolName : "";
    const provider = typeof tool.providerIdentifier === "string" ? tool.providerIdentifier : "";
    return name === toolName
      || name === stripped
      || native === stripped
      || `mcp__grok_bot_plugins__${name}` === toolName
      || (provider.length > 0 && native.length > 0 && (stripped === `${provider}-${native}` || stripped === `${provider}_${native}` || stripped.endsWith(`-${native}`) && stripped.slice(0, -(native.length + 1)) === provider));
  }) ?? (definition ?? null);
}

export function pluginPermissionIdentity(toolName: string, definition?: Record<string, unknown> | null): { readonly key: string; readonly target: string } {
  const provider = typeof definition?.providerIdentifier === "string" ? definition.providerIdentifier.trim() : "";
  const native = typeof definition?.toolName === "string" ? definition.toolName.trim() : "";
  const stripped = toolName.replace(/^mcp__grok_bot_plugins__/, "").replace(/__/g, " / ");
  const plugin = provider.length > 0 ? provider : (stripped.split(" / ")[0] ?? stripped);
  const action = native.length > 0 ? native : stripped;
  return {
    key: `plugin:${plugin}`,
    target: provider.length > 0 && native.length > 0 && provider !== native ? `${provider} / ${native}` : action,
  };
}

export function pluginConnectorName(definition?: Record<string, unknown> | null, toolName = ""): string {
  return pluginPermissionLabel(definition, toolName).catalog;
}

export function pluginPermissionLabel(
  definition?: Record<string, unknown> | null,
  toolName = "",
  input?: Record<string, unknown> | null,
  conversation: readonly { readonly role?: unknown; readonly content?: unknown }[] = [],
  listedTools: readonly Record<string, unknown>[] = [],
): { readonly catalog: string; readonly account: string | null; readonly label: string } {
  const provider = typeof definition?.providerIdentifier === "string" ? definition.providerIdentifier : "";
  const native = typeof definition?.toolName === "string" ? definition.toolName : "";
  const stripped = toolName.replace(/^mcp__grok_bot_plugins__/, "");
  const raw = provider.length > 0 ? provider : stripped;
  const blob = `${provider} ${toolName}`.replace(/[_-]+/g, " ");
  const known = /\b(gmail|slack|linear|github|notion|outlook|jira|asana|hubspot|salesforce|calendar|drive)\b/i.exec(blob);
  let catalog = "plugin";
  if (known != null) {
    const name = known[1]!.toLowerCase();
    catalog = name === "calendar" || name === "drive" ? `Google ${name[0]!.toUpperCase()}${name.slice(1)}` : name.replace(/\b\w/g, letter => letter.toUpperCase());
  } else {
    const cleaned = raw.replace(/^user-/i, "").split("--")[0]?.replace(/[_-]+/g, " ").trim() ?? "";
    if (cleaned.length > 0) catalog = cleaned.replace(/\b\w/g, letter => letter.toUpperCase());
  }
  const instance = /--([A-Za-z0-9][A-Za-z0-9_-]*)/.exec(raw);
  let account = instance?.[1] ?? (typeof definition?.accountKey === "string" ? definition.accountKey : null);
  if (account != null && native.length > 0 && (account === native || account.endsWith(`-${native}`))) {
    account = account === native ? null : account.slice(0, -(native.length + 1));
    if (account != null && account.length === 0) account = null;
  }
  if (account === DEFAULT_MCP_ACCOUNT_KEY) account = null;
  const inputEmail = emailFromPluginInput(input);
  if (inputEmail != null) {
    account = matchingConnectedAccountEmail(inputEmail, listedTools, definition) ?? inputEmail;
  } else {
    const mentioned = matchingConnectedAccountEmail(
      lastEmailFromConversation(conversation),
      listedTools,
      definition,
    );
    if (mentioned != null) account = mentioned;
  }
  return {
    catalog,
    account,
    label: account != null ? `${catalog} (${account})` : catalog,
  };
}

export const ASK_QUESTION_TOOL_NAME = "AskQuestion";
export const PROMPT_CONNECTORS_TOOL_NAME = "PromptConnectors";

export function isRoutedPromptTool(tool?: { readonly name?: unknown; readonly toolName?: unknown } | null): boolean {
  const name = typeof tool?.name === "string" ? tool.name.replace(/^mcp__grok_bot_plugins__/, "") : "";
  const native = typeof tool?.toolName === "string" ? tool.toolName : "";
  return name === ASK_QUESTION_TOOL_NAME || name === PROMPT_CONNECTORS_TOOL_NAME
    || native === ASK_QUESTION_TOOL_NAME || native === PROMPT_CONNECTORS_TOOL_NAME;
}

export function routedPromptTools(): Record<string, any>[] {
  return [
    {
      name: ASK_QUESTION_TOOL_NAME,
      providerIdentifier: "alli",
      toolName: ASK_QUESTION_TOOL_NAME,
      description: "Ask the user a question with selectable options as a question card. Use this instead of listing choices in plain text. Sending this waits for their pick. Set dismissOnMoveOn only for low-stakes questions that should auto-dismiss if the user sends a newer message without answering.",
      inputSchema: jsonSchemaFromZod(sandWidgetSchema),
    },
    {
      name: PROMPT_CONNECTORS_TOOL_NAME,
      providerIdentifier: "alli",
      toolName: PROMPT_CONNECTORS_TOOL_NAME,
      description: "Show in-chat connect cards for connectors the user still needs. Never include a connector that is already connected. One name shows a single connector card; several show a connectors list. Never paste a connect link or describe setup in plain text.",
      inputSchema: {
        type: "object",
        required: ["connectors"],
        properties: {
          connectors: { type: "array", minItems: 1, items: { type: "string" } },
          reason: { type: "string" },
        },
      },
    },
  ];
}

export function pluginAccountLabels(tools: readonly Record<string, any>[]): Map<string, string[]> {
  const byPlugin = new Map<string, string[]>();
  for (const tool of tools) {
    if (isRoutedPromptTool(tool)) continue;
    const name = typeof tool.name === "string" ? tool.name : "";
    const { catalog, account } = pluginPermissionLabel(tool, name);
    const email = typeof tool.accountEmail === "string" && tool.accountEmail.includes("@") ? tool.accountEmail : null;
    const key = email ?? account ?? "default";
    const list = byPlugin.get(catalog) ?? [];
    if (!list.includes(key)) list.push(key);
    byPlugin.set(catalog, list);
  }
  return byPlugin;
}

export function pluginAccountsHint(tools: readonly Record<string, any>[]): string | null {
  const byPlugin = pluginAccountLabels(tools);
  const multi = [...byPlugin.entries()].filter(([, accounts]) => accounts.length > 1);
  if (multi.length === 0) return null;
  return `Connected plugin accounts: ${multi.map(([plugin, accounts]) => `${plugin} (${accounts.join(", ")})`).join("; ")}. Ask which email or account to use before calling these tools. After the user answers, use that account.`;
}

export function routedCardsHint(tools: readonly Record<string, any>[] = []): string {
  const lines = ["When you need a decision, call AskQuestion so it renders as a question card. Never list options in plain text."];
  if (tools.length > 0) {
    lines.push("When a needed connector is not already connected, call PromptConnectors so the user gets a connect card. Never paste connect links in plain text.");
  }
  const accounts = pluginAccountsHint(tools);
  if (accounts != null) lines.push(accounts);
  return lines.join("\n");
}

export function filterUnconnectedConnectors(connectors: readonly unknown[], tools: readonly Record<string, any>[]): string[] {
  const connected = new Set([...pluginAccountLabels(tools).keys()].map(name => name.toLowerCase()));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of connectors) {
    if (typeof raw !== "string") continue;
    const name = raw.trim();
    if (name.length === 0) continue;
    const catalog = pluginPermissionLabel({ providerIdentifier: name }, name).catalog.toLowerCase();
    const key = name.toLowerCase();
    if (connected.has(key) || connected.has(catalog)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

export function parseAskQuestionArgs(args: unknown): SandWidget | null {
  const parsed = sandWidgetSchema.safeParse(args);
  return parsed.success ? parsed.data : null;
}

export function widgetReplyText(widget: unknown, picked: string): string {
  const record = asRecord(widget);
  const options = Array.isArray(record?.options) ? record.options : [];
  for (const raw of options) {
    const option = asRecord(raw);
    if (option == null) continue;
    const label = typeof option.label === "string" ? option.label.trim() : "";
    const value = typeof option.value === "string" ? option.value.trim() : "";
    if (picked === value || picked === label) return value.length > 0 ? value : label;
  }
  return picked;
}

function pluginPermissionResolution(value: unknown): string {
  if (value === "always" || value === "allow-once" || value === "never") return value;
  if (value === "approved") return "allow-once";
  return "deny";
}

export function mergeLocalInferenceAgents(remote: readonly unknown[], nowMs = Date.now()): Record<string, unknown>[] {
  const rest: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let remoteCount = 0;
  for (const raw of remote) {
    const row = asRecord(raw);
    if (row == null || typeof row.id !== "string") continue;
    remoteCount += 1;
    if (row.id === LOCAL_INFERENCE_AGENT_ID || seen.has(row.id)) continue;
    seen.add(row.id);
    rest.push(row);
  }
  if (rest.length > 0) return rest;
  return remoteCount === 0 ? [createLocalInferenceAgent(nowMs)] : [];
}

export function mergeLocalInferenceRosterEvent(payload: unknown, nowMs = Date.now()): Record<string, unknown> {
  const record = asRecord(payload) ?? {};
  const agents = Array.isArray(record.agents) ? record.agents : Array.isArray(payload) ? payload : [];
  const merged = mergeLocalInferenceAgents(agents, nowMs);
  if (Array.isArray(payload) && asRecord(payload) == null) return { agents: merged };
  const agent = asRecord(record.agent);
  return {
    ...record,
    agents: merged,
    ...(agent?.id === LOCAL_INFERENCE_AGENT_ID ? { agent: alliOverlay(agent, nowMs) } : {}),
  };
}

function alliOverlay(agent: Record<string, unknown>, nowMs: number): Record<string, unknown> {
  return { ...createLocalInferenceAgent(nowMs), isRunning: agent.isRunning === true, isComposingMessage: agent.isComposingMessage === true };
}

export function parseInferenceRouterTranscriptStore(value: unknown): Store {
  const root = asRecord(value);
  if (root?.schemaVersion !== 2 || asRecord(root.agents) == null) return EMPTY_STORE;
  const agents: Record<string, StoredEntry[]> = {};
  for (const [agentId, rawEntries] of Object.entries(root.agents as Record<string, unknown>)) {
    if (!Array.isArray(rawEntries)) continue;
    const entries: StoredEntry[] = [];
    for (const raw of rawEntries) {
      const row = asRecord(raw);
      if (row == null || !["codex", "claude-code", "grok", "openrouter"].includes(String(row.provider)) || !["user", "assistant"].includes(String(row.role)) || typeof row.content !== "string" || typeof row.id !== "string" || typeof row.timestampMs !== "number" || (row.clientNonce !== undefined && typeof row.clientNonce !== "string") || (row.richText !== undefined && typeof row.richText !== "string")) continue;
      if (row.reactions !== undefined && (!Array.isArray(row.reactions) || row.reactions.some(reaction => asRecord(reaction) == null || typeof asRecord(reaction)!.emoji !== "string" || typeof asRecord(reaction)!.by !== "string"))) continue;
      entries.push(row as unknown as StoredEntry);
    }
    agents[agentId] = entries.slice(-200);
  }
  return { schemaVersion: 2, agents };
}

const LOCAL_ATTACHMENT_TEXT_CAP = 64 * 1024;

async function readLocalAttachmentText(path: string, dispatchRemote: (method: string, args: unknown) => Promise<unknown>): Promise<string | null> {
  try {
    const local = await readFile(path);
    if (local.includes(0)) return `(binary file, ${local.byteLength} bytes)`;
    return local.subarray(0, LOCAL_ATTACHMENT_TEXT_CAP).toString("utf8");
  } catch {}
  try {
    const remote = await dispatchRemote("readAttachmentText", { path });
    const record = asRecord(remote);
    if (record?.kind === "text" && typeof record.text === "string") return record.text;
    if (record?.kind === "binary" && typeof record.bytes === "number") return `(binary file, ${record.bytes} bytes)`;
    if (typeof remote === "string") return remote;
  } catch {}
  return null;
}

async function formatLocalAttachmentNote(
  paths: readonly string[],
  names: readonly string[],
  dispatchRemote: (method: string, args: unknown) => Promise<unknown>,
): Promise<string> {
  if (paths.length === 0) return "";
  const blocks: string[] = [`The user attached ${paths.length === 1 ? "a file" : `${paths.length} files`}:`];
  for (const [index, path] of paths.entries()) {
    const name = names[index] && names[index]!.length > 0 ? names[index]! : basename(path);
    const text = await readLocalAttachmentText(path, dispatchRemote);
    blocks.push(text == null ? `- ${name} (${path})` : `- ${name} (${path})\n\n${text}`);
  }
  return blocks.join("\n");
}

export function projectInferenceRouterTranscriptEntry(entry: StoredEntry): Record<string, unknown> {
  return entry.role === "user"
    ? { kind: "message", id: entry.id, role: "user", content: entry.content, ...(entry.richText === undefined ? {} : { richText: entry.richText }), isStreaming: false, timestampMs: entry.timestampMs, ...(entry.clientNonce === undefined ? {} : { clientNonce: entry.clientNonce }), ...(entry.reactions === undefined ? {} : { reactions: entry.reactions }) }
    : { kind: "send-message", id: entry.id, message: { type: "text", content: entry.content }, timestampMs: entry.timestampMs, ...(entry.reactions === undefined ? {} : { reactions: entry.reactions }) };
}

export function createCoordinatorInferenceRouter(options: {
  readonly dataDir: string;
  readonly postEvent: (family: string, payload: unknown) => void;
  readonly dispatchRemote: (method: string, args: unknown) => Promise<unknown>;
  readonly now?: () => number;
  readonly composeDelayMs?: number;
  readonly permissionTimeoutMs?: number;
  readonly schedule?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  readonly runProvider?: typeof runRoutedProviderText;
}) {
  const settings = new SandSettingsStore(join(options.dataDir, "settings.json"));
  const storePath = join(options.dataDir, "inference-router-transcript.json");
  const now = options.now ?? Date.now;
  const queues = new Map<string, Promise<unknown>>();
  const pluginPermissionWaiters = new Map<string, (resolution: string) => void>();
  type WidgetWait = { readonly status: "answered"; readonly value: string } | { readonly status: "dismissed" } | { readonly status: "timeout" } | { readonly status: "moved-on" };
  const widgetWaiters = new Map<string, { readonly agentId: string; readonly dismissOnMoveOn: boolean; settle(result: WidgetWait): void }>();
  const sessionAllowedPlugins = new Set<string>();
  const sessionDeniedPlugins = new Set<string>();
  const liveCards = new Map<string, Record<string, unknown>[]>();
  const updateLiveCard = (agentId: string, entryId: string, patch: Record<string, unknown>): Record<string, unknown> | null => {
    const rows = liveCards.get(agentId) ?? [];
    const index = rows.findIndex(row => row.id === entryId);
    if (index < 0) return null;
    const updated = { ...rows[index], ...patch };
    rows[index] = updated;
    liveCards.set(agentId, rows);
    return updated;
  };
  const findLiveCardAgent = (entryId: string): string | null => {
    for (const [agentId, rows] of liveCards) {
      if (rows.some(row => row.id === entryId)) return agentId;
    }
    return null;
  };

  const upsertLiveCard = (agentId: string, entry: Record<string, unknown>) => {
    const rows = liveCards.get(agentId) ?? [];
    const index = rows.findIndex(row => row.id === entry.id);
    if (index >= 0) rows[index] = entry;
    else rows.push(entry);
    liveCards.set(agentId, rows);
  };
  const runProvider = options.runProvider ?? runRoutedProviderText;
  const composeDelayMs = options.composeDelayMs ?? 80;
  const permissionTimeoutMs = options.permissionTimeoutMs ?? 5 * 60 * 1000;
  const schedule = options.schedule ?? setTimeout;

  const load = async (): Promise<Store> => {
    try { return parseInferenceRouterTranscriptStore(JSON.parse(await readFile(storePath, "utf8"))); }
    catch { return EMPTY_STORE; }
  };
  const persist = async (store: Store): Promise<void> => {
    await mkdir(dirname(storePath), { recursive: true });
    const temporary = `${storePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, storePath);
  };
  const append = async (agentId: string, entries: readonly StoredEntry[]): Promise<Store> => {
    const current = await load();
    const next: Store = { schemaVersion: 2, agents: { ...current.agents, [agentId]: [...(current.agents[agentId] ?? []), ...entries].slice(-200) } };
    await persist(next);
    return next;
  };
  const emitTranscript = (agentId: string, type: "appended" | "updated", entry: Record<string, unknown>) => options.postEvent("transcript", { type, entry, agentId });
  const settleAgentWidgetsForNewPrompt = (agentId: string) => {
    for (const [entryId, waiter] of [...widgetWaiters]) {
      if (waiter.agentId !== agentId) continue;
      widgetWaiters.delete(entryId);
      if (waiter.dismissOnMoveOn) {
        const updated = updateLiveCard(agentId, entryId, { widgetDismissed: true });
        if (updated != null) emitTranscript(agentId, "updated", updated);
        waiter.settle({ status: "dismissed" });
      } else {
        waiter.settle({ status: "moved-on" });
      }
    }
  };
  const beginActivity = async (agentId: string, rosterRequest?: Promise<unknown>): Promise<() => void> => {
    try {
      const remote = await (rosterRequest ?? options.dispatchRemote("listAgents", {}));
      if (!Array.isArray(remote)) return () => {};
      const roster = mergeLocalInferenceAgents(remote);
      const project = (isRunning: boolean) => roster.map(raw => {
        const row = asRecord(raw);
        if (row?.id !== agentId) return raw;
        return { ...row, isRunning, isRunningTurn: isRunning, isComposingMessage: isRunning, isRetrying: false, ...(isRunning ? { currentActivity: { kind: "thinking" } } : { currentActivity: undefined }) };
      });
      const publishRunning = () => options.postEvent("agents", { activeAgentId: agentId, agents: project(true) });
      publishRunning();
      // Transcript refreshes can fetch the remote (idle) roster while a local CLI turn is
      // running. Pulse the locally authoritative state until the turn settles so those
      // refreshes cannot permanently erase the polished renderer's activity surface.
      const pulse = setInterval(publishRunning, 250);
      pulse.unref();
      return () => {
        clearInterval(pulse);
        options.postEvent("agents", { activeAgentId: agentId, agents: project(false) });
      };
    } catch { return () => {}; }
  };
  const toggleLocalReaction = async (agentId: string, entryId: string, emoji: string): Promise<Record<string, unknown> | null> => {
    const trimmed = emoji.trim();
    if (agentId.length === 0 || entryId.length === 0 || trimmed.length === 0) return null;
    const current = await load();
    const entries = current.agents[agentId];
    if (entries == null) return null;
    const index = entries.findIndex(entry => entry.id === entryId);
    if (index < 0) return null;
    const before = entries[index]!;
    const reactions = before.reactions ?? [];
    const exists = reactions.some(reaction => reaction.emoji === trimmed && reaction.by === "me");
    const nextReactions = exists ? reactions.filter(reaction => !(reaction.emoji === trimmed && reaction.by === "me")) : [...reactions, { emoji: trimmed, by: "me" }];
    const { reactions: _oldReactions, ...withoutReactions } = before;
    const updated: StoredEntry = nextReactions.length === 0 ? withoutReactions : { ...withoutReactions, reactions: nextReactions };
    const nextEntries = [...entries];
    nextEntries[index] = updated;
    await persist({ schemaVersion: 2, agents: { ...current.agents, [agentId]: nextEntries } });
    return projectInferenceRouterTranscriptEntry(updated);
  };
  const execute = async (provider: Exclude<SandInferenceProvider, "cursor">, args: Record<string, unknown>) => {
    const agentId = typeof args.agentId === "string" && args.agentId.length > 0 ? args.agentId : LOCAL_INFERENCE_AGENT_ID;
    const prompt = typeof args.prompt === "string" ? args.prompt : "";
    const richText = typeof args.richText === "string" ? args.richText : undefined;
    const clientNonce = typeof args.clientNonce === "string" ? args.clientNonce : randomUUID();
    const attachmentPaths = Array.isArray(args.attachmentPaths) ? args.attachmentPaths.filter((path): path is string => typeof path === "string" && path.length > 0) : [];
    const attachmentNames = Array.isArray(args.attachmentNames) ? args.attachmentNames.filter((name): name is string => typeof name === "string") : [];
    if (agentId.length === 0 || (prompt.length === 0 && attachmentPaths.length === 0)) throw new Error("Local inference routing requires an agentId and a prompt or attachment");
    const attachmentNote = await formatLocalAttachmentNote(attachmentPaths, attachmentNames, options.dispatchRemote);
    const promptForModel = [prompt, attachmentNote].filter(part => part.length > 0).join("\n\n");
    const timestampMs = now();
    const beforeUser = await load();
    // The roster read and the transcript tail are both round trips to the box and
    // neither depends on the other, so start them together instead of in series.
    const rosterRequest = options.dispatchRemote("listAgents", {}).catch(() => null);
    let remote: unknown = null;
    try { remote = await options.dispatchRemote("getAgentTranscriptTail", { id: agentId }); } catch { remote = null; }
    const remoteEntries = Array.isArray(asRecord(remote)?.entries) ? asRecord(remote)!.entries as unknown[] : [];
    const remoteTurn = remoteEntries.reduce<number>((highest, raw) => {
      const id = asRecord(raw)?.id;
      const match = typeof id === "string" ? /^t(\d+)(?:u|s\d+)$/.exec(id) : null;
      return match == null ? highest : Math.max(highest, Number(match[1]));
    }, -1);
    const localTurn = (beforeUser.agents[agentId] ?? []).reduce((highest, entry) => {
      const match = /^t(\d+)(?:u|s\d+)$/.exec(entry.id);
      return match == null ? highest : Math.max(highest, Number(match[1]));
    }, -1);
    const turn = Math.max(remoteTurn, localTurn) + 1;
    const userContent = promptForModel.length > 0 ? promptForModel : prompt;
    const persistUser = args.persistUser !== false;
    const userEntry = { kind: "message", id: `t${turn}u`, role: "user", content: userContent, ...(richText === undefined ? {} : { richText }), isStreaming: false, timestampMs, clientNonce };
    const withUser = persistUser
      ? await append(agentId, [{ provider, role: "user", content: userContent, ...(richText === undefined ? {} : { richText }), id: userEntry.id, clientNonce, timestampMs }])
      : beforeUser;
    if (persistUser) emitTranscript(agentId, "appended", userEntry);
    const endActivity = await beginActivity(agentId, rosterRequest);
    // Let the thinking avatar paint, then open an empty streaming bubble so the
    // official transcript shows typing dots instead of waiting on a blank row.
    await new Promise<void>(resolve => schedule(resolve, composeDelayMs));
    const messages = (withUser.agents[agentId] ?? []).map(entry => ({ role: entry.role, content: entry.content }));
    let content: string;
    const assistantTimestampMs = now();
    const assistantId = `t${turn}s0`;
    let assistantStreamStarted = false;
    const emitAssistant = (nextContent: string, streaming: boolean) => {
      const entry = { kind: "send-message", id: assistantId, message: { type: "text", content: nextContent }, streaming, timestampMs: assistantTimestampMs };
      emitTranscript(agentId, assistantStreamStarted ? "updated" : "appended", entry);
      assistantStreamStarted = true;
    };
    emitAssistant("", true);
    const reveal = createPacedTextReveal({ emit: emitAssistant, schedule });
    let listedTools: Record<string, any>[] = [];
    try { listedTools = routedPluginToolRows(await options.dispatchRemote("listRoutedMcpTools", {})); }
    catch { listedTools = []; }
    const promptTools = routedPromptTools();
    const toolsForModel = [...promptTools, ...listedTools];
    const routedMessages = [{ role: "system", content: routedCardsHint(listedTools) }, ...messages];
    const executePromptTool = async (definition: Record<string, any>, toolArgs: unknown): Promise<string> => {
      const toolName = typeof definition.toolName === "string" && definition.toolName.length > 0
        ? definition.toolName
        : typeof definition.name === "string" ? definition.name.replace(/^mcp__grok_bot_plugins__/, "") : "";
      if (toolName === ASK_QUESTION_TOOL_NAME) {
        const widget = parseAskQuestionArgs(toolArgs);
        if (widget == null) return "AskQuestion needs a prompt and 1-6 options with labels.";
        const entryId = `t${turn}w${randomUUID().slice(0, 8)}`;
        const entry = {
          kind: "send-message",
          id: entryId,
          message: { type: "widget", widget },
          timestampMs: now(),
        };
        upsertLiveCard(agentId, entry);
        emitTranscript(agentId, "appended", entry);
        const result = await new Promise<WidgetWait>(resolve => {
          schedule(() => {
            if (!widgetWaiters.has(entryId)) return;
            widgetWaiters.delete(entryId);
            resolve({ status: "timeout" });
          }, permissionTimeoutMs);
          widgetWaiters.set(entryId, { agentId, dismissOnMoveOn: widget.dismissOnMoveOn === true, settle: resolve });
        });
        if (result.status === "answered") return `The user chose: ${result.value}`;
        if (result.status === "dismissed") return "The user dismissed the question.";
        if (result.status === "moved-on") return "The user sent a new message. The question card is still live.";
        return "The user didn't answer.";
      }
      const record = asRecord(toolArgs) ?? {};
      const needed = filterUnconnectedConnectors(Array.isArray(record.connectors) ? record.connectors : [], listedTools);
      if (needed.length === 0) {
        return "Those connectors are already connected. Use the existing accounts and emails by default. Do not ask the user to add them again.";
      }
      const reason = typeof record.reason === "string" && record.reason.trim().length > 0 ? record.reason.trim() : undefined;
      const entryId = `t${turn}c${randomUUID().slice(0, 8)}`;
      const message = needed.length === 1
        ? { type: "connector", connector: needed[0], variant: "connect", ...(reason == null ? {} : { reason }) }
        : { type: "connectors", connectors: needed };
      const entry = { kind: "send-message", id: entryId, message, timestampMs: now() };
      upsertLiveCard(agentId, entry);
      emitTranscript(agentId, "appended", entry);
      return needed.length === 1
        ? `Showed a connect card for ${needed[0]}. Wait for the user to connect.`
        : `Showed connect cards for ${needed.join(", ")}. Wait for the user to connect.`;
    };
    const askPluginPermission = async (toolName: string, input: Record<string, unknown>, definition?: Record<string, unknown> | null) => {
      const resolved = resolveRoutedPluginTool(toolName, listedTools, definition);
      const identity = pluginPermissionIdentity(toolName, resolved);
      const permission = pluginPermissionLabel(resolved, toolName, input, messages, listedTools);
      if (sessionDeniedPlugins.has(identity.key)) return { behavior: "deny" as const, message: "The user denied this Alli Bot plugin." };
      if (sessionAllowedPlugins.has(identity.key)) return { behavior: "allow" as const, updatedInput: input };
      sessionAllowedPlugins.add(identity.key);
      const requestId = randomUUID();
      const entryId = `t${turn}p${requestId.slice(0, 8)}`;
      const approval = {
        requestId,
        status: "approved",
        surface: "mcp",
        summary: permission.label,
        reason: `Using ${permission.label}.`,
        command: permission.label,
      };
      const approvalEntry = {
        kind: "send-message",
        id: entryId,
        message: { type: "auto-review-approval", approval },
        timestampMs: now(),
      };
      upsertLiveCard(agentId, approvalEntry);
      emitTranscript(agentId, "appended", approvalEntry);
      return { behavior: "allow" as const, updatedInput: input };
    };
    const executePluginTool = async (definition: Record<string, any>, toolArgs: unknown, toolCallId: string) => {
      const toolName = typeof definition.name === "string" && definition.name.length > 0
        ? definition.name
        : typeof definition.toolName === "string" ? definition.toolName : "plugin";
      if (isRoutedPromptTool(definition) || toolName === ASK_QUESTION_TOOL_NAME || toolName === PROMPT_CONNECTORS_TOOL_NAME
        || toolName.replace(/^mcp__grok_bot_plugins__/, "") === ASK_QUESTION_TOOL_NAME
        || toolName.replace(/^mcp__grok_bot_plugins__/, "") === PROMPT_CONNECTORS_TOOL_NAME) {
        const text = await executePromptTool(definition, toolArgs);
        return { result: { case: "success", value: { content: [{ content: { case: "text", value: { text } } }] } } };
      }
      const decision = await askPluginPermission(toolName, asRecord(toolArgs) ?? {}, asRecord(definition));
      if (decision.behavior !== "allow") throw new Error(decision.message ?? "The user denied this Alli Bot plugin.");
      return await options.dispatchRemote("executeRoutedMcpTool", {
        providerIdentifier: definition.providerIdentifier,
        name: definition.name,
        toolName: definition.toolName,
        args: toolArgs,
        toolCallId,
        agentId,
      });
    };
    const bridge = provider === "claude-code" ? await createRoutedMcpBridge({
      listTools: async () => toolsForModel,
      callTool: async tool => {
        try { return await executePluginTool(tool, tool.args, tool.toolCallId); }
        catch (error) { return { result: { case: "error", value: { error: error instanceof Error ? error.message : String(error) } } }; }
      },
    }) : null;
    const onTextDelta = (delta: string, accumulated: string) => reveal.push(delta, accumulated);
    const canUseTool = async (toolName: string, input: Record<string, unknown>) => {
      // Claude Code emits "haven't granted it yet" unless the CLI itself is
      // allowed to call the MCP tool. The in-chat Allow card is asked later,
      // when the tool actually executes.
      if (toolName.includes("grok_bot_plugins") || toolName.startsWith("mcp__")) {
        return { behavior: "allow" as const, updatedInput: input };
      }
      return await askPluginPermission(toolName, input, resolveRoutedPluginTool(toolName, listedTools, null));
    };
    try {
      content = await runProvider(provider, routedMessages, bridge == null ? {
        tools: toolsForModel,
        executeTool: async (definition, toolArgs, toolCallId) => await executePluginTool(definition, toolArgs, toolCallId),
        onTextDelta,
        agentId,
      } : { mcpServerUrl: bridge.url, onTextDelta, canUseTool, agentId });
      reveal.push("", content);
      content = await reveal.finish();
    } catch (error) {
      content = `Router error: ${error instanceof Error ? error.message : String(error)}`;
      reveal.push("", content);
      content = await reveal.finish();
    }
    finally { endActivity(); await bridge?.close(); }
    await append(agentId, [{ provider, role: "assistant", content, id: assistantId, timestampMs: assistantTimestampMs }]);
    return { accepted: true, clientNonce, provider };
  };
  const persistWidgetAnswer = async (
    agentId: string,
    provider: Exclude<SandInferenceProvider, "cursor">,
    content: string,
  ) => {
    const current = await load();
    const existing = current.agents[agentId] ?? [];
    const live = liveCards.get(agentId) ?? [];
    const highest = [...existing, ...live].reduce((max, entry) => {
      const id = typeof entry.id === "string" ? entry.id : "";
      const match = /^t(\d+)/.exec(id);
      return match == null ? max : Math.max(max, Number(match[1]));
    }, -1);
    const timestampMs = now();
    const id = `t${highest + 1}u`;
    await append(agentId, [{ provider, role: "user", content, id, timestampMs }]);
    emitTranscript(agentId, "appended", { kind: "message", id, role: "user", content, isStreaming: false, timestampMs });
  };
  const enqueueExecute = (
    provider: Exclude<SandInferenceProvider, "cursor">,
    record: Record<string, unknown>,
    settleWidgets: boolean,
  ) => {
    const agentId = typeof record.agentId === "string" ? record.agentId : "";
    if (settleWidgets && agentId.length > 0) settleAgentWidgetsForNewPrompt(agentId);
    const previous = queues.get(agentId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => execute(provider, record)).catch(async (error) => {
      const timestampMs = now();
      const content = `Router error: ${error instanceof Error ? error.message : String(error)}`;
      if (agentId.length > 0) {
        const id = `t${Date.now()}s0`;
        await append(agentId, [{ provider, role: "assistant", content, id, timestampMs }]);
        emitTranscript(agentId, "appended", { kind: "send-message", id, message: { type: "text", content }, timestampMs });
      }
    });
    const queued = next.finally(() => { if (queues.get(agentId) === queued) queues.delete(agentId); });
    queues.set(agentId, queued);
    void queued;
    return { accepted: true as const, clientNonce: record.clientNonce, provider };
  };

  return {
    provider(): SandInferenceProvider { return settings.getInferenceProvider(); },
    async dispatch(method: string, args: unknown): Promise<{ handled: boolean; value?: unknown }> {
      const provider = settings.getInferenceProvider();
      if (method === "resolveLocalToolPermission" || method === "resolveAutoReviewApproval") {
        const record = asRecord(args) ?? {};
        const requestId = typeof record.requestId === "string" ? record.requestId : "";
        const waiter = pluginPermissionWaiters.get(requestId);
        if (waiter != null) {
          waiter(pluginPermissionResolution(record.resolution));
          return { handled: true, value: undefined };
        }
      }
      if (method === "respondToWidget" || method === "dismissWidget") {
        const record = asRecord(args) ?? {};
        const entryId = typeof record.entryId === "string" ? record.entryId : "";
        const agentId = typeof record.agentId === "string" && record.agentId.length > 0
          ? record.agentId
          : findLiveCardAgent(entryId) ?? "";
        if (entryId.length === 0 || agentId.length === 0) return { handled: false };
        const waiter = widgetWaiters.get(entryId);
        const card = (liveCards.get(agentId) ?? []).find(row => row.id === entryId);
        if (waiter == null && card == null) return { handled: false };
        if (method === "dismissWidget") {
          const updated = updateLiveCard(agentId, entryId, { widgetDismissed: true }) ?? card;
          if (updated != null) emitTranscript(agentId, "updated", updated);
          waiter?.settle({ status: "dismissed" });
          widgetWaiters.delete(entryId);
          return { handled: true, value: { accepted: true } };
        }
        const value = typeof record.value === "string" ? record.value.trim() : "";
        if (value.length === 0) return { handled: true, value: { accepted: false } };
        const message = asRecord(card?.message) ?? asRecord((liveCards.get(agentId) ?? []).find(row => row.id === entryId)?.message);
        const stored = widgetReplyText(message?.widget, value);
        const updated = updateLiveCard(agentId, entryId, { respondedValue: stored }) ?? card;
        if (updated != null) emitTranscript(agentId, "updated", { ...updated, respondedValue: stored });
        const hadWaiter = waiter != null;
        waiter?.settle({ status: "answered", value: stored });
        widgetWaiters.delete(entryId);
        if (provider !== "cursor") await persistWidgetAnswer(agentId, provider, stored);
        if (!hadWaiter && provider !== "cursor") {
          enqueueExecute(provider, { agentId, prompt: stored, persistUser: false }, false);
        }
        return { handled: true, value: { accepted: true } };
      }
      if (method === "reactToMessage") {
        const record = asRecord(args) ?? {};
        const agentId = typeof record.agentId === "string" ? record.agentId : "";
        const entryId = typeof record.entryId === "string" ? record.entryId : "";
        const emoji = typeof record.emoji === "string" ? record.emoji : "";
        const updated = await toggleLocalReaction(agentId, entryId, emoji);
        if (updated != null) {
          emitTranscript(agentId, "updated", updated);
          return { handled: true, value: undefined };
        }
      }
      if (method === "createAgent") return { handled: false };
      if (provider !== "cursor" && (method === "listAgents" || method === "countAgents")) {
        let remote: unknown = [];
        try { remote = await options.dispatchRemote("listAgents", args); } catch { remote = []; }
        const agents = mergeLocalInferenceAgents(Array.isArray(remote) ? remote : []);
        return { handled: true, value: method === "countAgents" ? agents.length : agents };
      }
      if (provider !== "cursor" && ["getAgentTranscriptTail", "openAgentTail", "getAgentTranscriptWindow"].includes(method)) {
        const record = asRecord(args) ?? {};
        const agentId = typeof record.id === "string" ? record.id : "";
        let remote: unknown = { entries: [] };
        try { remote = await options.dispatchRemote(method, args); } catch { remote = { entries: [] }; }
        const local = await load();
        const result = asRecord(remote);
        const remoteEntries = result != null && Array.isArray(result.entries) ? result.entries : [];
        const entries = [
          ...remoteEntries,
          ...(local.agents[agentId] ?? []).map(projectInferenceRouterTranscriptEntry),
          ...(liveCards.get(agentId) ?? []),
        ];
        const limit = typeof record.limit === "number" && Number.isInteger(record.limit) && record.limit > 0 ? record.limit : 500;
        return { handled: true, value: { ...(result ?? {}), entries: entries.slice(-limit) } };
      }
      if (method !== "sendPrompt" || provider === "cursor") return { handled: false };
      const record = asRecord(args) ?? {};
      return { handled: true, value: enqueueExecute(provider, record, true) };
    },
  };
}
