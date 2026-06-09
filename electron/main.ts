import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { ImportBatch } from "../src/types/domain";
import { ensureCoachContextDir, listCoachRuns, readCoachResponse, writeCoachContext, type CoachContextRequest } from "../server/coachContext";
import { runCodexHandoff } from "../server/codexRunner";
import { buildExportDataVersion, scanExportFolder, type ExportFileInfo, type SourceBatch } from "../server/exportFolder";

type AppConfig = {
  watchDir?: string;
};

type DesktopState = {
  batch: ImportBatch;
  squadBatch: ImportBatch;
  targetBatch: ImportBatch;
  files: ExportFileInfo[];
  dataVersion?: string;
  lastScanAt?: string;
  latestFileAt?: string;
  sources: SourceBatch[];
  warnings: string[];
  watchDir: string;
};

const emptyBatch: ImportBatch = {
  importedAt: new Date().toISOString(),
  sourceNames: [],
  players: [],
  warnings: []
};

let mainWindow: BrowserWindow | undefined;
let watcher: FSWatcher | undefined;
let scanTimer: NodeJS.Timeout | undefined;
let state: DesktopState;

app.whenReady().then(async () => {
  const config = await loadConfig();
  state = {
    batch: emptyBatch,
    squadBatch: emptyBatch,
    targetBatch: emptyBatch,
    files: [],
    sources: [],
    warnings: [],
    watchDir: config.watchDir ?? defaultExportDir()
  };

  await ensureCoachContextDir(coachContextDir());
  await scanExports();
  startWatcher();
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  watcher?.close();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function createWindow() {
  const indexPath = rendererIndexPath();
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1060,
    minHeight: 720,
    title: "FM Coach",
    backgroundColor: "#151513",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath()
    }
  });

  void mainWindow.loadFile(indexPath).catch((error) => {
    console.error(`Failed to load FM Coach renderer from ${indexPath}:`, error);
    void mainWindow?.loadURL(fallbackErrorPage(indexPath, error));
  });
}

