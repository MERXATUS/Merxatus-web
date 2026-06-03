import type { Prisma, PrismaClient } from "@prisma/client";
import { computeMemberPower } from "@/server/dungeonBattler";
import { computePartyPower } from "@/server/dungeonCombat";
import { weaponCombatBonusFromOptions } from "@/server/itemOptions";
import type { MinionArmorIds } from "@/server/minionArmorDb";
import { buildArmorLoadoutFromIds, loadMinionArmorIdsForUser } from "@/server/minionArmorDb";
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

export type MinionWeaponEquip = {
  baseItemId: string;
  enhanceLevel: number;
  optionsJson?: string | null;
};

export type MinionCombatEquipInput = {
  level: number;
  fighterRank: number;
  baseStats?: MinionBaseStats;
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
function toCombatInput(input: MinionCombatEquipInput) {
  return {
    level: input.level,
    fighterRank: input.fighterRank,
    baseStats: minionBaseStatsFromRow(input.baseStats),
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
  const { member, bonusHp, bonusDef } = combatMemberFromMinion(toCombatInput(input));
  const combatClass = resolveMinionCombatClass(
    promotionStateFromRow({
      promotionTier: input.promotionTier,
      promotionClass: input.promotionClass,
    }),
  );
  const combatClassLabel = input.combatClassLabel ?? minionCombatClassLabel(combatClass);
  return {
    minionId: input.minionId,
    combatClass,
    combatClassLabel,
    weaponBaseItemId: input.weapon?.baseItemId ?? null,
    power: computeMemberPower(member),
    bonusHp,
    bonusDef,
    row: member,
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
  };
};

export type PartyCombatDb =
  | Prisma.TransactionClient
  | Pick<PrismaClient, "minionTrait" | "weaponInstance" | "armorInstance" | "$queryRaw">;

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
        select: { id: true, baseItemId: true, optionsJson: true },
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

  const partyPower = computePartyPower({ members: memberInputs.map((x) => x.row) });
  return { memberInputs, partyPower };
}
