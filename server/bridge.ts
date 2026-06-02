import { createReadStream, watch } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ImportBatch } from "../src/types/domain";
import { parseArgs, scanExportFolder, type ExportFileInfo } from "./exportFolder";

type BridgeState = {
  batch: ImportBatch;
  files: ExportFileInfo[];
  lastScanAt?: string;
  watchDir: string;
  warnings: string[];
};

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = parseArgs(process.argv.slice(2));
const port = Number(args.port ?? 8765);
const host = args.host ?? "127.0.0.1";
const watchDir = resolve(args.watch ?? join(rootDir, "samples"));
const distDir = resolve(rootDir, "dist");
const emptyBatch: ImportBatch = {
  importedAt: new Date().toISOString(),
  sourceNames: [],
  players: [],
  warnings: []
};

let state: BridgeState = {
  batch: emptyBatch,
  files: [],
  watchDir,
  warnings: []
};
let scanTimer: NodeJS.Timeout | undefined;

await scanExports();
startWatcher();

const server = createServer((request, response) => {
  void route(request, response);
});

server.listen(port, host, () => {
  console.log(`FM Coach bridge listening at http://${host}:${port}`);
  console.log(`Watching exports in ${watchDir}`);
});

async function route(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);

  if (url.pathname === "/api/status") {
    sendJson(response, {
      ok: true,
      watchDir: state.watchDir,
      lastScanAt: state.lastScanAt,
      playerCount: state.batch.players.length,
      sourceCount: state.batch.sourceNames.length,
      sources: state.batch.sourceNames,
      warnings: [...state.warnings, ...state.batch.warnings]
    });
    return;
  }

  if (url.pathname === "/api/batch") {
    sendJson(response, state.batch);
    return;
  }

  if (url.pathname === "/api/files") {
    sendJson(response, state.files);
    return;
  }

  if (url.pathname === "/api/rescan" && request.method === "POST") {
    await scanExports();
    sendJson(response, { ok: true, lastScanAt: state.lastScanAt, playerCount: state.batch.players.length });
    return;
  }

  await serveStatic(url.pathname, response);
}

async function scanExports() {
  const scan = await scanExportFolder(watchDir);

  state = {
    batch: scan.batch,
    files: scan.files,
    lastScanAt: new Date().toISOString(),
    watchDir,
    warnings: scan.warnings
  };
}

function startWatcher() {
  try {
    watch(watchDir, { recursive: true }, () => {
      debounceScan();
    }).on("error", (error) => {
      state = {
        ...state,
        warnings: [...state.warnings, `Folder watcher failed: ${String(error)}`]
      };
    });
  } catch (error) {
    state = {
      ...state,
      warnings: [...state.warnings, `Folder watcher failed: ${String(error)}`]
    };
  }
}

function debounceScan() {
  if (scanTimer) {
    clearTimeout(scanTimer);
  }

  scanTimer = setTimeout(() => {
    void scanExports();
  }, 350);
}

async function serveStatic(pathname: string, response: ServerResponse) {
  const safePath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = resolve(distDir, safePath === "/" ? "index.html" : `.${safePath}`);

  if (!filePath.startsWith(distDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const fileInfo = await stat(filePath).catch(() => undefined);
  const targetPath = fileInfo?.isFile() ? filePath : join(distDir, "index.html");
  const targetInfo = await stat(targetPath).catch(() => undefined);

  if (!targetInfo?.isFile()) {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Run `npm run build` before starting the bridge server.");
    return;
  }

  response.writeHead(200, { "Content-Type": contentType(targetPath) });
  createReadStream(targetPath).pipe(response);
}

function sendJson(response: ServerResponse, data: unknown) {
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data, null, 2));
}

function contentType(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}
