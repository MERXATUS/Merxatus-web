import { computePartyPower } from "@/server/dungeonCombat";
import { partyStatsFromPower } from "@/shared/combatBalance";
import {
  aggregateSkillCombatBonuses,
  normalizeSkillLevelsForClass,
  parseMinionSkillLevels,
  skillBreakdownForClass,
  type SkillBreakdown,
} from "@/shared/minionSkills";
import type { MinionCombatClass } from "@/shared/minionDerivedClass";
import { equipmentStatBonusFromOptions, parseOptionsJson } from "@/server/itemOptions";
import { armorHpDefBonusFromOptionRows, armorUtilPowerBonusFromOptionRows } from "@/shared/itemOptionCatalog";
import { armorItemCombatPower, getArmorStats } from "@/shared/armorStatsData";
import type { MinionBaseStats } from "@/shared/minionBaseStats";
import { minionBaseStatsFromRow } from "@/shared/minionBaseStats";
import type { MinionEquipSlotId } from "@/shared/minionEquipSlots";
import { armorEnhanceHpDefBonus, armorEnhancePowerBonus } from "@/shared/armorTooltip";
import { weaponBasePower, weaponEnhancePowerBonus } from "@/shared/weaponTooltip";
import {
  emptyVoidSkillBonuses,
  mergeVoidSkillBonuses,
  voidSkillBonusesFromOptionRows,
  voidSkillDamageMultForSkill,
} from "@/shared/equipmentVoidOptions";
import { equipmentInstanceStatMultiplier } from "@/shared/equipmentItemLevel";
import { clampEquipmentQuality } from "@/shared/equipmentQuality";

export type MinionArmorPiece = {
  itemId: string;
  optionsJson?: string | null;
  enhanceLevel?: number;
  quality?: number;
  itemLevel?: number;
};
export type MinionArmorLoadout = Partial<
  Record<"helmet" | "armor" | "pants" | "shoes", MinionArmorPiece | null>
>;

/** @deprecated itemId 맵 — `armorLoadoutFromSlotIds` 사용 */
export type MinionArmorSlots = Partial<Record<"helmet" | "armor" | "pants" | "shoes", string | null>>;

export type MinionCombatInput = {
  level: number;
  fighterRank?: number;
  baseStats?: MinionBaseStats;
  combatClass?: MinionCombatClass;
  skillLevelsJson?: string | null;
  weapon?: {
    baseItemId: string;
    enhanceLevel: number;
    optionBonus?: number;
    optionsJson?: string | null;
    quality?: number;
    itemLevel?: number;
  } | null;
  armor?: MinionArmorLoadout;
};
export type StatLine = { label: string; base: number; equip: number; total: number };

export type MinionCombatBreakdown = {
  combatPower: number;
  attributes: MinionBaseStats;
  power: StatLine;
  hp: StatLine;
  def: StatLine;
  atk: StatLine & { min: number; max: number };
  armorPieces: Array<{
    slot: MinionEquipSlotId;
    slotLabel: string;
    itemId: string;
    name: string;
    hp: number;
    def: number;
    power: number;
  }>;
  skillBreakdown: SkillBreakdown | null;
};

const SLOT_LABELS: Record<string, string> = {
  helmet: "투구",
  armor: "갑옷",
  pants: "하의",
  shoes: "신발",
};

function statsFromPower(power: number) {
  return partyStatsFromPower(power);
}

function equipmentStatBonus(input: MinionCombatInput) {
  const weapon = equipmentStatBonusFromOptions(input.weapon?.optionsJson ?? null, "weapon");
  const armor = { strength: 0, agility: 0, intelligence: 0, endurance: 0 };
  for (const slot of ["helmet", "armor", "pants", "shoes"] as const) {
    const piece = input.armor?.[slot];
    if (!piece?.itemId) continue;
    const b = equipmentStatBonusFromOptions(piece.optionsJson ?? null, "armor");
    armor.strength += b.strength;
    armor.agility += b.agility;
    armor.intelligence += b.intelligence;
    armor.endurance += b.endurance;
  }
  return {
    strength: weapon.strength + armor.strength,
    agility: weapon.agility + armor.agility,
    intelligence: weapon.intelligence + armor.intelligence,
    endurance: weapon.endurance + armor.endurance,
  };
}

function minionBaseMember(input: Pick<MinionCombatInput, "level" | "fighterRank" | "baseStats">) {
  const stats = minionBaseStatsFromRow(input.baseStats);
  return {
    weaponBaseItemId: null as string | null,
    weaponEnhanceLevel: 0,
    weaponOptionBonus: 0,
    level: input.level,
    fighterRank: input.fighterRank ?? 0,
    armorPowerBonus: 0,
    strength: stats.strength,
    agility: stats.agility,
    intelligence: stats.intelligence,
    endurance: stats.endurance,
  };
}

