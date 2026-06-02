import { attributeCatalog } from "./attributeCatalog";
import type { AttributeKey, ImportBatch, Player } from "../types/domain";

export type FieldCoverage = {
  field: string;
  filled: number;
  total: number;
  ratio: number;
};

export type AttributeCoverage = {
  key: AttributeKey;
  label: string;
  filled: number;
  total: number;
  ratio: number;
};

export type DataQualityReport = {
  score: number;
  status: "empty" | "poor" | "partial" | "good";
  playerCount: number;
  sourceNames: string[];
  fieldCoverage: FieldCoverage[];
  attributeCoverage: AttributeCoverage[];
  averageAttributesPerPlayer: number;
  warnings: string[];
  recommendations: string[];
};

const REQUIRED_FIELDS = ["name", "position"] as const;
const IMPORTANT_FIELDS = ["age", "value", "wage", "condition", "sharpness", "averageRating"] as const;
const COACH_CONTEXT_FIELDS = ["height", "weight", "preferredFoot", "personality", "mediaHandling", "preferredMoves"] as const;
const CORE_ATTRIBUTES: AttributeKey[] = [
  "passing",
  "technique",
  "decisions",
  "workRate",
  "stamina",
  "pace",
  "acceleration",
  "tackling",
  "positioning",
  "finishing"
];

export function buildDataQualityReport(batch: ImportBatch | undefined): DataQualityReport {
  const players = batch?.players ?? [];
  const playerCount = players.length;

  if (playerCount === 0) {
    return {
      score: 0,
      status: "empty",
      playerCount: 0,
      sourceNames: batch?.sourceNames ?? [],
      fieldCoverage: [],
      attributeCoverage: [],
      averageAttributesPerPlayer: 0,
      warnings: ["선수단 export를 아직 읽지 못했습니다."],
      recommendations: ["파일명에 squad, team, roster, 선수단, 스쿼드 중 하나를 넣은 export를 폴더에 추가해 주세요."]
    };
  }

  const fieldCoverage = [...REQUIRED_FIELDS, ...IMPORTANT_FIELDS, ...COACH_CONTEXT_FIELDS].map((field) => coverageForField(players, field));
  const attributeCoverage = attributeCatalog.map((attribute) => ({
    key: attribute.key,
    label: attribute.label,
    ...coverageForAttribute(players, attribute.key)
  }));
  const averageAttributesPerPlayer = round(
    players.reduce((sum, player) => sum + Object.keys(player.attributes).length, 0) / playerCount
  );
  const warnings = buildWarnings(players, fieldCoverage, attributeCoverage, averageAttributesPerPlayer);
  const recommendations = buildRecommendations(fieldCoverage, attributeCoverage, averageAttributesPerPlayer);
  const score = scoreQuality(fieldCoverage, attributeCoverage, averageAttributesPerPlayer, warnings);

  return {
    score,
    status: score >= 82 ? "good" : score >= 55 ? "partial" : "poor",
    playerCount,
    sourceNames: batch?.sourceNames ?? [],
    fieldCoverage,
    attributeCoverage,
    averageAttributesPerPlayer,
    warnings,
    recommendations
  };
}

function coverageForField(players: Player[], field: keyof Player): FieldCoverage {
  const filled = players.filter((player) => {
    const value = player[field];
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (value && typeof value === "object") {
      return Object.keys(value).length > 0;
    }
    return value !== undefined && value !== null && value !== "";
  }).length;

  return {
    field,
    filled,
    total: players.length,
    ratio: players.length > 0 ? filled / players.length : 0
  };
}

function coverageForAttribute(players: Player[], key: AttributeKey): Pick<AttributeCoverage, "filled" | "total" | "ratio"> {
  const filled = players.filter((player) => typeof player.attributes[key] === "number").length;

  return {
    filled,
    total: players.length,
    ratio: players.length > 0 ? filled / players.length : 0
  };
}

