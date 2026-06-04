/** Bump when regenerating frame PNGs (cache bust in dev). */
export const FRAME_ASSET_REV = "20";

export function frameSrc(importedUrl: string): string {
  const sep = importedUrl.includes("?") ? "&" : "?";
  return `${importedUrl}${sep}rev=${FRAME_ASSET_REV}`;
}
