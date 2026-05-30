import { contextBridge, ipcRenderer } from "electron";

/** Minimal IPC surface for the launcher window only. */
contextBridge.exposeInMainWorld("companion", {
  startMission: () => ipcRenderer.send("start-mission"),
});
