import { positionGroups, topFits } from "./scoring";
import type { Player, RoleFit } from "../types/domain";

export type TargetRecommendation = {
  candidate: Player;
  bestFit: RoleFit;
  incumbent?: Player;
  incumbentFit?: RoleFit;
  upgrade: number;
  score: number;
  verdict: string;
  reasons: string[];
};

export function rankTargets(squad: Player[], candidates: Player[], query = "", limit = 20): TargetRecommendation[] {
  const normalized = query.trim().toLowerCase();

  return candidates
    .filter((candidate) => !isSamePlayerInSquad(candidate, squad))
    .filter((candidate) => matchesQuery(candidate, normalized))
    .map((candidate) => buildTargetRecommendation(squad, candidate))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function compareTarget(squad: Player[], candidate: Player, incumbentQuery = ""): TargetRecommendation {
  if (!incumbentQuery) {
    return buildTargetRecommendation(squad, candidate);
  }

  const incumbent = findPlayer(incumbentQuery, squad);
  return buildTargetRecommendation(squad, candidate, incumbent);
}

export function findPlayer(query: string, players: Player[]): Player | undefined {
  const normalized = query.toLowerCase().replace(/\s+/g, "");
  return players.find((player) => player.name.toLowerCase().replace(/\s+/g, "").includes(normalized));
}

function buildTargetRecommendation(squad: Player[], candidate: Player, forcedIncumbent?: Player): TargetRecommendation {
  const bestFit = topFits(candidate, 1)[0];
  const incumbent = forcedIncumbent ?? bestIncumbentForFit(squad, bestFit);
  const incumbentFit = incumbent ? topFits(incumbent, 5).find((fit) => fit.roleId === bestFit.roleId) ?? topFits(incumbent, 1)[0] : undefined;
  const upgrade = incumbentFit ? round(bestFit.score - incumbentFit.score) : 0;
  const scarcityBoost = incumbentFit ? 0 : 2;
  const ageBoost = ageValue(candidate);
  const valuePenalty = pricePenalty(candidate.value);
  const score = clamp(round(bestFit.score + Math.max(upgrade, 0) * 1.4 + scarcityBoost + ageBoost - valuePenalty), 1, 20);
  const reasons = buildReasons(candidate, bestFit, incumbent, incumbentFit, upgrade, ageBoost, valuePenalty, scarcityBoost);

  return {
    candidate,
    bestFit,
    incumbent,
    incumbentFit,
    upgrade,
    score,
    verdict: verdictFor(upgrade, score),
    reasons
  };
}

function bestIncumbentForFit(squad: Player[], fit: RoleFit): Player | undefined {
  return squad
    .map((player) => {
      const comparableFit = topFits(player, 5).find((item) => item.roleId === fit.roleId) ?? topFits(player, 1)[0];
      return { player, fit: comparableFit };
    })
    .filter((item) => item.fit.family === fit.family || positionGroups(item.player.position).includes(fit.family))
    .sort((a, b) => b.fit.score - a.fit.score)[0]?.player;
}

function buildReasons(
  candidate: Player,
  fit: RoleFit,
  incumbent: Player | undefined,
  incumbentFit: RoleFit | undefined,
  upgrade: number,
  ageBoost: number,
  valuePenalty: number,
  scarcityBoost: number
): string[] {
  const reasons = [`${fit.roleName} 적합도 ${fit.score}/20`];

  if (incumbent && incumbentFit) {
    reasons.push(`${incumbent.name} 대비 ${upgrade >= 0 ? "+" : ""}${upgrade}`);
  } else {
    reasons.push("비교 가능한 기존 선수가 부족함");
  }

  if (candidate.age && candidate.age <= 23) {
    reasons.push(`나이 ${candidate.age}세로 성장/재판매 여지`);
  } else if (candidate.age && candidate.age >= 30) {
    reasons.push(`나이 ${candidate.age}세라 장기계약 리스크`);
  }

  if (fit.strengths.length > 0) {
    reasons.push(`강점: ${fit.strengths.slice(0, 2).join(", ")}`);
  }

  if (fit.gaps.length > 0) {
    reasons.push(`보완점: ${fit.gaps.slice(0, 2).join(", ")}`);
  }

  if (ageBoost > 0) {
    reasons.push("나이 보너스 반영");
  }

  if (scarcityBoost > 0) {
    reasons.push("스쿼드 뎁스 부족 반영");
  }

  if (valuePenalty > 0) {
    reasons.push("가격 부담 반영");
  }

  return reasons;
}

function verdictFor(upgrade: number, score: number): string {
  if (upgrade === 0 && score >= 16.5) {
    return "뎁스 보강 우선";
  }

  if (upgrade >= 2 && score >= 16) {
    return "우선 영입 후보";
  }

  if (upgrade >= 0.8) {
    return "업그레이드 후보";
  }

  if (score >= 14) {
    return "스쿼드 옵션";
  }

  return "보류";
}

function matchesQuery(candidate: Player, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    candidate.name,
    candidate.position,
    candidate.club,
    candidate.nationality,
    ...topFits(candidate, 3).map((fit) => fit.roleName)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function isSamePlayerInSquad(candidate: Player, squad: Player[]): boolean {
  const candidateName = candidate.name.toLowerCase().replace(/\s+/g, "");
  return squad.some((player) => player.name.toLowerCase().replace(/\s+/g, "") === candidateName);
}

function ageValue(candidate: Player): number {
  if (!candidate.age) {
    return 0;
  }

  if (candidate.age <= 20) return 1.1;
  if (candidate.age <= 23) return 0.8;
  if (candidate.age <= 27) return 0.3;
  if (candidate.age >= 32) return -1.1;
  if (candidate.age >= 30) return -0.6;
  return 0;
}

function pricePenalty(value?: string): number {
  const amount = parseMoney(value);
  if (!amount) {
    return 0;
  }

  if (amount >= 80_000_000) return 1.4;
  if (amount >= 45_000_000) return 0.8;
  if (amount >= 25_000_000) return 0.4;
  return 0;
}

function parseMoney(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/,/g, "").toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*([kmb])?/);
  if (!match) {
    return undefined;
  }

  const amount = Number(match[1]);
  const suffix = match[2];
  if (suffix === "b") return amount * 1_000_000_000;
  if (suffix === "m") return amount * 1_000_000;
  if (suffix === "k") return amount * 1_000;
  return amount;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
