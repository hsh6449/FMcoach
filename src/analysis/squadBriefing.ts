import { positionGroups, topFits } from "./scoring";
import type { Player, PositionGroup, RoleFit } from "../types/domain";

type DepthGroup = Exclude<PositionGroup, "unknown">;

export type DepthBand = {
  id: DepthGroup;
  label: string;
  count: number;
  minimum: number;
  status: "empty" | "thin" | "ok" | "deep";
  topPlayers: Array<{ player: Player; fit: RoleFit }>;
};

export type BriefingItem = {
  title: string;
  detail: string;
  severity: "low" | "medium" | "high";
};

export type SquadBriefing = {
  headline: string;
  summary: string;
  readiness: number;
  depth: DepthBand[];
  keyPlayers: Array<{ player: Player; fit: RoleFit }>;
  watchlist: BriefingItem[];
  nextActions: BriefingItem[];
};

const DEPTH_CONFIG: Array<{ id: DepthGroup; label: string; minimum: number }> = [
  { id: "goalkeeper", label: "GK", minimum: 2 },
  { id: "centerBack", label: "CB", minimum: 4 },
  { id: "leftBack", label: "LB", minimum: 2 },
  { id: "rightBack", label: "RB", minimum: 2 },
  { id: "midfielder", label: "CM", minimum: 5 },
  { id: "leftWing", label: "LW", minimum: 2 },
  { id: "rightWing", label: "RW", minimum: 2 },
  { id: "attacker", label: "ST", minimum: 2 }
];

export function buildSquadBriefing(players: Player[]): SquadBriefing {
  if (players.length === 0) {
    return {
      headline: "선수단 데이터를 기다리는 중",
      summary: "샘플 데이터나 FM24 export를 넣으면 수석코치 브리핑을 만들 수 있습니다.",
      readiness: 0,
      depth: buildDepth(players),
      keyPlayers: [],
      watchlist: [{ title: "첫 단계", detail: "선수단 export 파일을 넣고 데이터 품질 점수를 먼저 확인하세요.", severity: "medium" }],
      nextActions: [{ title: "샘플 확인", detail: "샘플 데이터를 불러오면 앱 흐름을 먼저 볼 수 있습니다.", severity: "low" }]
    };
  }

  const depth = buildDepth(players);
  const keyPlayers = players
    .map((player) => ({ player, fit: topFits(player, 1)[0] }))
    .sort((a, b) => b.fit.score - a.fit.score)
    .slice(0, 5);
  const watchlist = buildWatchlist(players);
  const nextActions = buildNextActions(depth, watchlist);
  const readiness = calculateReadiness(depth, watchlist);

  return {
    headline: headlineFor(readiness, depth),
    summary: summaryFor(players, readiness, depth, watchlist),
    readiness,
    depth,
    keyPlayers,
    watchlist,
    nextActions
  };
}

function buildDepth(players: Player[]): DepthBand[] {
  return DEPTH_CONFIG.map((config) => {
    const groupPlayers = players
      .filter((player) => positionGroups(player.position).includes(config.id))
      .map((player) => ({ player, fit: topFits(player, 1)[0] }))
      .sort((a, b) => b.fit.score - a.fit.score);
    const count = groupPlayers.length;

    return {
      ...config,
      count,
      status: depthStatus(count, config.minimum),
      topPlayers: groupPlayers.slice(0, 3)
    };
  });
}

function depthStatus(count: number, minimum: number): DepthBand["status"] {
  if (count === 0) {
    return "empty";
  }
  if (count < minimum) {
    return "thin";
  }
  if (count >= minimum + 2) {
    return "deep";
  }
  return "ok";
}

