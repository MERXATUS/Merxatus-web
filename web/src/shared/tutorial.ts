import type { GameTabKey } from "@/shared/gameNav";
import type { ShopSubTab } from "@/shared/shopSubTab";

/** 튜토리얼 완료 표시값 (`User.tutorialStep`) */
export const TUTORIAL_DONE = 100;

export type TutorialStepId = "gacha_pull" | "enhance_equipment" | "sell_equipment";

export type TutorialStepAction =
  | { kind: "tab"; tab: Extract<GameTabKey, "shop" | "enhance">; shopSub?: ShopSubTab };

export type TutorialStepDef = {
  id: TutorialStepId;
  title: string;
  hint: string;
  action?: TutorialStepAction;
};

export const TUTORIAL_STEPS: TutorialStepDef[] = [
  {
    id: "gacha_pull",
    title: "골드로 장비 뽑기",
    hint: "상점 → 장비 → 입문 상자에서 「1회 뽑기」만 먼저 하세요. 재료 상자는 강화 후에 뽑아도 됩니다.",
    action: { kind: "tab", tab: "shop", shopSub: "equipment_pull" },
  },
  {
    id: "enhance_equipment",
    title: "장비 강화하기",
    hint: "대장간 → 강화에서 장비를 고르고 「강화하기」를 눌러 보세요. 골드만으로도 강화할 수 있고, 마석은 성공률을 올리는 선택 재료예요.",
    action: { kind: "tab", tab: "enhance" },
  },
  {
    id: "sell_equipment",
    title: "장비 판매하기",
    hint: "상점 → 장비 매입에서 +1 강화한 장비를 팔아 보세요. 강화 단계가 높을수록 매입가가 크게 오릅니다.",
    action: { kind: "tab", tab: "shop", shopSub: "equipment" },
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

/** 예전 5단계+ 튜토리얼 → 현재 3단계(0~2)로 보정. 0~2는 그대로 둔다. */
export function migrateLegacyTutorialStep(step: number): number {
  if (step >= TUTORIAL_DONE) return step;
  if (step <= 0) return 0;
  // 신규 3단계: 0=뽑기, 1=강화, 2=매입
  if (step < TUTORIAL_STEPS.length) return step;
  // 레거시 3~4 → 매입, 5+ → 완료
  if (step === 3 || step === 4) return 2;
  if (step >= 5) return TUTORIAL_DONE;
  return TUTORIAL_STEPS.length - 1;
}
