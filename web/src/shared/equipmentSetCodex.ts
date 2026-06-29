import { normalizeItemIdLower } from "@/shared/itemId";
import { EQUIPMENT_SETS, type EquipmentSetDef } from "@/shared/equipmentSets";
import { EQUIPMENT_CODEX_MILESTONES, CODEX_MILESTONE_BASE_ID } from "@/shared/equipmentCodexMilestones";

/** 세트 도감 전투력 합산 상한 */
export const SET_CODEX_MAX_BONUS_POWER = 100;

export type SetCodexBuffSlice = {
  bonusPower: number;
  bonusAtkMilli: number;
  bonusMagicMilli: number;
  bonusHpMilli: number;
  bonusDefMilli: number;
};

export type SetCodexTierDef = {
  id: string;
  label: string;
  description: string;
  /** 세트 내 등록 슬롯 대비 최소 비율 (0~1) */
  minCompletionRatio: number;
  /** 종류별 기본 등록이 모두 되어 있어야 함 */
  requireAllBase?: boolean;
  buffScale: number;
};

export const SET_CODEX_TIERS: SetCodexTierDef[] = [
  {
    id: "set_base",
    label: "세트 입문",
    description: "세트 구성품 기본 등록 완료",
    minCompletionRatio: 0,
    requireAllBase: true,
    buffScale: 1,
  },
  {
    id: "set_adept",
    label: "세트 숙련",
    description: "세트 도감 35% 이상",
    minCompletionRatio: 0.35,
    buffScale: 1.4,
  },
  {
    id: "set_expert",
    label: "세트 달인",
    description: "세트 도감 60% 이상",
    minCompletionRatio: 0.6,
    buffScale: 2,
  },
  {
    id: "set_master",
    label: "세트 완성",
    description: "세트 도감 85% 이상",
    minCompletionRatio: 0.85,
    buffScale: 2.8,
  },
];

/** 세트 등급별 기본 보너스 (tier buffScale 1 기준) */
const SET_BASE_BUFF_BY_GRADE: Record<number, SetCodexBuffSlice> = {
  1: { bonusPower: 2, bonusAtkMilli: 150, bonusMagicMilli: 100, bonusHpMilli: 200, bonusDefMilli: 150 },
  2: { bonusPower: 4, bonusAtkMilli: 300, bonusMagicMilli: 200, bonusHpMilli: 400, bonusDefMilli: 300 },
  3: { bonusPower: 6, bonusAtkMilli: 500, bonusMagicMilli: 350, bonusHpMilli: 700, bonusDefMilli: 500 },
  4: { bonusPower: 9, bonusAtkMilli: 750, bonusMagicMilli: 500, bonusHpMilli: 1000, bonusDefMilli: 750 },
  5: { bonusPower: 12, bonusAtkMilli: 1000, bonusMagicMilli: 700, bonusHpMilli: 1400, bonusDefMilli: 1000 },
};

export type SetCodexProgress = {
  registeredSlots: number;
  totalSlots: number;
  completionPct: number;
  allBaseRegistered: boolean;
};

export function codexRegisteredKey(baseItemId: string, milestoneId: string): string {
  return `${normalizeItemIdLower(baseItemId)}:${milestoneId}`;
}

export function buildCodexRegisteredKeySet(
  entries: Array<{ baseItemId: string; milestoneId: string }>,
): Set<string> {
  return new Set(entries.map((e) => codexRegisteredKey(e.baseItemId, e.milestoneId)));
}

export function setCodexItemIds(set: EquipmentSetDef): string[] {
  return [...set.weaponIds, ...set.armorItemIds].map((id) => normalizeItemIdLower(id));
}

