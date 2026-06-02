import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildCoachReport } from "../src/analysis/advisor";
import { rankTargets } from "../src/analysis/recruitment";
import { topFits } from "../src/analysis/scoring";
import { buildSquadBriefing } from "../src/analysis/squadBriefing";
import type { ImportBatch } from "../src/types/domain";

export type CoachContextRequest = {
  mode?: "coach" | "scout" | "tactic";
  question?: string;
  selectedPlayerId?: string;
  source?: string;
};

export type CoachContextSetupResult = {
  ok: true;
  contextDir: string;
  requestJsonPath: string;
  requestMarkdownPath: string;
  responseJsonPath: string;
  generatedAt: string;
};

export type CoachContextWriteResult = CoachContextSetupResult & {
  latestRequestJsonPath: string;
  latestRequestMarkdownPath: string;
  latestResponseJsonPath: string;
  runDir: string;
  runId: string;
  runLogPath: string;
};

export type CoachContextReadResult = {
  ok: boolean;
  responseJsonPath: string;
  answer?: unknown;
  message?: string;
  runDir?: string;
  runId?: string;
};

export type CoachRunStatus = "requested" | "running" | "completed" | "failed";

export type CoachRunSummary = {
  answer?: unknown;
  confidence?: string;
  createdAt?: string;
  finishedAt?: string;
  logJsonPath: string;
  mode?: string;
  question?: string;
  requestJsonPath: string;
  requestMarkdownPath: string;
  responseJsonPath: string;
  runDir: string;
  runId: string;
  status: CoachRunStatus;
  summary?: string;
  title?: string;
  verdict?: string;
};

type CoachContextInput = {
  allBatch: ImportBatch;
  contextDir: string;
  playbookPath: string;
  request: CoachContextRequest;
  squadBatch: ImportBatch;
  targetBatch: ImportBatch;
};

type CoachContextPayload = {
  allPlayers: ImportBatch;
  briefing: ReturnType<typeof buildSquadBriefing>;
  generatedAt: string;
  playbookPath: string;
  recruitment: ReturnType<typeof rankTargets>;
  report: ReturnType<typeof buildCoachReport>;
  request: CoachContextRequest;
  requestJsonPath: string;
  responseContract: ReturnType<typeof responseContract>;
  responseJsonPath: string;
  run: CoachRunPaths;
  selectedFits: ReturnType<typeof topFits>;
  selectedPlayer?: ImportBatch["players"][number];
  squad: ImportBatch;
  targets: ImportBatch;
};

export type CoachRunPaths = {
  id: string;
  dir: string;
  logJsonPath: string;
  requestJsonPath: string;
  requestMarkdownPath: string;
  responseJsonPath: string;
};

export type CoachRunLog = {
  command?: string;
  durationMs?: number;
  exitCode?: number | null;
  finishedAt?: string;
  message?: string;
  signal?: NodeJS.Signals | null;
  startedAt?: string;
  status: CoachRunStatus;
  stderr?: string;
  stdout?: string;
};

export async function ensureCoachContextDir(contextDir: string): Promise<CoachContextSetupResult> {
  const requestJsonPath = join(contextDir, "latest-request.json");
  const requestMarkdownPath = join(contextDir, "latest-request.md");
  const responseJsonPath = join(contextDir, "latest-response.json");

  await mkdir(join(contextDir, "runs"), { recursive: true });

  return {
    ok: true,
    contextDir,
    requestJsonPath,
    requestMarkdownPath,
    responseJsonPath,
    generatedAt: new Date().toISOString()
  };
}

export async function materializePlaybook(playbookPath: string, contextDir: string): Promise<string> {
  const targetPath = join(contextDir, "AI_COACH_PLAYBOOK.md");
  if (playbookPath === targetPath) {
    return targetPath;
  }

  const source = await readFile(playbookPath, "utf8").catch(() => "");
  if (!source) {
    return playbookPath;
  }

  await mkdir(contextDir, { recursive: true });
  await writeFile(targetPath, source, "utf8");
  return targetPath;
}