function registerIpc() {
  ipcMain.handle("fmCoach:getStatus", () => statusPayload());
  ipcMain.handle("fmCoach:getBatch", () => state.squadBatch);
  ipcMain.handle("fmCoach:getTargets", () => state.targetBatch);
  ipcMain.handle("fmCoach:getAllBatch", () => state.batch);
  ipcMain.handle("fmCoach:createCoachContext", async (_, request: CoachContextRequest) => writeCoachContext({
    allBatch: state.batch,
    contextDir: coachContextDir(),
    playbookPath: coachPlaybookPath(),
    request: { ...request, source: request.source ?? "desktop" },
    squadBatch: state.squadBatch,
    targetBatch: state.targetBatch
  }));
  ipcMain.handle("fmCoach:getCoachContextSetup", () => ensureCoachContextDir(coachContextDir()));
  ipcMain.handle("fmCoach:listCoachRuns", () => listCoachRuns(coachContextDir()));
  ipcMain.handle("fmCoach:readCoachResponse", () => readCoachResponse(coachContextDir()));
  ipcMain.handle("fmCoach:runCodexHandoff", () => runCodexHandoff({
    contextDir: coachContextDir(),
    playbookPath: coachPlaybookPath(),
    workspaceDir: coachContextDir()
  }));
  ipcMain.handle("fmCoach:rescan", async () => {
    await scanExports();
    return statusPayload();
  });
  ipcMain.handle("fmCoach:chooseExportFolder", async () => {
    const options: OpenDialogOptions = {
      title: "FM24 export folder",
      properties: ["openDirectory", "createDirectory"]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (!result.canceled && result.filePaths[0]) {
      state = { ...state, watchDir: result.filePaths[0] };
      await saveConfig({ watchDir: state.watchDir });
      await scanExports();
      startWatcher();
    }

    return statusPayload();
  });
}

async function scanExports() {
  const scan = await scanExportFolder(state.watchDir);
  state = {
    ...state,
    batch: scan.batch,
    squadBatch: scan.squadBatch,
    targetBatch: scan.targetBatch,
    files: scan.files,
    dataVersion: buildExportDataVersion(scan),
    lastScanAt: new Date().toISOString(),
    latestFileAt: scan.files[0]?.modifiedAt,
    sources: scan.sources,
    warnings: scan.warnings
  };
}

function startWatcher() {
  watcher?.close();

  if (!existsSync(state.watchDir)) {
    state = {
      ...state,
      warnings: [...state.warnings, `Export folder does not exist: ${state.watchDir}`]
    };
    return;
  }

  try {
    watcher = watch(state.watchDir, { recursive: true }, () => {
      if (scanTimer) {
        clearTimeout(scanTimer);
      }

      scanTimer = setTimeout(() => {
        void scanExports();
      }, 350);
    });
  } catch (error) {
    state = {
      ...state,
      warnings: [...state.warnings, `Folder watcher failed: ${String(error)}`]
    };
  }
}

function statusPayload() {
  return {
    ok: true,
    lastScanAt: state.lastScanAt,
    playerCount: state.squadBatch.players.length,
    sourceCount: state.squadBatch.sourceNames.length,
    sources: state.squadBatch.sourceNames,
    squadPlayerCount: state.squadBatch.players.length,
    targetPlayerCount: state.targetBatch.players.length,
    allPlayerCount: state.batch.players.length,
    contextDir: coachContextDir(),
    dataVersion: state.dataVersion,
    latestFileAt: state.latestFileAt,
    warnings: [...state.warnings, ...state.squadBatch.warnings],
    watchDir: state.watchDir
  };
}

function defaultExportDir(): string {
  return join(app.getPath("documents"), "Sports Interactive", "Football Manager 2024");
}

function coachContextDir(): string {
  return join(app.getPath("documents"), "FM Coach", "coach-context");
}

function coachPlaybookPath(): string {
  const resourcesPath = join(process.resourcesPath, "docs", "AI_COACH_PLAYBOOK.md");
  return firstExistingPath([
    resourcesPath,
    join(appRoot(), "docs", "AI_COACH_PLAYBOOK.md"),
    join(process.cwd(), "docs", "AI_COACH_PLAYBOOK.md")
  ]);
}

async function loadConfig(): Promise<AppConfig> {
  const path = configPath();
  const raw = await readFile(path, "utf8").catch(() => "");
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as AppConfig;
  } catch {
    return {};
  }
}

async function saveConfig(config: AppConfig) {
  const path = configPath();
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2), "utf8");
}

function configPath(): string {
  return join(app.getPath("userData"), "config.json");
}

function appRoot(): string {
  return firstExistingPath([
    resolve(__dirname, ".."),
    app.getAppPath(),
    process.cwd()
  ], (candidate) => existsSync(join(candidate, "dist", "index.html")));
}

function rendererIndexPath(): string {
  return join(appRoot(), "dist", "index.html");
}

function preloadPath(): string {
  return join(appRoot(), "dist-electron", "preload.cjs");
}

function firstExistingPath(paths: string[], predicate: (path: string) => boolean = existsSync): string {
  return paths.find((path) => predicate(path)) ?? paths[0];
}

function fallbackErrorPage(indexPath: string, error: unknown): string {
  const html = [
    "<!doctype html>",
    "<html>",
    "<head>",
    "<meta charset=\"utf-8\" />",
    "<title>FM Coach load error</title>",
    "<style>",
    "body{margin:0;min-height:100vh;display:grid;place-items:center;background:#151513;color:#f7fbf6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}",
    "main{width:min(720px,calc(100vw - 48px));padding:24px;border:1px solid #33443a;border-radius:8px;background:#1f2a23}",
    "h1{margin:0 0 10px;font-size:22px}p{line-height:1.5;color:#c7d4cb}code{display:block;white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;background:#111914;border-radius:8px;color:#dcebe1}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>FM Coach could not load the app UI</h1>",
    "<p>Run <code>npm run build</code> and start the desktop app again. If this keeps happening, check the renderer path below.</p>",
    `<code>${escapeHtml(indexPath)}\n\n${escapeHtml(String(error))}</code>`,
    "</main>",
    "</body>",
    "</html>"
  ].join("");

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
