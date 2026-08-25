import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { reconstructedVersion } from "../scripts/lib/config.mjs";
import {
  ALLI_RELEASE_ASAR_MARKERS,
  findMissingReleaseMarkers,
  verifyAlliReleaseAsar,
  writeReleaseChecksum,
} from "../scripts/lib/release-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("release asar contract requires the teammate catalog and Alli identity", () => {
  assert.deepEqual(ALLI_RELEASE_ASAR_MARKERS.map(marker => marker.id), [
    "search-templates",
    "five-column-grid",
    "open-picker",
    "botdirectory-catalog",
    "router-alli",
    "product-name",
    "sandbox-toggle",
    "teammate-title",
  ]);
  const empty = findMissingReleaseMarkers(Buffer.from("not the app"));
  assert.equal(empty.length, ALLI_RELEASE_ASAR_MARKERS.length);
  assert.throws(() => verifyAlliReleaseAsar(Buffer.from("Grok Bot")), /missing required markers/);
  const packed = Buffer.from(ALLI_RELEASE_ASAR_MARKERS.map(marker => marker.needle).join("\n"));
  assert.deepEqual(verifyAlliReleaseAsar(packed).markers, ALLI_RELEASE_ASAR_MARKERS.map(marker => marker.id));
});

test("packaging writes a DMG checksum and ships by copy", async () => {
  const pack = await readFile(path.join(repoRoot, "scripts", "lib", "package-reconstructed-app.mjs"), "utf8");
  const ship = await readFile(path.join(repoRoot, "scripts", "ship-alli-bot.mjs"), "utf8");
  const npm = await readFile(path.join(repoRoot, "package.json"), "utf8");
  assert.match(pack, /verifyAlliReleaseApp\(outputApp\)/);
  assert.match(pack, /writeReleaseChecksum\(outputDmg\)/);
  assert.match(pack, /mode: "copy"/);
  assert.doesNotMatch(pack, /mode: "asar-swap"/);
  assert.match(pack, /CFBundleShortVersionString/);
  assert.match(ship, /packageReconstructedMacApp\(\{ createDmg: true \}\)/);
  assert.match(ship, /run\("npm", \["run", "check"\]/);
  assert.match(ship, /install-alli-sandbox-tunnel\.sh/);
  assert.match(ship, /kill-alli-open\.sh/);
  assert.match(npm, /"ship": "npm run check && node scripts\/ship-alli-bot\.mjs"/);
  const npmJson = JSON.parse(npm);
  const product = await readFile(path.join(repoRoot, "source", "shared", "product-name.ts"), "utf8");
  const productVersion = /export const SAND_PRODUCT_VERSION = "([^"]+)"/.exec(product)?.[1];
  assert.equal(npmJson.version, reconstructedVersion);
  assert.equal(productVersion, reconstructedVersion);
});

test("release checksum sidecar matches file bytes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "alli-release-"));
  const target = path.join(dir, "Alli Bot.dmg");
  await writeFile(target, "alli-release-bytes");
  const result = await writeReleaseChecksum(target);
  assert.equal(result.bytes, 18);
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  const sidecar = await readFile(result.checksumPath, "utf8");
  assert.equal(sidecar, `${result.sha256}  Alli Bot.dmg\n`);
});
