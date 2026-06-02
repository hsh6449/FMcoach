import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { answerQuestion, buildCoachReport } from "../src/analysis/advisor";
import { topFits } from "../src/analysis/scoring";
import type { CoachReport, ImportBatch, Player } from "../src/types/domain";
import { parseArgs, scanExportFolder, type ExportFileInfo } from "./exportFolder";

type CliState = {
  batch: ImportBatch;
  files: ExportFileInfo[];
  report: CoachReport;
  selected?: Player;
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
    printPlayers(state.batch.players, rest);
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
  const report = buildCoachReport(scan.batch.players);

  return {
    batch: scan.batch,
    files: scan.files,
    report,
    selected: undefined,
    watchDir: folder
  };
}

function askCoach(question: string) {
  if (state.batch.players.length === 0) {
    console.log("아직 읽은 선수가 없습니다. FM24에서 export한 뒤 /sync를 실행해 주세요.");
    return;
  }

  const scopedQuestion = state.selected ? `${state.selected.name} 기준으로 ${question}` : question;
  console.log(answerQuestion(scopedQuestion, state.batch.players, state.report));
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

  const player = findPlayer(query, state.batch.players);
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
  console.log(`${current.batch.players.length} players, ${current.files.length} export files loaded`);
  printHelp();
}

function printHelp() {
  console.log([
    "명령:",
    "/sync - export 폴더 다시 읽기",
    "/summary - 스쿼드 요약",
    "/players [검색어] - 선수 목록",
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
    `선수: ${current.batch.players.length}명`,
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

  console.log(files.map((file) => `- ${file.name} (${Math.round(file.size / 1024)} KB)`).join("\n"));
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

function findPlayer(query: string, players: Player[]): Player | undefined {
  const normalized = query.toLowerCase().replace(/\s+/g, "");
  return players.find((player) => player.name.toLowerCase().replace(/\s+/g, "").includes(normalized));
}

async function readAllInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}
