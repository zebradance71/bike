/**
 * Active-window title watcher.
 *
 * Lightweight wrapper around `active-win` that polls the foreground window
 * title and reports a `block-mode` boolean transition to a single
 * `onChange` callback. Designed so the user does not have to install a
 * browser extension to get the block-disruption companion behavior.
 *
 * Reliability notes (the user asked specifically to minimize bugs):
 *
 * - `active-win` is loaded via dynamic `import()` so the rest of main.ts
 *   runs even if the dependency is missing (degrades gracefully → ext only).
 * - Each poll is wrapped in try/catch and a small error-streak counter:
 *   five consecutive failures park the watcher in a 30-second cooldown
 *   instead of spamming logs.
 * - State changes are confirmed across N polling ticks. The defaults trade
 *   responsiveness vs. flicker resistance: 1 tick to flip in either
 *   direction (≈ 1.2s) feels close to instant when switching tabs while
 *   still ignoring single-frame transient titles. Tweak via env
 *   (`NINJA_TITLE_POLL_MS`, `NINJA_TITLE_TICKS_TO_BLOCK`,
 *   `NINJA_TITLE_TICKS_TO_UNBLOCK`) without recompiling.
 * - The watcher *only reports transitions*. If the same value is observed
 *   repeatedly, no callback fires.
 * - `NINJA_TITLE_WATCHER=off` disables the whole thing.
 * - `NINJA_TITLE_PATTERNS` (comma-separated regex) and `NINJA_TITLE_BROWSERS`
 *   (comma-separated process names) override the built-in lists at startup
 *   without a rebuild.
 */
import type { BrowserWindow } from "electron";

type ActiveWinResult = {
  title?: string;
  owner?: { name?: string; processId?: number; path?: string };
  url?: string;
} | null;

type ActiveWinFn = () => Promise<ActiveWinResult>;

export type TitleWatcherOptions = {
  onChange: (on: boolean, source: "title-watcher") => void;
  /**
   * Pid of our own Electron processes. The watcher ignores foreground
   * windows owned by us so the companion never blocks itself when the
   * launcher window happens to mention "X" or similar.
   */
  selfPids?: number[];
  /** Override the built-in browser process list. */
  browsers?: string[];
  /** Override the built-in match patterns. */
  patterns?: (string | RegExp)[];
  /** Polling interval in ms. Default 1500. */
  pollMs?: number;
  isDev?: boolean;
};

const DEFAULT_BROWSERS = [
  // Windows process names
  "chrome.exe",
  "msedge.exe",
  "firefox.exe",
  "brave.exe",
  "opera.exe",
  "vivaldi.exe",
  "arc.exe",
  // macOS app bundles (defensive — ninja runs on Win primarily)
  "Google Chrome",
  "Microsoft Edge",
  "Firefox",
  "Brave Browser",
  "Opera",
  "Vivaldi",
  "Arc",
];

/**
 * Default title patterns. Word-boundary matched (case insensitive) so
 * "X" only triggers when it appears as a separate token (Chrome's tab
 * titles include " / X" / "(N) X" / "X (1)" forms). Adjust via
 * NINJA_TITLE_PATTERNS env if a particular site causes false positives.
 */
const DEFAULT_PATTERNS: RegExp[] = [
  /\bYouTube\b/i,
  /\bTwitter\b/i,
  /\bTikTok\b/i,
  /(?:^|[\s\-(/—|])X(?:[\s\-)/—|]|$)/, // "X" as standalone token
];

const POLL_MS_DEFAULT = 1200;
/** Default ticks required before flipping ON/OFF; 1 = instant on next poll. */
const TICKS_TO_BLOCK_DEFAULT = 1;
const TICKS_TO_UNBLOCK_DEFAULT = 1;
const ERR_STREAK_BEFORE_COOLDOWN = 5;
const ERR_COOLDOWN_MS = 30_000;

let pollTimer: NodeJS.Timeout | null = null;
let activeWinFn: ActiveWinFn | null = null;
let started = false;

let lastDetected = false;
let confirmTicks = 0;
let errStreak = 0;
let cooldownUntil = 0;

let browsers: string[] = DEFAULT_BROWSERS;
let patterns: RegExp[] = DEFAULT_PATTERNS;
let selfPids: Set<number> = new Set();
let pollMs = POLL_MS_DEFAULT;
let ticksToBlock = TICKS_TO_BLOCK_DEFAULT;
let ticksToUnblock = TICKS_TO_UNBLOCK_DEFAULT;
let onChange: TitleWatcherOptions["onChange"] | null = null;
let isDev = false;

function debugLog(...args: unknown[]): void {
  if (isDev) console.debug("[companion][title-watcher]", ...args);
}

function compilePatterns(raw: (string | RegExp)[]): RegExp[] {
  return raw
    .map((p) => {
      if (p instanceof RegExp) return p;
      try {
        return new RegExp(String(p), "i");
      } catch (err) {
        console.warn(
          "[companion][title-watcher] invalid pattern, skipping",
          p,
          err
        );
        return null;
      }
    })
    .filter((r): r is RegExp => r != null);
}

function isBrowserProcess(procName: string | undefined | null): boolean {
  if (!procName) return false;
  const lower = procName.toLowerCase();
  return browsers.some((b) => lower.includes(b.toLowerCase()));
}

function matchesPattern(title: string | undefined | null): boolean {
  if (!title) return false;
  return patterns.some((p) => p.test(title));
}

