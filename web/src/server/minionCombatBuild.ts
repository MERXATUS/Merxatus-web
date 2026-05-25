import type { MinionJobType, Prisma, PrismaClient } from "@prisma/client";
import { computeMemberPower } from "@/server/dungeonBattler";
import { computePartyPower } from "@/server/dungeonCombat";
import { weaponCombatBonusFromOptions } from "@/server/itemOptions";
import { loadMinionArmorIdsForUser, type MinionArmorIds } from "@/server/minionArmorDb";
import {
  armorSlotsFromMinionRow,
  combatMemberFromMinion,
  computeMinionCombatBreakdown,
  type MinionArmorSlots,
  type MinionCombatBreakdown,
} from "@/shared/minionCombatStats";

export type MinionWeaponEquip = {
  baseItemId: string;
  enhanceLevel: number;
  optionsJson?: string | null;
};

export type MinionCombatEquipInput = {
  level: number;
  fighterRank: number;
  weapon: MinionWeaponEquip | null;
  armor: MinionArmorSlots | MinionArmorIds;
};

function isArmorSlotView(armor: MinionArmorSlots | MinionArmorIds): armor is MinionArmorSlots {
  return "helmet" in armor || "armor" in armor || "pants" in armor || "shoes" in armor;
}

function normalizeArmor(armor: MinionArmorSlots | MinionArmorIds): MinionArmorSlots {
  if (isArmorSlotView(armor)) return armor;
  return armorSlotsFromMinionRow(armor);
}
function toCombatInput(input: MinionCombatEquipInput) {
  return {
    level: input.level,
    fighterRank: input.fighterRank,
    weapon: input.weapon
      ? {
          baseItemId: input.weapon.baseItemId,
          enhanceLevel: input.weapon.enhanceLevel,
          optionBonus: weaponCombatBonusFromOptions(input.weapon.optionsJson),
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
  input: MinionCombatEquipInput & { minionId: string; jobType: MinionJobType | string },
) {
  const { member, bonusHp, bonusDef } = combatMemberFromMinion(toCombatInput(input));
  return {
    minionId: input.minionId,
    jobType: input.jobType as MinionJobType,
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
  };
};

export type PartyCombatDb =
  | Prisma.TransactionClient
  | Pick<PrismaClient, "minionTrait" | "weaponInstance" | "$queryRaw">;

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

  const memberInputs = party.map((p) => {
    const wi = weaponById.get(p.minion.equippedWeaponInstanceId ?? "");
    const armorRow = armorByMinionId.get(p.minionId) ?? ({} as MinionArmorIds);
    return buildMinionPartyCombatRow({
      minionId: p.minionId,
      jobType: p.minion.jobType,
      level: p.minion.level,
      fighterRank: fighterByMinionId.get(p.minionId) ?? 0,
      weapon: wi
        ? {
            baseItemId: wi.baseItemId,
            enhanceLevel: wi.enhanceLevel,
            optionsJson: wi.optionsJson,
          }
        : null,
      armor: armorRow,
    });
  });

  const partyPower = computePartyPower({ members: memberInputs.map((x) => x.row) });
  return { memberInputs, partyPower };
}
