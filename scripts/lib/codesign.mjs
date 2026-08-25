import path from "node:path";
import { fileURLToPath } from "node:url";

import { capture, run } from "./process.mjs";

const thisDir = path.dirname(fileURLToPath(import.meta.url));

export const AD_HOC_CODESIGN_IDENTITY = "-";
export const ALLI_BOT_ENTITLEMENTS = path.join(thisDir, "alli-bot.entitlements");
export const NONINTERACTIVE_CODESIGN_STDIO = Object.freeze([
  "ignore",
  "inherit",
  "inherit",
]);

export function parseDeveloperIdApplicationIdentities(output) {
  if (typeof output !== "string") return [];
  const identities = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*\d+\)\s+[0-9A-F]{40}\s+"(Developer ID Application: .+)"\s*$/);
    if (match) identities.push(match[1]);
  }
  return identities;
}

async function defaultListIdentities() {
  return await capture("/usr/bin/security", ["find-identity", "-v", "-p", "codesigning"]);
}

export async function resolveCodesignIdentity({
  env = process.env,
  listIdentities = defaultListIdentities,
} = {}) {
  const configured = env.ALLI_CODESIGN_IDENTITY?.trim();
  if (configured) return configured;
  let listed = [];
  try {
    listed = parseDeveloperIdApplicationIdentities(await listIdentities());
  } catch {
    return AD_HOC_CODESIGN_IDENTITY;
  }
  if (listed.length === 1) return listed[0];
  if (listed.length > 1) {
    throw new Error(
      `Multiple Developer ID Application identities found; set ALLI_CODESIGN_IDENTITY to one of: ${listed.join(", ")}`,
    );
  }
  return AD_HOC_CODESIGN_IDENTITY;
}

export function adHocCodesignArguments(target) {
  if (typeof target !== "string" || target.length === 0) {
    throw new TypeError("An explicit application bundle path is required for ad-hoc signing.");
  }
  return [
    "--force",
    "--deep",
    "--timestamp=none",
    "--sign",
    AD_HOC_CODESIGN_IDENTITY,
    target,
  ];
}

export function codesignArguments(target, identity, { entitlements = ALLI_BOT_ENTITLEMENTS } = {}) {
  if (typeof target !== "string" || target.length === 0) {
    throw new TypeError("An explicit application bundle path is required for signing.");
  }
  if (identity === AD_HOC_CODESIGN_IDENTITY) return adHocCodesignArguments(target);
  if (typeof identity !== "string" || identity.length === 0) {
    throw new TypeError("A codesign identity is required.");
  }
  const args = [
    "--force",
    "--deep",
    "--options",
    "runtime",
    "--timestamp",
    "--sign",
    identity,
  ];
  if (typeof entitlements === "string" && entitlements.length > 0) {
    args.push("--entitlements", entitlements);
  }
  args.push(target);
  return args;
}

export async function signAppBundleAdHoc(target, runCommand = run) {
  await runCommand("/usr/bin/codesign", adHocCodesignArguments(target), {
    stdio: NONINTERACTIVE_CODESIGN_STDIO,
  });
}

export async function signPackagedApp(target, {
  env = process.env,
  listIdentities = defaultListIdentities,
  runCommand = run,
} = {}) {
  const identity = await resolveCodesignIdentity({ env, listIdentities });
  const args = codesignArguments(target, identity);
  try {
    await runCommand("/usr/bin/codesign", args, { stdio: NONINTERACTIVE_CODESIGN_STDIO });
  } catch (error) {
    console.warn(`Initial signing pass failed; retrying once: ${String(error)}`);
    await runCommand("/usr/bin/codesign", args, { stdio: NONINTERACTIVE_CODESIGN_STDIO });
  }
  return identity;
}
