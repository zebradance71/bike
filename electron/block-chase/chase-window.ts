import { screen } from "electron";
import type { BrowserWindow } from "electron";

export type ChaseWindowState = {
  w: number;
  h: number;
  x: number;
  y: number;
  posReady: boolean;
};

export function createChaseWindowState(): ChaseWindowState {
  return { w: 0, h: 0, x: 0, y: 0, posReady: false };
}

export function syncCompanionSize(
  companion: BrowserWindow,
  win: ChaseWindowState
): void {
  if (win.w <= 0 || win.h <= 0) {
    [win.w, win.h] = companion.getSize();
  }
}

export function syncCompanionPosition(
  companion: BrowserWindow,
  win: ChaseWindowState
): void {
  if (!win.posReady) {
    [win.x, win.y] = companion.getPosition();
    win.posReady = true;
  }
}

export function readChaseAnchor(
  offsetX: number,
  offsetY: number
): {
  cursorX: number;
  cursorY: number;
  anchorX: number;
  anchorY: number;
} {
  const cursor = screen.getCursorScreenPoint();
  return {
    cursorX: cursor.x,
    cursorY: cursor.y,
    anchorX: cursor.x + offsetX,
    anchorY: cursor.y + offsetY,
  };
}

export function applyCompanionBounds(
  companion: BrowserWindow,
  win: ChaseWindowState,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  companion.setBounds({ x, y, width: w, height: h });
  const bounds = companion.getBounds();
  win.x = bounds.x;
  win.y = bounds.y;
  win.posReady = true;
}

export function syncCompanionBounds(
  companion: BrowserWindow,
  win: ChaseWindowState
): void {
  [win.w, win.h] = companion.getSize();
  const bounds = companion.getBounds();
  win.x = bounds.x;
  win.y = bounds.y;
  win.posReady = true;
}
