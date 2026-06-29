import { normalizeItemId } from "@/shared/itemId";
import {
  armorEnhanceHpDefBonus,
  armorOptionHpDefBonus,
  armorTotalPower,
  type ArmorTooltipOption,
} from "@/shared/armorTooltip";
import { ARMOR_STATS_BY_ID, armorSlotLabelKo, type ArmorStatRow } from "@/shared/armorStatsData";
import { CODEX_BUFF_RATIO, formatCodexAtkMilli } from "@/shared/weaponCodex";
import {
  CODEX_MILESTONE_BASE_ID,
  codexMilestonesForPool,
  codexMilestoneDef,
  scaleCodexBuffSlice,
  type CodexMilestoneDef,
} from "@/shared/equipmentCodexMilestones";

/** 방어구 도감 전투력 버프 합산 상한 */
export const ARMOR_CODEX_MAX_TOTAL_BONUS_POWER = 240;

export type ArmorCodexBuffSlice = {
  bonusPower: number;
  bonusHpMilli: number;
  bonusDefMilli: number;
};

export type ArmorCodexMilestoneView = {
  milestoneId: string;
  label: string;
  description: string;
  registered: boolean;
  registeredEnhanceLevel: number;
  registeredQuality: number;
  registeredItemLevel: number;
  registeredAt: string | null;
  buff: ArmorCodexBuffSlice;
  previewBuff: ArmorCodexBuffSlice;
};

export type ArmorCodexEntryView = {
  baseItemId: string;
  name: string;
  slot: string;
  slotLabel: string;
  grade: number;
  icon?: string;
  iconSrc?: string;
  milestones: ArmorCodexMilestoneView[];
  registeredMilestoneCount: number;
  totalMilestones: number;
  buff: ArmorCodexBuffSlice;
};

export type ArmorCodexTotals = ArmorCodexBuffSlice & {
  registeredCount: number;
  totalCount: number;
  completionPct: number;
};

export function codexArmorCatalog(): Array<ArmorStatRow & { id: string }> {
  return Object.entries(ARMOR_STATS_BY_ID)
    .map(([id, row]) => ({ id, ...row }))
    .sort(
      (a, b) =>
        a.slot.localeCompare(b.slot) || a.grade - b.grade || a.name.localeCompare(b.name, "ko"),
    );
}

function statMilli(v: number): number {
  return Math.max(0, Math.round(v * 1000 * CODEX_BUFF_RATIO));
}

function zeroArmorBuff(): ArmorCodexBuffSlice {
  return { bonusPower: 0, bonusHpMilli: 0, bonusDefMilli: 0 };
}

function addArmorBuff(a: ArmorCodexBuffSlice, b: ArmorCodexBuffSlice): ArmorCodexBuffSlice {
  return {
    bonusPower: a.bonusPower + b.bonusPower,
    bonusHpMilli: a.bonusHpMilli + b.bonusHpMilli,
    bonusDefMilli: a.bonusDefMilli + b.bonusDefMilli,
  };
}

export function codexBaseBuffFromArmor(baseItemId: string): ArmorCodexBuffSlice {
  const id = normalizeItemId(baseItemId);
  if (!id) return zeroArmorBuff();
  const stats = ARMOR_STATS_BY_ID[id];
  const power = armorTotalPower({
    id: "",
    baseItemId: id,
    name: stats?.name ?? id,
    enhanceLevel: 0,
  });
  const baseHp = stats?.hp ?? 0;
  const baseDef = stats?.def ?? 0;
  return {
    bonusPower: Math.max(0, Math.floor(power * CODEX_BUFF_RATIO)),
    bonusHpMilli: statMilli(baseHp),
    bonusDefMilli: statMilli(baseDef),
  };
}