function buildWarnings(
  players: Player[],
  fields: FieldCoverage[],
  attributes: AttributeCoverage[],
  averageAttributesPerPlayer: number
): string[] {
  const warnings: string[] = [];
  const duplicateNames = findDuplicateNames(players);

  for (const field of fields.filter((item) => REQUIRED_FIELDS.includes(item.field as (typeof REQUIRED_FIELDS)[number]) && item.ratio < 0.95)) {
    warnings.push(`${field.field} 컬럼이 ${percent(field.ratio)}만 채워졌습니다.`);
  }

  if (averageAttributesPerPlayer < 8) {
    warnings.push(`선수당 평균 능력치 수가 ${averageAttributesPerPlayer}개라 역할 판단이 불안정합니다.`);
  }

  const missingCore = attributes.filter((attribute) => CORE_ATTRIBUTES.includes(attribute.key) && attribute.ratio < 0.75);
  if (missingCore.length > 0) {
    warnings.push(`핵심 능력치 누락: ${missingCore.slice(0, 5).map((item) => item.label).join(", ")}`);
  }

  if (duplicateNames.length > 0) {
    warnings.push(`동명이인/중복 가능성: ${duplicateNames.slice(0, 5).join(", ")}`);
  }

  return warnings;
}

function buildRecommendations(
  fields: FieldCoverage[],
  attributes: AttributeCoverage[],
  averageAttributesPerPlayer: number
): string[] {
  const recommendations: string[] = [];
  const lowFields = fields.filter(
    (field) =>
      field.ratio < 0.6 &&
      field.field !== "wage" &&
      !COACH_CONTEXT_FIELDS.includes(field.field as (typeof COACH_CONTEXT_FIELDS)[number])
  );
  const missingCore = attributes.filter((attribute) => CORE_ATTRIBUTES.includes(attribute.key) && attribute.ratio < 0.75);

  if (lowFields.length > 0) {
    recommendations.push(`다음 컬럼을 squad view에 추가하면 좋아요: ${lowFields.map((field) => field.field).join(", ")}`);
  }

  if (missingCore.length > 0) {
    recommendations.push(`핵심 능력치 컬럼 추가 필요: ${missingCore.map((attribute) => attribute.label).join(", ")}`);
  }

  if (averageAttributesPerPlayer < 16) {
    recommendations.push("스쿼드 export에는 최소 16개 이상 주요 능력치를 포함하는 view를 권장합니다.");
  }

  const missingContext = fields.filter((field) => COACH_CONTEXT_FIELDS.includes(field.field as (typeof COACH_CONTEXT_FIELDS)[number]) && field.ratio < 0.6);
  if (missingContext.length > 0) {
    recommendations.push(`입체적인 역할 분석을 위해 추가하면 좋은 컬럼: ${missingContext.map((field) => field.field).join(", ")}`);
  }

  if (recommendations.length === 0) {
    recommendations.push("선수단 데이터 품질은 현재 분석에 충분합니다.");
  }

  return recommendations;
}

function scoreQuality(
  fields: FieldCoverage[],
  attributes: AttributeCoverage[],
  averageAttributesPerPlayer: number,
  warnings: string[]
): number {
  const requiredScore = average(fields.filter((field) => REQUIRED_FIELDS.includes(field.field as (typeof REQUIRED_FIELDS)[number])).map((field) => field.ratio)) * 35;
  const importantScore = average(fields.filter((field) => IMPORTANT_FIELDS.includes(field.field as (typeof IMPORTANT_FIELDS)[number])).map((field) => field.ratio)) * 15;
  const coreAttributeScore = average(attributes.filter((attribute) => CORE_ATTRIBUTES.includes(attribute.key)).map((attribute) => attribute.ratio)) * 35;
  const densityScore = Math.min(averageAttributesPerPlayer / 20, 1) * 15;
  const penalty = Math.min(warnings.length * 3, 15);

  return Math.max(0, Math.min(100, Math.round(requiredScore + importantScore + coreAttributeScore + densityScore - penalty)));
}

function findDuplicateNames(players: Player[]): string[] {
  const counts = new Map<string, number>();
  for (const player of players) {
    const key = player.name.toLowerCase().replace(/\s+/g, " ");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
