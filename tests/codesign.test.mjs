import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  AD_HOC_CODESIGN_IDENTITY,
  ALLI_BOT_ENTITLEMENTS,
  adHocCodesignArguments,
  codesignArguments,
  parseDeveloperIdApplicationIdentities,
  resolveCodesignIdentity,
} from "../scripts/lib/codesign.mjs";
import { notarizeReleaseIfConfigured } from "../scripts/lib/macos-release.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("ad-hoc codesign arguments stay unsigned and untimestamped", () => {
  assert.deepEqual(adHocCodesignArguments("/tmp/Alli Bot.app"), [
    "--force",
    "--deep",
    "--timestamp=none",
    "--sign",
    "-",
    "/tmp/Alli Bot.app",
  ]);
  assert.deepEqual(
    codesignArguments("/tmp/Alli Bot.app", AD_HOC_CODESIGN_IDENTITY),
    adHocCodesignArguments("/tmp/Alli Bot.app"),
  );
});

test("Developer ID codesign uses hardened runtime, timestamp, and entitlements", () => {
  const identity = "Developer ID Application: Alongside LDA (ABCDE12345)";
  assert.deepEqual(codesignArguments("/tmp/Alli Bot.app", identity), [
    "--force",
    "--deep",
    "--options",
    "runtime",
    "--timestamp",
    "--sign",
    identity,
    "--entitlements",
    ALLI_BOT_ENTITLEMENTS,
    "/tmp/Alli Bot.app",
  ]);
  assert.equal(path.basename(ALLI_BOT_ENTITLEMENTS), "alli-bot.entitlements");
  assert.ok(ALLI_BOT_ENTITLEMENTS.startsWith(path.join(repoRoot, "scripts", "lib")));
});

test("resolveCodesignIdentity prefers env, then a single Developer ID, else ad-hoc", async () => {
  const listed = `  1) 0123456789ABCDEF0123456789ABCDEF01234567 "Developer ID Application: Alongside LDA (ABCDE12345)"
     1 valid identities found`;
  assert.deepEqual(parseDeveloperIdApplicationIdentities(listed), [
    "Developer ID Application: Alongside LDA (ABCDE12345)",
  ]);
  assert.equal(
    await resolveCodesignIdentity({ env: { ALLI_CODESIGN_IDENTITY: "Developer ID Application: Custom" }, listIdentities: async () => listed }),
    "Developer ID Application: Custom",
  );
  assert.equal(
    await resolveCodesignIdentity({ env: {}, listIdentities: async () => listed }),
    "Developer ID Application: Alongside LDA (ABCDE12345)",
  );
  assert.equal(
    await resolveCodesignIdentity({ env: {}, listIdentities: async () => "     0 valid identities found" }),
    AD_HOC_CODESIGN_IDENTITY,
  );
  await assert.rejects(
    () => resolveCodesignIdentity({
      env: {},
      listIdentities: async () => `  1) 0123456789ABCDEF0123456789ABCDEF01234567 "Developer ID Application: One (AAAAA11111)"
  2) FEDCBA9876543210FEDCBA9876543210FEDCBA98 "Developer ID Application: Two (BBBBB22222)"`,
    }),
    /Multiple Developer ID Application identities/,
  );
});

test("notarization is skipped without ALLI_NOTARY_PROFILE", async () => {
  const calls = [];
  const result = await notarizeReleaseIfConfigured("/tmp/Alli Bot.dmg", {
    env: {},
    runCommand: async (command, args) => {
      calls.push([command, args]);
    },
  });
  assert.equal(result.status, "skipped");
  assert.equal(calls.length, 0);
});
