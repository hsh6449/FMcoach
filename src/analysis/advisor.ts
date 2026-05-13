import { roleDefinitions } from "./roleDefinitions";
import { positionGroup, squadAverage, topFits } from "./scoring";
import type { AttributeKey, CoachReport, Player, SquadNeed } from "../types/domain";

const POSITION_LABELS = {
  goalkeeper: "골키퍼",
  defender: "센터백",
  midfielder: "중앙 미드필더",
  wide: "측면",
  attacker: "스트라이커",
  unknown: "미분류"
};

export function buildCoachReport(players: Player[]): CoachReport {
  const topRoleFits = players
    .map((player) => ({ player, fits: topFits(player, 3) }))
    .sort((a, b) => b.fits[0].score - a.fits[0].score)
    .slice(0, 12);

  const needs = detectSquadNeeds(players);

  return {
    bestXi: selectBestXi(players),
    topRoleFits,
    needs,
    training: recommendTraining(players),
    transferPriorities: needs.filter((need) => need.severity !== "low").slice(0, 4),
    tacticalNotes: buildTacticalNotes(players)
  };
}

export function answerQuestion(question: string, players: Player[], report: CoachReport): string {
  const lower = question.toLowerCase();
  const player = findMentionedPlayer(question, players);

  if (player) {
    return answerPlayerQuestion(question, player);
  }

  if (containsAny(lower, ["훈련", "training", "focus"])) {
    return formatTraining(report.training);
  }

  if (containsAny(lower, ["전술", "tactic", "formation", "역할", "role"])) {
    return report.tacticalNotes.join("\n");
  }

  if (containsAny(lower, ["영입", "이적", "transfer", "recruit", "보강"])) {
    return formatNeeds(report.transferPriorities);
  }

  if (containsAny(lower, ["베스트", "선발", "best", "xi", "라인업"])) {
    return formatBestXi(report.bestXi);
  }

  if (containsAny(lower, ["약점", "문제", "weak", "risk"])) {
    return formatNeeds(report.needs);
  }

  return [
    "현재 데이터 기준으로는 선수 역할 적합도, 훈련 포커스, 영입 우선순위까지 판단할 수 있어요.",
    report.needs[0] ? `가장 먼저 볼 지점은 ${report.needs[0].area}입니다. ${report.needs[0].reason}` : "스쿼드 데이터가 더 들어오면 약점 분석이 더 날카로워집니다.",
    "선수 이름을 같이 물어보면 해당 선수 기준으로 더 좁혀서 답할게요."
  ].join("\n");
}

function answerPlayerQuestion(question: string, player: Player): string {
  const fits = topFits(player, 3);
  const best = fits[0];
  const training = trainingForPlayer(player);
  const lower = question.toLowerCase();

  if (containsAny(lower, ["훈련", "training", "focus"])) {
    return `${player.name}은 ${training.focus} 쪽이 좋아 보여요. ${training.reason}`;
  }

  if (containsAny(lower, ["역할", "role", "포지션"])) {
    return `${player.name}의 1순위 역할은 ${best.roleName} (${best.score}/20)입니다. 강점은 ${best.strengths.join(", ") || "아직 뚜렷하게 잡히지 않음"}이고, 보완점은 ${best.gaps.join(", ") || "크게 보이지 않음"}입니다.`;
  }

  return `${player.name}은 ${best.roleName} 적합도가 ${best.score}/20입니다. ${training.focus} 훈련을 우선하고, ${best.gaps[0] ? `${best.gaps[0]} 보완을 같이 보면 좋아요.` : "현재 강점을 유지하는 방향이 좋아요."}`;
}

