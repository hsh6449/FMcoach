import { attributeFromHeader, normalizeHeader } from "../analysis/attributeCatalog";
import type { AttributeMap, ImportBatch, Player } from "../types/domain";

type Row = Record<string, string>;

const FIELD_ALIASES: Record<string, string[]> = {
  name: ["name", "player", "선수", "이름"],
  position: ["position", "positions", "pos", "best pos", "최적 포지션", "포지션"],
  age: ["age", "나이"],
  club: ["club", "team", "구단", "팀"],
  nationality: ["nationality", "nat", "nation", "국적"],
  value: ["value", "transfer value", "market value", "가치"],
  wage: ["wage", "salary", "주급"],
  personality: ["personality", "성격"],
  morale: ["morale", "사기"],
  condition: ["condition", "con", "fitness", "체력", "컨디션"],
  sharpness: ["match sharpness", "sharpness", "sha", "경기 감각"],
  appearances: ["apps", "appearances", "app", "출장"],
  goals: ["goals", "gls", "골"],
  assists: ["assists", "ast", "도움"],
  minutes: ["minutes", "mins", "min", "출장 시간"],
  averageRating: ["average rating", "avg rating", "av rat", "rating", "평점"]
};

const aliasLookup = new Map<string, keyof Omit<Player, "id" | "attributes" | "raw">>();

for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
  for (const alias of aliases) {
    aliasLookup.set(normalizeHeader(alias), field as keyof Omit<Player, "id" | "attributes" | "raw">);
  }
}

export async function parseFiles(files: File[]): Promise<ImportBatch> {
  const batches = await Promise.all(files.map((file) => parseFile(file)));
  const players = dedupePlayers(batches.flatMap((batch) => batch.players));

  return {
    importedAt: new Date().toISOString(),
    sourceNames: files.map((file) => file.name),
    players,
    warnings: batches.flatMap((batch) => batch.warnings)
  };
}

async function parseFile(file: File): Promise<ImportBatch> {
  const text = await file.text();
  const rows = file.name.toLowerCase().endsWith(".html") || text.includes("<table")
    ? parseHtmlRows(text)
    : parseTextRows(text);

  const players = rows.map(rowToPlayer).filter((player): player is Player => Boolean(player));
  const warnings: string[] = [];

  if (rows.length === 0) {
    warnings.push(`${file.name}: 테이블을 찾지 못했습니다.`);
  }

  if (rows.length > 0 && players.length === 0) {
    warnings.push(`${file.name}: 선수 이름 컬럼을 찾지 못했습니다.`);
  }

  return {
    importedAt: new Date().toISOString(),
    sourceNames: [file.name],
    players,
    warnings
  };
}

function parseHtmlRows(text: string): Row[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");
  const tables = [...doc.querySelectorAll("table")];
  const rows: Row[] = [];

  for (const table of tables) {
    const tableRows = [...table.querySelectorAll("tr")].map((tr) =>
      [...tr.children].map((cell) => cleanCell(cell.textContent ?? ""))
    );
    rows.push(...matrixToRows(tableRows));
  }

  return rows;
}

function parseTextRows(text: string): Row[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const delimiter = detectDelimiter(lines[0]);
  const tableRows = lines.map((line) => line.split(delimiter).map(cleanCell));
  return matrixToRows(tableRows);
}

function matrixToRows(tableRows: string[][]): Row[] {
  const headerIndex = tableRows.findIndex((row) => row.some((cell) => resolveField(cell) === "name"));
  if (headerIndex < 0) {
    return [];
  }

  const headers = tableRows[headerIndex].map(cleanHeader);
  return tableRows
    .slice(headerIndex + 1)
    .filter((row) => row.some(Boolean))
    .map((row) => {
      const item: Row = {};
      headers.forEach((header, index) => {
        if (header) {
          item[header] = cleanCell(row[index] ?? "");
        }
      });
      return item;
    });
}

function rowToPlayer(row: Row): Player | undefined {
  const normalized: Partial<Player> = {};
  const attributes: AttributeMap = {};

  for (const [header, value] of Object.entries(row)) {
    const attr = attributeFromHeader(header);
    if (attr) {
      const score = parseNumber(value);
      if (score !== undefined) {
        attributes[attr.key] = clamp(score, 1, 20);
      }
      continue;
    }

    const field = resolveField(header);
    if (!field || value === "") {
      continue;
    }

    if (["age", "condition", "sharpness", "appearances", "goals", "assists", "minutes", "averageRating"].includes(field)) {
      const numberValue = parseNumber(value);
      if (numberValue !== undefined) {
        (normalized as Record<string, number>)[field] = numberValue;
      }
    } else {
      (normalized as Record<string, string>)[field] = value;
    }
  }

  if (!normalized.name) {
    return undefined;
  }

  return {
    id: slug(`${normalized.name}-${normalized.position ?? ""}-${normalized.age ?? ""}`),
    name: normalized.name,
    position: normalized.position ?? "",
    age: normalized.age,
    club: normalized.club,
    nationality: normalized.nationality,
    value: normalized.value,
    wage: normalized.wage,
    personality: normalized.personality,
    morale: normalized.morale,
    condition: normalized.condition,
    sharpness: normalized.sharpness,
    appearances: normalized.appearances,
    goals: normalized.goals,
    assists: normalized.assists,
    minutes: normalized.minutes,
    averageRating: normalized.averageRating,
    attributes,
    raw: row
  };
}

function resolveField(header: string) {
  return aliasLookup.get(normalizeHeader(header));
}

function cleanHeader(value: string): string {
  return cleanCell(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCell(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectDelimiter(header: string): RegExp | string {
  if (header.includes("\t")) {
    return "\t";
  }

  if (header.includes(";")) {
    return ";";
  }

  return /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
}

function parseNumber(value: string): number | undefined {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return undefined;
  }

  return Number(match[0]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-|-$/g, "");
}

function dedupePlayers(players: Player[]): Player[] {
  const byId = new Map<string, Player>();
  for (const player of players) {
    const previous = byId.get(player.id);
    if (!previous) {
      byId.set(player.id, player);
      continue;
    }

    byId.set(player.id, {
      ...previous,
      ...player,
      attributes: { ...previous.attributes, ...player.attributes },
      raw: { ...previous.raw, ...player.raw }
    });
  }

  return [...byId.values()];
}
