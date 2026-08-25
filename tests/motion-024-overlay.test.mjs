import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { MOTION_024_OVERLAY_CSS, MOTION_024_STYLE_ID, installMotion024Overlay } from "../source/electron-preload/motion-024-overlay.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("0.24 motion overlay keeps official duration and press tokens", () => {
  assert.match(MOTION_024_OVERLAY_CSS, /--cursor-duration-instant: 50ms/);
  assert.match(MOTION_024_OVERLAY_CSS, /--cursor-easing-out-quint: cubic-bezier\(\.16, 1, \.3, 1\)/);
  assert.match(MOTION_024_OVERLAY_CSS, /--ui-press-scale: \.98/);
  assert.match(MOTION_024_OVERLAY_CSS, /scale\(var\(--ui-press-scale\)\)/);
  assert.match(MOTION_024_OVERLAY_CSS, /prefers-reduced-motion: reduce/);
});

test("0.24 motion overlay installs once", () => {
  const nodes = [];
  const doc = {
    getElementById: (id) => nodes.find((node) => node.id === id) ?? null,
    createElement: () => {
      const node = { id: "", textContent: "" };
      return node;
    },
    documentElement: {
      appendChild: (node) => {
        nodes.push(node);
        return node;
      },
    },
  };
  installMotion024Overlay(doc);
  installMotion024Overlay(doc);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].id, MOTION_024_STYLE_ID);
  assert.equal(nodes[0].textContent.includes("--ui-press-scale"), true);
});

test("reconstructed production stylesheet imports the 0.24 overlay", async () => {
  const source = await readFile(path.join(repoRoot, "frontend", "src", "production", "production.css"), "utf8");
  assert.match(source, /@import url\("\.\/motion-024\.css"\)/);
});
