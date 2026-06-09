import {
  ARMOR_OPTION_CATALOG,
  normalizeOptionId,
  optionTierValue,
  WEAPON_OPTION_CATALOG,
} from "@/shared/itemOptionCatalog";

/** 전투 시뮬에 직접 반영되는 장비 보정치 (% 단위, 합산) */
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

/** 전투 시뮬 직접 적용 + CP는 `utilOptionPowerFromDisplayValue`로 부분 환산 (희귀도 제외) */
export const MECHANIZED_WEAPON_OPTION_IDS = new Set([
  "ATK_SPD_PCT",
  "CRIT_CHANCE_PCT",
  "CRIT_DMG_PCT",
  "ARMOR_PEN_PCT",
  "FINAL_DMG_PCT",
  "LIFE_STEAL_PCT",
  "DMG_VS_BOSS_PCT",
  "DMG_VS_ANGEL_PCT",
  "DMG_VS_DEMON_PCT",
  "ITEM_RARITY_PCT",
]);

export const MECHANIZED_ARMOR_OPTION_IDS = new Set([
  "BLOCK_PCT",
  "DMG_RED_PCT",
  "CRIT_RESIST_PCT",
  "EVASION_PCT",
  "REGEN_HP_ADD",
  "THORN_PCT",
  "LIFE_STEAL_PCT",
  "FINAL_DMG_PCT",
]);

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

    if (id === "CRIT_CHANCE_PCT") out.critChancePct += v;
    else if (id === "CRIT_DMG_PCT") out.critDmgPct += v;
    else if (id === "ATK_SPD_PCT") out.atkSpdPct += v;
    else if (id === "ARMOR_PEN_PCT") out.armorPenPct += v;
    else if (id === "FINAL_DMG_PCT") out.finalDmgPct += v;
    else if (id === "LIFE_STEAL_PCT") out.lifeStealPct += v;
    else if (id === "DMG_VS_BOSS_PCT") out.dmgVsBossPct += v;
    else if (id === "DMG_VS_ANGEL_PCT") out.dmgVsAngelPct += v;
    else if (id === "DMG_VS_DEMON_PCT") out.dmgVsDemonPct += v;
    else if (id === "ITEM_RARITY_PCT") out.itemRarityPct += v;
    else if (id === "BLOCK_PCT") out.blockPct += v;
    else if (id === "DMG_RED_PCT") out.dmgReducePct += v;
    else if (id === "EVASION_PCT") out.evasionPct += v;
    else if (id === "CRIT_RESIST_PCT") out.critResistPct += v;
    else if (id === "THORN_PCT") out.thornPct += v;
    else if (id === "REGEN_HP_ADD") out.regenHpPerRound += Math.floor(v);
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

/** 파티 전체 희귀도 보너스 — 드랍 롤용 (전투력 환산 X) */
export function partyItemRarityBonusPct(
  members: Array<{ combatMods?: EquipmentCombatModifiers }>,
): number {
  let sum = 0;
  for (const m of members) {
    sum += m.combatMods?.itemRarityPct ?? 0;
  }
  return Math.max(0, sum);
}
