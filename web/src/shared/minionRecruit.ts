/** 인벤 카테고리·itemId 패턴으로 미니언 고용권 여부 */

export const MINION_RECRUIT_CATEGORY = "미니언고용권";

const RECRUIT_CATEGORY_ALIASES = new Set([
  MINION_RECRUIT_CATEGORY,
  "Minion_Ticket",
  "minion_ticket",
  "Ticket",
  "ticket",
]);

export function isMinionRecruitCategory(category: string | null | undefined) {
  const c = (category ?? "").trim();
  if (RECRUIT_CATEGORY_ALIASES.has(c)) return true;
  return c.toLowerCase() === "minion_ticket";
}

export function isMinionRecruitItemId(itemId: string) {
  return itemId.trim().toLowerCase() === "item_minion_ticket";
}

export type MinionHatchResult = {
  minion: {
    id: string;
    level: number;
    jobType: string;
  };
  recruit: {
    itemId: string;
    minionKind: string;
    ticketNameKo?: string;
  };
  consumedItemId: string;
  icon?: string | null;
  iconSrc?: string;
};

export const MINION_RECRUITED_EVENT = "minion_recruited";

export type MinionRecruitedDetail = {
  minionId: string;
  jobType: string;
};

export function dispatchMinionRecruited(detail: MinionRecruitedDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MINION_RECRUITED_EVENT, { detail }));
}

export function minionKindLabel(kind: string) {
  const k = kind.trim().toUpperCase();
  if (k === "DUNGEON") return "던전";
  if (k === "GATHER") return "수집";
  return kind;
}