function skillBonusesForInput(input: MinionCombatInput) {
  if (!input.combatClass) {
    return { powerBonus: 0, bonusHp: 0, bonusDef: 0, damageMult: 1 };
  }
  const levels = normalizeSkillLevelsForClass(
    input.combatClass,
    parseMinionSkillLevels(input.skillLevelsJson),
  );
  return aggregateSkillCombatBonuses(input.combatClass, levels);
}

function voidBonusesFromInput(input: MinionCombatInput) {
  let out = emptyVoidSkillBonuses();
  if (input.weapon?.optionsJson) {
    out = mergeVoidSkillBonuses(out, voidSkillBonusesFromOptionRows(parseOptionsJson(input.weapon.optionsJson)));
  }
  for (const slot of ["helmet", "armor", "pants", "shoes"] as const) {
    const piece = input.armor?.[slot];
    if (!piece?.optionsJson) continue;
    out = mergeVoidSkillBonuses(out, voidSkillBonusesFromOptionRows(parseOptionsJson(piece.optionsJson)));
  }
  return out;
}

function instanceScale(quality?: number, itemLevel?: number): number {
  return equipmentInstanceStatMultiplier(clampEquipmentQuality(quality ?? 0), itemLevel ?? 10);
}

function memberWithWeapon(input: MinionCombatInput) {
  const stats = minionBaseStatsFromRow(input.baseStats);
  const statBonus = equipmentStatBonus(input);
  const skill = skillBonusesForInput(input);
  const voidBonuses = voidBonusesFromInput(input);
  const voidPowerPct = voidBonuses.skillPowerPct;
  return {
    weaponBaseItemId: input.weapon?.baseItemId ?? null,
    weaponEnhanceLevel: input.weapon?.enhanceLevel ?? 0,
    weaponOptionBonus: input.weapon?.optionBonus ?? 0,
    skillPowerBonus: skill.powerBonus + voidPowerPct,
    level: input.level,
    fighterRank: input.fighterRank ?? 0,
    armorPowerBonus: sumArmorPower(input.armor),
    strength: stats.strength + statBonus.strength,
    agility: stats.agility + statBonus.agility,
    intelligence: stats.intelligence + statBonus.intelligence,
    endurance: stats.endurance + statBonus.endurance,
    skillDamageMult: skill.damageMult,
    weaponInstanceScale: input.weapon
      ? instanceScale(input.weapon.quality, input.weapon.itemLevel)
      : 1,
  };
}

function sumArmorStats(armor?: MinionArmorLoadout) {
  let hp = 0;
  let def = 0;
  const pieces: MinionCombatBreakdown["armorPieces"] = [];
  if (!armor) return { hp, def, pieces };

  for (const slot of ["helmet", "armor", "pants", "shoes"] as const) {
    const piece = armor[slot];
    if (!piece?.itemId) continue;
    const row = getArmorStats(piece.itemId);
    if (!row) continue;
    const optRows = parseOptionsJson(piece.optionsJson);
    const optHpDef = armorHpDefBonusFromOptionRows(optRows, row.hp, row.def);
    const enhHpDef = armorEnhanceHpDefBonus(piece.enhanceLevel ?? 0, row.hp, row.def);
    const scale = instanceScale(piece.quality, piece.itemLevel);
    const pieceHp = Math.floor((row.hp + optHpDef.hp + enhHpDef.hp) * scale);
    const pieceDef = Math.floor((row.def + optHpDef.def + enhHpDef.def) * scale);
    hp += pieceHp;
    def += pieceDef;
    const enhPower = armorEnhancePowerBonus(piece.itemId, piece.enhanceLevel ?? 0);
    const utilPower = armorUtilPowerBonusFromOptionRows(parseOptionsJson(piece.optionsJson ?? null));
    pieces.push({
      slot,
      slotLabel: SLOT_LABELS[slot] ?? slot,
      itemId: piece.itemId,
      name: row.name,
      hp: pieceHp,
      def: pieceDef,
      power: Math.floor((armorItemCombatPower(piece.itemId) + enhPower + utilPower) * scale),
    });
  }
  return { hp, def, pieces };
}

function sumArmorPower(armor?: MinionArmorLoadout) {
  let p = 0;
  if (!armor) return 0;
  for (const slot of ["helmet", "armor", "pants", "shoes"] as const) {
    const piece = armor[slot];
    if (piece?.itemId) {
      const scale = instanceScale(piece.quality, piece.itemLevel);
      const base =
        armorItemCombatPower(piece.itemId) +
        armorEnhancePowerBonus(piece.itemId, piece.enhanceLevel ?? 0) +
        armorUtilPowerBonusFromOptionRows(parseOptionsJson(piece.optionsJson ?? null));
      p += Math.floor(base * scale);
    }
  }
  return p;
}

