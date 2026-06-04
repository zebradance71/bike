import { contextBridge, ipcRenderer } from "electron";

export type TireTrackMarkPayload = {
  x: number;
  y: number;
  bornAt: number;
};

export type TireTracksFramePayload = {
  workArea: { x: number; y: number; width: number; height: number };
  marks?: TireTrackMarkPayload[];
  append?: TireTrackMarkPayload[];
  fullRedraw?: boolean;
};

const tireTracksAPI = {
  onFrame: (callback: (payload: TireTracksFramePayload) => void): (() => void) => {
    frameHandler = callback;
    if (pendingFrames.length > 0) {
      for (const payload of pendingFrames) {
        callback(payload);
      }
      pendingFrames.length = 0;
    }
    return () => {
      if (frameHandler === callback) frameHandler = null;
    };
  },
  onClear: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on("tire-tracks-clear", handler);
    return () => ipcRenderer.off("tire-tracks-clear", handler);
  },
};

let frameHandler: ((payload: TireTracksFramePayload) => void) | null = null;
const pendingFrames: TireTracksFramePayload[] = [];

ipcRenderer.on(
  "tire-tracks-frame",
  (_event: unknown, payload: TireTracksFramePayload) => {
    if (frameHandler) {
      frameHandler(payload);
      return;
    }
    pendingFrames.push(payload);
  }
);

contextBridge.exposeInMainWorld("tireTracks", tireTracksAPI);
