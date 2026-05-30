/**
 * Lightweight JSON-on-disk settings persisted under Electron's
 * `userData` directory. Used to remember:
 *
 *   - `autoStart`        — whether the OS-login auto-start hook is on
 *   - `hasCompletedFirstRun` — first launch sets autoStart=ON automatically
 *   - `lastSpritePx`     — restore companion size between sessions
 *
 * The store is intentionally tiny and synchronous; a corrupted/missing file
 * falls back to defaults rather than crashing main.
 */
import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export type AppSettings = {
  /** OS auto-start hook active. Mirror of `app.getLoginItemSettings()`. */
  autoStart: boolean;
  /** First-run sentinel. We only auto-enable autoStart on the *very* first run. */
  hasCompletedFirstRun: boolean;
  /** Last applied sprite size (48 / 64 / 96). Restored on next launch. */
  lastSpritePx?: number;
};

const DEFAULTS: AppSettings = {
  autoStart: true,
  hasCompletedFirstRun: false,
};

let cached: AppSettings | null = null;
let settingsPath: string | null = null;

function getSettingsPath(): string {
  if (settingsPath) return settingsPath;
  const dir = app.getPath("userData");
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.warn("[companion][settings] cannot create userData dir", err);
    }
  }
  settingsPath = path.join(dir, "settings.json");
  return settingsPath;
}

export function readSettings(): AppSettings {
  if (cached) return cached;
  try {
    const p = getSettingsPath();
    if (existsSync(p)) {
      const raw = readFileSync(p, "utf-8");
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      cached = { ...DEFAULTS, ...parsed };
      return cached;
    }
  } catch (err) {
    console.warn("[companion][settings] read failed; using defaults", err);
  }
  cached = { ...DEFAULTS };
  return cached;
}

export function writeSettings(patch: Partial<AppSettings>): AppSettings {
  const next: AppSettings = { ...readSettings(), ...patch };
  cached = next;
  try {
    const p = getSettingsPath();
    writeFileSync(p, JSON.stringify(next, null, 2), "utf-8");
  } catch (err) {
    console.warn("[companion][settings] write failed", err);
  }
  return next;
}

/** Reset cache — useful if the file was edited externally. */
export function reloadSettings(): AppSettings {
  cached = null;
  return readSettings();
}