function selectBestXi(players: Player[]): Player[] {
  const slots = [
    { label: "GK", family: "goalkeeper" },
    { label: "DC", family: "defender" },
    { label: "DC", family: "defender" },
    { label: "FB", family: "wide" },
    { label: "FB", family: "wide" },
    { label: "DM/MC", family: "midfielder" },
    { label: "MC", family: "midfielder" },
    { label: "AM", family: "midfielder" },
    { label: "W", family: "wide" },
    { label: "W", family: "wide" },
    { label: "ST", family: "attacker" }
  ] as const;

  const picked = new Set<string>();
  const lineUp: Player[] = [];

  for (const slot of slots) {
    const candidate = players
      .filter((player) => !picked.has(player.id))
      .map((player) => ({
        player,
        fit: topFits(player, 1)[0],
        group: positionGroup(player.position)
      }))
      .filter((item) => item.group === slot.family || item.fit.family === slot.family)
      .sort((a, b) => b.fit.score - a.fit.score)[0];

    if (candidate) {
      picked.add(candidate.player.id);
      lineUp.push(candidate.player);
    }
  }

  return lineUp;
}

function detectSquadNeeds(players: Player[]): SquadNeed[] {
  const needs: SquadNeed[] = [];
  const groups = ["goalkeeper", "defender", "midfielder", "wide", "attacker"] as const;
  const minimums = { goalkeeper: 2, defender: 4, midfielder: 5, wide: 4, attacker: 2 };

  for (const group of groups) {
    const groupPlayers = players.filter((player) => positionGroup(player.position) === group);
    if (groupPlayers.length < minimums[group]) {
      needs.push({
        area: POSITION_LABELS[group],
        severity: groupPlayers.length <= Math.floor(minimums[group] / 2) ? "high" : "medium",
        reason: `${POSITION_LABELS[group]} 뎁스가 ${groupPlayers.length}명이라 로테이션 여유가 작습니다.`
      });
    }
  }

  const pace = squadAverage(players, ["pace", "acceleration"]);
  const creativity = squadAverage(players, ["vision", "passing", "technique"]);
  const pressing = squadAverage(players, ["workRate", "stamina", "teamwork"]);
  const defensiveFocus = squadAverage(players, ["positioning", "concentration", "tackling"]);

  if (pace && pace < 11) {
    needs.push({ area: "전환 속도", severity: "medium", reason: `팀 평균 속도 지표가 ${pace}/20이라 높은 라인 운영 시 뒷공간 리스크가 큽니다.` });
  }

  if (creativity && creativity < 11) {
    needs.push({ area: "창의성", severity: "medium", reason: `패스/시야/기술 평균이 ${creativity}/20이라 지공 상황에서 찬스 품질이 낮아질 수 있습니다.` });
  }

  if (pressing && pressing < 11) {
    needs.push({ area: "압박 지속력", severity: "medium", reason: `활동량/지구력/팀워크 평균이 ${pressing}/20이라 강한 압박 전술은 유지 시간이 짧을 수 있습니다.` });
  }

  if (defensiveFocus && defensiveFocus < 11) {
    needs.push({ area: "수비 집중력", severity: "high", reason: `위치선정/집중력/태클 평균이 ${defensiveFocus}/20이라 경기 후반 실점 관리가 필요합니다.` });
  }

  return needs.length ? needs : [{ area: "스쿼드 균형", severity: "low", reason: "현재 export 기준으로는 큰 결함보다 역할 배치 최적화가 더 중요합니다." }];
}

function recommendTraining(players: Player[]) {
  return players
    .map((player) => ({ player, ...trainingForPlayer(player) }))
    .sort((a, b) => {
      const aAge = a.player.age ?? 30;
      const bAge = b.player.age ?? 30;
      return aAge - bAge;
    })
    .slice(0, 8);
}

