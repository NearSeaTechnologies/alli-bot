import { cp, mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { repoRoot } from "./config.mjs";
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

export const ALLI_BOT_ICON_SOURCE = path.join(repoRoot, "brand", "alli-bot-icon-1024.png");

const ICONSET_SIZES = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

export async function generateAlliBotIcns(icnsPath) {
  const staging = await mkdtemp(path.join(tmpdir(), "alli-bot-icon-"));
  const iconset = path.join(staging, "alli-bot.iconset");
  try {
    await mkdir(iconset, { recursive: true });
    for (const [name, size] of ICONSET_SIZES) {
      await run(SYSTEM_TOOLS.sips, ["-z", String(size), String(size), ALLI_BOT_ICON_SOURCE, "--out", path.join(iconset, name)]);
    }
    await run(SYSTEM_TOOLS.iconutil, ["-c", "icns", iconset, "-o", icnsPath]);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
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
  const resources = path.join(contents, "Resources");
  await mkdir(resources, { recursive: true });
  const icnsPath = path.join(resources, `${TO}.icns`);
  await generateAlliBotIcns(icnsPath);
  const electronIcns = path.join(resources, "electron.icns");
  if (await exists(electronIcns)) await cp(icnsPath, electronIcns);
  await replacePlistString(infoPlist, "CFBundleIconFile", TO);

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
