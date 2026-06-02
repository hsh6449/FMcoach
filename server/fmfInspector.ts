import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { gunzipSync, inflateRawSync, inflateSync } from "node:zlib";
import { parseArgs } from "./exportFolder";

type FmfGuess = "view" | "tactic" | "shortlist" | "editor-data" | "skin-or-resource" | "unknown";

type FmfFileReport = {
  path: string;
  name: string;
  size: number;
  sha256: string;
  magicHex: string;
  magicAscii: string;
  container: string;
  guess: FmfGuess;
  decompression: Array<{ method: string; ok: boolean; size?: number; error?: string }>;
  strings: string[];
  hints: string[];
};

type FmfInspection = {
  input: string;
  inspectedAt: string;
  files: FmfFileReport[];
  warnings: string[];
};

const args = parseArgs(process.argv.slice(2));
const inputPath = process.argv.slice(2).find((item) => !item.startsWith("--"));
const asJson = args.json === "true";
const minStringLength = Number(args.minStringLength ?? 4);
const maxStrings = Number(args.maxStrings ?? 80);

if (!inputPath) {
  console.log("Usage: npm run fmf:inspect -- /path/to/file-or-folder.fmf [--json]");
  process.exit(1);
}

const inspection = await inspectFmfPath(resolve(inputPath), { minStringLength, maxStrings });

if (asJson) {
  console.log(JSON.stringify(inspection, null, 2));
} else {
  printInspection(inspection);
}

export async function inspectFmfPath(
  input: string,
  options: { minStringLength?: number; maxStrings?: number } = {}
): Promise<FmfInspection> {
  const warnings: string[] = [];
  const files = await listFmfCandidates(input).catch((error: unknown) => {
    warnings.push(`FMF scan failed: ${String(error)}`);
    return [];
  });

  return {
    input,
    inspectedAt: new Date().toISOString(),
    files: await Promise.all(files.map((file) => inspectFmfFile(file, options))),
    warnings
  };
}

async function inspectFmfFile(
  filePath: string,
  options: { minStringLength?: number; maxStrings?: number }
): Promise<FmfFileReport> {
  const buffer = await readFile(filePath);
  const decompressedBuffers = tryDecompress(buffer);
  const bestTextBuffer = decompressedBuffers.find((item) => item.ok && item.buffer && item.buffer.length > 32)?.buffer ?? buffer;
  const strings = extractStrings(bestTextBuffer, options.minStringLength ?? 4, options.maxStrings ?? 80);
  const hints = buildHints(filePath, strings, buffer, decompressedBuffers);

  return {
    path: filePath,
    name: basename(filePath),
    size: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    magicHex: buffer.subarray(0, 16).toString("hex").match(/.{1,2}/g)?.join(" ") ?? "",
    magicAscii: asciiPreview(buffer.subarray(0, 16)),
    container: detectContainer(buffer),
    guess: guessFmfKind(filePath, strings),
    decompression: decompressedBuffers.map(({ method, ok, buffer: output, error }) => ({
      method,
      ok,
      size: output?.length,
      error
    })),
    strings,
    hints
  };
}

async function listFmfCandidates(input: string): Promise<string[]> {
  const info = await stat(input);
  if (info.isFile()) {
    return [input];
  }

  if (!info.isDirectory()) {
    return [];
  }

  const items = await readdir(input, { withFileTypes: true });
  const results: string[] = [];

  for (const item of items) {
    const fullPath = join(input, item.name);
    if (item.isDirectory()) {
      results.push(...(await listFmfCandidates(fullPath)));
      continue;
    }

    if (item.isFile() && [".fmf", ".xml", ".txt", ".json"].includes(extname(item.name).toLowerCase())) {
      results.push(fullPath);
    }
  }

  return results;
}

