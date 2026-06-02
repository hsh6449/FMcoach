import type { ImportBatch } from "./domain";
import type { CoachContextReadResult, CoachContextRequest, CoachContextWriteResult } from "../../server/coachContext";

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

declare global {
  interface Window {
    fmCoach?: {
      chooseExportFolder: () => Promise<DesktopStatus>;
      createCoachContext: (request: CoachContextRequest) => Promise<CoachContextWriteResult>;
      getBatch: () => Promise<ImportBatch>;
      getTargets: () => Promise<ImportBatch>;
      getAllBatch: () => Promise<ImportBatch>;
      getStatus: () => Promise<DesktopStatus>;
      readCoachResponse: () => Promise<CoachContextReadResult>;
      rescan: () => Promise<DesktopStatus>;
    };
  }
}
