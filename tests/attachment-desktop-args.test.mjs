import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  coerceAttachmentBytes,
  normalizeCommitStagedRequest,
  normalizePathRequest,
  normalizeStageAttachmentRequest,
} from "../source/shared/media/attachment-desktop-args.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const officialRenderer = path.join(repoRoot, "src/app/dist/renderer/assets/index-UbX-y3il.js");

test("stageAttachmentBytes accepts the shipped object form and positional args", () => {
  const bytes = new Uint8Array([1, 2, 3]);
  assert.deepEqual(normalizeStageAttachmentRequest({ filename: "note.txt", bytes }), { filename: "note.txt", bytes });
  assert.deepEqual(normalizeStageAttachmentRequest("note.txt", bytes), { filename: "note.txt", bytes });
  assert.deepEqual(
    normalizeStageAttachmentRequest({ filename: "note.md", bytesBase64: "YWJj" }),
    { filename: "note.md", bytes: "YWJj" },
  );
});

test("commitStagedAttachments accepts the shipped object form used by the send journal", () => {
  assert.deepEqual(
    normalizeCommitStagedRequest({ paths: ["/tmp/a"], filenames: ["a.txt"] }),
    { paths: ["/tmp/a"], filenames: ["a.txt"] },
  );
  assert.deepEqual(
    normalizeCommitStagedRequest(["/tmp/a"], ["a.txt"]),
    { paths: ["/tmp/a"], filenames: ["a.txt"] },
  );
});

test("discardStagedAttachment accepts { path } or a string", () => {
  assert.equal(normalizePathRequest({ path: "/tmp/a" }), "/tmp/a");
  assert.equal(normalizePathRequest("/tmp/a"), "/tmp/a");
});

test("shipped composer file picker anchor is unique", async (t) => {
  if (!existsSync(officialRenderer)) {
    t.skip("needs npm run bootstrap");
    return;
  }
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(officialRenderer, "utf8");
  const needle = "Mn=()=>{ne.current?.click()}";
  assert.equal(source.split(needle).length - 1, 1);
});

test("attachment bytes survive IPC-shaped ArrayBuffer views", () => {
  const bytes = new Uint8Array([9, 8, 7]);
  assert.deepEqual(coerceAttachmentBytes(bytes), bytes);
  assert.deepEqual(coerceAttachmentBytes(bytes.buffer), bytes);
  assert.equal(coerceAttachmentBytes(undefined), null);
  assert.deepEqual(coerceAttachmentBytes({ type: "Buffer", data: [9, 8, 7] }), bytes);
  assert.deepEqual(coerceAttachmentBytes([9, 8, 7]), bytes);
  assert.deepEqual(coerceAttachmentBytes(btoa(String.fromCharCode(9, 8, 7))), bytes);
  const sliced = bytes.buffer.slice(0);
  const offsetView = new Uint8Array(sliced, 0, 3);
  assert.deepEqual(coerceAttachmentBytes(offsetView), bytes);
});

test("composer HTML staging and picker anchors stay unique", async (t) => {
  if (!existsSync(officialRenderer)) {
    t.skip("needs npm run bootstrap");
    return;
  }
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(officialRenderer, "utf8");
  const patch = await readFile(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs"), "utf8");
  assert.equal(source.split("const c=new Uint8Array(await i.arrayBuffer());return e(o,c)").length - 1, 1);
  assert.equal(source.split("b.stageAttachmentBytes({filename:we,bytes:Pe})").length - 1, 1);
  assert.equal(source.split('P&&b!=null?p.jsx(Qln,{onChangeLimit:F,reading:b}):null').length - 1, 1);
  assert.equal(source.split('Get Grok Bot for iOS').length - 1, 1);
  assert.match(patch, /btoa\(bin\)/);
  assert.match(patch, /bytesBase64:typeof Pe===\\?"string\\?"\?Pe:void 0/);
});
