import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
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

export type CoachContextWriteResult = {
  ok: true;
  contextDir: string;
  requestJsonPath: string;
  requestMarkdownPath: string;
  responseJsonPath: string;
  generatedAt: string;
};

export type CoachContextReadResult = {
  ok: boolean;
  responseJsonPath: string;
  answer?: unknown;
  message?: string;
};

export type CoachContextSetupResult = CoachContextWriteResult;

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
  selectedFits: ReturnType<typeof topFits>;
  selectedPlayer?: ImportBatch["players"][number];
  squad: ImportBatch;
  targets: ImportBatch;
};

export async function ensureCoachContextDir(contextDir: string): Promise<CoachContextSetupResult> {
  const requestJsonPath = join(contextDir, "latest-request.json");
  const requestMarkdownPath = join(contextDir, "latest-request.md");
  const responseJsonPath = join(contextDir, "latest-response.json");

  await mkdir(contextDir, { recursive: true });

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
  const playbookPath = await materializePlaybook(input.playbookPath, input.contextDir);
  const report = buildCoachReport(input.squadBatch.players);
  const briefing = buildSquadBriefing(input.squadBatch.players);
  const selectedPlayer = input.squadBatch.players.find((player) => player.id === input.request.selectedPlayerId);
  const selectedFits = selectedPlayer ? topFits(selectedPlayer, 5) : [];
  const recruitment = rankTargets(input.squadBatch.players, input.targetBatch.players, "", 30);
  const responseJsonPath = paths.responseJsonPath;
  const requestJsonPath = paths.requestJsonPath;
  const requestMarkdownPath = paths.requestMarkdownPath;
  const payload: CoachContextPayload = {
    generatedAt,
    request: input.request,
    playbookPath,
    requestJsonPath,
    responseJsonPath,
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

  await unlink(responseJsonPath).catch(() => undefined);
  await writeFile(requestJsonPath, JSON.stringify(payload, null, 2), "utf8");
  await writeFile(requestMarkdownPath, formatRequestMarkdown(payload), "utf8");

  return {
    ok: true,
    contextDir: input.contextDir,
    requestJsonPath,
    requestMarkdownPath,
    responseJsonPath,
    generatedAt
  };
}

export async function readCoachResponse(contextDir: string): Promise<CoachContextReadResult> {
  const responseJsonPath = join(contextDir, "latest-response.json");
  const raw = await readFile(responseJsonPath, "utf8").catch(() => "");

  if (!raw) {
    return {
      ok: false,
      responseJsonPath,
      message: "latest-response.json을 아직 찾지 못했습니다."
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
      message: "latest-response.json 파싱에 실패했습니다. JSON 형식을 확인해 주세요."
    };
  }
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
    "2. Use `latest-request.json` as the source of truth.",
    "3. Do not invent missing player traits, hidden attributes, tactic data, or scouting data.",
    "4. Write the final answer to `latest-response.json` using the response contract below.",
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
