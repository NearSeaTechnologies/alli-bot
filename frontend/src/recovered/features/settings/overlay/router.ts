import type { AgentDesktopBridge } from "../../../contracts/desktop-bridge";

export type RouterProviderId = "claude-code" | "codex" | "grok";

export interface RouterProvider {
  readonly id: RouterProviderId;
  readonly label: string;
  readonly description: string;
  readonly usageDescription: string;
  readonly usageSource: "external";
}

export const DEFAULT_ROUTER_PROVIDER: RouterProviderId = "claude-code";
export const ROUTER_PROVIDER_PERSISTENCE_KEY = "settings.router-provider.v1";

export const ROUTER_PROVIDERS: readonly RouterProvider[] = [
  {
    id: "claude-code",
    label: "Claude",
    description: "Use your existing Claude Code sign-in. Does not use Cursor usage.",
    usageDescription: "Claude usage is billed to your Anthropic account.",
    usageSource: "external"
  },
  {
    id: "codex",
    label: "Codex",
    description: "Use your existing ChatGPT sign-in from Codex. Does not use Cursor usage.",
    usageDescription: "Codex usage is billed to your OpenAI / ChatGPT account.",
    usageSource: "external"
  },
  {
    id: "grok",
    label: "Grok",
    description: "Use your existing Grok / xAI sign-in. Bills your xAI account, not Cursor.",
    usageDescription: "Grok usage is billed to your xAI account.",
    usageSource: "external"
  }
];

const ROUTER_PROVIDER_IDS = new Set<RouterProviderId>(ROUTER_PROVIDERS.map((provider) => provider.id));

export function isRouterProviderId(value: unknown): value is RouterProviderId {
  return typeof value === "string" && ROUTER_PROVIDER_IDS.has(value as RouterProviderId);
}

export function routerProviderById(id: RouterProviderId): RouterProvider {
  return ROUTER_PROVIDERS.find((provider) => provider.id === id) ?? ROUTER_PROVIDERS[0]!;
}

export function parseRouterProviderPreference(raw: string | null): RouterProviderId {
  if (raw == null) return DEFAULT_ROUTER_PROVIDER;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value == null || Array.isArray(value)) return DEFAULT_ROUTER_PROVIDER;
    const record = value as Record<string, unknown>;
    if (record.schemaVersion !== 1 || !isRouterProviderId(record.provider)) return DEFAULT_ROUTER_PROVIDER;
    return record.provider;
  } catch {
    return DEFAULT_ROUTER_PROVIDER;
  }
}

export type RouterProviderPersistence = Pick<AgentDesktopBridge["clientPersistence"], "read" | "write">;

export async function loadRouterProvider(persistence: RouterProviderPersistence): Promise<RouterProviderId> {
  return parseRouterProviderPreference(await persistence.read(ROUTER_PROVIDER_PERSISTENCE_KEY));
}

export async function saveRouterProvider(persistence: RouterProviderPersistence, provider: RouterProviderId): Promise<void> {
  if (!isRouterProviderId(provider)) throw new Error("Unknown router provider.");
  await persistence.write(ROUTER_PROVIDER_PERSISTENCE_KEY, JSON.stringify({ schemaVersion: 1, provider }));
}
