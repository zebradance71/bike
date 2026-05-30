import type { CSSProperties } from "react";
import { useRef } from "react";
import { useSpriteSlotDevLog } from "./useSpriteSlotDevLog";
import "./sprite-body-slot.css";
import "./presence-frames.css";

/**
 * Character-agnostic sprite "slot": a square frame anchored at the bottom
 * that contains a single image-based body. Mirroring (left/right facing)
 * and per-frame remount via `imageKey` are handled here so packs only
 * need to supply the URL and current phase tag.
 *
 * The outer `companion-sprite-wrap` div is added when `wrapped=true`;
 * pack renderers can opt out (`wrapped=false`) to nest the slot inside
 * a custom wrapper (e.g. when overlaying smoke frames).
 */
export interface SpriteBodySlotProps {
  src: string;
  renderWidthPx: number;
  mirror?: boolean;
  phase: string;
  /** Outer `companion-sprite-wrap` (default true). False when nested. */
  wrapped?: boolean;
  wrapClassName?: string;
  wrapData?: Record<string, string>;
  imageKey?: string;
}

export function SpriteBodySlot({
  src,
  renderWidthPx,
  mirror = false,
  phase,
  wrapped = true,
  wrapClassName = "",
  wrapData,
  imageKey,
}: SpriteBodySlotProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);

  useSpriteSlotDevLog(imgRef, slotRef, phase, renderWidthPx);

  const body = (
    <div ref={slotRef} className="companion-body-slot">
      <div
        className="companion-frame-flip"
        data-facing={mirror ? "left" : "right"}
      >
        <img
          ref={imgRef}
          key={imageKey ?? src}
          className="companion-body-image"
          src={src}
          alt=""
          draggable={false}
        />
      </div>
    </div>
  );

  if (!wrapped) {
    return body;
  }

  return (
    <div
      className={`companion-sprite-wrap ${wrapClassName}`.trim()}
      style={{ "--sprite-render": `${renderWidthPx}px` } as CSSProperties}
      {...wrapData}
    >
      {body}
    </div>
  );
}
