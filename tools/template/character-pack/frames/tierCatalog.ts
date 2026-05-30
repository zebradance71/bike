import { frameSrc } from "./frameAssetUrl";

export type DisplayTierHeight = 53 | 70 | 106;

const tierModules = import.meta.glob<string>(
  "../../../assets/frames/*-h*.png",
  { eager: true, import: "default" }
);

const defaultModules = import.meta.glob<string>(
  "../../../assets/frames/*.png",
  { eager: true, import: "default" }
);

const TIER_RE = /\/([^/]+)-h(53|70|106)\.png$/;
const SKIP_STEM = /-(raw|pre-polish)$|-h\d+$/;

function tierForRenderPx(renderWidthPx: number): DisplayTierHeight {
  if (renderWidthPx <= 62) return 53;
  if (renderWidthPx <= 88) return 70;
  return 106;
}

function buildCatalog(): Map<string, Partial<Record<DisplayTierHeight, string>>> {
  const cat = new Map<string, Partial<Record<DisplayTierHeight, string>>>();
  for (const [path, url] of Object.entries(tierModules)) {
    const m = path.match(TIER_RE);
    if (!m) continue;
    const stem = m[1]!;
    const h = Number(m[2]) as DisplayTierHeight;
    const entry = cat.get(stem) ?? {};
    entry[h] = frameSrc(url);
    cat.set(stem, entry);
  }
  return cat;
}

const CATALOG = buildCatalog();

function buildDefaultCatalog(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [path, url] of Object.entries(defaultModules)) {
    const m = path.match(/\/([^/]+)\.png$/);
    if (!m) continue;
    const stem = m[1]!;
    if (SKIP_STEM.test(stem)) continue;
    out.set(stem, frameSrc(url));
  }
  return out;
}

const DEFAULT_CATALOG = buildDefaultCatalog();

function resolveFrameUrl(stem: string, renderWidthPx: number): string | null {
  const tier = tierForRenderPx(renderWidthPx);
  const entry = CATALOG.get(stem);
  const url = entry?.[tier] ?? entry?.[106] ?? entry?.[70] ?? entry?.[53];
  if (url) return url;
  return DEFAULT_CATALOG.get(stem) ?? null;
}

export function frameTierSrc(stem: string, renderWidthPx: number): string | null {
  const url = resolveFrameUrl(stem, renderWidthPx);
  if (url) return url;
  console.warn("[companion][asset] missing", stem, { fallbackUsed: true });
  return resolveFrameUrl("idle", renderWidthPx);
}

export function frameTierSrcOptional(
  stem: string,
  renderWidthPx: number
): string | null {
  return resolveFrameUrl(stem, renderWidthPx);
}
