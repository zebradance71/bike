import { useRef, type CSSProperties } from "react";
import type { DisplaySize } from "../displaySize";
import { spriteRenderPx } from "../displaySize";
import { activeCharacter } from "../characters/active";
import type { IdleDevBeat, RendererProps } from "../characters/types";
import { useCompanionDrag } from "../useCompanionDrag";
import { SpriteBodySlot } from "../frames/SpriteBodySlot";
import "../frames/sprite-body-slot.css";
import "../frames/presence-frames.css";
import "./renderer.css";

type CompanionSpriteRendererProps = RendererProps;

function FxLayer({ src, front }: { src: string; front?: boolean }) {
  return (
    <div
      className={`companion-fx-layer${front ? " companion-fx-layer--front" : ""}`}
      aria-hidden
    >
      <img className="companion-fx-layer__img" src={src} alt="" draggable={false} />
    </div>
  );
}

export function CompanionSpriteRenderer({
  state,
  spriteSize,
  idleResetSeq = 0,
  replaySeq = 0,
  onTransientEnd,
  idleDevBeat,
  idleDevBeatSeq = 0,
  draggable = false,
}: CompanionSpriteRendererProps) {
  const spriteRootRef = useRef<HTMLDivElement>(null);
  const renderW = spriteRenderPx(spriteSize);
  const anchorBl = activeCharacter.spriteAnchorBottomLeft === true;
  const canDrag = draggable && anchorBl;

  useCompanionDrag(spriteRootRef, canDrag);

  const layers = activeCharacter.useLayers(state, renderW, {
    idleResetSeq,
    replaySeq,
    onTransientEnd,
    idleDevBeat,
    idleDevBeatSeq,
  });

  const rootClass = [
    "companion-sprite-root",
    anchorBl ? "companion-sprite-root--anchor-bl" : "",
    canDrag ? "companion-sprite-root--draggable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="companion-stage" data-action={state.action}>
      <div
        ref={spriteRootRef}
        className={rootClass}
        style={{ "--sprite-render": `${renderW}px` } as CSSProperties}
        data-action={state.action}
        data-frame={layers.frameIndex + 1}
      >
        {layers.fxBack && <FxLayer src={layers.fxBack} />}
        {layers.body && (
          <SpriteBodySlot
            wrapped={false}
            src={layers.body}
            renderWidthPx={renderW}
            mirror={layers.mirror}
            phase={layers.phase}
            imageKey={`${layers.action}-${layers.body}`}
          />
        )}
      </div>
      {layers.fxFront && (
        <div
          className="companion-stage-fx-front"
          style={{ "--sprite-render": `${renderW}px` } as CSSProperties}
        >
          <FxLayer src={layers.fxFront} front />
        </div>
      )}
    </div>
  );
}
