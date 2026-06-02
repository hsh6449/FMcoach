import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { answerQuestion, buildCoachReport } from "../src/analysis/advisor";
import { compareTarget, findPlayer, rankTargets, type TargetRecommendation } from "../src/analysis/recruitment";
import { topFits } from "../src/analysis/scoring";
import type { CoachReport, ImportBatch, Player } from "../src/types/domain";
import { parseArgs, scanExportFolder, type ExportFileInfo, type ExportFolderScan } from "./exportFolder";

type CliState = {
  batch: ImportBatch;
  files: ExportFileInfo[];
  report: CoachReport;
  selected?: Player;
  squadPlayers: Player[];
  targetPlayers: Player[];
  watchDir: string;
};

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = parseArgs(process.argv.slice(2));
const watchDir = resolve(args.watch ?? join(rootDir, "samples"));

let state = await loadState(watchDir);
printBanner(state);

if (input.isTTY) {
  const rl = createInterface({ input, output });

  while (true) {
    const raw = await rl.question("\ncoach> ");
    const shouldContinue = await processLine(raw, false);
    if (!shouldContinue) {
      break;
    }
  }

  rl.close();
} else {
  const pipedInput = await readAllInput();
  for (const raw of pipedInput.split(/\r?\n/)) {
    const shouldContinue = await processLine(raw, true);
    if (!shouldContinue) {
      break;
    }
  }
}

async function processLine(raw: string, echo: boolean): Promise<boolean> {
  const command = raw.trim();

  if (!command) {
    return true;
  }

  if (echo) {
    console.log(`\ncoach> ${command}`);
  }

  if (["/quit", "/exit", "quit", "exit"].includes(command.toLowerCase())) {
    return false;
  }

  try {
    await handleCommand(command);
  } catch (error) {
    console.log(`문제가 생겼습니다: ${String(error)}`);
  }

  return true;
}

async function handleCommand(command: string) {
  const [name, ...parts] = command.split(/\s+/);
  const rest = parts.join(" ").trim();

  if (name === "/help") {
    printHelp();
    return;
  }

  if (name === "/sync") {
    state = await loadState(state.watchDir);
    console.log(`${state.batch.players.length}명의 선수와 ${state.files.length}개 export 파일을 다시 읽었습니다.`);
    return;
  }

  if (name === "/summary") {
    printSummary(state);
    return;
  }

  if (name === "/files") {
    printFiles(state.files);
    return;
  }

  if (name === "/players") {
    printPlayers(state.squadPlayers, rest);
    return;
  }

  if (name === "/targets") {
    printTargets(rest);
    return;
  }

  if (name === "/compare") {
    printCompare(rest);
    return;
  }

  if (name === "/player") {
    selectPlayer(rest);
    return;
  }

  askCoach(command);
}

async function loadState(folder: string): Promise<CliState> {
  const scan = await scanExportFolder(folder);
  const { squadPlayers, targetPlayers } = splitScanPlayers(scan);
  const report = buildCoachReport(squadPlayers);

  return {
    batch: scan.batch,
    files: scan.files,
    report,
    squadPlayers,
    targetPlayers,
    selected: undefined,
    watchDir: folder
  };
}

function askCoach(question: string) {
  if (state.squadPlayers.length === 0) {
    console.log("아직 읽은 선수가 없습니다. FM24에서 export한 뒤 /sync를 실행해 주세요.");
    return;
  }

  const scopedQuestion = state.selected ? `${state.selected.name} 기준으로 ${question}` : question;
  console.log(answerQuestion(scopedQuestion, state.squadPlayers, state.report));
}

function selectPlayer(query: string) {
  if (!query) {
    if (state.selected) {
      console.log(`현재 선택: ${state.selected.name} (${state.selected.position || "포지션 미상"})`);
    } else {
      console.log("선택된 선수가 없습니다. /player 선수명 으로 선택할 수 있어요.");
    }
    return;
  }

  const player = findPlayer(query, state.squadPlayers);
  if (!player) {
    console.log(`'${query}'에 맞는 선수를 찾지 못했습니다.`);
    return;
  }

  state = { ...state, selected: player };
  const fits = topFits(player, 3);
  console.log(`${player.name} 선택됨.`);
  console.log(fits.map((fit) => `- ${fit.roleName}: ${fit.score}/20`).join("\n"));
}

function printBanner(current: CliState) {
  console.log("FM Coach Terminal");
  console.log(`watch: ${current.watchDir}`);
  console.log(`${current.squadPlayers.length} squad players, ${current.targetPlayers.length} targets, ${current.files.length} export files loaded`);
  printHelp();
}

function printHelp() {
  console.log([
    "명령:",
    "/sync - export 폴더 다시 읽기",
    "/summary - 스쿼드 요약",
    "/players [검색어] - 선수 목록",
    "/targets [검색어/포지션/역할] - 영입 후보 랭킹",
    "/compare 후보명 [vs 기존선수명] - 후보 비교",
    "/player 선수명 - 선수 context 선택",
    "/files - 읽은 export 파일",
    "/quit - 종료",
    "그 외 문장은 그대로 수석코치 질문으로 처리"
  ].join("\n"));
}