export async function writeCoachContext(input: CoachContextInput): Promise<CoachContextWriteResult> {
  const generatedAt = new Date().toISOString();
  const paths = await ensureCoachContextDir(input.contextDir);
  const run = runPaths(input.contextDir, createRunId(generatedAt));
  const playbookPath = await materializePlaybook(input.playbookPath, input.contextDir);
  const report = buildCoachReport(input.squadBatch.players);
  const briefing = buildSquadBriefing(input.squadBatch.players);
  const selectedPlayer = input.squadBatch.players.find((player) => player.id === input.request.selectedPlayerId);
  const selectedFits = selectedPlayer ? topFits(selectedPlayer, 5) : [];
  const recruitment = rankTargets(input.squadBatch.players, input.targetBatch.players, "", 30);
  const responseJsonPath = run.responseJsonPath;
  const requestJsonPath = run.requestJsonPath;
  const requestMarkdownPath = run.requestMarkdownPath;
  const payload: CoachContextPayload = {
    generatedAt,
    request: input.request,
    playbookPath,
    requestJsonPath,
    responseJsonPath,
    run,
    squad: input.squadBatch,
    targets: input.targetBatch,
    allPlayers: input.allBatch,
    report,
    briefing,
    selectedPlayer,
    selectedFits,
    recruitment,
    responseContract: responseContract()
  };

  await mkdir(run.dir, { recursive: true });
  await unlink(paths.responseJsonPath).catch(() => undefined);
  await unlink(responseJsonPath).catch(() => undefined);
  await writeFile(requestJsonPath, JSON.stringify(payload, null, 2), "utf8");
  await writeFile(requestMarkdownPath, formatRequestMarkdown(payload), "utf8");
  await writeFile(paths.requestJsonPath, JSON.stringify(payload, null, 2), "utf8");
  await writeFile(paths.requestMarkdownPath, formatRequestMarkdown(payload), "utf8");
  await writeRunLog(run, { status: "requested", startedAt: generatedAt, message: "Codex 요청 파일을 생성했습니다." });

  return {
    ok: true,
    contextDir: input.contextDir,
    latestRequestJsonPath: paths.requestJsonPath,
    latestRequestMarkdownPath: paths.requestMarkdownPath,
    latestResponseJsonPath: paths.responseJsonPath,
    requestJsonPath,
    requestMarkdownPath,
    responseJsonPath,
    generatedAt,
    runDir: run.dir,
    runId: run.id,
    runLogPath: run.logJsonPath
  };
}

export async function readCoachResponse(contextDir: string): Promise<CoachContextReadResult> {
  const setup = await ensureCoachContextDir(contextDir);
  const payload = await readLatestCoachPayload(contextDir);
  const run = payload?.run;
  const responseJsonPath = run?.responseJsonPath ?? setup.responseJsonPath;
  const result = await readCoachResponseFile(responseJsonPath);

  if (result.ok) {
    return { ...result, runDir: run?.dir, runId: run?.id };
  }

  const latestResult = responseJsonPath === setup.responseJsonPath
    ? result
    : await readCoachResponseFile(setup.responseJsonPath);

  return {
    ...latestResult,
    message: latestResult.ok
      ? latestResult.message
      : `${responseFileName(responseJsonPath)}을 아직 찾지 못했습니다.`,
    runDir: run?.dir,
    runId: run?.id
  };
}

export async function readCoachResponseFile(responseJsonPath: string): Promise<CoachContextReadResult> {
  const raw = await readFile(responseJsonPath, "utf8").catch(() => "");

  if (!raw) {
    return {
      ok: false,
      responseJsonPath,
      message: `${responseFileName(responseJsonPath)}을 아직 찾지 못했습니다.`
    };
  }

  try {
    return {
      ok: true,
      responseJsonPath,
      answer: JSON.parse(raw) as unknown
    };
  } catch {
    return {
      ok: false,
      responseJsonPath,
      message: `${responseFileName(responseJsonPath)} 파싱에 실패했습니다. JSON 형식을 확인해 주세요.`
    };
  }
}

export async function readLatestCoachPayload(contextDir: string): Promise<CoachContextPayload | undefined> {
  const raw = await readFile(join(contextDir, "latest-request.json"), "utf8").catch(() => "");
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as CoachContextPayload;
  } catch {
    return undefined;
  }
}

export async function listCoachRuns(contextDir: string, limit = 8): Promise<{ ok: true; runs: CoachRunSummary[] }> {
  await ensureCoachContextDir(contextDir);
  const runsDir = join(contextDir, "runs");
  const items = await readdir(runsDir, { withFileTypes: true }).catch(() => []);
  const runs = await Promise.all(items
    .filter((item) => item.isDirectory())
    .map((item) => readCoachRunSummary(contextDir, item.name)));

  return {
    ok: true,
    runs: runs
      .filter((run): run is CoachRunSummary => Boolean(run))
      .sort((a, b) => (b.createdAt ?? b.runId).localeCompare(a.createdAt ?? a.runId))
      .slice(0, limit)
  };
}

export async function writeRunLog(run: CoachRunPaths, log: CoachRunLog): Promise<void> {
  await mkdir(run.dir, { recursive: true });
  await writeFile(run.logJsonPath, JSON.stringify(log, null, 2), "utf8");
}

export function runPaths(contextDir: string, runId: string): CoachRunPaths {
  const dir = join(contextDir, "runs", runId);

  return {
    id: runId,
    dir,
    logJsonPath: join(dir, "run-log.json"),
    requestJsonPath: join(dir, "request.json"),
    requestMarkdownPath: join(dir, "request.md"),
    responseJsonPath: join(dir, "response.json")
  };
}

