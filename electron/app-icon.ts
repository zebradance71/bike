import { existsSync } from "fs";
import { nativeImage } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Native window / taskbar icon candidates (first existing wins). */
export function resolveAppIcon(): Electron.NativeImage | undefined {
  const candidates = [
    path.join(__dirname, "../build/icon.png"),
    path.join(__dirname, "../assets/tray.png"),
    path.join(__dirname, "../assets/tray.ico"),
    path.join(__dirname, "../src/companion/assets/frames/block-idle.png"),
    path.join(__dirname, "../../src/companion/assets/frames/block-idle.png"),
    path.join(__dirname, "../src/companion/assets/frames/idle.png"),
  ];

  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) return img;
  }
  return undefined;
}

export function appIconCandidates(): string[] {
  return [
    path.join(process.resourcesPath ?? "", "assets", "tray.ico"),
    path.join(process.resourcesPath ?? "", "assets", "tray.png"),
    path.join(__dirname, "../assets/tray.ico"),
    path.join(__dirname, "../assets/tray.png"),
    path.join(__dirname, "../../assets/tray.ico"),
    path.join(__dirname, "../../assets/tray.png"),
    path.join(__dirname, "../build/icon.png"),
    path.join(__dirname, "../src/companion/assets/frames/block-idle.png"),
    path.join(__dirname, "../../src/companion/assets/frames/block-idle.png"),
    path.join(__dirname, "../src/companion/assets/frames/idle.png"),
    path.join(__dirname, "../../src/companion/assets/frames/idle.png"),
  ];
}
