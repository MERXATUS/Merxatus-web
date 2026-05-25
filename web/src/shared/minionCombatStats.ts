import { computePartyPower } from "@/server/dungeonCombat";
import { armorItemCombatPower, getArmorStats } from "@/shared/armorStatsData";
import type { MinionEquipSlotId } from "@/shared/minionEquipSlots";
import { weaponBasePower, weaponEnhancePowerBonus } from "@/shared/weaponTooltip";

export type MinionArmorSlots = Partial<Record<"helmet" | "armor" | "pants" | "shoes", string | null>>;

export type MinionCombatInput = {
  level: number;
  fighterRank?: number;
  weapon?: {
    baseItemId: string;
    enhanceLevel: number;
    optionBonus?: number;
  } | null;
  armor?: MinionArmorSlots;
};

export type StatLine = { label: string; base: number; equip: number; total: number };

export type MinionCombatBreakdown = {
  combatPower: number;
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
};

const SLOT_LABELS: Record<string, string> = {
  helmet: "투구",
  armor: "갑옷",
  pants: "하의",
  shoes: "신발",
};

function statsFromPower(power: number) {
  const p = Math.max(1, Math.floor(power));
  const maxHp = Math.max(24, Math.floor(p * 3.2));
  const baseAtk = Math.max(4, Math.floor(p * 0.35));
  return { maxHp, atkMin: baseAtk, atkMax: baseAtk + Math.max(2, Math.floor(p * 0.12)) };
}

function minionBaseMember(input: Pick<MinionCombatInput, "level" | "fighterRank">) {
  return {
    weaponBaseItemId: null as string | null,
    weaponEnhanceLevel: 0,
    weaponOptionBonus: 0,
    level: input.level,
    fighterRank: input.fighterRank ?? 0,
    armorPowerBonus: 0,
  };
}

function memberWithWeapon(input: MinionCombatInput) {
  return {
    weaponBaseItemId: input.weapon?.baseItemId ?? null,
    weaponEnhanceLevel: input.weapon?.enhanceLevel ?? 0,
    weaponOptionBonus: input.weapon?.optionBonus ?? 0,
    level: input.level,
    fighterRank: input.fighterRank ?? 0,
    armorPowerBonus: sumArmorPower(input.armor),
  };
}

function sumArmorStats(armor?: MinionArmorSlots) {
  let hp = 0;
  let def = 0;
  const pieces: MinionCombatBreakdown["armorPieces"] = [];
  if (!armor) return { hp, def, pieces };

  for (const slot of ["helmet", "armor", "pants", "shoes"] as const) {
    const itemId = armor[slot];
    if (!itemId) continue;
    const row = getArmorStats(itemId);
    if (!row) continue;
    hp += row.hp;
    def += row.def;
    pieces.push({
      slot,
      slotLabel: SLOT_LABELS[slot] ?? slot,
      itemId,
      name: row.name,
      hp: row.hp,
      def: row.def,
      power: armorItemCombatPower(itemId),
    });
  }
  return { hp, def, pieces };
}

function sumArmorPower(armor?: MinionArmorSlots) {
  let p = 0;
  if (!armor) return 0;
  for (const slot of ["helmet", "armor", "pants", "shoes"] as const) {
    const id = armor[slot];
    if (id) p += armorItemCombatPower(id);
  }
  return p;
}

export function computeMinionCombatBreakdown(input: MinionCombatInput): MinionCombatBreakdown {
  const basePower = computePartyPower({ members: [minionBaseMember(input)] });
  const weaponPower = input.weapon
    ? weaponBasePower(input.weapon.baseItemId) +
      weaponEnhancePowerBonus(input.weapon.enhanceLevel) +
      (input.weapon.optionBonus ?? 0)
    : 0;
  const { hp: armorHp, def: armorDef, pieces } = sumArmorStats(input.armor);
  const armorPower = sumArmorPower(input.armor);

  const combatPower = computePartyPower({ members: [memberWithWeapon(input)] });

  const baseStats = statsFromPower(basePower);
  const totalStats = statsFromPower(combatPower);

  const weaponAtk = input.weapon ? Math.max(0, Math.floor(weaponPower * 0.4)) : 0;

  return {
    combatPower,
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
      total: baseStats.maxHp + armorHp,
    },
    def: {
      label: "DEF",
      base: 0,
      equip: armorDef,
      total: armorDef,
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
  };
}

export function armorSlotsFromMinionRow(m: {
  equippedHelmetItemId?: string | null;
  equippedChestItemId?: string | null;
  equippedPantsItemId?: string | null;
  equippedBootsItemId?: string | null;
  equippedArmor?: MinionArmorSlots | null;
}): MinionArmorSlots {
  if (m.equippedArmor) return m.equippedArmor;
  return {
    helmet: m.equippedHelmetItemId ?? null,
    armor: m.equippedChestItemId ?? null,
    pants: m.equippedPantsItemId ?? null,
    shoes: m.equippedBootsItemId ?? null,
  };
}

export function combatMemberFromMinion(input: MinionCombatInput) {
  const armor = sumArmorStats(input.armor);
  return {
    member: memberWithWeapon(input),
    bonusHp: armor.hp,
    bonusDef: armor.def,
  };
}
