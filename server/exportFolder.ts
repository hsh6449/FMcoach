import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import type { ImportBatch } from "../src/types/domain";
import { parseExportBatch, parseExportText, SUPPORTED_EXPORT_EXTENSIONS } from "../src/parsers/fmExport";

export type ExportFileInfo = {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  kind: ExportKind;
};

export type ExportKind = "squad" | "targets" | "stats" | "unknown";

export type SourceBatch = {
  name: string;
  kind: ExportKind;
  batch: ImportBatch;
};

export type ExportFolderScan = {
  batch: ImportBatch;
  files: ExportFileInfo[];
  sources: SourceBatch[];
  warnings: string[];
};

export async function scanExportFolder(watchDir: string): Promise<ExportFolderScan> {
  const warnings: string[] = [];
  const files = await listExportFiles(watchDir).catch((error: unknown) => {
    warnings.push(`Export folder scan failed: ${String(error)}`);
    return [];
  });
  const sources = [];
  const fileDetails = [];
  const sourceBatches: SourceBatch[] = [];

  for (const filePath of files) {
    const name = relative(watchDir, filePath);
    const kind = classifyExport(name);
    const info = await stat(filePath);
    const text = await readFile(filePath, "utf8");
    const batch = parseExportText(name, text);

    sources.push({ name, text });
    sourceBatches.push({ name, kind, batch });
    fileDetails.push({
      name,
      path: filePath,
      size: info.size,
      modifiedAt: info.mtime.toISOString(),
      kind
    });
  }

  return {
    batch: parseExportBatch(sources),
    files: fileDetails.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)),
    sources: sourceBatches,
    warnings
  };
}

export function parseArgs(values: string[]): Record<string, string | undefined> {
  const parsed: Record<string, string | undefined> = {};

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      continue;
    }

    const key = value.slice(2);
    const next = values[index + 1];
    parsed[key] = next && !next.startsWith("--") ? next : "true";
    if (next && !next.startsWith("--")) {
      index += 1;
    }
  }

  return parsed;
}

async function listExportFiles(folder: string): Promise<string[]> {
  const items = await readdir(folder, { withFileTypes: true });
  const results: string[] = [];

  for (const item of items) {
    const fullPath = join(folder, item.name);
    if (item.isDirectory()) {
      results.push(...(await listExportFiles(fullPath)));
      continue;
    }

    if (item.isFile() && isSupportedExport(fullPath)) {
      results.push(fullPath);
    }
  }

  return results;
}

function isSupportedExport(filePath: string): boolean {
  const extension = extname(filePath).toLowerCase();
  return SUPPORTED_EXPORT_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXPORT_EXTENSIONS)[number]);
}

function classifyExport(name: string): ExportKind {
  const normalized = name.toLowerCase();

  if (["target", "targets", "shortlist", "scout", "search", "candidate", "recruit", "transfer"].some((token) => normalized.includes(token))) {
    return "targets";
  }

  if (["squad", "team", "first-team", "roster", "선수단", "스쿼드"].some((token) => normalized.includes(token))) {
    return "squad";
  }

  if (["stats", "record", "fixture", "match", "history", "기록"].some((token) => normalized.includes(token))) {
    return "stats";
  }

  return "unknown";
}
