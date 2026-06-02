import { attributeCatalog } from "../analysis/attributeCatalog";

export type ExportTemplateGroup = {
  id: string;
  label: string;
  description: string;
  columns: string[];
};

const identityColumns = ["Name", "Position", "Age", "Club", "Nation"];
const squadColumns = ["Value", "Wage", "Personality", "Morale"];
const conditionColumns = ["Condition", "Match Sharpness", "Apps", "Goals", "Assists", "Mins", "Av Rat"];
const attributeColumns = attributeCatalog.map((attribute) => attribute.label);

export const exportTemplateGroups: ExportTemplateGroup[] = [
  {
    id: "identity",
    label: "기본 정보",
    description: "선수 식별과 포지션 분류에 필요합니다.",
    columns: identityColumns
  },
  {
    id: "squad",
    label: "계약/선수단",
    description: "영입 우선순위와 장기 리스크 판단에 씁니다.",
    columns: squadColumns
  },
  {
    id: "condition",
    label: "상태/기록",
    description: "훈련, 기용, 로테이션 조언에 필요합니다.",
    columns: conditionColumns
  },
  {
    id: "attributes",
    label: "능력치",
    description: "역할 적합도와 전술 성향 분석의 핵심입니다.",
    columns: attributeColumns
  }
];

export const exportTemplateColumns = exportTemplateGroups.flatMap((group) => group.columns);
