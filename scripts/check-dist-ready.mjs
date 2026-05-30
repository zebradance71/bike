/**
 * Fail fast before `electron-builder` if ship assets are missing.
 * Called from npm `predist`.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ICONS = ["build/icon.ico", "assets/tray.ico", "assets/tray.png"];

function runIcons() {
  const isWin = process.platform === "win32";
  const py = isWin ? "py" : "python3";
  const r = spawnSync(`${py} -3 scripts/build-app-icon.py && ${py} -3 scripts/build-tray-icon.py`, {
    shell: true,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error("[predist] icon build failed — install Python 3 + Pillow, then: npm run build:icons");
    process.exit(1);
  }
}

const missing = ICONS.filter((p) => !existsSync(p));
if (missing.length > 0) {
  console.log("[predist] icons missing, building…", missing.join(", "));
  runIcons();
}

const stillMissing = ICONS.filter((p) => !existsSync(p));
if (stillMissing.length > 0) {
  console.error("[predist] required icons still missing:", stillMissing.join(", "));
  process.exit(1);
}

console.log("[predist] dist-ready OK (icons present)");
