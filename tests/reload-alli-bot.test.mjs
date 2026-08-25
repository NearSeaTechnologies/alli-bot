import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { AD_HOC_CODESIGN_IDENTITY } from "../scripts/lib/codesign.mjs";
import { installedAlliBotApp } from "../scripts/lib/config.mjs";
import { describeSigning, packagedAsarPaths } from "../scripts/lib/package-reconstructed-app.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("reload installs the rebuilt asar into /Applications/Alli Bot.app without a DMG", async () => {
  const reload = await readFile(path.join(repoRoot, "scripts", "reload-alli-bot.mjs"), "utf8");
  const pack = await readFile(path.join(repoRoot, "scripts", "lib", "package-reconstructed-app.mjs"), "utf8");
  const npm = await readFile(path.join(repoRoot, "package.json"), "utf8");
  assert.match(reload, /createDmg: false/);
  assert.match(reload, /kill-alli-open\.sh/);
  assert.match(reload, /\/usr\/bin\/open/);
  assert.match(reload, /installedAlliBotApp/);
  assert.match(pack, /mode: "copy"/);
  assert.doesNotMatch(pack, /mode: "asar-swap"/);
  assert.match(npm, /"reload": "node scripts\/reload-alli-bot\.mjs"/);
  assert.match(npm, /"reload:watch": "node scripts\/reload-alli-bot\.mjs --watch"/);
  assert.equal(installedAlliBotApp, "/Applications/Alli Bot.app");
  assert.equal(packagedAsarPaths("/tmp/Alli Bot.app").packagedAsar, "/tmp/Alli Bot.app/Contents/Resources/app.asar");
  assert.equal(describeSigning(AD_HOC_CODESIGN_IDENTITY), "ad-hoc (set ALLI_CODESIGN_IDENTITY or install a Developer ID Application cert)");
});
