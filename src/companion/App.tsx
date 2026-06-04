import { useCallback, useEffect, useRef, type ComponentType } from "react";
import { companionViewportSize, spriteRenderPx } from "./displaySize";
import { touchCompanionActivity } from "./engine/companionActivity";
import { useCompanionApp } from "./useDevAnimPreview";
import {
  activeCharacter,
  FRAME_ASSET_REV,
  frameTierResolveDebug,
  resolvePackStemUrl,
} from "./characters/active";
import { CompanionSpriteRenderer } from "./render/CompanionSpriteRenderer";
import type { RendererProps } from "./characters/types";
import "./companion.css";

const SpriteRenderer: ComponentType<RendererProps> =
  activeCharacter.Renderer ?? CompanionSpriteRenderer;

export function App() {
  const {
    state,
    replaySeq,
    idleResetSeq,
    idleDevBeat,
    idleDevBeatSeq,
    showActionDebug,
    onTransientEnd,
    spriteSize,
    blockMode,
  } = useCompanionApp();

  const viewportRef = useRef<HTMLDivElement>(null);
  const baseViewport = companionViewportSize(spriteSize);
  const renderW = spriteRenderPx(spriteSize);
  const widthExtra =
    activeCharacter.viewportWidthExtra?.(state.action, renderW) ?? 0;
  const viewport = {
    width: baseViewport.width + widthExtra,
    height: baseViewport.height,
  };

  const DebugPanel = activeCharacter.devDebugPanel;

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

    const idleResolved = resolvePackStemUrl(
      activeCharacter.trayIconStem ?? "idle",
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

  const canDrag =
    activeCharacter.spriteAnchorBottomLeft === true &&
    state.action === "idle" &&
    !blockMode;

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
          {blockMode ? " · BLOCK" : ""} · {activeCharacter.displayName}
          {activeCharacter.id === "bike"
            ? " · V vibrate · E exhaust · B block chase"
            : ""}{" "}
          · Alt+D
          debug · rev {FRAME_ASSET_REV} · {spriteSize}px / {renderW}px slot
        </span>
      )}

      <SpriteRenderer
        state={state}
        spriteSize={spriteSize}
        idleResetSeq={idleResetSeq}
        replaySeq={replaySeq}
        onTransientEnd={onTransientEnd}
        idleDevBeat={idleDevBeat}
        idleDevBeatSeq={idleDevBeatSeq}
        draggable={canDrag}
      />

      {import.meta.env.DEV && showActionDebug && DebugPanel && (
        <DebugPanel spriteSize={spriteSize} />
      )}
    </div>
  );
}
