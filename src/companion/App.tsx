import { useCallback, useEffect, useRef } from "react";
import { companionViewportSize, spriteRenderPx } from "./displaySize";
import { touchCompanionActivity } from "./engine/companionActivity";
import { useCompanionApp } from "./useDevAnimPreview";
import {
  KUNAI_FLY_EXTRA_PX_MULT,
  resolveStemUrl,
} from "./characters/ninja/actions";
import { ActionDebugPanel } from "./characters/ninja/debug/ActionDebugPanel";
import { FRAME_ASSET_REV } from "./characters/ninja/frames/frameAssetUrl";
import { frameTierResolveDebug } from "./characters/ninja/frames/tierCatalog";
import { NinjaSpriteRenderer } from "./characters/ninja/render/SpriteRenderer";
import { activeCharacter } from "./characters/active";
import "./companion.css";

export function App() {
  const {
    state,
    replaySeq,
    idleResetSeq,
    showActionDebug,
    onTransientEnd,
    spriteSize,
    blockMode,
  } = useCompanionApp();

  const viewportRef = useRef<HTMLDivElement>(null);
  const baseViewport = companionViewportSize(spriteSize);
  const renderW = spriteRenderPx(spriteSize);
  const kunaiExtraPx =
    state.action === "kunai"
      ? Math.round(renderW * KUNAI_FLY_EXTRA_PX_MULT)
      : 0;
  const viewport = {
    width: baseViewport.width + kunaiExtraPx,
    height: baseViewport.height,
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.focus();
    viewportRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const missing: string[] = [];
    for (const stem of activeCharacter.requiredStems) {
      const debug = frameTierResolveDebug(stem, renderW);
      console.info("[companion][asset]", {
        stem: debug.stem,
        resolvedPath: debug.resolvedPath,
        exists: debug.exists,
        fallbackUsed: debug.fallbackUsed,
      });
      if (!debug.exists) {
        missing.push(stem);
      }
    }

    const idleResolved = resolveStemUrl(
      { stem: activeCharacter.trayIconStem ?? "idle" },
      renderW
    );
    if (idleResolved) {
      console.info("[companion][asset] idle startup resolve OK", {
        character: activeCharacter.id,
        resolvedPath: idleResolved,
        rev: FRAME_ASSET_REV,
      });
    } else {
      console.warn("[companion][asset] idle startup resolve FAILED", {
        character: activeCharacter.id,
      });
      if (!missing.includes("idle")) missing.push("idle");
    }

    if (missing.length > 0) {
      console.warn("[companion][asset] missing stems", {
        character: activeCharacter.id,
        missing,
      });
    }
  }, [renderW]);

  const focusViewport = useCallback(() => {
    touchCompanionActivity();
    window.focus();
    viewportRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={viewportRef}
      className={
        import.meta.env.DEV
          ? "companion-viewport companion-viewport--dev"
          : "companion-viewport"
      }
      style={{ width: viewport.width, height: viewport.height }}
      data-sprite={spriteSize}
      tabIndex={import.meta.env.DEV ? 0 : undefined}
      onPointerDown={import.meta.env.DEV ? focusViewport : undefined}
    >
      {import.meta.env.DEV && (
        <span className="companion-size-hint" aria-hidden>
          {state.action}
          {blockMode ? " · BLOCK" : ""} · W walk · P pose · S smoke · Shift+S ·
          M mission · R run · L look · K kunai · B block · Alt+D debug · rev
          {" "}
          {FRAME_ASSET_REV} · {spriteSize}px / {renderW}px slot
        </span>
      )}

      <NinjaSpriteRenderer
        state={state}
        spriteSize={spriteSize}
        idleResetSeq={idleResetSeq}
        replaySeq={replaySeq}
        onTransientEnd={onTransientEnd}
      />

      {import.meta.env.DEV && showActionDebug && (
        <ActionDebugPanel spriteSize={spriteSize} />
      )}
    </div>
  );
}
