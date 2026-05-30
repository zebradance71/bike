import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent, WebContents } from "electron";

export type IpcGuardContext = {
  isDev: boolean;
  getCompanion: () => BrowserWindow | null;
  getLauncher: () => BrowserWindow | null;
};

function trustedDevOrigin(url: string): boolean {
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

export function isTrustedRendererUrl(url: string, isDev: boolean): boolean {
  if (isDev) return trustedDevOrigin(url);
  return url.startsWith("file://");
}

function senderWebContents(
  event: IpcMainEvent | IpcMainInvokeEvent
): WebContents | null {
  return event.sender;
}

export function isTrustedSender(
  ctx: IpcGuardContext,
  event: IpcMainEvent | IpcMainInvokeEvent
): boolean {
  const sender = senderWebContents(event);
  if (!sender || sender.isDestroyed()) return false;
  return isTrustedRendererUrl(sender.getURL(), ctx.isDev);
}

export function isCompanionSender(
  ctx: IpcGuardContext,
  event: IpcMainEvent | IpcMainInvokeEvent
): boolean {
  if (!isTrustedSender(ctx, event)) return false;
  const companion = ctx.getCompanion();
  if (!companion || companion.isDestroyed()) return false;
  return event.sender.id === companion.webContents.id;
}

export function isLauncherSender(
  ctx: IpcGuardContext,
  event: IpcMainEvent | IpcMainInvokeEvent
): boolean {
  if (!isTrustedSender(ctx, event)) return false;
  const launcher = ctx.getLauncher();
  if (!launcher || launcher.isDestroyed()) return false;
  return event.sender.id === launcher.webContents.id;
}
