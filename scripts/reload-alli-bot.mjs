import { existsSync, watch } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildFidelityReconstructedAsar } from "./clean-build.mjs";
import { installedAlliBotApp, outputApp, repoRoot } from "./lib/config.mjs";
import {
  installReconstructedApp,
  isInstalledAlliBot,
  packageReconstructedMacApp,
  refreshExistingApp,
} from "./lib/package-reconstructed-app.mjs";
import { verifyOfficialMacReference } from "./lib/macos-package-verification.mjs";
import { run } from "./lib/process.mjs";

const thisFile = fileURLToPath(import.meta.url);
const killScript = path.join(repoRoot, "scripts", "kill-alli-open.sh");
const watchRoots = [
  path.join(repoRoot, "source"),
  path.join(repoRoot, "scripts", "lib", "router-renderer-patch.mjs"),
];

function parseArgs(argv) {
  return {
    watch: argv.includes("--watch"),
    launch: !argv.includes("--no-launch"),
  };
}

function preferredNode26() {
  const candidates = [
    "/opt/homebrew/opt/node/bin/node",
    "/opt/homebrew/opt/node@26/bin/node",
  ];
  return candidates.find(candidate => existsSync(candidate)) ?? null;
}

async function reexecWithNode26IfNeeded() {
  if (process.versions.node.startsWith("26.")) return false;
  const node26 = preferredNode26();
  if (node26 == null) {
    throw new Error(`Alli Bot reload needs Node 26 (found ${process.version}). Install node@26 or run from /opt/homebrew/opt/node/bin/node.`);
  }
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(node26, [thisFile, ...process.argv.slice(2)], {
      stdio: "inherit",
      env: {
        ...process.env,
        PATH: `${path.dirname(node26)}:${process.env.PATH ?? ""}`,
      },
    });
    child.once("error", reject);
    child.once("exit", code => resolve(code ?? 1));
  });
  process.exit(exitCode);
  return true;
}

async function killOpenApps() {
  await run("/bin/bash", [killScript]);
}

async function rebuildPayload() {
  if (await isInstalledAlliBot(outputApp)) {
    const { builtAsar, builtAsarUnpacked, runtimeApp } = await buildFidelityReconstructedAsar();
    await verifyOfficialMacReference({ runtimeApp });
    await refreshExistingApp(outputApp, builtAsar, builtAsarUnpacked);
    return { builtAsar, builtAsarUnpacked };
  }
  const packed = await packageReconstructedMacApp({ createDmg: false });
  return { builtAsar: packed.builtAsar, builtAsarUnpacked: packed.builtAsarUnpacked };
}

async function reload({ launch }) {
  console.log("Rebuilding Alli Bot…");
  const payload = await rebuildPayload();
  console.log("Stopping the running app…");
  await killOpenApps();
  const installed = await installReconstructedApp({
    sourceApp: outputApp,
    destinationApp: installedAlliBotApp,
    builtAsar: payload.builtAsar,
    builtAsarUnpacked: payload.builtAsarUnpacked,
  });
  console.log(`Installed with ${installed.mode}: ${installed.destinationApp}`);
  if (launch) {
    await run("/usr/bin/open", [installed.destinationApp]);
    console.log("Launched Alli Bot. The SSH computer tunnel was left running.");
  }
}

function shouldIgnoreWatchPath(target) {
  if (typeof target !== "string" || target.length === 0) return false;
  return /(?:^|\/)(?:\.git|node_modules|\.build|dist)(?:\/|$)/.test(target.replaceAll("\\", "/"));
}

async function watchAndReload(options) {
  let queued = false;
  let running = false;
  const trigger = () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    queued = false;
    void reload(options).catch(error => {
      console.error(error instanceof Error ? error.message : error);
    }).finally(() => {
      running = false;
      if (queued) trigger();
    });
  };
  let debounce;
  const onChange = (event, filename) => {
    const target = typeof filename === "string" ? filename : "";
    if (shouldIgnoreWatchPath(target)) return;
    clearTimeout(debounce);
    debounce = setTimeout(trigger, 800);
  };
  for (const root of watchRoots) {
    watch(root, { recursive: true, persistent: true }, onChange);
  }
  console.log("Watching source/ for changes. Ctrl-C stops the watcher.");
  trigger();
}

const options = parseArgs(process.argv.slice(2));
await reexecWithNode26IfNeeded();
if (options.watch) await watchAndReload(options);
else await reload(options);
