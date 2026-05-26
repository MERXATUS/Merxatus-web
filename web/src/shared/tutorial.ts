/** 튜토리얼 완료 표시값 (`User.tutorialStep`) */
export const TUTORIAL_DONE = 100;

export type TutorialStepId =
  | "gather_mine"
  | "choose_specialist"
  | "first_craft"
  | "list_on_market"
  | "visit_market";

export type TutorialStepDef = {
  id: TutorialStepId;
  title: string;
  hint: string;
  /** 수집 시설 이름 (수령으로 완료) */
  gatherWorkshopName?: string;
  gatherRequiresCollect?: boolean;
  action?: { kind: "panel"; panel: "gather" | "specialist" } | { kind: "route"; path: string };
};

export const TUTORIAL_STEPS: TutorialStepDef[] = [
  {
    id: "gather_mine",
    title: "광산에서 한 번 수령",
    hint: "수집 → 광산 → 일꾼을 배치한 뒤 「수령」. 재료 공장 가동이에요.",
    gatherWorkshopName: "광산",
    gatherRequiresCollect: true,
    action: { kind: "panel", panel: "gather" },
  },
  {
    id: "choose_specialist",
    title: "전문 직업 선택",
    hint: "대장장이 · 연금술사 · 세공사 중 하나. 이후 해당 가공 시설을 쓸 수 있어요.",
  },
  {
    id: "first_craft",
    title: "첫 제작 완료",
    hint: "전문 작업장 → 레시피 하나를 끝까지 제작해 보세요.",
    action: { kind: "panel", panel: "specialist" },
  },
  {
    id: "list_on_market",
    title: "거래소에 올리기",
    hint: "만든 물건(또는 재료)을 거래소 판매 탭에서 등록해 보세요.",
    action: { kind: "route", path: "/market?tab=sell" },
  },
  {
    id: "visit_market",
    title: "거래소 둘러보기",
    hint: "다른 매물과 시세를 확인해 보세요.",
    action: { kind: "route", path: "/market" },
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

/** 예전 6단계(수집 4곳 + 거래소 + 전문직) → 5단계 흐름으로 보정 */
export function migrateLegacyTutorialStep(step: number): number {
  if (step >= TUTORIAL_DONE) return step;
  if (step === 2 || step === 3) return 1;
  if (step === 5) return 1;
  return step;
}
