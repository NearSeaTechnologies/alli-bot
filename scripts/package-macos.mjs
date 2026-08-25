import { outputApp, outputDmg } from "./lib/config.mjs";
import { describeSigning, packageReconstructedMacApp } from "./lib/package-reconstructed-app.mjs";

if (process.platform !== "darwin") {
  throw new Error("The reconstructed macOS application can only be packaged on macOS.");
}

const { identity, verification, notarization } = await packageReconstructedMacApp({ createDmg: true });

console.log(`Packaged application: ${outputApp} (${verification.runtime.nodeFileCount} native manifest entries, ${verification.runtime.runtimeFileCount} unpacked runtime files)`);
console.log(`Signed with: ${describeSigning(identity)}`);
console.log(`Disk image: ${outputDmg}`);
if (notarization.status === "skipped") {
  console.log(`Notarization skipped: ${notarization.reason}. Store credentials with: xcrun notarytool store-credentials`);
} else {
  console.log(`Notarization: ${notarization.status} (${notarization.profile})`);
}
