/**
 * System tray integration.
 *
 * Goals:
 *   - One persistent tray icon for the entire app session
 *   - Left-click toggles the companion's visibility
 *   - Right-click context menu exposes Block-mode controls, Auto-start
 *     toggle, settings access, and a real Quit
 *   - Surfaces the *current* block / auto-start state so the user always
 *     knows what's going on
 *
 * Reliability:
 *   - All Electron API calls are guarded for a destroyed companion/launcher
 *   - Icon loading falls back to a 1×1 transparent PNG so the tray *always*
 *     constructs even if the asset is missing (the app remains usable while
 *     the user runs `py -3 scripts/build-tray-icon.py`)
 *   - `rebuildMenu()` is idempotent and safe to call from any IPC handler
 */
import {
  app,
  BrowserWindow,
  clipboard,
  Menu,
  MenuItemConstructorOptions,
  nativeImage,
  shell,
  Tray,
} from "electron";
import { existsSync } from "fs";
import path from "path";
import { ensureBlockBridgeToken } from "./block-bridge";
import { branding } from "./branding";
import { readSettings, writeSettings } from "./settings-store";

/**
 * 1×1 transparent PNG used only as the last-resort fallback when **no**
 * tray asset can be located, including the dev-time fallback to
 * `idle.png`. With the icon candidate list below, this should rarely (if
 * ever) actually be hit in practice.
 */
const FALLBACK_ICON_DATAURL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

export type TrayDeps = {
  /** Returns current launcher / companion windows (may be null). */
  getLauncher: () => BrowserWindow | null;
  getCompanion: () => BrowserWindow | null;
  /** Show or create the launcher window. */
  showLauncher: () => void;
  /** Show or create the companion window. */
  showCompanion: () => void;
  /** Hide the companion (don't destroy). */
  hideCompanion: () => void;
  /** Force block-mode ON / OFF via the existing broadcastBlockMode. */
  setBlockMode: (on: boolean, source: string) => void;
  /** Read the canonical block-mode mirror state. */
  isBlockMode: () => boolean;
  /** Set OS auto-start; returns the actually-applied state. */
  setAutoStart: (on: boolean) => boolean;
  /** Begin a real quit (sets a "wantsQuit" flag elsewhere then app.quit). */
  quit: () => void;
  /** Where to look for the icon, in priority order (first existing wins). */
  iconCandidates: string[];
  /** True when running under Vite dev. */
  isDev: boolean;
};

let tray: Tray | null = null;
let deps: TrayDeps | null = null;

function loadTrayIcon(candidates: string[]): Electron.NativeImage {
  for (const p of candidates) {
    if (!p) continue;
    if (existsSync(p)) {
      try {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) return img;
      } catch (err) {
        console.warn("[companion][tray] icon load failed", p, err);
      }
    }
  }
  console.warn(
    "[companion][tray] no usable icon found; using transparent fallback. " +
      "Run `py -3 scripts/build-tray-icon.py` to generate assets/tray.{png,ico}."
  );
  return nativeImage.createFromDataURL(FALLBACK_ICON_DATAURL);
}

function companionVisible(): boolean {
  const w = deps?.getCompanion();
  return !!(w && !w.isDestroyed() && w.isVisible());
}

/** OS login-item truth (settings file can drift on Windows). */
function readAutoStartApplied(): boolean {
  if (process.platform === "darwin" || process.platform === "win32") {
    try {
      return app.getLoginItemSettings().openAtLogin;
    } catch {
      return readSettings().autoStart;
    }
  }
  return readSettings().autoStart;
}

