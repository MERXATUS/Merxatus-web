import {
  ARMOR_OPTION_CATALOG,
  normalizeOptionId,
  optionTierValue,
  WEAPON_OPTION_CATALOG,
} from "@/shared/itemOptionCatalog";

/** 전투에 직접 반영되는 장비 % 보정 (깡스탯: 공속·데미지) */
export type EquipmentCombatModifiers = {
  critChancePct: number;
  critDmgPct: number;
  atkSpdPct: number;
  armorPenPct: number;
  finalDmgPct: number;
  lifeStealPct: number;
  dmgVsBossPct: number;
  dmgVsAngelPct: number;
  dmgVsDemonPct: number;
  itemRarityPct: number;
  blockPct: number;
  dmgReducePct: number;
  evasionPct: number;
  critResistPct: number;
  thornPct: number;
  regenHpPerRound: number;
};

export type EnemyCombatTags = {
  isBoss: boolean;
  isAngel: boolean;
  isDemon: boolean;
};

/** 공속·데미지 % — 전투 시뮬 직접 적용 + CP 환산 */
export const MECHANIZED_WEAPON_OPTION_IDS = new Set(["ATK_SPD_PCT", "FINAL_DMG_PCT"]);

export const MECHANIZED_ARMOR_OPTION_IDS = new Set(["FINAL_DMG_PCT"]);

export function emptyCombatModifiers(): EquipmentCombatModifiers {
  return {
    critChancePct: 0,
    critDmgPct: 0,
    atkSpdPct: 0,
    armorPenPct: 0,
    finalDmgPct: 0,
    lifeStealPct: 0,
    dmgVsBossPct: 0,
    dmgVsAngelPct: 0,
    dmgVsDemonPct: 0,
    itemRarityPct: 0,
    blockPct: 0,
    dmgReducePct: 0,
    evasionPct: 0,
    critResistPct: 0,
    thornPct: 0,
    regenHpPerRound: 0,
  };
}

export function isMechanizedWeaponOptionId(optionId: string): boolean {
  return MECHANIZED_WEAPON_OPTION_IDS.has(normalizeOptionId(optionId));
}

export function isMechanizedArmorOptionId(optionId: string): boolean {
  return MECHANIZED_ARMOR_OPTION_IDS.has(normalizeOptionId(optionId));
}

export function combatModifiersFromOptionRows(
  rows: Array<{ optionId: string; tier: number }>,
  pool: "weapon" | "armor",
): EquipmentCombatModifiers {
  const catalog = pool === "weapon" ? WEAPON_OPTION_CATALOG : ARMOR_OPTION_CATALOG;
  const mechanized = pool === "weapon" ? MECHANIZED_WEAPON_OPTION_IDS : MECHANIZED_ARMOR_OPTION_IDS;
  const out = emptyCombatModifiers();

  for (const row of rows) {
    const id = normalizeOptionId(row.optionId);
    if (!mechanized.has(id)) continue;
    const v = optionTierValue(catalog, id, row.tier);
    if (v <= 0) continue;

    if (id === "ATK_SPD_PCT") out.atkSpdPct += v;
    else if (id === "FINAL_DMG_PCT") out.finalDmgPct += v;
  }

  return out;
}

export function mergeCombatModifiers(
  ...mods: EquipmentCombatModifiers[]
): EquipmentCombatModifiers {
  const out = emptyCombatModifiers();
  for (const m of mods) {
    out.critChancePct += m.critChancePct;
    out.critDmgPct += m.critDmgPct;
    out.atkSpdPct += m.atkSpdPct;
    out.armorPenPct += m.armorPenPct;
    out.finalDmgPct += m.finalDmgPct;
    out.lifeStealPct += m.lifeStealPct;
    out.dmgVsBossPct += m.dmgVsBossPct;
    out.dmgVsAngelPct += m.dmgVsAngelPct;
    out.dmgVsDemonPct += m.dmgVsDemonPct;
    out.itemRarityPct += m.itemRarityPct;
    out.blockPct += m.blockPct;
    out.dmgReducePct += m.dmgReducePct;
    out.evasionPct += m.evasionPct;
    out.critResistPct += m.critResistPct;
    out.thornPct += m.thornPct;
    out.regenHpPerRound += m.regenHpPerRound;
  }
  return out;
}

export function inferEnemyCombatTags(input: {
  category?: "MONSTER" | "BOSS" | string;
  monsterId?: string;
  monsterName?: string;
}): EnemyCombatTags {
  const hay = `${input.monsterId ?? ""} ${input.monsterName ?? ""}`.toLowerCase();
  const cat = String(input.category ?? "").trim().toUpperCase();
  return {
    isBoss: cat === "BOSS",
    isAngel: /angel|천사|seraph|archangel/.test(hay),
    isDemon: /demon|devil|악마|마왕|fiend/.test(hay),
  };
}

/** @deprecated — 희귀도 옵션 제거 */
export function partyItemRarityBonusPct(
  _members: Array<{ combatMods?: EquipmentCombatModifiers }>,
): number {
  return 0;
}
