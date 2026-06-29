import type { Prisma, PrismaClient } from "@prisma/client";
import { computeMemberPower } from "@/server/dungeonBattler";
import { computePartyPower } from "@/server/dungeonCombat";
import { parseOptionsJson, weaponCombatBonusFromOptions } from "@/server/itemOptions";
import { accessoryIdsFromRow, accessorySlotsFromIds, EMPTY_ACCESSORY_IDS, type MinionAccessoryIds } from "@/server/minionAccessoryDb";
import { buildArmorLoadoutFromIds, type MinionArmorIds } from "@/server/minionArmorDb";
import {
  accessoryCombatModifiersForSlots,
} from "@/shared/accessoryCatalog";
import {
  combatModifiersFromOptionRows,
  mergeCombatModifiers,
  type EquipmentCombatModifiers,
} from "@/shared/equipmentCombatModifiers";
import type { MinionAccessorySlotId } from "@/shared/minionEquipSlots";
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
import { minionDisplayName } from "@/shared/minionNickname";
import { loadKnightOrderBonuses, scalePartyPowerWithKnightOrder } from "@/server/knightOrder";
import { loadArmorCodexTotals } from "@/server/armorCodex";
import { loadSetCodexTotals } from "@/server/setCodex";
import { loadWeaponCodexTotals } from "@/server/weaponCodex";
import { formatCodexAtkMilli } from "@/shared/weaponCodex";
import type { SetCodexBuffSlice } from "@/shared/equipmentSetCodex";
import type { KnightOrderBonuses } from "@/shared/knightOrder";

export type MinionWeaponEquip = {
  baseItemId: string;
  enhanceLevel: number;
  optionsJson?: string | null;
  quality?: number;
  itemLevel?: number;
};

