export type TireTrackMarkPayload = {
  x: number;
  y: number;
  bornAt: number;
};
export type TireTracksFramePayload = {
  workArea: { x: number; y: number; width: number; height: number };
  /** Full state for fade refresh. */
  marks?: TireTrackMarkPayload[];
  /** New stamps only — merged into local buffer. */
  append?: TireTrackMarkPayload[];
  fullRedraw?: boolean;
};
