import { rename, stat } from "node:fs/promises";
import path from "node:path";

import { run } from "./process.mjs";
import { SYSTEM_TOOLS } from "./system-tools.mjs";

const FROM = "Grok Bot";
const TO = "Alli Bot";

const HELPERS = [
  { fromApp: `${FROM} Helper.app`, toApp: `${TO} Helper.app`, fromExec: `${FROM} Helper`, toExec: `${TO} Helper`, bundleId: "com.anysphere.sand.helper" },
  { fromApp: `${FROM} Helper (GPU).app`, toApp: `${TO} Helper (GPU).app`, fromExec: `${FROM} Helper (GPU)`, toExec: `${TO} Helper (GPU)`, bundleId: "com.anysphere.sand.helper.GPU" },
  { fromApp: `${FROM} Helper (Plugin).app`, toApp: `${TO} Helper (Plugin).app`, fromExec: `${FROM} Helper (Plugin)`, toExec: `${TO} Helper (Plugin)`, bundleId: "com.anysphere.sand.helper.Plugin" },
  { fromApp: `${FROM} Helper (Renderer).app`, toApp: `${TO} Helper (Renderer).app`, fromExec: `${FROM} Helper (Renderer)`, toExec: `${TO} Helper (Renderer)`, bundleId: "com.anysphere.sand.helper.Renderer" },
];

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function renameExisting(from, to) {
  if (!await exists(from)) return;
  if (from === to) return;
  if (await exists(to)) return;
  await rename(from, to);
}

async function replacePlistString(plist, key, value) {
  if (!await exists(plist)) return;
  await run(SYSTEM_TOOLS.plutil, ["-replace", key, "-string", value, plist]);
}

export async function applyAlliBotMacIdentity(appPath) {
  if (typeof appPath !== "string" || appPath.trim() === "") {
    throw new TypeError("An application bundle path is required");
  }
  const contents = path.join(appPath, "Contents");
  const macos = path.join(contents, "MacOS");
  const frameworks = path.join(contents, "Frameworks");
  const infoPlist = path.join(contents, "Info.plist");

  await renameExisting(path.join(macos, FROM), path.join(macos, TO));
  await replacePlistString(infoPlist, "CFBundleExecutable", TO);
  await replacePlistString(infoPlist, "CFBundleName", TO);
  await replacePlistString(infoPlist, "CFBundleDisplayName", TO);

  for (const helper of HELPERS) {
    const fromApp = path.join(frameworks, helper.fromApp);
    const toApp = path.join(frameworks, helper.toApp);
    await renameExisting(fromApp, toApp);
    const helperRoot = await exists(toApp) ? toApp : fromApp;
    if (!await exists(helperRoot)) continue;
    const helperMacos = path.join(helperRoot, "Contents", "MacOS");
    await renameExisting(path.join(helperMacos, helper.fromExec), path.join(helperMacos, helper.toExec));
    const helperPlist = path.join(helperRoot, "Contents", "Info.plist");
    await replacePlistString(helperPlist, "CFBundleExecutable", helper.toExec);
    await replacePlistString(helperPlist, "CFBundleDisplayName", helper.toExec);
    await replacePlistString(helperPlist, "CFBundleIdentifier", helper.bundleId);
  }
}
