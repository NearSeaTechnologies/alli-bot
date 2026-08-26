import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import * as esbuild from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const motionCssPath = path.join(repoRoot, "frontend", "src", "production", "motion-024.css");

async function loadOverlay() {
  const result = await esbuild.build({
    absWorkingDir: repoRoot,
    entryPoints: ["source/electron-preload/motion-024-overlay.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    loader: { ".css": "text" },
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

test("0.24 motion overlay keeps official duration and press tokens", async () => {
  const css = await readFile(motionCssPath, "utf8");
  assert.match(css, /--cursor-duration-instant: 50ms/);
  assert.match(css, /--cursor-easing-out-quint: cubic-bezier\(\.16, 1, \.3, 1\)/);
  assert.match(css, /--ui-press-scale: \.98/);
  assert.match(css, /scale\(var\(--ui-press-scale\)\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  const overlay = await loadOverlay();
  assert.equal(overlay.MOTION_024_OVERLAY_CSS.trim(), css.trim());
});

test("0.24 motion overlay installs once from the CSS file", async () => {
  const overlay = await loadOverlay();
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
  overlay.installMotion024Overlay(doc);
  overlay.installMotion024Overlay(doc);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].id, overlay.MOTION_024_STYLE_ID);
  assert.equal(nodes[0].textContent.includes("--ui-press-scale"), true);
});

test("reconstructed production stylesheet does not double-apply the overlay", async () => {
  const source = await readFile(path.join(repoRoot, "frontend", "src", "production", "production.css"), "utf8");
  assert.doesNotMatch(source, /@import url\("\.\/motion-024\.css"\)/);
});

test("0.24 motion overlay does not override the host renderer's own enter and exit motion", async () => {
  const css = await readFile(path.join(repoRoot, "frontend/src/production/motion-024.css"), "utf8");
  // The overlay is injected into every document, including the original Grok Bot
  // bundle, which drives these attributes with its own transitions. Declaring them
  // here layered a second animation on top and made popovers animate twice.
  const declarations = css.replace(/@media[^{]*\{[\s\S]*?\n\}/g, "");
  assert.doesNotMatch(declarations, /^\[data-starting-style\]/m);
  assert.doesNotMatch(declarations, /^\[data-ending-style\]/m);
  assert.doesNotMatch(declarations, /^\[role="menu"\]/m);
  assert.doesNotMatch(declarations, /^\[role="listbox"\]/m);
  assert.doesNotMatch(declarations, /^\[role="dialog"\]/m);
  // The additive tokens and press feedback must stay.
  assert.match(css, /--ui-press-scale: \.98/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
