export type SandBoxRuntime = "sandbox";

export const DEFAULT_SAND_BOX_RUNTIME: SandBoxRuntime = "sandbox";

export function isSandBoxRuntime(value: unknown): value is SandBoxRuntime {
  return value === "sandbox";
}
