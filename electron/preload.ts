import { contextBridge, ipcRenderer } from "electron";
import type { ImportBatch } from "../src/types/domain";
import type { CoachContextRequest, CoachContextReadResult, CoachContextSetupResult, CoachContextWriteResult } from "../server/coachContext";
import type { CodexRunResult } from "../server/codexRunner";

export type DesktopStatus = {
  ok: boolean;
  watchDir: string;
  lastScanAt?: string;
  playerCount: number;
  sourceCount: number;
  squadPlayerCount?: number;
  targetPlayerCount?: number;
  allPlayerCount?: number;
  contextDir?: string;
  sources: string[];
  warnings: string[];
};

contextBridge.exposeInMainWorld("fmCoach", {
  chooseExportFolder: () => ipcRenderer.invoke("fmCoach:chooseExportFolder") as Promise<DesktopStatus>,
  createCoachContext: (request: CoachContextRequest) => ipcRenderer.invoke("fmCoach:createCoachContext", request) as Promise<CoachContextWriteResult>,
  getBatch: () => ipcRenderer.invoke("fmCoach:getBatch") as Promise<ImportBatch>,
  getTargets: () => ipcRenderer.invoke("fmCoach:getTargets") as Promise<ImportBatch>,
  getAllBatch: () => ipcRenderer.invoke("fmCoach:getAllBatch") as Promise<ImportBatch>,
  getCoachContextSetup: () => ipcRenderer.invoke("fmCoach:getCoachContextSetup") as Promise<CoachContextSetupResult>,
  getStatus: () => ipcRenderer.invoke("fmCoach:getStatus") as Promise<DesktopStatus>,
  readCoachResponse: () => ipcRenderer.invoke("fmCoach:readCoachResponse") as Promise<CoachContextReadResult>,
  rescan: () => ipcRenderer.invoke("fmCoach:rescan") as Promise<DesktopStatus>,
  runCodexHandoff: () => ipcRenderer.invoke("fmCoach:runCodexHandoff") as Promise<CodexRunResult>
});