export function computeMinionCombatPower(input: MinionCombatInput): number {
  return computePartyPower({ members: [memberWithWeapon(input)] });
}

export function computeMinionCombatBreakdown(input: MinionCombatInput): MinionCombatBreakdown {
  const attributes = minionBaseStatsFromRow(input.baseStats);
  const basePower = computePartyPower({ members: [minionBaseMember(input)] });
  const weaponScale = input.weapon ? instanceScale(input.weapon.quality, input.weapon.itemLevel) : 1;
  const weaponPower = input.weapon
    ? Math.floor(
        (weaponBasePower(input.weapon.baseItemId) +
          weaponEnhancePowerBonus(input.weapon.baseItemId, input.weapon.enhanceLevel) +
          (input.weapon.optionBonus ?? 0)) *
          weaponScale,
      )
    : 0;
  const { hp: armorHp, def: armorDef, pieces } = sumArmorStats(input.armor);
  const armorPower = sumArmorPower(input.armor);

  const skill = skillBonusesForInput(input);
  const skillBreakdown = input.combatClass
    ? skillBreakdownForClass(input.combatClass, input.skillLevelsJson)
    : null;
  const combatPower = computePartyPower({ members: [memberWithWeapon(input)] });

  const baseStats = statsFromPower(basePower);
  const totalStats = statsFromPower(combatPower);

  const weaponAtk = input.weapon ? Math.max(0, Math.floor(weaponPower * 0.4)) : 0;

  return {
    combatPower,
    attributes,
    power: {
      label: "전투력",
      base: basePower,
      equip: weaponPower + armorPower,
      total: combatPower,
    },
    hp: {
      label: "HP",
      base: baseStats.maxHp,
      equip: armorHp,
      total: baseStats.maxHp + armorHp + skill.bonusHp,
    },
    def: {
      label: "DEF",
      base: 0,
      equip: armorDef,
      total: armorDef + skill.bonusDef,
    },
    atk: {
      label: "ATK",
      base: baseStats.atkMin,
      equip: weaponAtk,
      total: baseStats.atkMin + weaponAtk,
      min: totalStats.atkMin + weaponAtk,
      max: totalStats.atkMax + weaponAtk,
    },
    armorPieces: pieces,
    skillBreakdown,
  };
}

export function armorLoadoutFromSlotIds(slots: MinionArmorSlots): MinionArmorLoadout {
  return {
    helmet: slots.helmet ? { itemId: slots.helmet } : null,
    armor: slots.armor ? { itemId: slots.armor } : null,
    pants: slots.pants ? { itemId: slots.pants } : null,
    shoes: slots.shoes ? { itemId: slots.shoes } : null,
  };
}

export function armorSlotsFromMinionRow(m: {
  equippedHelmetItemId?: string | null;
  equippedChestItemId?: string | null;
  equippedPantsItemId?: string | null;
  equippedBootsItemId?: string | null;
  equippedArmor?: MinionArmorLoadout | MinionArmorSlots | null;
}): MinionArmorLoadout {
  if (m.equippedArmor) {
    const a = m.equippedArmor;
    if ("helmet" in a && (a.helmet == null || typeof a.helmet === "object")) {
      return a as MinionArmorLoadout;
    }
    return armorLoadoutFromSlotIds(a as MinionArmorSlots);
  }
  return armorLoadoutFromSlotIds({
    helmet: m.equippedHelmetItemId ?? null,
    armor: m.equippedChestItemId ?? null,
    pants: m.equippedPantsItemId ?? null,
    shoes: m.equippedBootsItemId ?? null,
  });
}

export function combatMemberFromMinion(input: MinionCombatInput) {
  const armor = sumArmorStats(input.armor);
  const skill = skillBonusesForInput(input);
  const voidBonuses = voidBonusesFromInput(input);
  const primarySkillId = input.combatClass
    ? primaryCombatSkillForMinion(input.combatClass, input.skillLevelsJson)?.id ?? null
    : null;
  const voidMult = voidSkillDamageMultForSkill(voidBonuses, primarySkillId);
  const activeHitMult = 1 + voidBonuses.activeSkillHitPct / 100;
  return {
    member: memberWithWeapon(input),
    bonusHp: armor.hp + skill.bonusHp,
    bonusDef: armor.def + skill.bonusDef,
    skillDamageMult: skill.damageMult * voidMult * activeHitMult,
  };
}
