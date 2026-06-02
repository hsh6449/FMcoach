import { mkdir, readFile, writeFile } from "node:fs/promises";
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

export async function writeCoachContext(input: CoachContextInput): Promise<CoachContextWriteResult> {
  const generatedAt = new Date().toISOString();
  const report = buildCoachReport(input.squadBatch.players);
  const briefing = buildSquadBriefing(input.squadBatch.players);
  const selectedPlayer = input.squadBatch.players.find((player) => player.id === input.request.selectedPlayerId);
  const selectedFits = selectedPlayer ? topFits(selectedPlayer, 5) : [];
  const recruitment = rankTargets(input.squadBatch.players, input.targetBatch.players, "", 30);
  const responseJsonPath = join(input.contextDir, "latest-response.json");
  const requestJsonPath = join(input.contextDir, "latest-request.json");
  const requestMarkdownPath = join(input.contextDir, "latest-request.md");
  const payload: CoachContextPayload = {
    generatedAt,
    request: input.request,
    playbookPath: input.playbookPath,
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

  await mkdir(input.contextDir, { recursive: true });
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

export async function writeDummyCoachResponse(contextDir: string): Promise<CoachContextReadResult> {
  const requestJsonPath = join(contextDir, "latest-request.json");
  const responseJsonPath = join(contextDir, "latest-response.json");
  const raw = await readFile(requestJsonPath, "utf8").catch(() => "");
  const payload = raw ? JSON.parse(raw) as CoachContextPayload : undefined;
  const topTarget = payload?.recruitment[0];
  const mainNeed = payload?.report.needs[0];
  const selected = payload?.selectedPlayer;
  const answer = {
    generatedAt: new Date().toISOString(),
    title: selected ? `${selected.name} 역할 실험 리포트` : "더미 수석코치 리포트",
    summary: topTarget
      ? `${topTarget.candidate.name}이 현재 후보군 1순위입니다. ${topTarget.bestFit.roleName} 적합도 ${topTarget.bestFit.score}/20, 추천점수 ${topTarget.score}/20입니다.`
      : mainNeed
        ? `${mainNeed.area} 보강이 가장 먼저 보입니다. ${mainNeed.reason}`
        : "현재 데이터 기준으로 큰 보강 리스크는 낮게 잡힙니다.",
    verdict: topTarget ? "영입 추천" : "조건부 적합",
    sections: [
      {
        heading: "파일 handoff 확인",
        items: [
          "앱이 latest-request.json/latest-request.md를 만들었습니다.",
          "더미 응답 생성기가 latest-response.json을 썼고, 앱은 이 파일을 다시 읽어 렌더링할 수 있습니다."
        ]
      },
      {
        heading: "샘플 판단",
        items: [
          topTarget
            ? `${topTarget.candidate.name}: ${topTarget.reasons.slice(0, 3).join(" / ")}`
            : mainNeed
              ? `[${mainNeed.severity}] ${mainNeed.area}: ${mainNeed.reason}`
              : "스쿼드/후보 데이터가 더 들어오면 이 섹션이 구체화됩니다."
        ]
      }
    ],
    actions: [
      "Codex 세션에서는 latest-request.md를 읽고 같은 JSON 형식으로 답하면 됩니다.",
      "앱에서는 응답 파일 변경을 읽어 채팅 패널에 반영합니다."
    ],
    confidence: payload ? "보통" : "낮음"
  };

  await mkdir(contextDir, { recursive: true });
  await writeFile(responseJsonPath, JSON.stringify(answer, null, 2), "utf8");

  return {
    ok: true,
    responseJsonPath,
    answer
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
