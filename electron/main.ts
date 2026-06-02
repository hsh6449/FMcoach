import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImportBatch } from "../src/types/domain";
import { scanExportFolder, type ExportFileInfo, type SourceBatch } from "../server/exportFolder";

type AppConfig = {
  watchDir?: string;
};

type DesktopState = {
  batch: ImportBatch;
  files: ExportFileInfo[];
  lastScanAt?: string;
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
    files: [],
    sources: [],
    warnings: [],
    watchDir: config.watchDir ?? defaultExportDir()
  };

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
      preload: join(app.getAppPath(), "dist-electron", "preload.cjs")
    }
  });

  void mainWindow.loadFile(join(app.getAppPath(), "dist", "index.html"));
}

function registerIpc() {
  ipcMain.handle("fmCoach:getStatus", () => statusPayload());
  ipcMain.handle("fmCoach:getBatch", () => state.batch);
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
    files: scan.files,
    lastScanAt: new Date().toISOString(),
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
    playerCount: state.batch.players.length,
    sourceCount: state.batch.sourceNames.length,
    sources: state.batch.sourceNames,
    warnings: [...state.warnings, ...state.batch.warnings],
    watchDir: state.watchDir
  };
}

function defaultExportDir(): string {
  return join(app.getPath("documents"), "Sports Interactive", "Football Manager 2024");
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
