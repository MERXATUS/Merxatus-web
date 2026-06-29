import { normalizeItemId } from "@/shared/itemId";
import { weaponEnhancePowerBonus, weaponBasePower } from "@/shared/weaponTooltip";
import { WEAPON_STATS_BY_ID, type WeaponStatRow } from "@/shared/weaponStatsData";
import {
  CODEX_MILESTONE_BASE_ID,
  codexMilestonesForPool,
  codexMilestoneDef,
  scaleCodexBuffSlice,
  type CodexMilestoneDef,
} from "@/shared/equipmentCodexMilestones";

/** 도감 등록 시 무기 스탯의 이 비율만큼 계정 버프 */
export const CODEX_BUFF_RATIO = 0.06;

/** 도감 전투력 버프 합산 상한 */
export const CODEX_MAX_TOTAL_BONUS_POWER = 200;

export type WeaponCodexBuffSlice = {
  bonusPower: number;
  bonusAtkMilli: number;
  bonusMagicMilli: number;
};

export type WeaponCodexMilestoneView = {
  milestoneId: string;
  label: string;
  description: string;
  registered: boolean;
  registeredEnhanceLevel: number;
  registeredQuality: number;
  registeredItemLevel: number;
  registeredAt: string | null;
  buff: WeaponCodexBuffSlice;
  previewBuff: WeaponCodexBuffSlice;
};

export type WeaponCodexEntryView = {
  baseItemId: string;
  name: string;
  grade: number;
  icon?: string;
  iconSrc?: string;
  milestones: WeaponCodexMilestoneView[];
  registeredMilestoneCount: number;
  totalMilestones: number;
  buff: WeaponCodexBuffSlice;
};

export type WeaponCodexTotals = WeaponCodexBuffSlice & {
  registeredCount: number;
  totalCount: number;
  completionPct: number;
};

export function codexWeaponCatalog(): Array<WeaponStatRow & { id: string }> {
  return Object.entries(WEAPON_STATS_BY_ID)
    .map(([id, row]) => ({ id, ...row }))
    .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, "ko"));
}

function statMilli(v: number): number {
  return Math.max(0, Math.round(v * 1000 * CODEX_BUFF_RATIO));
}

function zeroWeaponBuff(): WeaponCodexBuffSlice {
  return { bonusPower: 0, bonusAtkMilli: 0, bonusMagicMilli: 0 };
}

function addWeaponBuff(a: WeaponCodexBuffSlice, b: WeaponCodexBuffSlice): WeaponCodexBuffSlice {
  return {
    bonusPower: a.bonusPower + b.bonusPower,
    bonusAtkMilli: a.bonusAtkMilli + b.bonusAtkMilli,
    bonusMagicMilli: a.bonusMagicMilli + b.bonusMagicMilli,
  };
}

/** 베이스 스탯 기준 도감 버프 (마일스톤 배율 적용 전) */
export function codexBaseBuffFromWeapon(baseItemId: string): WeaponCodexBuffSlice {
  const id = normalizeItemId(baseItemId);
  if (!id) return zeroWeaponBuff();
  const stats = WEAPON_STATS_BY_ID[id];
  const weaponPower = weaponBasePower(id);
  return {
    bonusPower: Math.max(0, Math.floor(weaponPower * CODEX_BUFF_RATIO)),
    bonusAtkMilli: statMilli(stats?.atk ?? 0),
    bonusMagicMilli: statMilli(stats?.magic ?? 0),
  };
}

/** 등록 시점 무기 1개 기준 도감 버프 산출 */
export function codexBuffFromWeapon(input: {
  baseItemId: string;
  enhanceLevel: number;
  optionPowerBonus?: number;
}): WeaponCodexBuffSlice {
  const id = normalizeItemId(input.baseItemId);
  if (!id) return zeroWeaponBuff();
  const weaponPower =
    weaponBasePower(id) +
    weaponEnhancePowerBonus(id, input.enhanceLevel) +
    Math.max(0, Math.floor(input.optionPowerBonus ?? 0));
  const base = codexBaseBuffFromWeapon(id);
  return {
    bonusPower: Math.max(0, Math.floor(weaponPower * CODEX_BUFF_RATIO)),
    bonusAtkMilli: base.bonusAtkMilli,
    bonusMagicMilli: base.bonusMagicMilli,
  };
}

