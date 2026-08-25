export const SAND_INFERENCE_PROVIDERS = ["cursor", "claude-code", "codex", "grok", "openrouter"] as const;
export const SAND_SELECTABLE_INFERENCE_PROVIDERS = ["claude-code", "codex", "grok"] as const;
export const DEFAULT_SAND_INFERENCE_PROVIDER = "claude-code";
export type SandInferenceProvider = (typeof SAND_INFERENCE_PROVIDERS)[number];
export type SandSelectableInferenceProvider = (typeof SAND_SELECTABLE_INFERENCE_PROVIDERS)[number];

export interface SandInferenceRouterUsageProvider {
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly lastUsedAt: string | null;
}

export interface SandInferenceRouterUsage {
  readonly schemaVersion: 1;
  readonly providers: Record<SandInferenceProvider, SandInferenceRouterUsageProvider>;
}

export function isSandInferenceProvider(value: unknown): value is SandInferenceProvider {
  return typeof value === "string" && (SAND_INFERENCE_PROVIDERS as readonly string[]).includes(value);
}

export function isSelectableInferenceProvider(value: unknown): value is SandSelectableInferenceProvider {
  return typeof value === "string" && (SAND_SELECTABLE_INFERENCE_PROVIDERS as readonly string[]).includes(value);
}

export function coerceSelectableInferenceProvider(value: unknown): SandSelectableInferenceProvider {
  return isSelectableInferenceProvider(value) ? value : DEFAULT_SAND_INFERENCE_PROVIDER;
}

export function rendererTransportState(provider: SandInferenceProvider, gatewayLive: boolean): "connected" | "down" {
  return provider === "cursor" && !gatewayLive ? "down" : "connected";
}

export function shouldSkipRoutedHostWake(provider: SandInferenceProvider, canExecute: boolean): boolean {
  return provider !== "cursor" && !canExecute;
}

export function emptySandInferenceRouterUsage(): SandInferenceRouterUsage {
  const empty = (): SandInferenceRouterUsageProvider => ({ requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, lastUsedAt: null });
  return { schemaVersion: 1, providers: { cursor: empty(), "claude-code": empty(), codex: empty(), grok: empty(), openrouter: empty() } };
}