async function loadActiveWin(): Promise<ActiveWinFn | null> {
  try {
    // active-win@8 is ESM-only; dynamic import works from both CJS and ESM.
    const mod = (await import("active-win")) as { default?: ActiveWinFn };
    const fn = mod.default ?? (mod as unknown as ActiveWinFn);
    if (typeof fn !== "function") {
      throw new Error("active-win export is not a function");
    }
    return fn;
  } catch (err) {
    console.warn(
      "[companion][title-watcher] `active-win` is not available; watcher will stay disabled. " +
        "Run `npm install active-win` to enable extension-less site detection.",
      err
    );
    return null;
  }
}

async function tick(): Promise<void> {
  if (!activeWinFn) return;
  if (Date.now() < cooldownUntil) return;

  let detected = false;
  try {
    const win = await activeWinFn();
    if (win) {
      const ownerPid = win.owner?.processId;
      const procName = win.owner?.name ?? "";
      const ourSelf =
        typeof ownerPid === "number" && selfPids.has(ownerPid);
      if (!ourSelf && isBrowserProcess(procName)) {
        detected = matchesPattern(win.title);
      }
    }
    errStreak = 0;
  } catch (err) {
    errStreak++;
    if (errStreak >= ERR_STREAK_BEFORE_COOLDOWN) {
      cooldownUntil = Date.now() + ERR_COOLDOWN_MS;
      console.warn(
        "[companion][title-watcher] sustained errors; cooling down 30s",
        err
      );
      errStreak = 0;
    } else if (isDev) {
      debugLog("poll error", err);
    }
    return;
  }

  if (detected !== lastDetected) {
    confirmTicks++;
    const needed = detected ? ticksToBlock : ticksToUnblock;
    if (confirmTicks >= needed) {
      lastDetected = detected;
      confirmTicks = 0;
      debugLog("transition", { detected });
      try {
        onChange?.(detected, "title-watcher");
      } catch (err) {
        console.warn("[companion][title-watcher] onChange threw", err);
      }
    }
  } else if (confirmTicks !== 0) {
    confirmTicks = 0;
  }
}

export async function startTitleWatcher(
  opts: TitleWatcherOptions
): Promise<void> {
  if (started) return;
  started = true;

  if (
    (process.env.COMPANION_TITLE_WATCHER ?? process.env.NINJA_TITLE_WATCHER ?? "")
      .toLowerCase() === "off"
  ) {
    console.info(
      "[companion][title-watcher] disabled by COMPANION_TITLE_WATCHER=off"
    );
    return;
  }

  isDev = !!opts.isDev;
  pollMs = Math.max(500, opts.pollMs ?? POLL_MS_DEFAULT);
  ticksToBlock = TICKS_TO_BLOCK_DEFAULT;
  ticksToUnblock = TICKS_TO_UNBLOCK_DEFAULT;
  selfPids = new Set(opts.selfPids ?? [process.pid]);

  // Env-var tuning. Lets a user dial in responsiveness without recompiling.
  const envPollMs = Number(process.env.NINJA_TITLE_POLL_MS);
  if (Number.isFinite(envPollMs) && envPollMs >= 200) {
    pollMs = envPollMs;
  }
  const envTicksBlock = Number(process.env.NINJA_TITLE_TICKS_TO_BLOCK);
  if (Number.isFinite(envTicksBlock) && envTicksBlock >= 1) {
    ticksToBlock = Math.floor(envTicksBlock);
  }
  const envTicksUnblock = Number(process.env.NINJA_TITLE_TICKS_TO_UNBLOCK);
  if (Number.isFinite(envTicksUnblock) && envTicksUnblock >= 1) {
    ticksToUnblock = Math.floor(envTicksUnblock);
  }

  if (opts.browsers && opts.browsers.length > 0) {
    browsers = opts.browsers;
  }
  if (opts.patterns && opts.patterns.length > 0) {
    patterns = compilePatterns(opts.patterns);
  }

  const envPatterns = process.env.NINJA_TITLE_PATTERNS;
  if (envPatterns) {
    const parsed = compilePatterns(
      envPatterns
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
    if (parsed.length > 0) patterns = parsed;
  }
  const envBrowsers = process.env.NINJA_TITLE_BROWSERS;
  if (envBrowsers) {
    const parsed = envBrowsers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parsed.length > 0) browsers = parsed;
  }

  onChange = opts.onChange;

  activeWinFn = await loadActiveWin();
  if (!activeWinFn) return;

  console.info("[companion][title-watcher] starting", {
    pollMs,
    ticksToBlock,
    ticksToUnblock,
    browsers: browsers.length,
    patterns: patterns.map((p) => p.source),
  });

  pollTimer = setInterval(() => {
    void tick();
  }, pollMs);
  // run once immediately so block-mode reflects the current foreground.
  void tick();
}

export function stopTitleWatcher(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  activeWinFn = null;
  onChange = null;
  started = false;
  lastDetected = false;
  confirmTicks = 0;
  errStreak = 0;
  cooldownUntil = 0;
  ticksToBlock = TICKS_TO_BLOCK_DEFAULT;
  ticksToUnblock = TICKS_TO_UNBLOCK_DEFAULT;
}

/**
 * Helper so main.ts can collect every Electron BrowserWindow's pid in one
 * shot. Used to populate `selfPids` so the watcher ignores our own
 * launcher / companion windows.
 */
export function collectSelfPids(windows: (BrowserWindow | null)[]): number[] {
  const pids = new Set<number>([process.pid]);
  for (const w of windows) {
    if (!w || w.isDestroyed()) continue;
    try {
      const pid = w.webContents.getOSProcessId();
      if (pid > 0) pids.add(pid);
    } catch {
      // ignore — webContents may not be ready yet
    }
  }
  return [...pids];
}