function formatRequestMarkdown(payload: CoachContextPayload) {
  const selected = payload.selectedPlayer
    ? `${payload.selectedPlayer.name} (${payload.selectedPlayer.position || "포지션 미상"})`
    : "없음";
  const topTargets = payload.recruitment
    .slice(0, 10)
    .map((item, index) => `${index + 1}. ${item.candidate.name} - ${item.verdict}, ${item.bestFit.roleName} ${item.bestFit.score}/20, 추천점수 ${item.score}/20`)
    .join("\n");
  const needs = payload.report.needs
    .slice(0, 8)
    .map((need) => `- [${need.severity}] ${need.area}: ${need.reason}`)
    .join("\n");
  const keyPlayers = payload.briefing.keyPlayers
    .slice(0, 8)
    .map((item) => `- ${item.player.name}: ${item.fit.roleName} ${item.fit.score}/20`)
    .join("\n");

  return [
    "# FM Coach Codex Request",
    "",
    `Generated: ${payload.generatedAt}`,
    `Mode: ${payload.request.mode ?? "coach"}`,
    `Question: ${payload.request.question ?? "현재 스쿼드와 영입 후보를 수석코치 관점으로 분석해 주세요."}`,
    `Selected player: ${selected}`,
    "",
    "## Files",
    "",
    `- Playbook: ${payload.playbookPath}`,
    `- Full JSON context: ${payload.requestJsonPath}`,
    `- Write response JSON to: ${payload.responseJsonPath}`,
    "",
    "## Instructions For Codex",
    "",
    "1. Read the playbook first.",
    "2. Use the JSON context path listed above as the source of truth.",
    "3. Do not invent missing player traits, hidden attributes, tactic data, or scouting data.",
    "4. Write the final answer to the response JSON path listed above using the response contract below.",
    "5. Keep recommendations grounded in local data fields.",
    "",
    "## Squad Snapshot",
    "",
    `- Squad players: ${payload.squad.players.length}`,
    `- Target players: ${payload.targets.players.length}`,
    `- Briefing: ${payload.briefing.summary}`,
    "",
    "## Squad Needs",
    "",
    needs || "- 스쿼드 리스크 없음 또는 데이터 부족",
    "",
    "## Key Players",
    "",
    keyPlayers || "- 핵심 선수 분석 대기",
    "",
    "## Top Recruitment Candidates",
    "",
    topTargets || "- 영입 후보 export 없음",
    "",
    "## Response Contract",
    "",
    "```json",
    JSON.stringify(responseContract(), null, 2),
    "```",
    ""
  ].join("\n");
}

function responseContract() {
  return {
    generatedAt: "ISO timestamp",
    title: "짧은 제목",
    summary: "앱에 표시할 핵심 요약",
    verdict: "적합 | 조건부 적합 | 애매 | 부적합 | 영입 추천 | 보류",
    sections: [
      {
        heading: "섹션 제목",
        items: ["근거가 포함된 문장"]
      }
    ],
    actions: ["사용자가 바로 실행할 수 있는 다음 행동"],
    confidence: "높음 | 보통 | 낮음"
  };
}

async function readCoachRunSummary(contextDir: string, runId: string): Promise<CoachRunSummary | undefined> {
  const run = runPaths(contextDir, runId);
  const rawRequest = await readFile(run.requestJsonPath, "utf8").catch(() => "");
  const rawResponse = await readFile(run.responseJsonPath, "utf8").catch(() => "");
  const rawLog = await readFile(run.logJsonPath, "utf8").catch(() => "");
  const request = parseJson<CoachContextPayload>(rawRequest);
  const answer = parseJson<Record<string, unknown>>(rawResponse);
  const log = parseJson<CoachRunLog>(rawLog);
  const exists = rawRequest || rawResponse || rawLog || await stat(run.dir).then((info) => info.isDirectory()).catch(() => false);

  if (!exists) {
    return undefined;
  }

  const status = answer
    ? "completed"
    : log?.status ?? "requested";

  return {
    answer,
    confidence: stringValue(answer?.confidence),
    createdAt: request?.generatedAt ?? log?.startedAt,
    finishedAt: log?.finishedAt,
    logJsonPath: run.logJsonPath,
    mode: request?.request.mode,
    question: request?.request.question,
    requestJsonPath: run.requestJsonPath,
    requestMarkdownPath: run.requestMarkdownPath,
    responseJsonPath: run.responseJsonPath,
    runDir: run.dir,
    runId,
    status,
    summary: stringValue(answer?.summary),
    title: stringValue(answer?.title),
    verdict: stringValue(answer?.verdict)
  };
}

function createRunId(generatedAt: string): string {
  const timestamp = generatedAt
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[TZ]/g, "-")
    .replace(/-$/, "");
  return `${timestamp}-${randomUUID().slice(0, 8)}`;
}

function parseJson<T>(raw: string): T | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function responseFileName(path: string): string {
  return path.endsWith("latest-response.json") ? "latest-response.json" : "response.json";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
