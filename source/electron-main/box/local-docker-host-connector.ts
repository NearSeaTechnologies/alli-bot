import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { SandSettingsStore } from "../../shared/node/settings/sand-settings-store.js";
import type { RecreateResult } from "./box-recreate-commands.js";
import type { SandRemoteHostConnector } from "./box-host-connector.js";
import type { GatewayConnection } from "./gateway-descriptor-cache.js";

/** Image and container name of the box that runs on the Hetzner sandbox VPS. */
export const SANDBOX_BOX_IMAGE = "public.ecr.aws/k0i0n2g5/cursorenvironments/universal:sand-box-latest";
export const SANDBOX_BOX_CONTAINER = "grok-bot-local-vm";
/** Local end of the SSH tunnel that forwards to the sandbox gateway. */
export const SANDBOX_GATEWAY_URL = "http://127.0.0.1:1340";
const READY_TIMEOUT_MS = 180_000;
const CONNECT_TIMEOUT_MS = 15_000;

export interface SandboxStatus {
  readonly available: boolean;
  readonly running: boolean;
  readonly ready: boolean;
  readonly containerName: string;
  readonly image: string;
  readonly detail: string;
}

interface CommandResult { readonly ok: boolean; readonly output: string }

function runCommand(command: string, args: readonly string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const append = (chunk: Buffer): void => { output += chunk.toString(); if (output.length > 200_000) output = output.slice(-200_000); };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.once("error", (error) => resolve({ ok: false, output: `${output}\n${error.message}`.trim() }));
    child.once("close", (code) => resolve({ ok: code === 0, output: output.trim() }));
  });
}

export async function readSandboxSshTarget(home = homedir()): Promise<{ host: string; key: string }> {
  const key = process.env.ALLI_SANDBOX_SSH_KEY?.trim() || join(home, ".ssh", "id_ed25519");
  let host = process.env.ALLI_SANDBOX_SSH?.trim() || "";
  if (host.length === 0) {
    try {
      const envFile = await readFile(join(home, "Library", "Application Support", "Alli Bot", "host.env"), "utf8");
      for (const line of envFile.split(/\r?\n/)) {
        const match = /^ALLI_SANDBOX_SSH_FALLBACK=(.*)$/.exec(line.trim());
        if (match) host = match[1]!.trim();
      }
    } catch {}
  }
  if (host.length === 0) host = "root@46.224.83.5";
  return { host, key };
}

export async function runSandboxSsh(remoteCommand: string): Promise<CommandResult> {
  const { host, key } = await readSandboxSshTarget();
  const args = ["-4", "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "ConnectTimeout=20", "-o", "StrictHostKeyChecking=accept-new"];
  try {
    await stat(key);
    args.push("-i", key);
  } catch {}
  args.push(host, remoteCommand);
  return await runCommand("ssh", args);
}

async function waitSandboxGateway(settingsPath: string, timeoutMs = READY_TIMEOUT_MS): Promise<GatewayConnection> {
  const token = await readOrCreateToken(settingsPath);
  const baseUrl = sandboxGatewayUrl();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await gatewayReady(token, baseUrl)) return { baseUrl, token };
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Sandbox computer did not come back at ${baseUrl} after an update.`);
}

export async function updateSandboxBox(settingsPath: string): Promise<RecreateResult> {
  const updated = await runSandboxSsh(
    `docker pull ${SANDBOX_BOX_IMAGE}; docker rm -f ${SANDBOX_BOX_CONTAINER} >/dev/null 2>&1 || true; bash /opt/alli-bot/install.sh`,
  );
  if (!updated.ok) return { status: "rejected", reason: updated.output || "Could not update the GrokBot computer over SSH." };
  await waitSandboxGateway(settingsPath);
  return { status: "started-untrackable" };
}

export async function resetSandboxBox(settingsPath: string): Promise<RecreateResult> {
  const reset = await runSandboxSsh(
    `docker rm -f ${SANDBOX_BOX_CONTAINER} >/dev/null 2>&1 || true; docker volume rm grok-bot-local-vm-workspace grok-bot-local-vm-data >/dev/null 2>&1 || true; bash /opt/alli-bot/install.sh`,
  );
  if (!reset.ok) return { status: "rejected", reason: reset.output || "Could not reset the GrokBot computer over SSH." };
  await waitSandboxGateway(settingsPath);
  return { status: "started-untrackable" };
}

function credentialPath(settingsPath: string): string {
  // File name predates the sandbox-only runtime; existing installs share this token with the VPS box.
  return join(dirname(settingsPath), "local-docker-vm.json");
}

async function readOrCreateToken(settingsPath: string): Promise<string> {
  const target = credentialPath(settingsPath);
  try {
    const parsed = JSON.parse(await readFile(target, "utf8")) as { token?: unknown };
    if (typeof parsed.token === "string" && parsed.token.length >= 32) return parsed.token;
  } catch {}
  const token = randomBytes(32).toString("hex");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify({ schemaVersion: 1, token }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(target, 0o600);
  return token;
}

export function sandboxGatewayUrl(): string {
  const configured = process.env.SAND_BOX_GATEWAY_URL?.trim();
  return configured && configured.length > 0 ? configured.replace(/\/+$/, "") : SANDBOX_GATEWAY_URL;
}

async function gatewayReady(token: string, baseUrl = sandboxGatewayUrl()): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch { return false; }
}

export async function connectSandboxBox(settingsPath: string): Promise<GatewayConnection> {
  const token = await readOrCreateToken(settingsPath);
  const baseUrl = sandboxGatewayUrl();
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await gatewayReady(token, baseUrl)) return { baseUrl, token };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Sandbox computer is not reachable at ${baseUrl}. Load the Alli sandbox launchd tunnel (npm run sandbox:tunnel:install) and make sure the GrokBot container is running.`);
}

export async function getSandboxStatus(settingsPath: string): Promise<SandboxStatus> {
  const token = await readOrCreateToken(settingsPath);
  const ready = await gatewayReady(token);
  return {
    available: true,
    running: ready,
    ready,
    containerName: SANDBOX_BOX_CONTAINER,
    image: SANDBOX_BOX_IMAGE,
    detail: ready ? "Sandbox computer is ready." : "Waiting for the sandbox tunnel on localhost:1340.",
  };
}

/**
 * Routes every box connection to the sandbox computer on the Hetzner VPS.
 * The desktop never runs or inspects a local box: the remote connector only
 * contributes credential issuance, and its own connect/recreate paths are
 * never used.
 */
export function createSettingsRoutedHostConnector(
  remote: SandRemoteHostConnector,
  settings: SandSettingsStore,
): SandRemoteHostConnector {
  return {
    connect: async () => await connectSandboxBox(settings.settingsPath),
    ...(remote.issueLocalExecDaemonCredential == null ? {} : { issueLocalExecDaemonCredential: remote.issueLocalExecDaemonCredential.bind(remote) }),
    ...(remote.issueInferenceCredential == null ? {} : { issueInferenceCredential: remote.issueInferenceCredential.bind(remote) }),
    recreate: async (): Promise<RecreateResult> => await updateSandboxBox(settings.settingsPath),
    forceRecreate: async (): Promise<RecreateResult> => await resetSandboxBox(settings.settingsPath),
  };
}
