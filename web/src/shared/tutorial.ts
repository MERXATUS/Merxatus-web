/** 튜토리얼 완료 표시값 (`User.tutorialStep`) */
export const TUTORIAL_DONE = 100;

export type TutorialStepId =
  | "gather_mine"
  | "gather_fishery"
  | "gather_explore"
  | "gather_archaeology"
  | "visit_market"
  | "choose_specialist";

export type TutorialStepDef = {
  id: TutorialStepId;
  title: string;
  hint: string;
  /** 수집 시설 이름 (수령 또는 방문으로 완료) */
  gatherWorkshopName?: string;
  /** true면 수령 API로만 완료, false면 시설 선택(방문)으로도 완료 */
  gatherRequiresCollect?: boolean;
  action?: { kind: "panel"; panel: "gather" } | { kind: "route"; path: string };
  specialistHint?: string;
};

export const TUTORIAL_STEPS: TutorialStepDef[] = [
  {
    id: "gather_mine",
    title: "광산에서 수령",
    hint: "수집 → 광산 → 튜토리얼 광부 미니언을 배치한 뒤 「수령」. 완료하면 낚시꾼을 받아요.",
    gatherWorkshopName: "광산",
    gatherRequiresCollect: true,
    action: { kind: "panel", panel: "gather" },
    specialistHint: "대장장이",
  },
  {
    id: "gather_fishery",
    title: "낚시터에서 수령",
    hint: "1단계 보상 낚시꾼을 낚시터에 배치하고 「수령」해 보세요. 연금술사와 잘 맞아요.",
    gatherWorkshopName: "낚시터",
    gatherRequiresCollect: true,
    action: { kind: "panel", panel: "gather" },
    specialistHint: "연금술사",
  },
  {
    id: "gather_explore",
    title: "탐험 시설 방문",
    hint: "탐험 시설을 열어 보세요. (미니언 배치까지 하면 충분해요)",
    gatherWorkshopName: "탐험",
    gatherRequiresCollect: false,
    action: { kind: "panel", panel: "gather" },
    specialistHint: "연금술사",
  },
  {
    id: "gather_archaeology",
    title: "고고학 시설 방문",
    hint: "고고학 시설을 열어 보세요. 고고학자는 세공사와 잘 맞아요.",
    gatherWorkshopName: "고고학",
    gatherRequiresCollect: false,
    action: { kind: "panel", panel: "gather" },
    specialistHint: "세공사",
  },
  {
    id: "visit_market",
    title: "거래소 둘러보기",
    hint: "거래소 화면까지 들어가 보세요. 구매·판매는 나중에 천천히.",
    action: { kind: "route", path: "/market" },
  },
  {
    id: "choose_specialist",
    title: "전문 직업 선택",
    hint: "대장장이 · 연금술사 · 세공사 중 하나를 고릅니다. 이후에는 해당 가공 시설을 쓸 수 있어요.",
  },
];

export const GATHER_TUTORIAL_WORKSHOPS = ["광산", "낚시터", "탐험", "고고학"] as const;

export function tutorialStepIndex(step: number): number {
  if (step >= TUTORIAL_DONE) return -1;
  return Math.max(0, Math.min(step, TUTORIAL_STEPS.length - 1));
}

export function tutorialCurrentStep(step: number): TutorialStepDef | null {
  const idx = tutorialStepIndex(step);
  if (idx < 0) return null;
  return TUTORIAL_STEPS[idx] ?? null;
}

export function tutorialIsDone(step: number) {
  return step >= TUTORIAL_DONE;
}

export function tutorialProgressPercent(step: number) {
  if (tutorialIsDone(step)) return 100;
  return Math.round((step / TUTORIAL_STEPS.length) * 100);
}
