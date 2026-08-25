export type SandBoxRuntime = "remote" | "local-docker" | "sandbox";

export const DEFAULT_SAND_BOX_RUNTIME: SandBoxRuntime = "sandbox";

export function isSandBoxRuntime(value: unknown): value is SandBoxRuntime {
  return value === "remote" || value === "local-docker" || value === "sandbox";
}

export function resolveSandBoxRuntime(value: unknown): SandBoxRuntime {
  if (value === "local-docker") return "local-docker";
  return "sandbox";
}
