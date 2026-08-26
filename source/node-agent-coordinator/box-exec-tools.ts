import { createPromiseClient } from "@connectrpc/connect";
import { MethodKind } from "@bufbuild/protobuf";
import { createConnectTransport } from "@connectrpc/connect-node";

import { ExecService } from "../packages/proto/generated/agent/v1/exec_service_connect.js";
import { ExecServerMessage } from "../packages/proto/generated/agent/v1/exec_pb.js";
import { buildHostShellArgs } from "../host/box/box-shell-command.js";

/**
 * The box already runs an exec daemon that can execute shell commands inside the
 * sandbox, and the tunnel already forwards its port. Nothing was calling it from
 * the routed turn, so the agent had no way to act on its own computer: the CLI
 * was started with `tools: []` and the only tools it saw were AskQuestion and
 * PromptConnectors. This module is the missing bridge.
 */
export const BOX_EXEC_DAEMON_URL_ENV = "SAND_BOX_EXEC_DAEMON_URL";
export const BOX_EXEC_DAEMON_AUTH_ENV = "SAND_BOX_EXEC_DAEMON_AUTH_TOKEN";
export const DEFAULT_BOX_EXEC_DAEMON_URL = "http://127.0.0.1:1337";
export const DEFAULT_BOX_EXEC_DAEMON_AUTH_TOKEN = "local";
export const DEFAULT_BOX_WORKING_DIRECTORY = "/home/box";
export const BOX_SHELL_TOOL_NAME = "Shell";
const DEFAULT_SHELL_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 30_000;

export interface BoxShellRequest {
  readonly command: string;
  readonly workingDirectory?: string;
  readonly timeoutMs?: number;
  readonly toolCallId: string;
}

export interface BoxShellResult {
  readonly ok: boolean;
  readonly output: string;
}

export interface BoxExecClient {
  shell(request: BoxShellRequest): Promise<BoxShellResult>;
}

export function boxExecDaemonUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[BOX_EXEC_DAEMON_URL_ENV]?.trim();
  return configured != null && configured.length > 0 ? configured.replace(/\/+$/, "") : DEFAULT_BOX_EXEC_DAEMON_URL;
}

export function boxExecDaemonAuthToken(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[BOX_EXEC_DAEMON_AUTH_ENV]?.trim();
  return configured != null && configured.length > 0 ? configured : DEFAULT_BOX_EXEC_DAEMON_AUTH_TOKEN;
}

/** Tool definition handed to the model, shaped like the other routed prompt tools. */
export function boxShellToolDefinition(): Record<string, unknown> {
  return {
    name: BOX_SHELL_TOOL_NAME,
    providerIdentifier: "alli",
    toolName: BOX_SHELL_TOOL_NAME,
    description:
      "Run a shell command on your own computer - the sandbox this agent owns, not the user's laptop. "
      + "Use it to read and write files, inspect the system, run git, install packages, and check your work. "
      + "The user is asked to approve each command before it runs.",
    inputSchema: {
      type: "object",
      required: ["command"],
      properties: {
        command: { type: "string", description: "The shell command to run." },
        workingDirectory: { type: "string", description: `Directory to run in. Defaults to ${DEFAULT_BOX_WORKING_DIRECTORY}.` },
      },
    },
  };
}

function truncate(text: string): string {
  return text.length <= MAX_OUTPUT_CHARS ? text : `${text.slice(0, MAX_OUTPUT_CHARS)}\n… output truncated at ${MAX_OUTPUT_CHARS} characters.`;
}

/** Flattens the daemon's streamed reply into text the model can read. */
export function formatShellStream(elements: readonly Record<string, any>[]): BoxShellResult {
  const chunks: string[] = [];
  let ok = true;
  let sawResult = false;
  for (const element of elements) {
    const message = element?.execClientMessage;
    if (message == null) continue;
    const result = message.shellResult;
    if (result == null) continue;
    sawResult = true;
    if (result.spawnError != null) {
      ok = false;
      chunks.push(`Command could not start: ${String(result.spawnError.error ?? "unknown error")}`);
      continue;
    }
    const stdout = typeof result.stdout === "string" ? result.stdout : "";
    const stderr = typeof result.stderr === "string" ? result.stderr : "";
    const exitCode = typeof result.exitCode === "number" ? result.exitCode : 0;
    if (exitCode !== 0) ok = false;
    if (stdout.length > 0) chunks.push(stdout);
    if (stderr.length > 0) chunks.push(stderr.trim().length === 0 ? stderr : `stderr:\n${stderr}`);
    if (exitCode !== 0) chunks.push(`exit code ${exitCode}`);
  }
  if (!sawResult) return { ok: false, output: "The sandbox returned no result for this command." };
  const output = chunks.join("\n").trim();
  return { ok, output: truncate(output.length > 0 ? output : "(no output)") };
}

export function createBoxExecClient(options?: {
  readonly baseUrl?: string;
  readonly authToken?: string;
}): BoxExecClient {
  const baseUrl = options?.baseUrl ?? boxExecDaemonUrl();
  const authToken = options?.authToken ?? boxExecDaemonAuthToken();
  const transport = createConnectTransport({
    baseUrl,
    httpVersion: "1.1",
    interceptors: [
      (next) => async (request) => {
        request.header.set("authorization", `Bearer ${authToken}`);
        return await next(request);
      },
    ],
  });
  // The generated descriptor does not declare Exec as server-streaming, so the
  // client cannot be typed from it directly. The daemon's own server applies the
  // same override (source/box-exec-daemon/server.ts).
  const BoxExecService = {
    typeName: ExecService.typeName,
    methods: { exec: { ...ExecService.methods.exec, kind: MethodKind.ServerStreaming } },
  } as const;
  const client = createPromiseClient(BoxExecService, transport);
  let sequence = 0;
  return {
    async shell(request: BoxShellRequest): Promise<BoxShellResult> {
      sequence += 1;
      // The daemon keys work by exec id; reusing one returns the earlier result.
      const execId = `routed-${request.toolCallId}-${sequence}`;
      const shellArgs = buildHostShellArgs({
        command: request.command,
        name: "bash",
        workingDirectory: request.workingDirectory ?? DEFAULT_BOX_WORKING_DIRECTORY,
        toolCallId: execId,
      });
      shellArgs.timeout = request.timeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS;
      const elements: Record<string, any>[] = [];
      try {
        const stream = client.exec(new ExecServerMessage({ id: sequence, execId, message: { case: "shellArgs", value: shellArgs } }));
        for await (const element of stream) elements.push(element.toJson() as Record<string, any>);
      } catch (error) {
        return { ok: false, output: `Could not reach the sandbox computer: ${error instanceof Error ? error.message : String(error)}` };
      }
      return formatShellStream(elements);
    },
  };
}