function trainingForPlayer(player: Player): { focus: string; reason: string } {
  const best = topFits(player, 1)[0];
  const attrs = player.attributes;
  const gap = best.gaps[0]?.split(" ")[0];

  if ((attrs.stamina ?? 20) <= 10 || (attrs.workRate ?? 20) <= 10) {
    return { focus: "Endurance", reason: "지구력/활동량이 역할 수행 시간을 제한할 수 있습니다." };
  }

  if ((attrs.firstTouch ?? 20) <= 10 || (attrs.passing ?? 20) <= 10) {
    return { focus: "Ball Control", reason: "퍼스트 터치와 패스 안정성을 올리면 대부분의 역할 효율이 좋아집니다." };
  }

  if ((attrs.finishing ?? 20) <= 10 && positionGroup(player.position) === "attacker") {
    return { focus: "Final Third", reason: "공격수로 쓰려면 결정력/침착성 보완 가치가 큽니다." };
  }

  if ((attrs.tackling ?? 20) <= 10 && ["defender", "midfielder"].includes(positionGroup(player.position))) {
    return { focus: "Defending", reason: "태클과 수비 위치선정이 안정되면 전술 리스크가 줄어듭니다." };
  }

  return { focus: gap ? `${gap} support` : "Role familiarity", reason: `${best.roleName} 강점을 유지하면서 약한 핵심 능력치를 보완합니다.` };
}

function buildTacticalNotes(players: Player[]): string[] {
  const pace = squadAverage(players, ["pace", "acceleration"]);
  const pressing = squadAverage(players, ["workRate", "stamina", "teamwork"]);
  const buildup = squadAverage(players, ["passing", "firstTouch", "decisions", "composure"]);
  const defense = squadAverage(players, ["positioning", "concentration", "marking", "tackling"]);
  const notes: string[] = [];

  if (buildup >= 13) {
    notes.push(`빌드업은 짧은 패스 기반으로 가져갈 만합니다. 패스/터치/판단 평균이 ${buildup}/20입니다.`);
  } else if (buildup > 0) {
    notes.push(`후방 빌드업은 무리하지 않는 편이 좋아요. 패스/터치/판단 평균이 ${buildup}/20입니다.`);
  }

  if (pressing >= 13) {
    notes.push(`전방 압박 강도를 높여도 버틸 여지가 있습니다. 활동량/지구력/팀워크 평균이 ${pressing}/20입니다.`);
  } else if (pressing > 0) {
    notes.push(`강한 압박은 선택적으로 쓰는 쪽이 안전합니다. 압박 지속력 평균이 ${pressing}/20입니다.`);
  }

  if (pace >= 13) {
    notes.push(`높은 수비 라인과 빠른 전환에 어울리는 속도 자원이 있습니다. 속도 평균은 ${pace}/20입니다.`);
  } else if (pace > 0) {
    notes.push(`높은 라인은 뒷공간 관리가 필요합니다. 속도 평균은 ${pace}/20입니다.`);
  }

  if (defense > 0 && defense < 11) {
    notes.push(`수비 집중력이 낮게 잡힙니다. 경기 막판에는 템포를 낮추고 수비형 역할을 하나 더 두는 선택지가 좋습니다.`);
  }

  return notes.length ? notes : ["전술 조언을 위해서는 패스, 판단, 지구력, 수비 관련 컬럼이 포함된 export가 더 필요합니다."];
}

function formatTraining(items: CoachReport["training"]): string {
  if (items.length === 0) {
    return "훈련 추천을 만들 선수 데이터가 아직 부족합니다.";
  }

  return items.map((item) => `${item.player.name}: ${item.focus} - ${item.reason}`).join("\n");
}

function formatNeeds(needs: SquadNeed[]): string {
  if (needs.length === 0) {
    return "큰 보강 포인트는 보이지 않습니다.";
  }

  return needs.map((need) => `[${need.severity}] ${need.area}: ${need.reason}`).join("\n");
}

function formatBestXi(players: Player[]): string {
  if (players.length === 0) {
    return "베스트 XI를 만들 선수 데이터가 아직 부족합니다.";
  }

  return players.map((player, index) => `${index + 1}. ${player.name} (${player.position || "포지션 미상"}) - ${topFits(player, 1)[0].roleName}`).join("\n");
}

function findMentionedPlayer(question: string, players: Player[]): Player | undefined {
  const normalized = question.toLowerCase().replace(/\s+/g, "");
  return players.find((player) => normalized.includes(player.name.toLowerCase().replace(/\s+/g, "")));
}

function containsAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}
