import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { buildFidelityReconstructedAsar } from "../clean-build.mjs";
import { applyAlliBotMacIdentity } from "./alli-bot-identity.mjs";
import { AD_HOC_CODESIGN_IDENTITY, signPackagedApp } from "./codesign.mjs";
import {
  installedAlliBotApp,
  outputApp,
  outputDir,
  outputDmg,
  reconstructedBundleId,
  reconstructedName,
} from "./config.mjs";
import { createAlliDmg, notarizeReleaseIfConfigured } from "./macos-release.mjs";
import { verifyOfficialMacReference, verifyReconstructedMacPackage } from "./macos-package-verification.mjs";
import { capture, run } from "./process.mjs";
import { SYSTEM_TOOLS } from "./system-tools.mjs";

export function packagedAsarPaths(appPath) {
  const packagedAsar = path.join(appPath, "Contents", "Resources", "app.asar");
  return { packagedAsar, packagedUnpacked: `${packagedAsar}.unpacked` };
}

export async function swapPackagedAsar(appPath, builtAsar, builtAsarUnpacked) {
  const { packagedAsar, packagedUnpacked } = packagedAsarPaths(appPath);
  await rm(packagedAsar, { force: true });
  await rm(packagedUnpacked, { recursive: true, force: true });
  await cp(builtAsar, packagedAsar);
  await cp(builtAsarUnpacked, packagedUnpacked, {
    recursive: true,
    dereference: false,
    preserveTimestamps: true,
  });
}

async function resignApp(appPath) {
  await rm(path.join(appPath, "Contents", "_CodeSignature"), { recursive: true, force: true });
  await run(SYSTEM_TOOLS.xattr, ["-cr", appPath]);
  const identity = await signPackagedApp(appPath);
  await run(SYSTEM_TOOLS.codesign, ["--verify", "--deep", "--strict", appPath]);
  return identity;
}

export async function readBundleIdentifier(appPath) {
  try {
    return await capture(SYSTEM_TOOLS.plutil, ["-extract", "CFBundleIdentifier", "raw", path.join(appPath, "Contents", "Info.plist")]);
  } catch {
    return "";
  }
}

export async function isInstalledAlliBot(appPath = installedAlliBotApp) {
  if (!existsSync(appPath)) return false;
  return await readBundleIdentifier(appPath) === reconstructedBundleId;
}

async function applyReconstructedInfoPlist(appPath) {
  const infoPlist = path.join(appPath, "Contents", "Info.plist");
  await run(SYSTEM_TOOLS.plutil, ["-remove", "ElectronAsarIntegrity", infoPlist]);
  await run(SYSTEM_TOOLS.plutil, ["-replace", "CFBundleIdentifier", "-string", reconstructedBundleId, infoPlist]);
  await run(SYSTEM_TOOLS.plutil, ["-replace", "CFBundleDisplayName", "-string", reconstructedName, infoPlist]);
  await run(SYSTEM_TOOLS.plutil, ["-remove", "CFBundleURLTypes", infoPlist]);
  await run(SYSTEM_TOOLS.plutil, ["-insert", "CFBundleURLTypes", "-xml", "<array><dict><key>CFBundleTypeRole</key><string>Viewer</string><key>CFBundleURLName</key><string>Alli Bot auth callback</string><key>CFBundleURLSchemes</key><array><string>sand</string></array></dict></array>", infoPlist]);
}

export async function materializeDistApp({ builtAsar, builtAsarUnpacked, runtimeApp }) {
  await mkdir(outputDir, { recursive: true });
  await rm(outputApp, { recursive: true, force: true });
  await run(SYSTEM_TOOLS.ditto, [runtimeApp, outputApp]);
  await run(SYSTEM_TOOLS.xattr, ["-cr", outputApp]);
  await swapPackagedAsar(outputApp, builtAsar, builtAsarUnpacked);
  await applyReconstructedInfoPlist(outputApp);
  await resignApp(outputApp);
  const { packagedUnpacked } = packagedAsarPaths(outputApp);
  const verification = await verifyReconstructedMacPackage({
    officialApp: runtimeApp,
    reconstructedApp: outputApp,
    sourceUnpackedRoot: builtAsarUnpacked,
    packagedUnpackedRoot: packagedUnpacked,
  });
  await applyAlliBotMacIdentity(outputApp);
  const identity = await resignApp(outputApp);
  return { identity, verification };
}

export async function refreshExistingApp(appPath, builtAsar, builtAsarUnpacked) {
  await swapPackagedAsar(appPath, builtAsar, builtAsarUnpacked);
  return await resignApp(appPath);
}

export async function packageReconstructedMacApp({ createDmg = true } = {}) {
  if (process.platform !== "darwin") {
    throw new Error("The reconstructed macOS application can only be packaged on macOS.");
  }
  const { builtAsar, builtAsarUnpacked, runtimeApp } = await buildFidelityReconstructedAsar();
  await verifyOfficialMacReference({ runtimeApp });
  const { identity, verification } = await materializeDistApp({ builtAsar, builtAsarUnpacked, runtimeApp });
  let notarization = { status: "skipped", reason: "Disk image was not built." };
  if (createDmg) {
    await createAlliDmg({ appPath: outputApp, dmgPath: outputDmg });
    notarization = await notarizeReleaseIfConfigured(outputDmg);
  }
  return { builtAsar, builtAsarUnpacked, runtimeApp, identity, verification, notarization };
}

export async function installReconstructedApp({
  sourceApp = outputApp,
  destinationApp = installedAlliBotApp,
  builtAsar,
  builtAsarUnpacked,
} = {}) {
  if (!existsSync(sourceApp)) throw new Error(`Missing packaged app: ${sourceApp}`);
  if (await isInstalledAlliBot(destinationApp) && builtAsar != null && builtAsarUnpacked != null) {
    await refreshExistingApp(destinationApp, builtAsar, builtAsarUnpacked);
    return { destinationApp, mode: "asar-swap" };
  }
  await rm(destinationApp, { recursive: true, force: true });
  await run(SYSTEM_TOOLS.ditto, [sourceApp, destinationApp]);
  await resignApp(destinationApp);
  return { destinationApp, mode: "copy" };
}

export function describeSigning(identity) {
  return identity === AD_HOC_CODESIGN_IDENTITY
    ? "ad-hoc (set ALLI_CODESIGN_IDENTITY or install a Developer ID Application cert)"
    : identity;
}
