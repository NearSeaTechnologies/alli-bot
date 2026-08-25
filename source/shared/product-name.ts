import { homedir } from "node:os";
import { join } from "node:path";

export const SAND_PRODUCT_DISPLAY_NAME = "Alli Bot";
export const SAND_PRODUCT_HTTP_TOKEN = SAND_PRODUCT_DISPLAY_NAME.replaceAll(/\s+/g, "");
export const SAND_PRODUCT_VERSION = "1.0.0";

export function getAlliSupportDir(homeDir = homedir(), platform = process.platform): string {
  if (platform === "darwin") return join(homeDir, "Library", "Application Support", SAND_PRODUCT_DISPLAY_NAME);
  if (platform === "win32") return join(homeDir, "AppData", "Roaming", SAND_PRODUCT_DISPLAY_NAME);
  return join(homeDir, ".config", "alli-bot");
}

export function getAlliSandDataDir(homeDir = homedir(), platform = process.platform): string {
  if (platform === "linux") return join(homeDir, ".grokbot");
  return join(getAlliSupportDir(homeDir, platform), "sand-data");
}

export function getAlliLegacyGrokbotDir(homeDir = homedir()): string {
  return join(homeDir, ".grokbot");
}
