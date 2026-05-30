import type { CSSProperties } from "react";
import type { DisplaySize } from "../../../displaySize";
import { spriteRenderPx } from "../../../displaySize";
import type { CompanionState } from "../../../engine/types";
import { SpriteBodySlot } from "../../../frames/SpriteBodySlot";
import { useNinjaLayers } from "../useLayers";
import "../../../frames/sprite-body-slot.css";
import "../../../frames/presence-frames.css";
import "./renderer.css";

interface NinjaSpriteRendererProps {
  state: CompanionState;
  spriteSize: DisplaySize;
  idleResetSeq?: number;
  replaySeq?: number;
  onTransientEnd?: () => void;
}

function FxLayer({
  src,
  front,
}: {
  src: string;
  front?: boolean;
}) {
  return (
    <div
      className={`ninja-fx-layer${front ? " ninja-fx-layer--front" : ""}`}
      aria-hidden
    >
      <img className="ninja-fx-layer__img" src={src} alt="" draggable={false} />
    </div>
  );
}

export function NinjaSpriteRenderer({
  state,
  spriteSize,
  idleResetSeq = 0,
  replaySeq = 0,
  onTransientEnd,
}: NinjaSpriteRendererProps) {
  const renderW = spriteRenderPx(spriteSize);
  const layers = useNinjaLayers(state, renderW, {
    idleResetSeq,
    replaySeq,
    onTransientEnd,
  });

  return (
    <div className="ninja-stage" data-action={state.action}>
      <div
        className="ninja-sprite-root"
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
      {/* fxFront sits at stage level so it can span window-expansion area
          (used by kunai). For other actions, fx art is square and contains
          inside the normal viewport — visually identical. */}
      {layers.fxFront && (
        <div
          className="ninja-stage-fx-front"
          style={{ "--sprite-render": `${renderW}px` } as CSSProperties}
        >
          <FxLayer src={layers.fxFront} front />
        </div>
      )}
    </div>
  );
}
