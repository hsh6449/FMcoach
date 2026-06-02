import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, stat, unlink } from "node:fs/promises";
import {
  ensureCoachContextDir,
  materializePlaybook,
  readCoachResponseFile,
  readLatestCoachPayload,
  writeRunLog,
  type CoachContextReadResult,
  type CoachRunPaths
} from "./coachContext";

export type CodexRunInput = {
  contextDir: string;
  playbookPath: string;
  workspaceDir: string;
};

export type CodexRunResult = {
  ok: boolean;
  command: string;
  contextDir: string;
  cwd: string;
  durationMs: number;
  exitCode?: number | null;
  finishedAt: string;
  message?: string;
  requestJsonPath: string;
  requestMarkdownPath: string;
  response?: CoachContextReadResult;
  responseJsonPath: string;
  runDir?: string;
  runId?: string;
  runLogPath?: string;
  signal?: NodeJS.Signals | null;
  startedAt: string;
  stderr: string;
  stdout: string;
};

const CODEX_TIMEOUT_MS = 180000;
const MAX_OUTPUT_CHARS = 6000;
const bundledCodexPath = "/Applications/Codex.app/Contents/Resources/codex";

export async function runCodexHandoff(input: CodexRunInput): Promise<CodexRunResult> {
  const setup = await ensureCoachContextDir(input.contextDir);
  const latestPayload = await readLatestCoachPayload(input.contextDir);
  const activeRun = latestPayload?.run ?? {
    id: "latest",
    dir: input.contextDir,
    logJsonPath: "",
    requestJsonPath: setup.requestJsonPath,
    requestMarkdownPath: setup.requestMarkdownPath,
    responseJsonPath: setup.responseJsonPath
  };
  const requestExists = await stat(activeRun.requestMarkdownPath).then((info) => info.isFile()).catch(() => false);
  const startedAt = new Date();

  if (!requestExists) {
    return {
      ok: false,
      command: "",
      contextDir: input.contextDir,
      cwd: input.workspaceDir,
      durationMs: 0,
      finishedAt: startedAt.toISOString(),
      message: "latest-request.md가 없습니다. 먼저 Codex 요청을 생성해 주세요.",
      requestJsonPath: activeRun.requestJsonPath,
      requestMarkdownPath: activeRun.requestMarkdownPath,
      responseJsonPath: activeRun.responseJsonPath,
      runDir: activeRun.dir,
      runId: activeRun.id,
      runLogPath: activeRun.logJsonPath,
      startedAt: startedAt.toISOString(),
      stderr: "",
      stdout: ""
    };
  }

  const codexBin = resolveCodexBin();
  const playbookPath = await materializePlaybook(input.playbookPath, input.contextDir);
  await writeActiveRunLog(activeRun, {
    status: "running",
    startedAt: startedAt.toISOString(),
    message: "Codex CLI 실행 중"
  });
  await unlink(setup.responseJsonPath).catch(() => undefined);
  await unlink(activeRun.responseJsonPath).catch(() => undefined);
  const args = [
    "--ask-for-approval",
    "never",
    "exec",
    "--sandbox",
    "workspace-write",
    "--cd",
    input.workspaceDir,
    "--add-dir",
    input.contextDir,
    "--skip-git-repo-check",
    "--color",
    "never",
    "-"
  ];
  const command = [codexBin, ...args].map(shellLabel).join(" ");
  const run = await spawnCodex(codexBin, args, buildCodexPrompt({
    contextDir: input.contextDir,
    playbookPath,
    requestJsonPath: activeRun.requestJsonPath,
    requestMarkdownPath: activeRun.requestMarkdownPath,
    responseJsonPath: activeRun.responseJsonPath
  }));
  const finishedAt = new Date();
  const response = await readCoachResponseFile(activeRun.responseJsonPath);
  const stdout = trimOutput(run.stdout);
  const stderr = trimOutput(run.stderr);
  const ok = run.exitCode === 0 && response.ok;
  if (response.ok) {
    await copyFile(activeRun.responseJsonPath, setup.responseJsonPath).catch(() => undefined);
  }
  await writeActiveRunLog(activeRun, {
    command,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    exitCode: run.exitCode,
    finishedAt: finishedAt.toISOString(),
    message: ok
      ? "Codex CLI가 response.json을 작성했습니다."
      : response.message ?? run.message ?? "Codex CLI 실행 결과를 확인해 주세요.",
    signal: run.signal,
    startedAt: startedAt.toISOString(),
    status: ok ? "completed" : "failed",
    stderr,
    stdout
  });

  return {
    ok,
    command,
    contextDir: input.contextDir,
    cwd: input.workspaceDir,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    exitCode: run.exitCode,
    finishedAt: finishedAt.toISOString(),
    message: ok
      ? "Codex CLI가 response.json을 작성했고 latest-response.json에 반영했습니다."
      : response.message ?? run.message ?? "Codex CLI 실행 결과를 확인해 주세요.",
    requestJsonPath: setup.requestJsonPath,
    requestMarkdownPath: setup.requestMarkdownPath,
    response,
    responseJsonPath: activeRun.responseJsonPath,
    runDir: activeRun.dir,
    runId: activeRun.id,
    runLogPath: activeRun.logJsonPath,
    signal: run.signal,
    startedAt: startedAt.toISOString(),
    stderr,
    stdout
  };
}