export function computeSetCodexProgress(
  set: EquipmentSetDef,
  registeredKeys: Set<string>,
): SetCodexProgress {
  const itemIds = setCodexItemIds(set);
  const milestonesPerItem = EQUIPMENT_CODEX_MILESTONES.length;
  const totalSlots = itemIds.length * milestonesPerItem;
  if (totalSlots <= 0) {
    return { registeredSlots: 0, totalSlots: 0, completionPct: 0, allBaseRegistered: false };
  }
  let registeredSlots = 0;
  for (const itemId of itemIds) {
    for (const m of EQUIPMENT_CODEX_MILESTONES) {
      if (registeredKeys.has(codexRegisteredKey(itemId, m.id))) registeredSlots++;
    }
  }
  const allBaseRegistered = itemIds.every((id) =>
    registeredKeys.has(codexRegisteredKey(id, CODEX_MILESTONE_BASE_ID)),
  );
  return {
    registeredSlots,
    totalSlots,
    completionPct: Math.round((registeredSlots / totalSlots) * 1000) / 10,
    allBaseRegistered,
  };
}

function scaleSetBuff(base: SetCodexBuffSlice, scale: number): SetCodexBuffSlice {
  const s = Math.max(0, scale);
  return {
    bonusPower: Math.max(0, Math.floor(base.bonusPower * s)),
    bonusAtkMilli: Math.max(0, Math.floor(base.bonusAtkMilli * s)),
    bonusMagicMilli: Math.max(0, Math.floor(base.bonusMagicMilli * s)),
    bonusHpMilli: Math.max(0, Math.floor(base.bonusHpMilli * s)),
    bonusDefMilli: Math.max(0, Math.floor(base.bonusDefMilli * s)),
  };
}

export function setCodexTierBuff(set: EquipmentSetDef, tier: SetCodexTierDef): SetCodexBuffSlice {
  const grade = Math.max(1, Math.min(5, Math.floor(set.grade)));
  const base = SET_BASE_BUFF_BY_GRADE[grade] ?? SET_BASE_BUFF_BY_GRADE[1];
  return scaleSetBuff(base, tier.buffScale);
}

export function isSetCodexTierUnlocked(
  set: EquipmentSetDef,
  registeredKeys: Set<string>,
  tier: SetCodexTierDef,
): boolean {
  const progress = computeSetCodexProgress(set, registeredKeys);
  if (progress.totalSlots <= 0) return false;
  if (tier.requireAllBase && !progress.allBaseRegistered) return false;
  const ratio = progress.registeredSlots / progress.totalSlots;
  return ratio >= tier.minCompletionRatio;
}

export function aggregateSetCodexBuffs(slices: SetCodexBuffSlice[]): SetCodexBuffSlice & {
  unlockedTierCount: number;
} {
  const out: SetCodexBuffSlice = {
    bonusPower: 0,
    bonusAtkMilli: 0,
    bonusMagicMilli: 0,
    bonusHpMilli: 0,
    bonusDefMilli: 0,
  };
  for (const s of slices) {
    out.bonusPower += s.bonusPower;
    out.bonusAtkMilli += s.bonusAtkMilli;
    out.bonusMagicMilli += s.bonusMagicMilli;
    out.bonusHpMilli += s.bonusHpMilli;
    out.bonusDefMilli += s.bonusDefMilli;
  }
  out.bonusPower = Math.min(SET_CODEX_MAX_BONUS_POWER, out.bonusPower);
  return { ...out, unlockedTierCount: slices.length };
}

export function codexEligibleSets(): EquipmentSetDef[] {
  return EQUIPMENT_SETS.filter((s) => setCodexItemIds(s).length > 0);
}

export function setCodexBuffLabel(totals: SetCodexBuffSlice): string {
  const parts: string[] = [];
  if (totals.bonusPower > 0) parts.push(`전투력 +${totals.bonusPower}`);
  if (totals.bonusAtkMilli > 0) parts.push(`ATK +${(totals.bonusAtkMilli / 1000).toFixed(1).replace(/\.0$/, "")}`);
  if (totals.bonusMagicMilli > 0) parts.push(`MAG +${(totals.bonusMagicMilli / 1000).toFixed(1).replace(/\.0$/, "")}`);
  if (totals.bonusHpMilli > 0) parts.push(`HP +${(totals.bonusHpMilli / 1000).toFixed(1).replace(/\.0$/, "")}`);
  if (totals.bonusDefMilli > 0) parts.push(`DEF +${(totals.bonusDefMilli / 1000).toFixed(1).replace(/\.0$/, "")}`);
  return parts.length ? parts.join(" · ") : "세트 보너스 없음";
}
