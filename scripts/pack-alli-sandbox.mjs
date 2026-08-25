import { mkdir, readFile, cp, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import os from "node:os";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staging = path.join(os.tmpdir(), `alli-sandbox-${process.pid}`);
const output = path.join(repoRoot, "dist", "alli-sandbox-computer.tgz");
const hostMain = path.join(repoRoot, ".build", "fidelity", "app", "dist", "host", "host-main.cjs");
const daemonDir = path.join(repoRoot, ".build", "fidelity", "app", "dist", "box-exec-daemon");
const tokenFile = path.join(os.homedir(), ".grokbot", "local-docker-vm.json");
const computerDir = path.join(repoRoot, "scripts", "alli-sandbox-computer");
const packedScripts = [
  "install.sh",
  "ensure.sh",
  "bootstrap.sh",
  "update.sh",
  "reset.sh",
  "uninstall.sh",
  "join-netbird.sh",
  "alli-sandbox.service",
  "host.env",
];

const tokenJson = JSON.parse(await readFile(tokenFile, "utf8"));
if (typeof tokenJson.token !== "string" || tokenJson.token.length < 32) {
  throw new Error("Missing ~/.grokbot/local-docker-vm.json token.");
}

await mkdir(path.join(staging, "box-exec-daemon"), { recursive: true });
await cp(hostMain, path.join(staging, "host-main.cjs"));
await cp(daemonDir, path.join(staging, "box-exec-daemon"), { recursive: true });
await writeFile(path.join(staging, "gateway.token"), `${tokenJson.token}\n`, { mode: 0o600 });
for (const name of packedScripts) {
  const source = path.join(computerDir, name);
  const target = path.join(staging, name);
  await cp(source, target);
  if (name.endsWith(".sh")) await chmod(target, 0o755);
}
await mkdir(path.join(repoRoot, "dist"), { recursive: true });

await new Promise((resolve, reject) => {
  const child = spawn("tar", ["-czf", output, "-C", staging, "."], { stdio: "inherit" });
  child.once("error", reject);
  child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`tar exited ${code}`)));
});

console.log(output);
