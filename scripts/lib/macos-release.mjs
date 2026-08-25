import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { run } from "./process.mjs";
import { SYSTEM_TOOLS } from "./system-tools.mjs";

export async function createAlliDmg({
  appPath,
  dmgPath,
  volumeName = "Alli Bot",
  runCommand = run,
} = {}) {
  if (typeof appPath !== "string" || !appPath.endsWith(".app")) {
    throw new TypeError("createAlliDmg requires an .app bundle path.");
  }
  if (typeof dmgPath !== "string" || !dmgPath.endsWith(".dmg")) {
    throw new TypeError("createAlliDmg requires a .dmg destination path.");
  }
  const staging = await mkdtemp(path.join(tmpdir(), "alli-bot-dmg-"));
  try {
    await runCommand(SYSTEM_TOOLS.ditto, [appPath, path.join(staging, path.basename(appPath))]);
    await runCommand(SYSTEM_TOOLS.hdiutil, [
      "create",
      "-volname",
      volumeName,
      "-srcfolder",
      staging,
      "-ov",
      "-format",
      "UDZO",
      dmgPath,
    ]);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return dmgPath;
}

export async function notarizeReleaseIfConfigured(dmgPath, {
  env = process.env,
  runCommand = run,
} = {}) {
  const profile = env.ALLI_NOTARY_PROFILE?.trim();
  if (!profile) {
    return { status: "skipped", reason: "ALLI_NOTARY_PROFILE is not set" };
  }
  if (typeof dmgPath !== "string" || !dmgPath.endsWith(".dmg")) {
    throw new TypeError("Notarization requires a .dmg path.");
  }
  await runCommand("/usr/bin/xcrun", [
    "notarytool",
    "submit",
    dmgPath,
    "--keychain-profile",
    profile,
    "--wait",
  ]);
  await runCommand("/usr/bin/xcrun", ["stapler", "staple", dmgPath]);
  return { status: "stapled", profile };
}
