import type { ImportBatch } from "./domain";
import type { CoachContextReadResult, CoachContextRequest, CoachContextSetupResult, CoachContextWriteResult } from "../../server/coachContext";
import type { CodexRunResult } from "../../server/codexRunner";

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
      getCoachContextSetup: () => Promise<CoachContextSetupResult>;
      getStatus: () => Promise<DesktopStatus>;
      readCoachResponse: () => Promise<CoachContextReadResult>;
      rescan: () => Promise<DesktopStatus>;
      runCodexHandoff: () => Promise<CodexRunResult>;
    };
  }
}