function rebuildMenu(): void {
  if (!tray || !deps) return;
  const block = deps.isBlockMode();
  const visible = companionVisible();

  const template: MenuItemConstructorOptions[] = [
    {
      label: `${branding.productName} — ${visible ? "running" : "hidden"}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: visible
        ? `Hide ${branding.displayName}`
        : `Show ${branding.displayName}`,
      click: () => {
        if (visible) deps?.hideCompanion();
        else deps?.showCompanion();
        rebuildMenu();
      },
    },
    {
      label: "Open settings…",
      click: () => deps?.showLauncher(),
    },
    { type: "separator" },
    {
      label: `Block mode${block ? "  ●" : ""}`,
      submenu: [
        {
          label: `Currently: ${block ? "ON" : "OFF"}`,
          enabled: false,
        },
        { type: "separator" },
        {
          label: "Force ON",
          enabled: !block,
          click: () => {
            deps?.setBlockMode(true, "tray");
            rebuildMenu();
          },
        },
        {
          label: "Force OFF",
          enabled: block,
          click: () => {
            deps?.setBlockMode(false, "tray");
            rebuildMenu();
          },
        },
      ],
    },
    { type: "separator" },
    {
      label: "Start with Windows",
      submenu: (() => {
        const autoOn = readAutoStartApplied();
        const items: MenuItemConstructorOptions[] = [
          {
            label: `Currently: ${autoOn ? "ON" : "OFF"}`,
            enabled: false,
          },
        ];
        if (deps.isDev) {
          items.push({
            label: "Dev mode: use installed .exe (npm run dist)",
            enabled: false,
          });
        }
        items.push(
          { type: "separator" },
          {
            label: "Turn ON",
            enabled: !autoOn,
            click: () => {
              const applied = deps?.setAutoStart(true) ?? false;
              writeSettings({ autoStart: applied });
              rebuildMenu();
            },
          },
          {
            label: "Turn OFF",
            enabled: autoOn,
            click: () => {
              const applied = deps?.setAutoStart(false) ?? false;
              writeSettings({ autoStart: applied });
              rebuildMenu();
            },
          }
        );
        return items;
      })(),
    },
    { type: "separator" },
    {
      label: "Open user data folder",
      click: () => {
        try {
          void shell.openPath(app.getPath("userData"));
        } catch (err) {
          console.warn("[companion][tray] open userData failed", err);
        }
      },
    },
    {
      label: "Copy block bridge token",
      click: () => {
        try {
          clipboard.writeText(ensureBlockBridgeToken());
        } catch (err) {
          console.warn("[companion][tray] copy block token failed", err);
        }
      },
    },
    {
      label: "Reload assets",
      visible: !!deps.isDev,
      click: () => {
        const c = deps?.getCompanion();
        if (c && !c.isDestroyed()) c.webContents.reload();
        const l = deps?.getLauncher();
        if (l && !l.isDestroyed()) l.webContents.reload();
      },
    },
    { type: "separator" },
    {
      label: `Quit ${branding.productName}`,
      click: () => deps?.quit(),
    },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

export function createAppTray(d: TrayDeps): Tray | null {
  if (tray) return tray;
  deps = d;

  try {
    const icon = loadTrayIcon(d.iconCandidates);
    tray = new Tray(icon);
    tray.setToolTip(branding.productName);
    tray.on("click", () => {
      // Left-click toggle. Some Linux distros don't fire `click` reliably;
      // the right-click menu is the canonical fallback.
      if (companionVisible()) deps?.hideCompanion();
      else deps?.showCompanion();
      rebuildMenu();
    });
    tray.on("double-click", () => {
      deps?.showLauncher();
    });
    rebuildMenu();
    return tray;
  } catch (err) {
    console.warn(
      "[companion][tray] failed to create tray; running without it",
      err
    );
    tray = null;
    return null;
  }
}

/** External callers (e.g. main.ts after a block-mode broadcast) can refresh
 * the menu so the "Currently: ON/OFF" label stays accurate. */
export function refreshTrayMenu(): void {
  rebuildMenu();
}

export function destroyAppTray(): void {
  if (tray) {
    try {
      tray.destroy();
    } catch {
      // ignore — happens during fast shutdown
    }
    tray = null;
  }
  deps = null;
}
