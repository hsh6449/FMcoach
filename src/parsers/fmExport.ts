import { attributeFromHeader, normalizeHeader } from "../analysis/attributeCatalog";
import type { AttributeMap, HiddenAttributeKey, HiddenAttributeMap, ImportBatch, Player } from "../types/domain";

type Row = Record<string, string>;
type PlayerField = keyof Omit<Player, "id" | "attributes" | "hiddenAttributes" | "raw">;

export const SUPPORTED_EXPORT_EXTENSIONS = [".html", ".htm", ".txt", ".csv"] as const;

const FIELD_ALIASES: Record<string, string[]> = {
  name: ["name", "player", "선수", "이름"],
  position: ["position", "positions", "pos", "best pos", "최적 포지션", "포지션"],
  age: ["age", "나이"],
  club: ["club", "team", "구단", "팀"],
  nationality: ["nationality", "nat", "nation", "국적"],
  height: ["height", "hei", "키"],
  weight: ["weight", "wei", "몸무게", "체중"],
  preferredFoot: ["preferred foot", "foot", "left foot", "right foot", "주발"],
  value: ["value", "transfer value", "market value", "가치"],
  wage: ["wage", "salary", "주급"],
  personality: ["personality", "성격"],
  mediaHandling: ["media handling", "media", "미디어 대처", "언론 대처"],
  morale: ["morale", "사기"],
  condition: ["condition", "con", "fitness", "체력", "컨디션"],
  sharpness: ["match sharpness", "sharpness", "sha", "경기 감각"],
  appearances: ["apps", "appearances", "app", "출장"],
  goals: ["goals", "gls", "골"],
  assists: ["assists", "ast", "도움"],
  minutes: ["minutes", "mins", "min", "출장 시간"],
  averageRating: ["average rating", "avg rating", "av rat", "rating", "평점"],
  preferredMoves: ["preferred moves", "player traits", "traits", "ppms", "ppm", "선호 플레이", "선플"]
};

const HIDDEN_ATTRIBUTE_ALIASES: Record<HiddenAttributeKey, string[]> = {
  adaptability: ["adaptability", "ada", "적응력"],
  ambition: ["ambition", "amb", "야망"],
  consistency: ["consistency", "cons", "일관성", "꾸준함"],
  controversy: ["controversy", "contro", "논쟁성"],
  dirtiness: ["dirtiness", "dirty", "반칙성"],
  importantMatches: ["important matches", "imp matches", "important match", "imp", "중요 경기"],
  injuryProneness: ["injury proneness", "injury prone", "inj proneness", "inj", "부상 빈도", "부상 경향"],
  loyalty: ["loyalty", "loy", "충성심"],
  pressure: ["pressure", "pres", "압박감 대처"],
  professionalism: ["professionalism", "prof", "프로의식"],
  sportsmanship: ["sportsmanship", "sports", "스포츠맨십"],
  temperament: ["temperament", "temp", "참을성", "기질"],
  versatility: ["versatility", "vers", "다재다능"]
};

const aliasLookup = new Map<string, PlayerField>();
const hiddenAttributeLookup = new Map<string, HiddenAttributeKey>();

for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
  for (const alias of aliases) {
    aliasLookup.set(normalizeHeader(alias), field as PlayerField);
  }
}

for (const [field, aliases] of Object.entries(HIDDEN_ATTRIBUTE_ALIASES) as Array<[HiddenAttributeKey, string[]]>) {
  for (const alias of aliases) {
    hiddenAttributeLookup.set(normalizeHeader(alias), field);
  }
}

export async function parseFiles(files: File[]): Promise<ImportBatch> {
  const sources = await Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() })));
  return parseExportBatch(sources);
}

export function parseExportBatch(sources: Array<{ name: string; text: string }>): ImportBatch {
  const batches = sources.map((source) => parseExportText(source.name, source.text));
  const players = dedupePlayers(batches.flatMap((batch) => batch.players));

  return {
    importedAt: new Date().toISOString(),
    sourceNames: sources.map((source) => source.name),
    players,
    warnings: batches.flatMap((batch) => batch.warnings)
  };
}

export function parseExportText(name: string, text: string): ImportBatch {
  const rows = name.toLowerCase().endsWith(".html") || name.toLowerCase().endsWith(".htm") || text.includes("<table")
    ? parseHtmlRows(text)
    : parseTextRows(text);

  const players = rows.map(rowToPlayer).filter((player): player is Player => Boolean(player));
  const warnings: string[] = [];

  if (rows.length === 0) {
    warnings.push(`${name}: 테이블을 찾지 못했습니다.`);
  }

  if (rows.length > 0 && players.length === 0) {
    warnings.push(`${name}: 선수 이름 컬럼을 찾지 못했습니다.`);
  }

  return {
    importedAt: new Date().toISOString(),
    sourceNames: [name],
    players,
    warnings
  };
}

function parseHtmlRows(text: string): Row[] {
  const tables = extractTagBlocks(text, "table");
  const rows: Row[] = [];

  for (const table of tables) {
    const tableRows = extractTagBlocks(table, "tr").map((tr) => {
      const headerCells = extractTagBlocks(tr, "th");
      const dataCells = extractTagBlocks(tr, "td");
      const cells = headerCells.length > 0 ? headerCells : dataCells;
      return cells.map((cell) => cleanCell(decodeHtml(stripTags(cell))));
    });
    rows.push(...matrixToRows(tableRows));
  }

  return rows.length > 0 ? rows : parseTextRows(stripTags(text));
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
  const hiddenAttributes: HiddenAttributeMap = {};

  for (const [header, value] of Object.entries(row)) {
    const attr = attributeFromHeader(header);
    if (attr) {
      const score = parseNumber(value);
      if (score !== undefined) {
        attributes[attr.key] = clamp(score, 1, 20);
      }
      continue;
    }

    const hiddenAttribute = resolveHiddenAttribute(header);
    if (hiddenAttribute) {
      const score = parseNumber(value);
      if (score !== undefined) {
        hiddenAttributes[hiddenAttribute] = clamp(score, 1, 20);
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
    } else if (field === "preferredMoves") {
      normalized.preferredMoves = parseList(value);
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
    height: normalized.height,
    weight: normalized.weight,
    preferredFoot: normalized.preferredFoot,
    value: normalized.value,
    wage: normalized.wage,
    personality: normalized.personality,
    mediaHandling: normalized.mediaHandling,
    morale: normalized.morale,
    condition: normalized.condition,
    sharpness: normalized.sharpness,
    appearances: normalized.appearances,
    goals: normalized.goals,
    assists: normalized.assists,
    minutes: normalized.minutes,
    averageRating: normalized.averageRating,
    preferredMoves: normalized.preferredMoves ?? [],
    hiddenAttributes,
    attributes,
    raw: row
  };
}

function resolveField(header: string) {
  return aliasLookup.get(normalizeHeader(header));
}

function resolveHiddenAttribute(header: string) {
  return hiddenAttributeLookup.get(normalizeHeader(header));
}

function parseList(value: string): string[] {
  return value
    .split(/\s*(?:;|\||\/|\u2022|\n)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);
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

function extractTagBlocks(text: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

function stripTags(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:td|th)>/gi, "\t")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\""
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
    }

    if (normalized.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
    }

    return named[normalized] ?? `&${entity};`;
  });
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
