import { app, dialog } from "electron";
import { appendFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { branding } from "./branding";

function logDir(): string {
  const dir = path.join(app.getPath("userData"), "logs");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function appendStartupLog(line: string): void {
  try {
    appendFileSync(
      path.join(logDir(), "startup.log"),
      `[${new Date().toISOString()}] ${line}\n`,
      "utf-8"
    );
  } catch {
    // Best-effort only.
  }
}

function appendCrashLog(kind: string, detail: unknown): void {
  try {
    const msg =
      detail instanceof Error
        ? `${detail.message}\n${detail.stack ?? ""}`
        : String(detail);
    appendFileSync(
      path.join(logDir(), "crash.log"),
      `[${new Date().toISOString()}] ${kind}: ${msg}\n`,
      "utf-8"
    );
  } catch {
    // ignore
  }
}

export function showFatalStartupError(title: string, message: string): void {
  appendStartupLog(`FATAL ${title}: ${message}`);
  try {
    dialog.showMessageBoxSync({
      type: "error",
      title: branding.productName,
      message: title,
      detail: `${message}\n\nLog: ${path.join(app.getPath("userData"), "logs")}`,
      buttons: ["OK"],
    });
  } catch {
    console.error(title, message);
  }
}

/** Block unsupported platforms before windows / tray spin up. */
export function assertRuntimeSupported(): void {
  if (process.platform !== "win32") {
    showFatalStartupError(
      "Windows のみ対応しています",
      "Ninja2 は Windows 10 / 11（64-bit）専用です。"
    );
    app.exit(1);
  }
  if (process.arch !== "x64") {
    showFatalStartupError(
      "64-bit Windows が必要です",
      "この PC（ARM 等）向けのビルドはまだありません。\nx64 版 Windows をご利用ください。"
    );
    app.exit(1);
  }
}

export function installProcessCrashHandlers(): void {
  process.on("uncaughtException", (err) => {
    appendCrashLog("uncaughtException", err);
    if (app.isReady()) {
      showFatalStartupError(
        "予期しないエラー",
        `${err.message}\n\nアプリを再起動してください。`
      );
    }
    app.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    appendCrashLog("unhandledRejection", reason);
  });
}

/** Packaged build sanity — missing preload / html means a bad install. */
export function assertPackagedLayout(): void {
  if (!app.isPackaged) return;

  const root = path.join(path.dirname(app.getPath("exe")), "resources");
  const checks = [
    path.join(root, "app.asar"),
    path.join(root, "assets", "tray.ico"),
    path.join(app.getAppPath(), "dist", "companion.html"),
    path.join(app.getAppPath(), "dist", "launcher.html"),
    path.join(app.getAppPath(), "dist-electron", "preload.mjs"),
    path.join(app.getAppPath(), "dist-electron", "launcher-preload.mjs"),
  ];

  const missing = checks.filter((p) => !existsSync(p));
  if (missing.length === 0) return;

  appendStartupLog(`missing packaged files: ${missing.join("; ")}`);
  showFatalStartupError(
    "インストールが不完全です",
    "必要なファイルが見つかりません。\n\n・ZIP の場合は「解凍してから」Ninja2.exe を実行\n・再ダウンロード / 再インストール\n・ウイルス対策ソフトの隔離を確認"
  );
  app.exit(1);
}
