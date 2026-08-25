/// <reference path="../css-text.d.ts" />
import motion024Css from "../../frontend/src/production/motion-024.css";

export const MOTION_024_STYLE_ID = "sand-motion-024";

/** Official Grok Bot 0.24.0 motion overlay. Single source: frontend/src/production/motion-024.css. */
export const MOTION_024_OVERLAY_CSS: string = motion024Css;

export function installMotion024Overlay(doc: { getElementById(id: string): unknown; documentElement: { appendChild(node: unknown): unknown }; createElement(tag: string): { id: string; textContent: string } }): void {
  if (doc.getElementById(MOTION_024_STYLE_ID) != null) return;
  const style = doc.createElement("style");
  style.id = MOTION_024_STYLE_ID;
  style.textContent = MOTION_024_OVERLAY_CSS;
  doc.documentElement.appendChild(style);
}
