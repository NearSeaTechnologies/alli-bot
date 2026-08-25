import type { Context } from "../../packages/context/core.js";
import { shellExecutorResource } from "../../packages/agent-exec/shell.js";
import { runSandboxComputerKeepAwake } from "../../shared/sandbox-computer-always-on.js";
import { buildHostShellArgs } from "./box-shell-command.js";
import type { ShellAccessor } from "./box-windows.js";

export async function keepSandboxComputerAwake(ctx: Context, accessor: ShellAccessor): Promise<void> {
  await runSandboxComputerKeepAwake((command) => accessor.get(shellExecutorResource).execute(ctx, buildHostShellArgs({
    command,
    name: "keep-awake",
    workingDirectory: "/workspace",
    toolCallId: "sand-keep-awake",
  })));
}
