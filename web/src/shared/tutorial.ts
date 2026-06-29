/** 튜토리얼 완료 표시값 (`User.tutorialStep`) */
export const TUTORIAL_DONE = 100;

export type TutorialStepId = "dungeon_first_cashout" | "list_on_market" | "visit_market";

export type TutorialStepDef = {
  id: TutorialStepId;
  title: string;
  hint: string;
  action?: { kind: "panel"; panel: "dungeon" } | { kind: "route"; path: string };
};

export const TUTORIAL_STEPS: TutorialStepDef[] = [
  {
    id: "dungeon_first_cashout",
    title: "던전 첫 정산",
    hint: "던전 → 방치 탐험 → 「방치 시작」 후 「보상 수확」으로 재료·골드를 받아 보세요.",
    action: { kind: "panel", panel: "dungeon" },
  },
  {
    id: "list_on_market",
    title: "거래소에 올리기",
    hint: "던전·무탑·레이드에서 얻은 재료나 무기를 거래소 판매 탭에서 등록해 보세요.",
    action: { kind: "route", path: "/market?tab=sell" },
  },
  {
    id: "visit_market",
    title: "거래소 둘러보기",
    hint: "다른 매물과 시세를 확인해 보세요.",
    action: { kind: "route", path: "/market" },
  },
];

/** @deprecated 수집 UI 제거 — 레거시 호환 */
export const GATHER_TUTORIAL_WORKSHOPS: readonly string[] = [];

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

/** 예전 단계(수집·전문직·제작) → 던전·거래 3단계로 보정 */
export function migrateLegacyTutorialStep(step: number): number {
  if (step >= TUTORIAL_DONE) return step;
  if (step <= 0) return 0;
  if (step === 1 || step === 2) return 1;
  if (step === 3 || step === 4) return 2;
  if (step >= 5) return TUTORIAL_DONE;
  return Math.min(step, TUTORIAL_STEPS.length - 1);
}
