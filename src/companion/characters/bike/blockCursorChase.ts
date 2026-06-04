import { BLOCK_SPRITE_PX, NORMAL_SPRITE_PX } from "../../engine/timing";
import type { DisplaySize } from "../../displaySize";
import type { CompanionState } from "../../engine/types";
import { activeCharacter } from "../active";

export const BLOCK_CHASE_ACTION = "blockChase" as const;

export type BlockChaseDeps = {
  characterId: string;
  setState: (patch: CompanionState | ((s: CompanionState) => CompanionState)) => void;
  setSpriteSize?: (px: DisplaySize) => void;
  setIdle: (facing: "left" | "right") => void;
  isCancelled: () => boolean;
};

type ChaseSession = {
  cancelPollId: number | null;
  offFacing: () => void;
  resolveRun: (() => void) | null;
};

let activeSession: ChaseSession | null = null;

function teardownSession(disableChase: boolean): void {
  const session = activeSession;
  if (!session) return;
  activeSession = null;

  if (session.cancelPollId != null) {
    window.clearInterval(session.cancelPollId);
  }
  session.offFacing();
  if (disableChase) {
    void window.companion?.setBlockChase?.({ enabled: false });
  }
  session.resolveRun?.();
}

export async function runBlockCursorChase(deps: BlockChaseDeps): Promise<void> {
  teardownSession(true);

  await window.companion?.savePreBlockPosition?.();

  await window.companion?.setDisplaySize?.(BLOCK_SPRITE_PX);
  deps.setSpriteSize?.(BLOCK_SPRITE_PX);

  await window.companion?.setBlockChase?.({
    enabled: true,
    tireTracks: activeCharacter.blockChaseTireTracks ?? false,
  });

  deps.setState({
    id: deps.characterId,
    action: BLOCK_CHASE_ACTION,
    facing: "right",
  });

  const offFacing =
    window.companion?.onBlockChaseFacing?.((facing) => {
      if (deps.isCancelled()) return;
      deps.setState({
        id: deps.characterId,
        action: BLOCK_CHASE_ACTION,
        facing,
      });
    }) ?? (() => {});

  return new Promise<void>((resolve) => {
    const session: ChaseSession = {
      cancelPollId: null,
      offFacing,
      resolveRun: resolve,
    };
    activeSession = session;

    session.cancelPollId = window.setInterval(() => {
      if (!deps.isCancelled()) return;
      teardownSession(true);
    }, 64);
  });
}

export async function endBlockCursorChase(deps: BlockChaseDeps): Promise<void> {
  teardownSession(true);
  await window.companion?.setDisplaySize?.(NORMAL_SPRITE_PX);
  deps.setSpriteSize?.(NORMAL_SPRITE_PX);
  await window.companion?.restorePreBlockPosition?.(450);
  if (!deps.isCancelled()) {
    deps.setIdle("right");
  }
}
