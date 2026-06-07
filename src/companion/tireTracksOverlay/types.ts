export type TireTrackMarkPayload = {
  x: number;
  y: number;
  angleDeg: number;
  bornAt: number;
};

export type TireTracksFramePayload = {
  workArea: { x: number; y: number; width: number; height: number };
  marks?: TireTrackMarkPayload[];
  append?: TireTrackMarkPayload[];
  fullRedraw?: boolean;
};
