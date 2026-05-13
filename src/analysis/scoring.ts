import { attributeLabel } from "./attributeCatalog";
import { roleDefinitions } from "./roleDefinitions";
import type { AttributeKey, Player, RoleDefinition, RoleFit } from "../types/domain";

export function scorePlayerForRole(player: Player, role: RoleDefinition): RoleFit {
  const entries = Object.entries(role.weights) as Array<[AttributeKey, number]>;
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const weighted = entries.reduce((sum, [key, weight]) => {
    const value = player.attributes[key] ?? 8;
    return sum + value * weight;
  }, 0);

  const score = totalWeight > 0 ? weighted / totalWeight : 0;
  const sorted = entries
    .map(([key, weight]) => ({ key, weight, value: player.attributes[key] ?? 0 }))
    .sort((a, b) => b.weight - a.weight);

  const strengths = sorted
    .filter((item) => item.value >= 14)
    .slice(0, 3)
    .map((item) => `${attributeLabel(item.key)} ${item.value}`);

  const gaps = sorted
    .filter((item) => item.value > 0 && item.value <= 10)
    .slice(0, 3)
    .map((item) => `${attributeLabel(item.key)} ${item.value}`);

  return {
    roleId: role.id,
    roleName: role.name,
    score: round(score),
    family: role.family,
    matchedPosition: matchesPosition(player.position, role.positions),
    strengths,
    gaps
  };
}

export function topFits(player: Player, limit = 3): RoleFit[] {
  return roleDefinitions
    .map((role) => scorePlayerForRole(player, role))
    .sort((a, b) => {
      const positionDelta = Number(b.matchedPosition) - Number(a.matchedPosition);
      return positionDelta || b.score - a.score;
    })
    .slice(0, limit);
}

export function squadAverage(players: Player[], keys: AttributeKey[]): number {
  const values = players.flatMap((player) => keys.map((key) => player.attributes[key]).filter(Boolean) as number[]);
  if (values.length === 0) {
    return 0;
  }

  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function positionGroup(position: string): "goalkeeper" | "defender" | "midfielder" | "wide" | "attacker" | "unknown" {
  const value = position.toUpperCase();
  if (value.includes("GK")) return "goalkeeper";
  if (value.includes("ST") || value.includes("SC")) return "attacker";
  if (value.includes("AM L") || value.includes("AM R") || value.includes("AML") || value.includes("AMR") || value.includes("WB") || value.includes("D L") || value.includes("D R") || value.includes("ML") || value.includes("MR")) return "wide";
  if (value.includes("D C") || value.includes("DC") || value.includes("CB")) return "defender";
  if (value.includes("DM") || value.includes("M C") || value.includes("MC") || value.includes("AM C") || value.includes("AMC")) return "midfielder";
  return "unknown";
}

function matchesPosition(playerPosition: string, rolePositions: string[]): boolean {
  const value = normalizePosition(playerPosition);
  return rolePositions.some((position) => value.includes(normalizePosition(position)));
}

function normalizePosition(value: string): string {
  return value.toUpperCase().replace(/[()]/g, "").replace(/\s+/g, " ").trim();
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
