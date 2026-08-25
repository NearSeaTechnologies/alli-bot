import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isSafeFolderId } from "../../storage/folder-id.js";
import { reportSessionDiagnostic } from "./session-diagnostics.js";

type SecretRecord = Record<string, unknown>;
function errorClass(error: unknown): string { return error instanceof Error ? error.name : typeof error; }

export class SandConnectorSecretStore {
  constructor(readonly secretsRoot: string) {}
  filePath(agentId: string, platform: string): string { return join(this.secretsRoot, agentId, `${platform}.json`); }
  read(agentId: string, platform: string): SecretRecord {
    try { const parsed: unknown = JSON.parse(readFileSync(this.filePath(agentId, platform), "utf8")); return parsed != null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as SecretRecord : {}; }
    catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") reportSessionDiagnostic({ family: "store_db", kind: "connector_secrets_unreadable", agentId, errorClass: errorClass(error) });
      return {};
    }
  }
  /**
   * These files hold connector credentials. They were written with the default
   * umask, i.e. world-readable, while every other secret in this project is
   * written 0600. Owner-only, and the per-agent directory is 0700.
   */
  setSecret(agentId: string, platform: string, field: string, value: string): boolean {
    if (!isSafeFolderId(agentId) || !isSafeFolderId(platform) || field.length === 0) return false;
    const path = this.filePath(agentId, platform), merged = { ...this.read(agentId, platform), [field]: value };
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const tempPath = `${path}.${process.pid}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(merged, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(tempPath, path);
    // rename carries the temp file's mode, but an inherited file from an older
    // build keeps its own - restate it so existing installs are repaired too.
    try { chmodSync(path, 0o600); } catch {}
    try { chmodSync(dirname(path), 0o700); } catch {}
    return true;
  }
  getSecret(agentId: string, platform: string, field: string): string | null {
    if (!isSafeFolderId(agentId) || !isSafeFolderId(platform)) return null;
    const value = this.read(agentId, platform)[field]; return typeof value === "string" && value.length > 0 ? value : null;
  }
  removeAgentPlatform(agentId: string, platform: string): void { if (isSafeFolderId(agentId) && isSafeFolderId(platform)) rmSync(this.filePath(agentId, platform), { force: true }); }
}
