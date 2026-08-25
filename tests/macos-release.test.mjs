import assert from "node:assert/strict";
import { lstat, readlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createAlliDmg } from "../scripts/lib/macos-release.mjs";
import { SYSTEM_TOOLS } from "../scripts/lib/system-tools.mjs";

test("createAlliDmg stages the app beside an Applications symlink for drag-install", async () => {
  const calls = [];
  let staged = null;
  const dmgPath = await createAlliDmg({
    appPath: "/tmp/Alli Bot.app",
    dmgPath: "/tmp/Alli Bot.dmg",
    runCommand: async (command, args) => {
      calls.push([command, args]);
      if (command === SYSTEM_TOOLS.hdiutil) {
        const src = args[args.indexOf("-srcfolder") + 1];
        staged = {
          app: path.join(src, "Alli Bot.app"),
          applications: path.join(src, "Applications"),
          applicationsTarget: await readlink(path.join(src, "Applications")),
          applicationsLink: (await lstat(path.join(src, "Applications"))).isSymbolicLink(),
        };
      }
    },
  });
  assert.equal(dmgPath, "/tmp/Alli Bot.dmg");
  assert.equal(calls[0][0], SYSTEM_TOOLS.ditto);
  assert.deepEqual(calls[0][1], ["/tmp/Alli Bot.app", staged.app]);
  assert.equal(staged.applicationsLink, true);
  assert.equal(staged.applicationsTarget, "/Applications");
  assert.deepEqual(calls[1], [SYSTEM_TOOLS.hdiutil, [
    "create",
    "-volname",
    "Alli Bot",
    "-srcfolder",
    path.dirname(staged.app),
    "-ov",
    "-format",
    "UDZO",
    "/tmp/Alli Bot.dmg",
  ]]);
});
