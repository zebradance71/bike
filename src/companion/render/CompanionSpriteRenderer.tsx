import type { CSSProperties } from "react";
import type { DisplaySize } from "../displaySize";
import { spriteRenderPx } from "../displaySize";
import { activeCharacter } from "../characters/active";
import type { CompanionState } from "../engine/types";
import { SpriteBodySlot } from "../frames/SpriteBodySlot";
import "../frames/sprite-body-slot.css";
import "../frames/presence-frames.css";
import "./renderer.css";

interface CompanionSpriteRendererProps {
  state: CompanionState;
  spriteSize: DisplaySize;
  idleResetSeq?: number;
  replaySeq?: number;
  onTransientEnd?: () => void;
}

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
}: CompanionSpriteRendererProps) {
  const renderW = spriteRenderPx(spriteSize);
  const layers = activeCharacter.useLayers(state, renderW, {
    idleResetSeq,
    replaySeq,
    onTransientEnd,
  });

  return (
    <div className="companion-stage" data-action={state.action}>
      <div
        className="companion-sprite-root"
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
