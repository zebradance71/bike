import { rearWheelScreenFromWindow } from "../block-chase-tire-tracks";
import {
  computeVirtualWorkArea,
  createChaseWorkAreaResolver,
  type ChaseWorkAreaResolver,
} from "../tire-tracks-windows";
import { CHASE_EDGE_UNION_MARGIN_PX } from "./constants";
import {
  anchorNearWorkAreaEdge,
  displayIdForAnchor,
  type WorkArea,
} from "./display";

export type ChaseClampArea = {
  readonly chaseWorkArea: ChaseWorkAreaResolver;
  crossDisplayChase: boolean;
  reset(): void;
  invalidateUnionCache(): void;
  chaseDisplaysDiffer(
    anchorX: number,
    anchorY: number,
    winX: number,
    winY: number,
    spritePx: number,
    facingLeft: boolean
  ): boolean;
  resolve(
    anchorX: number,
    anchorY: number,
    winX: number,
    winY: number,
    spritePx: number,
    facingLeft: boolean
  ): WorkArea;
};

export function createChaseClampArea(): ChaseClampArea {
  const chaseWorkArea = createChaseWorkAreaResolver();
  let crossDisplayChase = false;
  let cachedUnionWorkArea: WorkArea | null = null;

  function unionWorkArea(): WorkArea {
    if (!cachedUnionWorkArea) {
      cachedUnionWorkArea = computeVirtualWorkArea();
    }
    return cachedUnionWorkArea;
  }

  function chaseDisplaysDiffer(
    anchorX: number,
    anchorY: number,
    winX: number,
    winY: number,
    spritePx: number,
    facingLeft: boolean
  ): boolean {
    const anchorDisp = displayIdForAnchor(anchorX, anchorY);
    const wheel = rearWheelScreenFromWindow(winX, winY, spritePx, facingLeft);
    return anchorDisp !== displayIdForAnchor(wheel.x, wheel.y);
  }

  function shouldUseUnion(
    anchorX: number,
    anchorY: number,
    winX: number,
    winY: number,
    spritePx: number,
    facingLeft: boolean
  ): boolean {
    return (
      chaseDisplaysDiffer(anchorX, anchorY, winX, winY, spritePx, facingLeft) ||
      crossDisplayChase ||
      anchorNearWorkAreaEdge(anchorX, anchorY, CHASE_EDGE_UNION_MARGIN_PX)
    );
  }

  return {
    chaseWorkArea,
    get crossDisplayChase() {
      return crossDisplayChase;
    },
    set crossDisplayChase(value: boolean) {
      crossDisplayChase = value;
    },
    reset() {
      chaseWorkArea.reset();
      crossDisplayChase = false;
      cachedUnionWorkArea = null;
    },
    invalidateUnionCache() {
      cachedUnionWorkArea = null;
    },
    chaseDisplaysDiffer,
    resolve(anchorX, anchorY, winX, winY, spritePx, facingLeft) {
      if (shouldUseUnion(anchorX, anchorY, winX, winY, spritePx, facingLeft)) {
        return unionWorkArea();
      }
      return chaseWorkArea.resolve(anchorX, anchorY);
    },
  };
}
