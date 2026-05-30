import raw from "../branding.json";

/**
 * Per-build branding loaded from the repo-root `branding.json`.
 * Fork the repo for a new character and edit that file (or run
 * `tools/template/init-new-pack.ps1` in Phase C) — electron-builder,
 * tray labels, and the block HTTP port all read from here.
 */
export type AppBranding = {
  appName: string;
  appId: string;
  productName: string;
  displayName: string;
  characterId: string;
  copyright: string;
  description: string;
  author: string;
  publisher: string;
  homepage: string;
  blockBridgePort: number;
};

export const branding = raw as AppBranding;
