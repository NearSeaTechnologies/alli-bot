import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { installedAlliBotApp, outputApp, outputDmg, reconstructedVersion, repoRoot } from "./lib/config.mjs";
import { describeSigning, installReconstructedApp, packageReconstructedMacApp } from "./lib/package-reconstructed-app.mjs";
import { AD_HOC_CODESIGN_IDENTITY } from "./lib/codesign.mjs";
import { run } from "./lib/process.mjs";

const thisFile = fileURLToPath(import.meta.url);
const killScript = path.join(repoRoot, "scripts", "kill-alli-open.sh");
const tunnelInstall = path.join(repoRoot, "scripts", "install-alli-sandbox-tunnel.sh");

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
    throw new Error(`Alli Bot ship needs Node 26 (found ${process.version}). Install node@26 or run from /opt/homebrew/opt/node/bin/node.`);
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

async function installTunnel() {
  if (process.env.ALLI_SANDBOX_SKIP_LAUNCHCTL === "1") {
    return { status: "skipped", detail: "ALLI_SANDBOX_SKIP_LAUNCHCTL=1" };
  }
  try {
    await run("/bin/bash", [tunnelInstall]);
    return { status: "installed", detail: "launchd team.alongside.allibot.sandbox-tunnel" };
  } catch (error) {
    return { status: "failed", detail: String(error?.message ?? error) };
  }
}

await reexecWithNode26IfNeeded();

if (process.platform !== "darwin") {
  throw new Error("Alli Bot can only be shipped on macOS.");
}

console.log("Running npm run check…");
await run("npm", ["run", "check"], { cwd: repoRoot });

console.log(`Packaging Alli Bot ${reconstructedVersion}…`);
const packed = await packageReconstructedMacApp({ createDmg: true });
console.log(`Signed with: ${describeSigning(packed.identity)}`);
if (packed.checksum != null) console.log(`DMG SHA-256: ${packed.checksum.sha256}`);
if (packed.notarization.status === "skipped") {
  console.log(`Notarization skipped: ${packed.notarization.reason}`);
} else {
  console.log(`Notarization: ${packed.notarization.status} (${packed.notarization.profile})`);
}

console.log("Stopping running Alli Bot…");
await run("/bin/bash", [killScript]);

console.log(`Replacing ${installedAlliBotApp} from ${outputApp}…`);
const installed = await installReconstructedApp({
  sourceApp: outputApp,
  destinationApp: installedAlliBotApp,
});
console.log(`Installed with ${installed.mode}: ${installed.destinationApp}`);

const tunnel = await installTunnel();
console.log(`Computer tunnel: ${tunnel.status} (${tunnel.detail})`);

if (packed.identity === AD_HOC_CODESIGN_IDENTITY) {
  console.log("Gatekeeper: ad-hoc signature. This Mac can run it; a clean Mac cannot until Developer ID + notarize.");
} else {
  console.log(`Gatekeeper: signed as ${packed.identity}. Assess with:`);
  console.log(`  spctl --assess --type install -v "${outputDmg}"`);
  console.log(`  spctl --assess --type execute -v "${installedAlliBotApp}"`);
}

if (!process.argv.includes("--no-launch")) {
  await run("/usr/bin/open", [installed.destinationApp]);
  console.log("Launched Alli Bot.");
}

console.log("Do not run official Grok Bot at the same time.");
console.log("NetBird enroll on the VPS still needs NETBIRD_SETUP_KEY; until then the tunnel uses public SSH.");
