import { contextBridge, ipcRenderer } from "electron";
import type { ImportBatch } from "../src/types/domain";

export type DesktopStatus = {
  ok: boolean;
  watchDir: string;
  lastScanAt?: string;
  playerCount: number;
  sourceCount: number;
  squadPlayerCount?: number;
  targetPlayerCount?: number;
  allPlayerCount?: number;
  sources: string[];
  warnings: string[];
};

contextBridge.exposeInMainWorld("fmCoach", {
  chooseExportFolder: () => ipcRenderer.invoke("fmCoach:chooseExportFolder") as Promise<DesktopStatus>,
  getBatch: () => ipcRenderer.invoke("fmCoach:getBatch") as Promise<ImportBatch>,
  getTargets: () => ipcRenderer.invoke("fmCoach:getTargets") as Promise<ImportBatch>,
  getAllBatch: () => ipcRenderer.invoke("fmCoach:getAllBatch") as Promise<ImportBatch>,
  getStatus: () => ipcRenderer.invoke("fmCoach:getStatus") as Promise<DesktopStatus>,
  rescan: () => ipcRenderer.invoke("fmCoach:rescan") as Promise<DesktopStatus>
});
