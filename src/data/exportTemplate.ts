import type { AttributeKey } from "../types/domain";

export type ExportTemplateGroup = {
  id: string;
  label: string;
  description: string;
  columns: string[];
};

const attributeLabels: Record<AttributeKey, string> = {
  corners: "Corners",
  crossing: "Crossing",
  dribbling: "Dribbling",
  finishing: "Finishing",
  firstTouch: "First Touch",
  freeKickTaking: "Free Kick Taking",
  heading: "Heading",
  longShots: "Long Shots",
  longThrows: "Long Throws",
  marking: "Marking",
  passing: "Passing",
  penaltyTaking: "Penalty Taking",
  tackling: "Tackling",
  technique: "Technique",
  aggression: "Aggression",
  anticipation: "Anticipation",
  bravery: "Bravery",
  composure: "Composure",
  concentration: "Concentration",
  decisions: "Decisions",
  determination: "Determination",
  flair: "Flair",
  leadership: "Leadership",
  offTheBall: "Off The Ball",
  positioning: "Positioning",
  teamwork: "Teamwork",
  vision: "Vision",
  workRate: "Work Rate",
  acceleration: "Acceleration",
  agility: "Agility",
  balance: "Balance",
  jumpingReach: "Jumping Reach",
  naturalFitness: "Natural Fitness",
  pace: "Pace",
  stamina: "Stamina",
  strength: "Strength"
};

const technicalAttributes: AttributeKey[] = [
  "corners",
  "crossing",
  "dribbling",
  "finishing",
  "firstTouch",
  "freeKickTaking",
  "heading",
  "longShots",
  "longThrows",
  "marking",
  "passing",
  "penaltyTaking",
  "tackling",
  "technique"
];

const mentalAttributes: AttributeKey[] = [
  "aggression",
  "anticipation",
  "bravery",
  "composure",
  "concentration",
  "decisions",
  "determination",
  "flair",
  "leadership",
  "offTheBall",
  "positioning",
  "teamwork",
  "vision",
  "workRate"
];

const physicalAttributes: AttributeKey[] = [
  "acceleration",
  "agility",
  "balance",
  "jumpingReach",
  "naturalFitness",
  "pace",
  "stamina",
  "strength"
];

const profileColumns = [
  "Name",
  "Position",
  "Age",
  "Height",
  "Weight",
  "Preferred Foot",
  "Personality",
  "Media Handling",
  "Player Traits",
  "Condition",
  "Match Sharpness",
  "Average Rating"
];

const hiddenColumns = [
  "Adaptability",
  "Ambition",
  "Consistency",
  "Important Matches",
  "Injury Proneness",
  "Pressure",
  "Professionalism",
  "Temperament",
  "Versatility"
];

export const exportTemplateGroups: ExportTemplateGroup[] = [
  {
    id: "profile",
    label: "선수 프로필",
    description: "역할 판단에 필요한 신체/주발/성격/선플 영역입니다.",
    columns: profileColumns
  },
  {
    id: "technical",
    label: "기술적 능력",
    description: "FM 선수 프로필의 Technical 영역입니다.",
    columns: technicalAttributes.map((key) => attributeLabels[key])
  },
  {
    id: "mental",
    label: "정신적 능력",
    description: "FM 선수 프로필의 Mental 영역입니다.",
    columns: mentalAttributes.map((key) => attributeLabels[key])
  },
  {
    id: "physical",
    label: "신체적 능력",
    description: "FM 선수 프로필의 Physical 영역입니다.",
    columns: physicalAttributes.map((key) => attributeLabels[key])
  },
  {
    id: "hidden",
    label: "히든/성향",
    description: "보이는 export나 외부 도구에서 얻을 수 있을 때만 사용합니다.",
    columns: hiddenColumns
  }
];

export const exportTemplateColumns = exportTemplateGroups.flatMap((group) => group.columns);
