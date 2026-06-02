import { attributeLabel } from "./attributeCatalog";
import { roleDefinitions } from "./roleDefinitions";
import type { AttributeKey, Player, PositionGroup, RoleDefinition, RoleFamily, RoleFit } from "../types/domain";

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

export function positionGroup(position: string): PositionGroup {
  return positionGroups(position)[0] ?? "unknown";
}

export function positionGroups(position: string): PositionGroup[] {
  const value = normalizePositionText(position);
  const groups = new Set<Exclude<PositionGroup, "unknown">>();

  if (matchesAny(value, [/\bGK\b/])) groups.add("goalkeeper");
  if (matchesAny(value, [/\bD\s*C\b/, /\bDC\b/, /\bCB\b/])) groups.add("centerBack");
  if (matchesAny(value, [/\bD\s*L\b/, /\bDL\b/, /\bFB\s*L\b/, /\bFBL\b/, /\bWB\s*L\b/, /\bWBL\b/])) groups.add("leftBack");
  if (matchesAny(value, [/\bD\s*R\b/, /\bDR\b/, /\bFB\s*R\b/, /\bFBR\b/, /\bWB\s*R\b/, /\bWBR\b/])) groups.add("rightBack");
  if (matchesAny(value, [/\bDM\b/, /\bM\s*C\b/, /\bMC\b/, /\bAM\s*[CLR]\b/, /\bAM[CLR]\b/])) groups.add("midfielder");
  if (matchesAny(value, [/\bM\s*L\b/, /\bML\b/, /\bW\s*L\b/, /\bWL\b/])) groups.add("leftWing");
  if (matchesAny(value, [/\bM\s*R\b/, /\bMR\b/, /\bW\s*R\b/, /\bWR\b/])) groups.add("rightWing");
  if (matchesAny(value, [/\bST\b/, /\bS\s*C\b/, /\bSC\b/])) groups.add("attacker");

  return groups.size > 0 ? [...groups] : ["unknown"];
}

export function positionCoversRoleFamily(position: string, family: RoleFamily): boolean {
  return positionGroups(position).some((group) => roleFamilyCoversPositionGroup(family, group));
}

export function roleFamilyCoversPositionGroup(family: RoleFamily, group: PositionGroup): boolean {
  if (family === "sideBack") {
    return group === "leftBack" || group === "rightBack";
  }
  if (family === "wing") {
    return group === "leftWing" || group === "rightWing";
  }
  return family === group;
}

function matchesPosition(playerPosition: string, rolePositions: string[]): boolean {
  const value = normalizePosition(playerPosition);
  return rolePositions.some((position) => value.includes(normalizePosition(position)));
}

function normalizePosition(value: string): string {
  return value.toUpperCase().replace(/[()]/g, "").replace(/\s+/g, " ").trim();
}

function normalizePositionText(value: string): string {
  return value
    .toUpperCase()
    .replace(/[(),/|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
