import type { Prisma, PrismaClient } from "@prisma/client";
import { computeMemberPower } from "@/server/dungeonBattler";
import { computePartyPower } from "@/server/dungeonCombat";
import { parseOptionsJson, weaponCombatBonusFromOptions } from "@/server/itemOptions";
import type { MinionArmorIds } from "@/server/minionArmorDb";
import { buildArmorLoadoutFromIds, loadMinionArmorIdsForUser } from "@/server/minionArmorDb";
import {
  combatModifiersFromOptionRows,
  mergeCombatModifiers,
  type EquipmentCombatModifiers,
} from "@/shared/equipmentCombatModifiers";
import {
  armorLoadoutFromSlotIds,
  combatMemberFromMinion,
  computeMinionCombatBreakdown,
  type MinionArmorLoadout,
  type MinionArmorSlots,
  type MinionCombatBreakdown,
} from "@/shared/minionCombatStats";
import { minionBaseStatsFromRow, type MinionBaseStats } from "@/shared/minionBaseStats";
import { minionCombatClassLabel, type MinionCombatClass } from "@/shared/minionDerivedClass";
import { promotionStateFromRow, resolveMinionCombatClass } from "@/shared/minionPromotion";
import { aggregateSkillCombatEffects } from "@/shared/combatSkillEffects";
import { equipmentStatusEffectsFromGear } from "@/shared/equipmentStatusEffects";
import {
  primaryActiveSkillForMinion,
  primaryPassiveSkillForMinion,
} from "@/shared/minionSkills";
import { passiveModsForSkill } from "@/shared/skillCombatRuntime";
import type { StatusApplySpec } from "@/shared/combatStatus";
import { loadKnightOrderBonuses, scalePartyPowerWithKnightOrder } from "@/server/knightOrder";
import type { KnightOrderBonuses } from "@/shared/knightOrder";

export type MinionWeaponEquip = {
  baseItemId: string;
  enhanceLevel: number;
  optionsJson?: string | null;
};

export type MinionCombatEquipInput = {
  level: number;
  fighterRank: number;
  baseStats?: MinionBaseStats;
  combatClass?: MinionCombatClass;
  skillLevelsJson?: string | null;
  weapon: MinionWeaponEquip | null;
  armor: MinionArmorLoadout | MinionArmorSlots;
};

function isArmorSlotView(armor: MinionArmorLoadout | MinionArmorSlots): armor is MinionArmorSlots {
  const h = armor.helmet;
  return h == null || typeof h === "string";
}

function normalizeArmor(armor: MinionArmorLoadout | MinionArmorSlots): MinionArmorLoadout {
  if (isArmorSlotView(armor)) return armorLoadoutFromSlotIds(armor);
  return armor;
}

function combatModsFromEquip(input: MinionCombatEquipInput): EquipmentCombatModifiers {
  const weaponRows = parseOptionsJson(input.weapon?.optionsJson ?? null);
  const armor = normalizeArmor(input.armor);
  const armorMods = (["helmet", "armor", "pants", "shoes"] as const).map((slot) => {
    const piece = armor[slot];
    if (!piece?.itemId) return combatModifiersFromOptionRows([], "armor");
    return combatModifiersFromOptionRows(parseOptionsJson(piece.optionsJson ?? null), "armor");
  });
  return mergeCombatModifiers(
    combatModifiersFromOptionRows(weaponRows, "weapon"),
    ...armorMods,
  );
}
function toCombatInput(input: MinionCombatEquipInput) {
  return {
    level: input.level,
    fighterRank: input.fighterRank,
    baseStats: minionBaseStatsFromRow(input.baseStats),
    combatClass: input.combatClass,
    skillLevelsJson: input.skillLevelsJson,
    weapon: input.weapon
      ? {
          baseItemId: input.weapon.baseItemId,
          enhanceLevel: input.weapon.enhanceLevel,
          optionBonus: weaponCombatBonusFromOptions(input.weapon.optionsJson),
          optionsJson: input.weapon.optionsJson,
        }
      : null,
    armor: normalizeArmor(input.armor),
  };
}

/** UI·던전 공통 — 착용 장비 기준 전투력 분해 */
export function buildMinionCombatBreakdown(input: MinionCombatEquipInput): MinionCombatBreakdown {
  return computeMinionCombatBreakdown(toCombatInput(input));
}

