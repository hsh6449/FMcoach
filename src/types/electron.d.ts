import type { ImportBatch } from "./domain";

export type DesktopStatus = {
  ok: boolean;
  watchDir: string;
  lastScanAt?: string;
  playerCount: number;
  sourceCount: number;
  sources: string[];
  warnings: string[];
};

declare global {
  interface Window {
    fmCoach?: {
      chooseExportFolder: () => Promise<DesktopStatus>;
      getBatch: () => Promise<ImportBatch>;
      getStatus: () => Promise<DesktopStatus>;
      rescan: () => Promise<DesktopStatus>;
    };
  }
}