export function codexMilestoneBuffFromWeapon(input: {
  baseItemId: string;
  milestoneId: string;
  enhanceLevel: number;
  optionPowerBonus?: number;
}): WeaponCodexBuffSlice {
  const milestone = codexMilestoneDef(input.milestoneId);
  if (!milestone) return zeroWeaponBuff();
  if (milestone.id === CODEX_MILESTONE_BASE_ID) {
    return codexBuffFromWeapon({
      baseItemId: input.baseItemId,
      enhanceLevel: input.enhanceLevel,
      optionPowerBonus: input.optionPowerBonus,
    });
  }
  return scaleCodexBuffSlice(codexBaseBuffFromWeapon(input.baseItemId), milestone.buffScale);
}

export function previewWeaponCodexMilestones(
  baseItemId: string,
  registeredByMilestone: Map<
    string,
    WeaponCodexBuffSlice & {
      registeredEnhanceLevel: number;
      registeredQuality: number;
      registeredItemLevel: number;
      registeredAt: string | null;
    }
  >,
): WeaponCodexMilestoneView[] {
  return codexMilestonesForPool("weapon").map((m: CodexMilestoneDef) => {
    const reg = registeredByMilestone.get(m.id);
    const previewBuff = codexMilestoneBuffFromWeapon({
      baseItemId,
      milestoneId: m.id,
      enhanceLevel: 0,
    });
    return {
      milestoneId: m.id,
      label: m.label,
      description: m.description,
      registered: !!reg,
      registeredEnhanceLevel: reg?.registeredEnhanceLevel ?? 0,
      registeredQuality: reg?.registeredQuality ?? 0,
      registeredItemLevel: reg?.registeredItemLevel ?? 10,
      registeredAt: reg?.registeredAt ?? null,
      buff: reg
        ? {
            bonusPower: reg.bonusPower,
            bonusAtkMilli: reg.bonusAtkMilli,
            bonusMagicMilli: reg.bonusMagicMilli,
          }
        : zeroWeaponBuff(),
      previewBuff,
    };
  });
}

export function sumWeaponCodexBuffs(slices: WeaponCodexBuffSlice[]): WeaponCodexBuffSlice {
  return slices.reduce((acc, s) => addWeaponBuff(acc, s), zeroWeaponBuff());
}

export function aggregateCodexBuffs(
  entries: Array<{
    bonusPower: number;
    bonusAtkMilli: number;
    bonusMagicMilli: number;
  }>,
  catalogItemCount?: number,
): WeaponCodexTotals {
  const perItem = catalogItemCount ?? codexWeaponCatalog().length;
  const milestonesPerItem = codexMilestonesForPool("weapon").length;
  const totalCount = perItem * milestonesPerItem;
  let bonusPower = 0;
  let bonusAtkMilli = 0;
  let bonusMagicMilli = 0;
  for (const e of entries) {
    bonusPower += Math.max(0, e.bonusPower);
    bonusAtkMilli += Math.max(0, e.bonusAtkMilli);
    bonusMagicMilli += Math.max(0, e.bonusMagicMilli);
  }
  bonusPower = Math.min(CODEX_MAX_TOTAL_BONUS_POWER, bonusPower);
  const registeredCount = entries.length;
  return {
    bonusPower,
    bonusAtkMilli,
    bonusMagicMilli,
    registeredCount,
    totalCount,
    completionPct: totalCount > 0 ? Math.round((registeredCount / totalCount) * 1000) / 10 : 0,
  };
}

export function formatCodexAtkMilli(milli: number): string {
  const v = milli / 1000;
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");
}

export function codexBuffLabel(totals: Pick<WeaponCodexTotals, "bonusPower" | "bonusAtkMilli" | "bonusMagicMilli">) {
  const parts: string[] = [];
  if (totals.bonusPower > 0) parts.push(`전투력 +${totals.bonusPower}`);
  if (totals.bonusAtkMilli > 0) parts.push(`ATK +${formatCodexAtkMilli(totals.bonusAtkMilli)}`);
  if (totals.bonusMagicMilli > 0) parts.push(`MAG +${formatCodexAtkMilli(totals.bonusMagicMilli)}`);
  return parts.length ? parts.join(" · ") : "등록된 무기 없음";
}