export type MinionCombatEquipInput = {
  level: number;
  fighterRank: number;
  baseStats?: MinionBaseStats;
  combatClass?: MinionCombatClass;
  skillLevelsJson?: string | null;
  weapon: MinionWeaponEquip | null;
  armor: MinionArmorLoadout | MinionArmorSlots;
  accessories?: Partial<Record<MinionAccessorySlotId, string | null>>;
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
    accessoryCombatModifiersForSlots(input.accessories ?? {}),
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
          quality: input.weapon.quality,
          itemLevel: input.weapon.itemLevel,
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
    nickname?: string | null;
    promotionTier?: number | null;
    promotionClass?: string | null;
    bonusAtkFlat?: number;
    bonusMagicFlat?: number;
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
  const displayName = minionDisplayName(input.nickname, combatClassLabel);
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
    nickname: input.nickname ?? null,
    displayName,
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
    bonusAtkFlat: input.bonusAtkFlat,
    bonusMagicFlat: input.bonusMagicFlat,
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
  | Pick<
      PrismaClient,
      "minion" | "minionTrait" | "weaponInstance" | "armorInstance" | "weaponCodexEntry" | "armorCodexEntry" | "$queryRaw"
    >;

type CombatDb = PartyCombatDb;

const USER_COMBAT_META_TTL_MS = 30_000;
const userCombatMetaCache = new Map<
  string,
  {
    expiresAt: number;
    weaponCodex: Awaited<ReturnType<typeof loadWeaponCodexTotals>>;
    armorCodex: Awaited<ReturnType<typeof loadArmorCodexTotals>>;
    setCodex: SetCodexBuffSlice;
    knightOrder: KnightOrderBonuses;
  }
>();

export function invalidateUserCombatMetaCache(userId?: string) {
  if (userId) userCombatMetaCache.delete(userId);
  else userCombatMetaCache.clear();
}

async function loadUserCombatMeta(tx: CombatDb, userId: string) {
  const cached = userCombatMetaCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const [weaponCodex, armorCodex, setCodex, knightOrder] = await Promise.all([
    loadWeaponCodexTotals(tx, userId),
    loadArmorCodexTotals(tx, userId),
    loadSetCodexTotals(userId),
    loadKnightOrderBonuses(tx, userId),
  ]);
  const value = {
    expiresAt: Date.now() + USER_COMBAT_META_TTL_MS,
    weaponCodex,
    armorCodex,
    setCodex,
    knightOrder,
  };
  userCombatMetaCache.set(userId, value);
  return value;
}

const EMPTY_ARMOR_IDS: MinionArmorIds = {
  equippedHelmetItemId: null,
  equippedChestItemId: null,
  equippedPantsItemId: null,
  equippedBootsItemId: null,
  equippedHelmetInstanceId: null,
  equippedChestInstanceId: null,
  equippedPantsInstanceId: null,
  equippedBootsInstanceId: null,
};

type MinionCombatEquipRow = MinionArmorIds & MinionAccessoryIds & { id: string; nickname: string | null };

/** 던전·자동 웨이브 — UI와 동일한 장비/옵션/방어구 반영 */
export async function loadPartyCombatRows(tx: CombatDb, userId: string, party: PartyMinionRow[]) {
  const minionIds = party.map((p) => p.minionId);
  const weaponInstanceIds = party
    .map((p) => p.minion.equippedWeaponInstanceId)
    .filter(Boolean) as string[];

  const [traits, weapons, armorRows, userMeta] = await Promise.all([
    tx.minionTrait.findMany({
      where: { minionId: { in: minionIds }, type: "FIGHTER" },
      select: { minionId: true, rank: true },
      take: 50,
    }),
    weaponInstanceIds.length
      ? tx.weaponInstance.findMany({
          where: { id: { in: weaponInstanceIds }, userId },
          select: {
            id: true,
            baseItemId: true,
            enhanceLevel: true,
            optionsJson: true,
            quality: true,
            itemLevel: true,
          },
          take: 50,
        })
      : Promise.resolve([]),
    minionIds.length
      ? tx.minion.findMany({
          where: { userId, id: { in: minionIds } },
          select: {
            id: true,
            nickname: true,
            equippedHelmetItemId: true,
            equippedChestItemId: true,
            equippedPantsItemId: true,
            equippedBootsItemId: true,
            equippedHelmetInstanceId: true,
            equippedChestInstanceId: true,
            equippedPantsInstanceId: true,
            equippedBootsInstanceId: true,
            equippedRing1ItemId: true,
            equippedRing2ItemId: true,
            equippedNecklaceItemId: true,
            equippedNecklace2ItemId: true,
            equippedRelicItemId: true,
            equippedRelic2ItemId: true,
            equippedRelic3ItemId: true,
          },
        })
      : Promise.resolve([]),
    loadUserCombatMeta(tx, userId),
  ]);

  const fighterByMinionId = new Map(traits.map((t) => [t.minionId, t.rank]));
  const weaponById = new Map(weapons.map((w) => [w.id, w]));
  const armorByMinionId = new Map<string, MinionCombatEquipRow>(
    armorRows.map((r) => [r.id, r as MinionCombatEquipRow]),
  );

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
        select: { id: true, baseItemId: true, optionsJson: true, enhanceLevel: true, quality: true, itemLevel: true },
        take: 100,
      })
    : [];
  const armorInstById = new Map(armorInstances.map((a) => [a.id, a]));

  const { weaponCodex, armorCodex, setCodex, knightOrder } = userMeta;
  const codexAtkFlat =
    Number(formatCodexAtkMilli(weaponCodex.bonusAtkMilli + setCodex.bonusAtkMilli));
  const codexMagicFlat =
    Number(formatCodexAtkMilli(weaponCodex.bonusMagicMilli + setCodex.bonusMagicMilli));
  const codexPower = weaponCodex.bonusPower + armorCodex.bonusPower + setCodex.bonusPower;
  const codexBonusHp = Math.floor((armorCodex.bonusHpMilli + setCodex.bonusHpMilli) / 1000);
  const codexBonusDef = Math.floor((armorCodex.bonusDefMilli + setCodex.bonusDefMilli) / 1000);

  const memberInputs = party.map((p) => {
    const wi = weaponById.get(p.minion.equippedWeaponInstanceId ?? "");
    const equipRow = armorByMinionId.get(p.minionId);
    const armorIds: MinionArmorIds = equipRow ?? EMPTY_ARMOR_IDS;
    return buildMinionPartyCombatRow({
      minionId: p.minionId,
      nickname: equipRow?.nickname ?? null,
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
            quality: wi.quality,
            itemLevel: wi.itemLevel,
          }
        : null,
      armor: buildArmorLoadoutFromIds(armorIds, armorInstById),
      accessories: accessorySlotsFromIds(accessoryIdsFromRow(equipRow ?? EMPTY_ACCESSORY_IDS)),
      bonusAtkFlat: codexAtkFlat,
      bonusMagicFlat: codexMagicFlat,
    });
  });

  for (const row of memberInputs) {
    row.power += codexPower;
    row.bonusHp += codexBonusHp;
    row.bonusDef += codexBonusDef;
  }

  const basePartyPower = computePartyPower({ members: memberInputs.map((x) => x.row) });
  const partyPower = scalePartyPowerWithKnightOrder(basePartyPower, knightOrder);
  return { memberInputs, partyPower, basePartyPower, knightOrder, weaponCodex, armorCodex };
}