function printSummary(current: CliState) {
  const needs = current.report.needs.slice(0, 4).map((need) => `- [${need.severity}] ${need.area}: ${need.reason}`);
  const tactics = current.report.tacticalNotes.slice(0, 4).map((note) => `- ${note}`);
  const best = current.report.bestXi.slice(0, 11).map((player, index) => `${index + 1}. ${player.name} (${player.position || "?"})`);

  console.log([
    `선수단: ${current.squadPlayers.length}명`,
    `영입 후보: ${current.targetPlayers.length}명`,
    `파일: ${current.files.length}개`,
    "",
    "베스트 XI 초안:",
    best.join("\n") || "- 데이터 부족",
    "",
    "보강/리스크:",
    needs.join("\n") || "- 큰 리스크 없음",
    "",
    "전술 메모:",
    tactics.join("\n") || "- 전술 메모 없음"
  ].join("\n"));
}

function printFiles(files: ExportFileInfo[]) {
  if (files.length === 0) {
    console.log("읽은 export 파일이 없습니다.");
    return;
  }

  console.log(files.map((file) => `- [${file.kind}] ${file.name} (${Math.round(file.size / 1024)} KB)`).join("\n"));
}

function printPlayers(players: Player[], query: string) {
  const filtered = query ? players.filter((player) => player.name.toLowerCase().includes(query.toLowerCase())) : players;
  if (filtered.length === 0) {
    console.log("조건에 맞는 선수가 없습니다.");
    return;
  }

  console.log(filtered.slice(0, 30).map((player) => {
    const fit = topFits(player, 1)[0];
    return `- ${player.name} (${player.position || "?"}) · ${fit.roleName} ${fit.score}/20`;
  }).join("\n"));
}

function printTargets(query: string) {
  if (state.targetPlayers.length === 0) {
    console.log("영입 후보 export를 찾지 못했습니다. 파일명에 target, shortlist, scout, search, transfer 중 하나를 넣어두면 후보군으로 분류합니다.");
    return;
  }

  const recommendations = rankTargets(state.squadPlayers, state.targetPlayers, query, 15);
  if (recommendations.length === 0) {
    console.log("조건에 맞는 영입 후보가 없습니다.");
    return;
  }

  console.log(recommendations.map(formatTargetLine).join("\n"));
}

function printCompare(rest: string) {
  if (!rest) {
    console.log("/compare 후보명 또는 /compare 후보명 vs 기존선수명 형식으로 입력해 주세요.");
    return;
  }

  const [candidateQuery, incumbentQuery = ""] = rest.split(/\s+vs\s+/i).map((item) => item.trim());
  const candidate = findPlayer(candidateQuery, state.targetPlayers);

  if (!candidate) {
    console.log(`'${candidateQuery}'에 맞는 영입 후보를 찾지 못했습니다.`);
    return;
  }

  const recommendation = compareTarget(state.squadPlayers, candidate, incumbentQuery);
  console.log(formatTargetDetail(recommendation));
}

function splitScanPlayers(scan: ExportFolderScan): { squadPlayers: Player[]; targetPlayers: Player[] } {
  const squadSources = scan.sources.filter((source) => source.kind === "squad");
  const targetSources = scan.sources.filter((source) => source.kind === "targets");

  return {
    squadPlayers: mergePlayers(squadSources.length > 0 ? squadSources.flatMap((source) => source.batch.players) : scan.batch.players),
    targetPlayers: mergePlayers(targetSources.flatMap((source) => source.batch.players))
  };
}

function mergePlayers(players: Player[]): Player[] {
  const byId = new Map<string, Player>();

  for (const player of players) {
    const previous = byId.get(player.id);
    byId.set(player.id, previous ? {
      ...previous,
      ...player,
      attributes: { ...previous.attributes, ...player.attributes },
      raw: { ...previous.raw, ...player.raw }
    } : player);
  }

  return [...byId.values()];
}

function formatTargetLine(item: TargetRecommendation): string {
  const incumbent = item.incumbent ? ` vs ${item.incumbent.name} ${item.upgrade >= 0 ? "+" : ""}${item.upgrade}` : " no incumbent";
  return `- ${item.candidate.name} (${item.candidate.position || "?"}) · ${item.bestFit.roleName} ${item.bestFit.score}/20 · ${item.verdict}${incumbent}`;
}

function formatTargetDetail(item: TargetRecommendation): string {
  return [
    `${item.candidate.name} (${item.candidate.position || "포지션 미상"})`,
    `평가: ${item.verdict}`,
    `후보 점수: ${item.score}`,
    `최적 역할: ${item.bestFit.roleName} ${item.bestFit.score}/20`,
    item.incumbent && item.incumbentFit
      ? `비교 대상: ${item.incumbent.name} ${item.incumbentFit.roleName} ${item.incumbentFit.score}/20 (${item.upgrade >= 0 ? "+" : ""}${item.upgrade})`
      : "비교 대상: 없음",
    "",
    "근거:",
    item.reasons.map((reason) => `- ${reason}`).join("\n")
  ].join("\n");
}

async function readAllInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}
