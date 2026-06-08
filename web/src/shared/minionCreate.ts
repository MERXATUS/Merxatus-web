/** 부캐(추가 캐릭터) 생성에 필요한 기존 캐릭터 최소 레벨 */
export const MINION_ALT_CREATE_LEVEL = 100;

/** 생성 픽 토큰용 가상 itemId (인벤 소모 없음) */
export const MINION_CREATE_PICK_ITEM_ID = "__minion_create__";

export const MINION_CREATE_CANDIDATE_COUNT = 3;

export type MinionCreateEligibility = {
  canCreate: boolean;
  minionCount: number;
  maxOwned: number;
  highestLevel: number;
  requiredLevel: number;
  isFirstSlot: boolean;
  error?: string;
};

export type MinionCreateCandidate = {
  candidateIndex: number;
  labelKo: string;
  baseStats: {
    strength: number;
    agility: number;
    intelligence: number;
    endurance: number;
  };
};

export function minionCreateBlockedMessage(eligibility: MinionCreateEligibility): string {
  if (eligibility.canCreate) return "";
  if (eligibility.error === "MAX_DUNGEON_MINION_OWNED") {
    return `미니언 보유 한도(${eligibility.maxOwned}명)에 도달했어요.`;
  }
  if (eligibility.error === "MINION_CREATE_LEVEL_REQUIRED") {
    return `추가 캐릭터는 기존 캐릭터가 Lv${eligibility.requiredLevel} 이상이어야 생성할 수 있어요. (현재 최고 Lv${eligibility.highestLevel})`;
  }
  return "지금은 캐릭터를 생성할 수 없어요.";
}