function buildWatchlist(players: Player[]): BriefingItem[] {
  const items: BriefingItem[] = [];
  const lowCondition = players.filter((player) => typeof player.condition === "number" && player.condition < 80);
  const lowSharpness = players.filter((player) => typeof player.sharpness === "number" && player.sharpness < 70);
  const olderCore = players
    .map((player) => ({ player, fit: topFits(player, 1)[0] }))
    .filter((item) => (item.player.age ?? 0) >= 30 && item.fit.score >= 13)
    .sort((a, b) => b.fit.score - a.fit.score);
  const lowRoleFit = players
    .map((player) => ({ player, fit: topFits(player, 1)[0] }))
    .filter((item) => item.fit.score < 11)
    .sort((a, b) => a.fit.score - b.fit.score);

  if (lowCondition.length > 0) {
    items.push({
      title: "컨디션 관리",
      detail: `${lowCondition.slice(0, 3).map((player) => player.name).join(", ")} 컨디션이 80% 아래입니다.`,
      severity: "high"
    });
  }

  if (lowSharpness.length > 0) {
    items.push({
      title: "경기 감각",
      detail: `${lowSharpness.slice(0, 3).map((player) => player.name).join(", ")} 경기 감각을 올릴 필요가 있습니다.`,
      severity: "medium"
    });
  }

  if (olderCore.length > 0) {
    items.push({
      title: "핵심 베테랑",
      detail: `${olderCore[0].player.name}은 여전히 핵심 전력입니다. 체력 배분과 후계자 계획을 같이 보세요.`,
      severity: "medium"
    });
  }

  if (lowRoleFit.length > 0) {
    items.push({
      title: "역할 재검토",
      detail: `${lowRoleFit.slice(0, 2).map((item) => item.player.name).join(", ")}은 현재 역할 적합도가 낮게 잡힙니다.`,
      severity: "medium"
    });
  }

  if (items.length === 0) {
    items.push({ title: "큰 위험 없음", detail: "현재 export 기준으로 즉시 조정할 위험 신호는 크지 않습니다.", severity: "low" });
  }

  return items.slice(0, 4);
}

function buildNextActions(depth: DepthBand[], watchlist: BriefingItem[]): BriefingItem[] {
  const actions: BriefingItem[] = [];
  const thinDepth = depth.filter((band) => band.status === "empty" || band.status === "thin");
  const highRisk = watchlist.find((item) => item.severity === "high");

  if (thinDepth.length > 0) {
    actions.push({
      title: "뎁스 보강",
      detail: `${thinDepth[0].label} 포지션부터 후보를 찾는 것이 우선입니다.`,
      severity: thinDepth[0].status === "empty" ? "high" : "medium"
    });
  }

  if (highRisk) {
    actions.push({
      title: "당장 조정",
      detail: highRisk.detail,
      severity: "high"
    });
  }

  actions.push({
    title: "데이터 보강",
    detail: "컨디션, 경기 감각, 최근 평점 컬럼이 있으면 훈련/기용 조언이 더 좋아집니다.",
    severity: "low"
  });

  return actions.slice(0, 3);
}

function calculateReadiness(depth: DepthBand[], watchlist: BriefingItem[]): number {
  const maxPerBand = 100 / Math.max(depth.length, 1);
  const depthScore = depth.reduce((sum, band) => {
    if (band.status === "deep") return sum + maxPerBand;
    if (band.status === "ok") return sum + maxPerBand * 0.85;
    if (band.status === "thin") return sum + maxPerBand * 0.45;
    return sum + maxPerBand * 0.1;
  }, 0);
  const riskPenalty = watchlist.reduce((sum, item) => {
    if (item.severity === "high") return sum + 10;
    if (item.severity === "medium") return sum + 5;
    return sum + 0;
  }, 0);

  return Math.max(0, Math.min(100, Math.round(depthScore - riskPenalty)));
}

function headlineFor(readiness: number, depth: DepthBand[]): string {
  const weakest = depth
    .filter((band) => band.status === "empty" || band.status === "thin")
    .sort((a, b) => severityRank(a.status) - severityRank(b.status))[0];

  if (readiness >= 82) {
    return "선수단 균형은 좋은 편입니다";
  }
  if (weakest) {
    return `${weakest.label} 뎁스부터 확인하세요`;
  }
  return "역할 배치와 체력 관리가 핵심입니다";
}

function summaryFor(players: Player[], readiness: number, depth: DepthBand[], watchlist: BriefingItem[]): string {
  const thinCount = depth.filter((band) => band.status === "empty" || band.status === "thin").length;
  const highRisk = watchlist.filter((item) => item.severity === "high").length;

  return `${players.length}명 기준 준비도 ${readiness}/100입니다. 얇은 포지션 ${thinCount}개, 즉시 주의 항목 ${highRisk}개가 잡혔습니다.`;
}

function severityRank(status: DepthBand["status"]): number {
  if (status === "empty") return 0;
  if (status === "thin") return 1;
  if (status === "ok") return 2;
  return 3;
}
