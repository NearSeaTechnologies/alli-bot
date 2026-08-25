import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tunnel = path.join(repoRoot, "scripts", "alli-sandbox-tunnel.sh");
const install = path.join(repoRoot, "scripts", "install-alli-sandbox-tunnel.sh");
const joinNetbird = path.join(repoRoot, "scripts", "alli-sandbox-computer", "join-netbird.sh");

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("sandbox tunnel prefers ALLI_SANDBOX_SSH, else the public Hetzner host", async () => {
  const forced = await run("bash", [tunnel, "--print-host"], {
    ALLI_SANDBOX_SSH: "root@100.86.9.9",
    PATH: "/usr/bin:/bin",
  });
  assert.equal(forced.code, 0);
  assert.equal(forced.stdout.trim(), "root@100.86.9.9");

  const fallback = await run("bash", [tunnel, "--print-host"], {
    ALLI_SANDBOX_SSH: "",
    ALLI_SANDBOX_SSH_FALLBACK: "root@46.224.83.5",
    PATH: "/usr/bin:/bin",
  });
  assert.equal(fallback.code, 0);
  assert.equal(fallback.stdout.trim(), "root@46.224.83.5");
});

test("tunnel install writes a KeepAlive launch agent without loading it in tests", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "alli-tunnel-"));
  const support = path.join(root, "support");
  const agents = path.join(root, "agents");
  const result = await run("bash", [install], {
    ALLI_SANDBOX_SUPPORT_DIR: support,
    ALLI_SANDBOX_LAUNCH_AGENT_DIR: agents,
    ALLI_SANDBOX_SKIP_LAUNCHCTL: "1",
    PATH: "/usr/bin:/bin",
    HOME: root,
  });
  assert.equal(result.code, 0, result.stderr);
  const plist = await readFile(path.join(agents, "team.alongside.allibot.sandbox-tunnel.plist"), "utf8");
  const script = await readFile(path.join(support, "sandbox-tunnel.sh"), "utf8");
  assert.match(plist, /team\.alongside\.allibot\.sandbox-tunnel/);
  assert.match(plist, /KeepAlive/);
  assert.match(plist, /RunAtLoad/);
  assert.match(plist, /sandbox-tunnel\.sh/);
  assert.match(script, /AddressFamily=inet/);
  assert.match(script, /netbird status --json/);
  assert.match(script, /\[\[ "\$code" =~ \^2\[0-9\]\[0-9\]\$ \]\]/);
  assert.match(result.stdout, /launchctl skipped/);
});

test("sandbox computer pack list includes systemd boot unit", async () => {
  const pack = await readFile(path.join(repoRoot, "scripts", "pack-alli-sandbox.mjs"), "utf8");
  const unit = await readFile(path.join(repoRoot, "scripts", "alli-sandbox-computer", "alli-sandbox.service"), "utf8");
  const hostEnv = await readFile(path.join(repoRoot, "scripts", "alli-sandbox-computer", "host.env"), "utf8");
  const installSh = await readFile(path.join(repoRoot, "scripts", "alli-sandbox-computer", "install.sh"), "utf8");
  assert.match(pack, /"alli-sandbox\.service"/);
  assert.match(pack, /"ensure\.sh"/);
  assert.match(pack, /"bootstrap\.sh"/);
  assert.match(pack, /"update\.sh"/);
  assert.match(pack, /"reset\.sh"/);
  assert.match(unit, /WantedBy=multi-user\.target/);
  assert.match(hostEnv, /root@46\.224\.83\.5/);
  assert.match(installSh, /already running/);
});

test("NetBird join script requires a setup key and uses Alongside management", async () => {
  const source = await readFile(joinNetbird, "utf8");
  assert.match(source, /NETBIRD_SETUP_KEY/);
  assert.match(source, /vpn\.alongside\.team/);
  assert.match(source, /HOSTNAME_VALUE=\$\{NETBIRD_HOSTNAME:-alli-sandbox\}/);
  const missing = await run("bash", [joinNetbird], { PATH: "/usr/bin:/bin" });
  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /NETBIRD_SETUP_KEY/);
});