async function writeActiveRunLog(run: CoachRunPaths, log: Parameters<typeof writeRunLog>[1]) {
  if (!run.logJsonPath) {
    return;
  }

  await writeRunLog(run, log);
}

function resolveCodexBin(): string {
  if (process.env.FM_COACH_CODEX_BIN) {
    return process.env.FM_COACH_CODEX_BIN;
  }

  if (existsSync(bundledCodexPath)) {
    return bundledCodexPath;
  }

  return "codex";
}

function buildCodexPrompt(paths: {
  contextDir: string;
  playbookPath: string;
  requestJsonPath: string;
  requestMarkdownPath: string;
  responseJsonPath: string;
}) {
  return [
    "You are the real Codex handoff worker for the FM Coach local app.",
    "",
    "Your job is to read the local request files and write the response file for the app.",
    "",
    "Files:",
    `- Playbook: ${paths.playbookPath}`,
    `- Markdown request: ${paths.requestMarkdownPath}`,
    `- JSON source of truth: ${paths.requestJsonPath}`,
    `- Response JSON target: ${paths.responseJsonPath}`,
    "",
    "Instructions:",
    "1. Read the playbook, markdown request, and JSON request before answering.",
    "2. Do not invent missing player traits, hidden attributes, tactical data, scouting data, CA, or PA.",
    "3. Write exactly one valid JSON object to the response JSON target path. Follow the responseContract inside the request JSON.",
    "4. Answer in Korean.",
    "5. Do not modify any file except the response JSON target.",
    "6. After writing the file, finish with a single short sentence confirming that the response JSON was written.",
    "",
    "This is not a mock response. The app will read the JSON file you write."
  ].join("\n");
}

function spawnCodex(command: string, args: string[], prompt: string) {
  return new Promise<{
    exitCode?: number | null;
    message?: string;
    signal?: NodeJS.Signals | null;
    stderr: string;
    stdout: string;
  }>((resolve) => {
    const child = spawn(command, args, {
      cwd: args.includes("--cd") ? args[args.indexOf("--cd") + 1] : undefined,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, CODEX_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderr.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        message: String(error),
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8")
      });
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        signal,
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8")
      });
    });

    child.stdin.end(prompt);
  });
}

function shellLabel(value: string): string {
  if (/^[\w./:=+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}

function trimOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) {
    return text;
  }

  const headLength = Math.floor(MAX_OUTPUT_CHARS / 2);
  const tailLength = MAX_OUTPUT_CHARS - headLength;
  const skipped = text.length - MAX_OUTPUT_CHARS;

  return [
    text.slice(0, headLength),
    `\n...[${skipped} chars truncated]...\n`,
    text.slice(-tailLength)
  ].join("");
}
