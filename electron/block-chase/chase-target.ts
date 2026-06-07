import {
  clampWheelToWorkArea,
  rearWheelScreenFromWindow,
  windowPositionFromWheelScreen,
} from "../block-chase-tire-tracks";
import type { ChaseClampArea } from "./clamp-area";
import { clampWindowToWorkArea, resolveFacing } from "./motion";

export type Facing = "left" | "right";

export function facingLeft(facing: Facing): boolean {
  return facing === "left";
}

function windowPosKeepingWheel(
  winX: number,
  winY: number,
  spritePx: number,
  fromFacing: Facing,
  toFacing: Facing
): { x: number; y: number } {
  const wheel = rearWheelScreenFromWindow(
    winX,
    winY,
    spritePx,
    facingLeft(fromFacing)
  );
  return windowPositionFromWheelScreen(
    wheel.x,
    wheel.y,
    spritePx,
    facingLeft(toFacing)
  );
}

export function computeChaseWindowTarget(input: {
  clampArea: ChaseClampArea;
  facing: Facing;
  anchorX: number;
  anchorY: number;
  winX: number;
  winY: number;
  winW: number;
  winH: number;
  spritePx: number;
  velX: number;
}): {
  x: number;
  y: number;
  wheelX: number;
  wheelY: number;
  facing: Facing;
} {
  const {
    clampArea,
    facing: initialFacing,
    anchorX,
    anchorY,
    winX,
    winY,
    winW,
    winH,
    spritePx,
    velX,
  } = input;

  const workArea = clampArea.resolve(
    anchorX,
    anchorY,
    winX,
    winY,
    spritePx,
    facingLeft(initialFacing)
  );
  const currentWheel = rearWheelScreenFromWindow(
    winX,
    winY,
    spritePx,
    facingLeft(initialFacing)
  );

  const nextFacing = resolveFacing(
    anchorX,
    currentWheel.x,
    initialFacing,
    velX
  );
  let facing = nextFacing;
  let nx: number;
  let ny: number;

  if (nextFacing !== initialFacing) {
    const flipPos = windowPosKeepingWheel(
      winX,
      winY,
      spritePx,
      initialFacing,
      nextFacing
    );
    ({ x: nx, y: ny } = clampWindowToWorkArea(
      flipPos.x,
      flipPos.y,
      workArea,
      winW,
      winH
    ));
  } else {
    const wheelAnchor = clampWheelToWorkArea(
      anchorX,
      anchorY,
      workArea,
      spritePx,
      facingLeft(facing)
    );
    const target = windowPositionFromWheelScreen(
      wheelAnchor.x,
      wheelAnchor.y,
      spritePx,
      facingLeft(facing)
    );
    ({ x: nx, y: ny } = clampWindowToWorkArea(
      target.x,
      target.y,
      workArea,
      winW,
      winH
    ));
  }

  const wheel = rearWheelScreenFromWindow(
    nx,
    ny,
    spritePx,
    facingLeft(facing)
  );
  return { x: nx, y: ny, wheelX: wheel.x, wheelY: wheel.y, facing };
}