function tryDecompress(buffer: Buffer): Array<{ method: string; ok: boolean; buffer?: Buffer; error?: string }> {
  const attempts = [
    { method: "gzip", run: () => gunzipSync(buffer) },
    { method: "zlib", run: () => inflateSync(buffer) },
    { method: "raw-deflate", run: () => inflateRawSync(buffer) }
  ];

  return attempts.map((attempt) => {
    try {
      const output = attempt.run();
      return { method: attempt.method, ok: true, buffer: output };
    } catch (error) {
      return { method: attempt.method, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

function detectContainer(buffer: Buffer): string {
  if (buffer.subarray(0, 2).toString("hex") === "1f8b") return "gzip";
  if (buffer.subarray(0, 2).toString("ascii") === "PK") return "zip";
  if (buffer.subarray(0, 5).toString("utf8").startsWith("<?xml")) return "xml";
  if (buffer.subarray(0, 6).toString("utf8") === "SQLite") return "sqlite";
  if ([0x78].includes(buffer[0]) && [0x01, 0x5e, 0x9c, 0xda].includes(buffer[1])) return "zlib-like";
  return "fmf-or-binary";
}

function guessFmfKind(filePath: string, strings: string[]): FmfGuess {
  const name = basename(filePath).toLowerCase();
  const joined = strings.join(" ").toLowerCase();

  if (tokenMatch(name, ["view", "views"]) || tokenMatch(joined, ["view", "views", "column", "columns"])) return "view";
  if (tokenMatch(name, ["tactic", "tactics"]) || tokenMatch(joined, ["tactic", "tactics", "formation", "mentality"])) return "tactic";
  if (tokenMatch(name, ["shortlist", "shortlists"]) || tokenMatch(joined, ["shortlist", "shortlists", "person", "player"])) return "shortlist";
  if (tokenMatch(name, ["editor"]) || tokenMatch(joined, ["database", "competition"])) return "editor-data";
  if (tokenMatch(name, ["skin", "skins"]) || tokenMatch(joined, ["graphics", "panels"])) return "skin-or-resource";
  return "unknown";
}

function tokenMatch(value: string, tokens: string[]): boolean {
  return tokens.some((token) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(token)}([^a-z0-9]|$)`).test(value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildHints(
  filePath: string,
  strings: string[],
  buffer: Buffer,
  decompressed: Array<{ method: string; ok: boolean; buffer?: Buffer; error?: string }>
): string[] {
  const hints: string[] = [];
  const extension = extname(filePath).toLowerCase();
  const joined = strings.join(" ").toLowerCase();

  if (extension === ".fmf" && decompressed.every((item) => !item.ok)) {
    hints.push("No standard gzip/zlib/raw-deflate payload detected. This may need FM Resource Archiver or a custom FMF decoder.");
  }

  if (detectContainer(buffer) === "zip") {
    hints.push("Looks like a ZIP container. Try opening it with unzip tools before writing a custom parser.");
  }

  if (joined.includes("<") && joined.includes(">")) {
    hints.push("Text looks XML-like. An extracted-folder parser may be enough.");
  }

  if (joined.includes("tactic") || joined.includes("formation")) {
    hints.push("Likely useful for tactic profile import.");
  }

  if (joined.includes("shortlist") || joined.includes("player")) {
    hints.push("May contain player references, but not necessarily full attributes.");
  }

  if (strings.length === 0) {
    hints.push("No readable strings found in the sampled payload.");
  }

  return hints;
}

function extractStrings(buffer: Buffer, minLength: number, max: number): string[] {
  const utf8 = buffer.toString("utf8");
  if (looksTextual(utf8)) {
    return unique(
      utf8
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length >= minLength)
        .slice(0, max)
    );
  }

  const strings: string[] = [];
  let current = "";

  for (const byte of buffer) {
    if (byte >= 32 && byte <= 126) {
      current += String.fromCharCode(byte);
      continue;
    }

    if (current.length >= minLength) {
      strings.push(current);
      if (strings.length >= max) {
        return strings;
      }
    }
    current = "";
  }

  if (current.length >= minLength && strings.length < max) {
    strings.push(current);
  }

  return strings;
}

function looksTextual(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  const sample = value.slice(0, 4096);
  const replacementCount = [...sample].filter((char) => char === "\uFFFD").length;
  const controlCount = [...sample].filter((char) => {
    const code = char.charCodeAt(0);
    return code < 32 && !["\n", "\r", "\t"].includes(char);
  }).length;

  return replacementCount / sample.length < 0.01 && controlCount / sample.length < 0.05;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function asciiPreview(buffer: Buffer): string {
  return [...buffer]
    .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "."))
    .join("");
}

function printInspection(inspection: FmfInspection) {
  console.log(`FMF inspection: ${inspection.input}`);
  console.log(`files: ${inspection.files.length}`);

  for (const warning of inspection.warnings) {
    console.log(`warning: ${warning}`);
  }

  for (const file of inspection.files) {
    console.log("");
    console.log(`${file.name}`);
    console.log(`  path: ${file.path}`);
    console.log(`  size: ${file.size} bytes`);
    console.log(`  sha256: ${file.sha256}`);
    console.log(`  magic: ${file.magicHex} | ${file.magicAscii}`);
    console.log(`  container: ${file.container}`);
    console.log(`  guess: ${file.guess}`);
    console.log("  decompression:");
    for (const item of file.decompression) {
      console.log(`    - ${item.method}: ${item.ok ? `ok (${item.size} bytes)` : `no (${item.error})`}`);
    }
    console.log("  hints:");
    for (const hint of file.hints) {
      console.log(`    - ${hint}`);
    }
    console.log("  strings:");
    for (const value of file.strings.slice(0, 20)) {
      console.log(`    - ${value}`);
    }
  }
}
