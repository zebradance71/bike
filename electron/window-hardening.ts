import type { BrowserWindow, WebPreferences } from "electron";

const MAX_ANIMATION_MS = 30_000;

/** Shared hardened renderer prefs for launcher + companion. */
export function rendererWebPreferences(preloadPath: string): WebPreferences {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
}

function isAllowedNavigationUrl(url: string, isDev: boolean): boolean {
  if (url.startsWith("file://")) return true;
  if (!isDev) return false;
  try {
    const u = new URL(url);
    return (
      (u.protocol === "http:" || u.protocol === "https:") &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

/** Block arbitrary navigation / popups (XSS defense-in-depth). */
export function attachRendererGuards(
  win: BrowserWindow,
  isDev: boolean
): void {
  const wc = win.webContents;

  wc.setWindowOpenHandler(() => ({ action: "deny" }));

  const blockIfUntrusted = (event: { preventDefault: () => void }, url: string) => {
    if (!isAllowedNavigationUrl(url, isDev)) {
      event.preventDefault();
      if (isDev) {
        console.warn("[companion][nav] blocked", url);
      }
    }
  };

  wc.on("will-navigate", (event, url) => blockIfUntrusted(event, url));
  wc.on("will-redirect", (event, url) => blockIfUntrusted(event, url));
}

export function clampAnimationMs(durationMs: number): number {
  const n = Math.round(Number(durationMs));
  if (!Number.isFinite(n)) return 300;
  return Math.max(50, Math.min(MAX_ANIMATION_MS, n));
}
