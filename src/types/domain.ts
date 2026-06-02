export type AttributeKey =
  | "corners"
  | "crossing"
  | "dribbling"
  | "finishing"
  | "firstTouch"
  | "freeKickTaking"
  | "heading"
  | "longShots"
  | "longThrows"
  | "marking"
  | "passing"
  | "penaltyTaking"
  | "tackling"
  | "technique"
  | "aggression"
  | "anticipation"
  | "bravery"
  | "composure"
  | "concentration"
  | "decisions"
  | "determination"
  | "flair"
  | "leadership"
  | "offTheBall"
  | "positioning"
  | "teamwork"
  | "vision"
  | "workRate"
  | "acceleration"
  | "agility"
  | "balance"
  | "jumpingReach"
  | "naturalFitness"
  | "pace"
  | "stamina"
  | "strength";

export type AttributeMap = Partial<Record<AttributeKey, number>>;

export type Player = {
  id: string;
  name: string;
  position: string;
  age?: number;
  club?: string;
  nationality?: string;
  value?: string;
  wage?: string;
  personality?: string;
  morale?: string;
  condition?: number;
  sharpness?: number;
  appearances?: number;
  goals?: number;
  assists?: number;
  minutes?: number;
  averageRating?: number;
  attributes: AttributeMap;
  raw: Record<string, string>;
};

export type ImportBatch = {
  importedAt: string;
  sourceNames: string[];
  players: Player[];
  warnings: string[];
};

export type RoleFamily = "goalkeeper" | "centerBack" | "sideBack" | "midfielder" | "wing" | "attacker";

export type PositionGroup =
  | "goalkeeper"
  | "centerBack"
  | "leftBack"
  | "rightBack"
  | "midfielder"
  | "leftWing"
  | "rightWing"
  | "attacker"
  | "unknown";

export type RoleDefinition = {
  id: string;
  name: string;
  family: RoleFamily;
  positions: string[];
  weights: Partial<Record<AttributeKey, number>>;
};

export type RoleFit = {
  roleId: string;
  roleName: string;
  score: number;
  family: RoleDefinition["family"];
  matchedPosition: boolean;
  strengths: string[];
  gaps: string[];
};

export type SquadNeed = {
  area: string;
  severity: "low" | "medium" | "high";
  reason: string;
};

export type CoachReport = {
  bestXi: Player[];
  topRoleFits: Array<{ player: Player; fits: RoleFit[] }>;
  needs: SquadNeed[];
  training: Array<{ player: Player; focus: string; reason: string }>;
  transferPriorities: SquadNeed[];
  tacticalNotes: string[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};
