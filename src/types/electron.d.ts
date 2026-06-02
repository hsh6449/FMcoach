import type { ImportBatch } from "./domain";

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

declare global {
  interface Window {
    fmCoach?: {
      chooseExportFolder: () => Promise<DesktopStatus>;
      getBatch: () => Promise<ImportBatch>;
      getTargets: () => Promise<ImportBatch>;
      getAllBatch: () => Promise<ImportBatch>;
      getStatus: () => Promise<DesktopStatus>;
      rescan: () => Promise<DesktopStatus>;
    };
  }
}
