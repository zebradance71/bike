import type { ComponentType } from "react";

import type { CompanionState } from "../engine/types";
import type { DisplaySize } from "../displaySize";

/**
 * Asset reference by stem (resolved via the pack's frame tier catalog
 * at render time). Single-frame static body.
 */
export type AssetStemRef = { readonly stem: string };

/** Multi-frame animation that cycles forever at a fixed interval. */
export type AnimatedBodyRef = {
  readonly stems: readonly string[];
  readonly frameMs: number;
};

/**
 * Enter-once, then loop. Used by smoke (sit), shiftSmoke (meditation),
 * pose (peek), and look (glance).
 */
export type EnterLoopBodyRef = {
  readonly enter: readonly string[];
  readonly enterFrameMs: number;
  /** When set, enter duration is enterFrameMs ± this (ms). */
  readonly enterFrameMsJitter?: number;
  readonly loop: readonly string[];
  readonly loopFrameMs: number;
  readonly loopFrameMsJitter: number;
  /** true: play loop frames once in order then end. false: alternate forever. */
  readonly loopOnce?: boolean;
};

export type BodyRef = AssetStemRef | AnimatedBodyRef | EnterLoopBodyRef;

/**
 * One action's complete sprite spec. `body` is required; `fxBack`/`fxFront`
 * are optional overlays. `mirrorOnFacing` defaults to true.
 */
export type ActionDef = {
  readonly label: string;
  readonly devKey?: string;
  readonly body: BodyRef;
  readonly fxBack?: AssetStemRef | null;
  readonly fxFront?: AssetStemRef | null;
  readonly mirrorOnFacing?: boolean;
};

/**
 * Render-layer snapshot returned by a pack's `useLayers` hook each frame.
 * The base renderer (`CompanionSpriteRenderer`) consumes this shape.
 */
export type CompanionRenderLayers = {
  /** Action key currently being rendered (may differ from state.action while transient). */
  action: string;
  /** Body sprite URL (null while pack is mid-teleport / hidden). */
  body: string | null;
  /** Optional FX layer drawn *behind* the body (e.g. smoke puff). */
  fxBack: string | null;
  /** Optional FX layer drawn *in front* (e.g. kunai flying out). */
  fxFront: string | null;
  /** Whether to horizontally mirror the body for facing=left. */
  mirror: boolean;
  /** Free-form phase tag used for CSS hooks / debug. */
  phase: string;
  /** Current frame index within an animation cycle (for data-frame attr). */
  frameIndex: number;
};

export type UseLayersOptions = {
  /**
   * Bumped to force the pack to forget any in-progress transient and
   * re-seed from idle. Used by the autonomous behavior on action change.
   */
  idleResetSeq?: number;
  /** Bumped to replay a one-shot transient (e.g. dev key press). */
  replaySeq?: number;
  /** Called when a one-shot transient finishes (mission / smoke / kunai etc). */
  onTransientEnd?: () => void;
};

export type UseLayersHook = (
  state: CompanionState,
  renderWidthPx: number,
  options?: UseLayersOptions
) => CompanionRenderLayers;

export type RendererProps = {
  state: CompanionState;
  spriteSize: DisplaySize;
  idleResetSeq?: number;
  replaySeq?: number;
  onTransientEnd?: () => void;
};

/**
 * A complete character pack: identity, sprite catalog, action definitions,
 * and the state-machine hook that produces per-frame render layers.
 *
 * One pack per build. The active pack is selected at compile time by
 * `src/companion/characters/active.ts`. To ship a different character,
 * fork the repo, drop a new pack folder in `src/companion/characters/`,
 * and re-point `active.ts`. (The `init-new-pack` template script
 * automates this.)
 */
export type CharacterPack = {
  /** Unique id (used at runtime as `CompanionState.id`). */
  readonly id: string;
  /** Human-readable name shown in tray / launcher / window title. */
  readonly displayName: string;

  /** All stems that must resolve in the frame catalog at startup. */
  readonly requiredStems: readonly string[];

  /** Action catalog keyed by action id; `idle` is required. */
  readonly actions: Readonly<Record<string, ActionDef>>;

  /** State-machine hook driving render layers each frame. */
  readonly useLayers: UseLayersHook;

  /**
   * Optional pack-specific renderer. Most packs leave this undefined and
   * rely on the base `CompanionSpriteRenderer`. Override only when a
   * pack needs structurally different DOM (e.g. extra parallax layer).
   */
  readonly Renderer?: ComponentType<RendererProps>;

  /**
   * Tray icon source stem (resolved via frame catalog). Defaults to "idle"
   * when undefined; can be overridden when a pack wants a custom face.
   */
  readonly trayIconStem?: string;

  /** Optional dev-only debug overlay (e.g. action timeline panel). */
  readonly devDebugPanel?: ComponentType<{ spriteSize: DisplaySize }>;

  /**
   * Extra viewport width for wide FX (e.g. kunai flight). Return 0 when
   * the action does not need horizontal expansion.
   */
  readonly viewportWidthExtra?: (
    action: string,
    renderWidthPx: number
  ) => number;
};

/** Pack-defined action keys for the active build (narrowed at runtime). */
export type PackActionKey<P extends CharacterPack> = keyof P["actions"] & string;