/** 던전 파티 1명 — UI와 동일한 `computePartyPower` 멤버 행 */
export function buildMinionPartyCombatRow(
  input: MinionCombatEquipInput & {
    minionId: string;
    combatClassLabel?: string;
    promotionTier?: number | null;
    promotionClass?: string | null;
  },
) {
  const combatClass =
    input.combatClass ??
    resolveMinionCombatClass(
      promotionStateFromRow({
        promotionTier: input.promotionTier,
        promotionClass: input.promotionClass,
      }),
    );
  const combatInput = toCombatInput({ ...input, combatClass });
  const built = combatMemberFromMinion(combatInput);
  const combatClassLabel = input.combatClassLabel ?? minionCombatClassLabel(combatClass);
  const primarySkill = primaryActiveSkillForMinion(combatClass, input.skillLevelsJson);
  const passiveSkill = primaryPassiveSkillForMinion(combatClass, input.skillLevelsJson);
  let combatMods = combatModsFromEquip(input);
  const passiveMods = passiveModsForSkill(passiveSkill?.id ?? null, passiveSkill?.level ?? 0);
  if (passiveMods.dmgReducePct) combatMods.dmgReducePct += passiveMods.dmgReducePct;
  if (passiveMods.critChancePct) combatMods.critChancePct += passiveMods.critChancePct;
  if (passiveMods.lifeStealPct) combatMods.lifeStealPct += passiveMods.lifeStealPct;
  const armor = normalizeArmor(input.armor);
  const gearFx = equipmentStatusEffectsFromGear({
    weaponOptionsJson: input.weapon?.optionsJson,
    armorOptionsJsonList: (["helmet", "armor", "pants", "shoes"] as const).map(
      (slot) => armor[slot]?.optionsJson,
    ),
  });
  const skillFx = aggregateSkillCombatEffects(combatClass, input.skillLevelsJson);
  const onHitStatuses: StatusApplySpec[] = [...gearFx.onHit];
  const onFightStartSelfStatuses: StatusApplySpec[] = [
    ...gearFx.onFightStartSelf,
    ...skillFx.onFightStartSelf,
  ];
  return {
    minionId: input.minionId,
    combatClass,
    combatClassLabel,
    weaponBaseItemId: input.weapon?.baseItemId ?? null,
    power: computeMemberPower(built.member),
    bonusHp: built.bonusHp,
    bonusDef: built.bonusDef,
    agility: built.member.agility,
    endurance: built.member.endurance,
    skillDamageMult: built.skillDamageMult,
    activeSkillName: primarySkill?.name ?? null,
    activeSkillId: primarySkill?.id ?? null,
    activeSkillLevel: primarySkill?.level ?? 0,
    passiveSkillName: passiveSkill?.name ?? null,
    passiveSkillId: passiveSkill?.id ?? null,
    passiveSkillLevel: passiveSkill?.level ?? 0,
    passiveLowHpAtkMaxBonusPct: passiveMods.lowHpAtkMaxBonusPct ?? 0,
    combatMods,
    onHitStatuses,
    onFightStartSelfStatuses,
    row: built.member,
  };
}

type PartyMinionRow = {
  minionId: string;
  minion: {
    level: number;
    jobType: string;
    equippedWeaponInstanceId: string | null;
    strength?: number | null;
    agility?: number | null;
    intelligence?: number | null;
    endurance?: number | null;
    promotionTier?: number | null;
    promotionClass?: string | null;
    skillLevelsJson?: string | null;
  };
};

export type PartyCombatDb =
  | Prisma.TransactionClient
  | Pick<PrismaClient, "minion" | "minionTrait" | "weaponInstance" | "armorInstance" | "$queryRaw">;

type CombatDb = PartyCombatDb;
/** 던전·자동 웨이브 — UI와 동일한 장비/옵션/방어구 반영 */
export async function loadPartyCombatRows(tx: CombatDb, userId: string, party: PartyMinionRow[]) {
  const minionIds = party.map((p) => p.minionId);
  const traits = await tx.minionTrait.findMany({
    where: { minionId: { in: minionIds }, type: "FIGHTER" },
    select: { minionId: true, rank: true },
    take: 50,
  });
  const fighterByMinionId = new Map(traits.map((t) => [t.minionId, t.rank]));

  const weaponInstanceIds = party
    .map((p) => p.minion.equippedWeaponInstanceId)
    .filter(Boolean) as string[];
  const weapons = weaponInstanceIds.length
    ? await tx.weaponInstance.findMany({
        where: { id: { in: weaponInstanceIds }, userId },
        select: {
          id: true,
          baseItemId: true,
          enhanceLevel: true,
          optionsJson: true,
        },
        take: 50,
      })
    : [];
  const weaponById = new Map(weapons.map((w) => [w.id, w]));

  const armorByMinionId = await loadMinionArmorIdsForUser(tx, userId);

  const armorInstanceIds = new Set<string>();
  for (const row of armorByMinionId.values()) {
    for (const id of [
      row.equippedHelmetInstanceId,
      row.equippedChestInstanceId,
      row.equippedPantsInstanceId,
      row.equippedBootsInstanceId,
    ]) {
      if (id) armorInstanceIds.add(id);
    }
  }
  const armorInstances = armorInstanceIds.size
    ? await tx.armorInstance.findMany({
        where: { id: { in: [...armorInstanceIds] }, userId },
        select: { id: true, baseItemId: true, optionsJson: true, enhanceLevel: true },
        take: 100,
      })
    : [];
  const armorInstById = new Map(armorInstances.map((a) => [a.id, a]));

  const memberInputs = party.map((p) => {
    const wi = weaponById.get(p.minion.equippedWeaponInstanceId ?? "");
    const armorRow = armorByMinionId.get(p.minionId) ?? {
      equippedHelmetItemId: null,
      equippedChestItemId: null,
      equippedPantsItemId: null,
      equippedBootsItemId: null,
      equippedHelmetInstanceId: null,
      equippedChestInstanceId: null,
      equippedPantsInstanceId: null,
      equippedBootsInstanceId: null,
    };
    return buildMinionPartyCombatRow({
      minionId: p.minionId,
      level: p.minion.level,
      fighterRank: fighterByMinionId.get(p.minionId) ?? 0,
      baseStats: minionBaseStatsFromRow(p.minion),
      promotionTier: p.minion.promotionTier,
      promotionClass: p.minion.promotionClass,
      skillLevelsJson: p.minion.skillLevelsJson,
      weapon: wi
        ? {
            baseItemId: wi.baseItemId,
            enhanceLevel: wi.enhanceLevel,
            optionsJson: wi.optionsJson,
          }
        : null,
      armor: buildArmorLoadoutFromIds(armorRow, armorInstById),
    });
  });

  const basePartyPower = computePartyPower({ members: memberInputs.map((x) => x.row) });
  const knightOrder = await loadKnightOrderBonuses(tx, userId);
  const partyPower = scalePartyPowerWithKnightOrder(basePartyPower, knightOrder);
  return { memberInputs, partyPower, basePartyPower, knightOrder };
}
