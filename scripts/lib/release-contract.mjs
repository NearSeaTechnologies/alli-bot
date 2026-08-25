import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { capture } from "./process.mjs";
import { reconstructedBundleId, reconstructedName, reconstructedVersion } from "./config.mjs";
import { SYSTEM_TOOLS } from "./system-tools.mjs";

export const ALLI_RELEASE_ASAR_MARKERS = Object.freeze([
  { id: "search-templates", needle: "Search templates" },
  { id: "five-column-grid", needle: "repeat(5,minmax(0,1fr))" },
  { id: "open-picker", needle: "W.openPicker()" },
  { id: "botdirectory-catalog", needle: "multi-account-content-desk" },
  { id: "router-alli", needle: "Router (Alli)" },
  { id: "product-name", needle: "Alli Bot" },
  { id: "sandbox-toggle", needle: "Use sandbox computer" },
  { id: "teammate-title", needle: "Meet a future teammate" },
]);

export function findMissingReleaseMarkers(bytes, markers = ALLI_RELEASE_ASAR_MARKERS) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError("Release contract verification requires a Buffer.");
  return markers.filter(marker => !bytes.includes(Buffer.from(marker.needle, "utf8"))).map(marker => marker.id);
}

export function verifyAlliReleaseAsar(bytes, markers = ALLI_RELEASE_ASAR_MARKERS) {
  const missing = findMissingReleaseMarkers(bytes, markers);
  if (missing.length > 0) {
    throw new Error(`Alli Bot release asar is missing required markers: ${missing.join(", ")}`);
  }
  return { markers: markers.map(marker => marker.id) };
}

export async function verifyAlliReleaseApp(appPath) {
  if (typeof appPath !== "string" || !appPath.endsWith(".app")) {
    throw new TypeError("verifyAlliReleaseApp requires an .app bundle path.");
  }
  const infoPlist = path.join(appPath, "Contents", "Info.plist");
  const asarPath = path.join(appPath, "Contents", "Resources", "app.asar");
  const [bundleId, displayName, shortVersion, asar] = await Promise.all([
    capture(SYSTEM_TOOLS.plutil, ["-extract", "CFBundleIdentifier", "raw", infoPlist]),
    capture(SYSTEM_TOOLS.plutil, ["-extract", "CFBundleDisplayName", "raw", infoPlist]),
    capture(SYSTEM_TOOLS.plutil, ["-extract", "CFBundleShortVersionString", "raw", infoPlist]),
    readFile(asarPath),
  ]);
  if (bundleId !== reconstructedBundleId) {
    throw new Error(`Release bundle id is ${bundleId}, expected ${reconstructedBundleId}`);
  }
  if (displayName !== reconstructedName) {
    throw new Error(`Release display name is ${displayName}, expected ${reconstructedName}`);
  }
  if (shortVersion !== reconstructedVersion) {
    throw new Error(`Release version is ${shortVersion}, expected ${reconstructedVersion}`);
  }
  const asarCheck = verifyAlliReleaseAsar(asar);
  return {
    appPath,
    bundleId,
    displayName,
    version: shortVersion,
    asarBytes: asar.byteLength,
    asarSha256: createHash("sha256").update(asar).digest("hex"),
    markers: asarCheck.markers,
  };
}

export async function writeReleaseChecksum(filePath) {
  const bytes = await readFile(filePath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const checksumPath = `${filePath}.sha256`;
  await writeFile(checksumPath, `${digest}  ${path.basename(filePath)}\n`);
  return { checksumPath, sha256: digest, bytes: bytes.byteLength };
}