export function codexBuffFromArmor(input: {
  baseItemId: string;
  enhanceLevel: number;
  options?: ArmorTooltipOption[];
}): ArmorCodexBuffSlice {
  const id = normalizeItemId(input.baseItemId);
  if (!id) return zeroArmorBuff();
  const stats = ARMOR_STATS_BY_ID[id];
  const power = armorTotalPower({
    id: "",
    baseItemId: id,
    name: stats?.name ?? id,
    enhanceLevel: input.enhanceLevel,
    options: input.options,
  });
  const baseHp = stats?.hp ?? 0;
  const baseDef = stats?.def ?? 0;
  const enh = armorEnhanceHpDefBonus(input.enhanceLevel, baseHp, baseDef);
  const opt = armorOptionHpDefBonus(input.options, baseHp, baseDef);
  const totalHp = baseHp + enh.hp + opt.hp;
  const totalDef = baseDef + enh.def + opt.def;
  const base = codexBaseBuffFromArmor(id);
  return {
    bonusPower: Math.max(0, Math.floor(power * CODEX_BUFF_RATIO)),
    bonusHpMilli: statMilli(totalHp),
    bonusDefMilli: statMilli(totalDef),
  };
}

export function codexMilestoneBuffFromArmor(input: {
  baseItemId: string;
  milestoneId: string;
  enhanceLevel: number;
  options?: ArmorTooltipOption[];
}): ArmorCodexBuffSlice {
  const milestone = codexMilestoneDef(input.milestoneId);
  if (!milestone) return zeroArmorBuff();
  if (milestone.id === CODEX_MILESTONE_BASE_ID) {
    return codexBuffFromArmor({
      baseItemId: input.baseItemId,
      enhanceLevel: input.enhanceLevel,
      options: input.options,
    });
  }
  return scaleCodexBuffSlice(codexBaseBuffFromArmor(input.baseItemId), milestone.buffScale);
}

export function previewArmorCodexMilestones(
  baseItemId: string,
  registeredByMilestone: Map<
    string,
    ArmorCodexBuffSlice & {
      registeredEnhanceLevel: number;
      registeredQuality: number;
      registeredItemLevel: number;
      registeredAt: string | null;
    }
  >,
): ArmorCodexMilestoneView[] {
  return codexMilestonesForPool("armor").map((m: CodexMilestoneDef) => {
    const reg = registeredByMilestone.get(m.id);
    const previewBuff = codexMilestoneBuffFromArmor({
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
            bonusHpMilli: reg.bonusHpMilli,
            bonusDefMilli: reg.bonusDefMilli,
          }
        : zeroArmorBuff(),
      previewBuff,
    };
  });
}

export function sumArmorCodexBuffs(slices: ArmorCodexBuffSlice[]): ArmorCodexBuffSlice {
  return slices.reduce((acc, s) => addArmorBuff(acc, s), zeroArmorBuff());
}

export function aggregateArmorCodexBuffs(
  entries: Array<{
    bonusPower: number;
    bonusHpMilli: number;
    bonusDefMilli: number;
  }>,
  catalogItemCount?: number,
): ArmorCodexTotals {
  const perItem = catalogItemCount ?? codexArmorCatalog().length;
  const milestonesPerItem = codexMilestonesForPool("armor").length;
  const totalCount = perItem * milestonesPerItem;
  let bonusPower = 0;
  let bonusHpMilli = 0;
  let bonusDefMilli = 0;
  for (const e of entries) {
    bonusPower += Math.max(0, e.bonusPower);
    bonusHpMilli += Math.max(0, e.bonusHpMilli);
    bonusDefMilli += Math.max(0, e.bonusDefMilli);
  }
  bonusPower = Math.min(ARMOR_CODEX_MAX_TOTAL_BONUS_POWER, bonusPower);
  const registeredCount = entries.length;
  return {
    bonusPower,
    bonusHpMilli,
    bonusDefMilli,
    registeredCount,
    totalCount,
    completionPct: totalCount > 0 ? Math.round((registeredCount / totalCount) * 1000) / 10 : 0,
  };
}

export function armorCodexBuffLabel(
  totals: Pick<ArmorCodexTotals, "bonusPower" | "bonusHpMilli" | "bonusDefMilli">,
) {
  const parts: string[] = [];
  if (totals.bonusPower > 0) parts.push(`전투력 +${totals.bonusPower}`);
  if (totals.bonusHpMilli > 0) parts.push(`HP +${formatCodexAtkMilli(totals.bonusHpMilli)}`);
  if (totals.bonusDefMilli > 0) parts.push(`DEF +${formatCodexAtkMilli(totals.bonusDefMilli)}`);
  return parts.length ? parts.join(" · ") : "등록된 방어구 없음";
}
