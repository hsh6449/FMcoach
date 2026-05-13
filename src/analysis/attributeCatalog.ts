import type { AttributeKey } from "../types/domain";

type AttributeInfo = {
  key: AttributeKey;
  label: string;
  aliases: string[];
};

export const attributeCatalog: AttributeInfo[] = [
  { key: "corners", label: "Corners", aliases: ["cor", "corners", "corner", "코너킥"] },
  { key: "crossing", label: "Crossing", aliases: ["cro", "crossing", "크로스"] },
  { key: "dribbling", label: "Dribbling", aliases: ["dri", "dribbling", "드리블"] },
  { key: "finishing", label: "Finishing", aliases: ["fin", "finishing", "골 결정력", "결정력"] },
  { key: "firstTouch", label: "First Touch", aliases: ["fir", "first touch", "firsttouch", "퍼스트 터치"] },
  { key: "freeKickTaking", label: "Free Kick Taking", aliases: ["fre", "free kick taking", "fk taking", "프리킥"] },
  { key: "heading", label: "Heading", aliases: ["hea", "heading", "헤딩"] },
  { key: "longShots", label: "Long Shots", aliases: ["lon", "long shots", "longshots", "중거리 슛"] },
  { key: "longThrows", label: "Long Throws", aliases: ["l th", "long throws", "longthrows", "장거리 스로인"] },
  { key: "marking", label: "Marking", aliases: ["mar", "marking", "마킹"] },
  { key: "passing", label: "Passing", aliases: ["pas", "passing", "패스"] },
  { key: "penaltyTaking", label: "Penalty Taking", aliases: ["pen", "penalty taking", "pk taking", "페널티킥"] },
  { key: "tackling", label: "Tackling", aliases: ["tck", "tackling", "태클"] },
  { key: "technique", label: "Technique", aliases: ["tec", "technique", "기술"] },
  { key: "aggression", label: "Aggression", aliases: ["agg", "aggression", "적극성"] },
  { key: "anticipation", label: "Anticipation", aliases: ["ant", "anticipation", "예측력"] },
  { key: "bravery", label: "Bravery", aliases: ["bra", "bravery", "용감성"] },
  { key: "composure", label: "Composure", aliases: ["cmp", "composure", "침착성"] },
  { key: "concentration", label: "Concentration", aliases: ["cnt", "concentration", "집중력"] },
  { key: "decisions", label: "Decisions", aliases: ["dec", "decisions", "판단력"] },
  { key: "determination", label: "Determination", aliases: ["det", "determination", "승부욕"] },
  { key: "flair", label: "Flair", aliases: ["fla", "flair", "천재성"] },
  { key: "leadership", label: "Leadership", aliases: ["ldr", "leadership", "리더십"] },
  { key: "offTheBall", label: "Off The Ball", aliases: ["otb", "off the ball", "offtheball", "공격 위치선정"] },
  { key: "positioning", label: "Positioning", aliases: ["pos", "positioning", "수비 위치선정"] },
  { key: "teamwork", label: "Teamwork", aliases: ["tea", "teamwork", "팀워크"] },
  { key: "vision", label: "Vision", aliases: ["vis", "vision", "시야"] },
  { key: "workRate", label: "Work Rate", aliases: ["wor", "work rate", "workrate", "활동량"] },
  { key: "acceleration", label: "Acceleration", aliases: ["acc", "acceleration", "순간 속도"] },
  { key: "agility", label: "Agility", aliases: ["agi", "agility", "민첩성"] },
  { key: "balance", label: "Balance", aliases: ["bal", "balance", "균형감각"] },
  { key: "jumpingReach", label: "Jumping Reach", aliases: ["jum", "jumping reach", "jumping", "점프 거리"] },
  { key: "naturalFitness", label: "Natural Fitness", aliases: ["nat", "natural fitness", "타고난 체력"] },
  { key: "pace", label: "Pace", aliases: ["pac", "pace", "주력"] },
  { key: "stamina", label: "Stamina", aliases: ["sta", "stamina", "지구력"] },
  { key: "strength", label: "Strength", aliases: ["str", "strength", "몸싸움"] }
];

const aliasLookup = new Map<string, AttributeInfo>();

for (const info of attributeCatalog) {
  aliasLookup.set(normalizeHeader(info.label), info);
  for (const alias of info.aliases) {
    aliasLookup.set(normalizeHeader(alias), info);
  }
}

export function normalizeHeader(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/\./g, "");
}

export function attributeFromHeader(header: string): AttributeInfo | undefined {
  return aliasLookup.get(normalizeHeader(header));
}

export function attributeLabel(key: AttributeKey): string {
  return attributeCatalog.find((item) => item.key === key)?.label ?? key;
}
