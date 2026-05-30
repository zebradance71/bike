/**
 * Bump when regenerating this pack's frame PNGs — Vite dev caches image
 * URLs; without a new `rev=` query the browser keeps showing the old
 * sprites after `npm run dev`. The rev is per-pack so different
 * characters can ship asset updates independently.
 */
export const FRAME_ASSET_REV = "97";

export function frameSrc(importedUrl: string): string {
  const sep = importedUrl.includes("?") ? "&" : "?";
  return `${importedUrl}${sep}rev=${FRAME_ASSET_REV}`;
}
