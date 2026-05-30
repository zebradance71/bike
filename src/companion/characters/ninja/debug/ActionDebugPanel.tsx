import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { DisplaySize } from "../../../displaySize";
import { spriteRenderPx } from "../../../displaySize";
import {
  describeAssetPath,
  getActionDef,
  isAnimatedBody,
  isEnterLoopBody,
  ACTION_KEYS,
  resolveBodyUrl,
  resolveFxBackUrl,
  resolveFxFrontUrl,
  type ActionKey,
} from "../actions";
import { SpriteBodySlot } from "../../../frames/SpriteBodySlot";
import "../render/renderer.css";
import "../../../frames/sprite-body-slot.css";
import "./action-debug.css";

function parsePx(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function ActionPreviewRow({
  action,
  renderWidthPx,
}: {
  action: ActionKey;
  renderWidthPx: number;
}) {
  const def = getActionDef(action);
  const bodyUrl = isEnterLoopBody(def.body)
    ? resolveBodyUrl(action, renderWidthPx, 0, { enterLoopPhase: "enter" })
    : resolveBodyUrl(action, renderWidthPx, 0);
  const fxBackUrl = resolveFxBackUrl(action, renderWidthPx);
  const fxFrontUrl = resolveFxFrontUrl(action, renderWidthPx);
  const previewRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({
    naturalWidth: 0,
    naturalHeight: 0,
    computedWidth: 0,
    computedHeight: 0,
    slotWidth: 0,
    slotHeight: 0,
  });

  const bodyPath = isAnimatedBody(def.body)
    ? def.body.stems.map((s) => `frames/${s}.png`).join(", ")
    : isEnterLoopBody(def.body)
      ? [...def.body.enter, ...def.body.loop]
          .map((s) => `frames/${s}.png`)
          .join(", ")
      : describeAssetPath(def.body, renderWidthPx);

  useEffect(() => {
    const root = previewRef.current;
    if (!root) return;

    const measure = () => {
      const img = root.querySelector<HTMLImageElement>(".companion-body-image");
      const slot = root.querySelector<HTMLElement>(".companion-body-slot");
      if (!img || !slot) return;
      const imgCs = getComputedStyle(img);
      const slotCs = getComputedStyle(slot);
      setMetrics({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        computedWidth: parsePx(imgCs.width),
        computedHeight: parsePx(imgCs.height),
        slotWidth: parsePx(slotCs.width),
        slotHeight: parsePx(slotCs.height),
      });
    };

    const img = root.querySelector<HTMLImageElement>(".companion-body-image");
    if (!img) return;
    if (img.complete) measure();
    else img.addEventListener("load", measure, { once: true });
  }, [bodyUrl, renderWidthPx]);

  return (
    <tr>
      <td>
        <code>{action}</code>
      </td>
      <td>{def.label}</td>
      <td>
        <div className="ninja-debug-path">{bodyPath}</div>
        {fxBackUrl && (
          <div className="ninja-debug-path">
            fxBack: {describeAssetPath(def.fxBack!, renderWidthPx)}
          </div>
        )}
        {fxFrontUrl && (
          <div className="ninja-debug-path">
            fxFront: {describeAssetPath(def.fxFront!, renderWidthPx)}
          </div>
        )}
      </td>
      <td>
        <div
          className="ninja-debug-preview"
          style={
            { "--sprite-render": `${renderWidthPx}px` } as CSSProperties
          }
        >
          <div ref={previewRef} className="ninja-debug-preview-inner">
            <SpriteBodySlot
              wrapped={false}
              src={bodyUrl ?? ""}
              renderWidthPx={renderWidthPx}
              phase={`debug-${action}`}
              imageKey={bodyUrl ?? ""}
            />
          </div>
        </div>
      </td>
      <td>
        {metrics.slotWidth > 0
          ? `${metrics.slotWidth}×${metrics.slotHeight}`
          : `${renderWidthPx}px`}
      </td>
      <td>
        {metrics.naturalWidth}×{metrics.naturalHeight}
      </td>
      <td>
        {metrics.computedWidth}×{metrics.computedHeight}
      </td>
    </tr>
  );
}

export function ActionDebugPanel({
  spriteSize,
}: {
  spriteSize: DisplaySize;
}) {
  const renderW = spriteRenderPx(spriteSize);

  return (
    <div className="ninja-action-debug" role="region" aria-label="Action debug">
      <div className="ninja-action-debug__title">Action assets (dev)</div>
      <table className="ninja-action-debug__table">
        <thead>
          <tr>
            <th>key</th>
            <th>label</th>
            <th>paths</th>
            <th>preview</th>
            <th>slot</th>
            <th>natural</th>
            <th>computed</th>
          </tr>
        </thead>
        <tbody>
          {ACTION_KEYS.map((action) => (
            <ActionPreviewRow
              key={action}
              action={action}
              renderWidthPx={renderW}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
