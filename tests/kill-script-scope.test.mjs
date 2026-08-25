import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("the kill script never targets the official Grok Bot", async () => {
  const script = await readFile(path.join(repoRoot, "scripts", "kill-alli-open.sh"), "utf8");
  const commands = script
    .split("\n")
    .filter((line) => /^\s*(pkill|quit_app|killall)\b/.test(line) || /^\s*"/.test(line));
  const joined = commands.join("\n");

  // "/Applications/Grok Bot.app" is the official app (com.anysphere.sand). It is a
  // different product that merely shares a name prefix - killing it took down the
  // user's real Grok Bot every time this project rebuilt.
  assert.doesNotMatch(joined, /\/Applications\/Grok Bot\.app/);
  // A bare `quit_app "Grok Bot"` quits the official app by name.
  assert.doesNotMatch(script, /quit_app "Grok Bot"\s*$/m);
  // A bare daemon pattern matches the official app's daemon too.
  assert.doesNotMatch(joined, /(^|[^ ])"Grok Bot\.app\/Contents/m);

  // It must still clean up this project's own copies.
  assert.match(script, /\/Applications\/Alli Bot\.app/);
  assert.match(script, /\/Volumes\/Alli Bot/);
  assert.match(script, /dist\/Alli Bot\.app/);
  assert.match(script, /Grok Bot 0\.18 Reconstructed/);
});
