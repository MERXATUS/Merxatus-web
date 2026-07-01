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
import { equipmentStatusEffectsFromGear } from "@/shared/equipmentStatusEffects";
import type { StatusApplySpec } from "@/shared/combatStatus";
import { minionDisplayName } from "@/shared/minionNickname";
import { ZERO_KNIGHT_ORDER_BONUSES } from "@/shared/knightOrder";
import { scalePartyPowerWithKnightOrder } from "@/server/knightOrder";
import { displayCombatPower } from "@/shared/combatPowerScale";
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
          optionBonus: weaponCombatBonusFromOptions(input.weapon.optionsJson, input.weapon.baseItemId),
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
  const combatClass: MinionCombatClass = "ADVENTURER";
  const combatInput = toCombatInput({ ...input, combatClass });
  const built = combatMemberFromMinion(combatInput);
  const combatClassLabel = input.combatClassLabel ?? minionCombatClassLabel(combatClass);
  const displayName = minionDisplayName(input.nickname, combatClassLabel);
  let combatMods = combatModsFromEquip(input);
  const armor = normalizeArmor(input.armor);
  const gearFx = equipmentStatusEffectsFromGear({
    weaponOptionsJson: input.weapon?.optionsJson,
    armorOptionsJsonList: (["helmet", "armor", "pants", "shoes"] as const).map(
      (slot) => armor[slot]?.optionsJson,
    ),
  });
  const onHitStatuses: StatusApplySpec[] = [...gearFx.onHit];
  const onFightStartSelfStatuses: StatusApplySpec[] = [...gearFx.onFightStartSelf];
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
    skillDamageMult: 1,
    activeSkillName: null,
    activeSkillId: null,
    activeSkillLevel: 0,
    passiveSkillName: null,
    passiveSkillId: null,
    passiveSkillLevel: 0,
    passiveLowHpAtkMaxBonusPct: 0,
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

type UserCodexMeta = {
  expiresAt: number;
  weaponCodex: Awaited<ReturnType<typeof loadWeaponCodexTotals>>;
  armorCodex: Awaited<ReturnType<typeof loadArmorCodexTotals>>;
  setCodex: SetCodexBuffSlice;
};

type UserCombatMeta = UserCodexMeta & { knightOrder: KnightOrderBonuses };

const userCodexMetaCache = new Map<string, UserCodexMeta>();
const userCombatMetaCache = new Map<string, UserCombatMeta>();
const userCombatMetaInflight = new Map<string, Promise<UserCombatMeta>>();

export function invalidateUserCombatMetaCache(userId?: string) {
  if (userId) {
    userCodexMetaCache.delete(userId);
    userCombatMetaCache.delete(userId);
    userCombatMetaInflight.delete(userId);
    void import("@/server/knightOrder").then((m) => m.invalidateKnightOrderCache(userId));
  } else {
    userCodexMetaCache.clear();
    userCombatMetaCache.clear();
    userCombatMetaInflight.clear();
    void import("@/server/knightOrder").then((m) => m.invalidateKnightOrderCache());
  }
}

async function loadUserCodexMeta(tx: CombatDb, userId: string): Promise<UserCodexMeta> {
  const cached = userCodexMetaCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const [weaponCodex, armorCodex, setCodex] = await Promise.all([
    loadWeaponCodexTotals(tx, userId),
    loadArmorCodexTotals(tx, userId),
    loadSetCodexTotals(userId),
  ]);
  const value = {
    expiresAt: Date.now() + USER_COMBAT_META_TTL_MS,
    weaponCodex,
    armorCodex,
    setCodex,
  };
  userCodexMetaCache.set(userId, value);
  return value;
}

function codexBonusesFromMeta(meta: Pick<UserCodexMeta, "weaponCodex" | "armorCodex" | "setCodex">) {
  const { weaponCodex, armorCodex, setCodex } = meta;
  return {
    codexAtkFlat: Number(formatCodexAtkMilli(weaponCodex.bonusAtkMilli + setCodex.bonusAtkMilli)),
    codexMagicFlat: Number(formatCodexAtkMilli(weaponCodex.bonusMagicMilli + setCodex.bonusMagicMilli)),
    codexPower: weaponCodex.bonusPower + armorCodex.bonusPower + setCodex.bonusPower,
    codexBonusHp: Math.floor((armorCodex.bonusHpMilli + setCodex.bonusHpMilli) / 1000),
    codexBonusDef: Math.floor((armorCodex.bonusDefMilli + setCodex.bonusDefMilli) / 1000),
  };
}

async function loadUserCombatMeta(tx: CombatDb, userId: string): Promise<UserCombatMeta> {
  const cached = userCombatMetaCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const inflight = userCombatMetaInflight.get(userId);
  if (inflight) return inflight;

  const promise = (async () => {
    const codexMeta = await loadUserCodexMeta(tx, userId);
    const knightOrder = ZERO_KNIGHT_ORDER_BONUSES;
    const value = { ...codexMeta, knightOrder };
    userCombatMetaCache.set(userId, value);
    return value;
  })();

  userCombatMetaInflight.set(userId, promise);
  try {
    return await promise;
  } finally {
    userCombatMetaInflight.delete(userId);
  }
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

const MINION_CP_SELECT = {
  id: true,
  level: true,
  jobType: true,
  equippedWeaponInstanceId: true,
  strength: true,
  agility: true,
  intelligence: true,
  endurance: true,
  promotionTier: true,
  promotionClass: true,
  skillLevelsJson: true,
  nickname: true,
} as const;

async function loadPartyEquipmentBatch(tx: CombatDb, userId: string, party: PartyMinionRow[]) {
  const minionIds = party.map((p) => p.minionId);
  const weaponInstanceIds = party
    .map((p) => p.minion.equippedWeaponInstanceId)
    .filter(Boolean) as string[];

  const traitTake = Math.min(200, Math.max(1, minionIds.length));
  const weaponTake = Math.min(200, Math.max(1, weaponInstanceIds.length));

  const [traits, weapons, armorRows] = await Promise.all([
    minionIds.length
      ? tx.minionTrait.findMany({
          where: { minionId: { in: minionIds }, type: "FIGHTER" },
          select: { minionId: true, rank: true },
          take: traitTake,
        })
      : Promise.resolve([]),
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
          take: weaponTake,
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
  ]);

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
        take: Math.min(400, Math.max(1, armorInstanceIds.size)),
      })
    : [];
  const armorInstById = new Map(armorInstances.map((a) => [a.id, a]));

  return {
    fighterByMinionId: new Map(traits.map((t) => [t.minionId, t.rank])),
    weaponById: new Map(weapons.map((w) => [w.id, w])),
    armorByMinionId,
    armorInstById,
  };
}

function buildMemberInputsForParty(
  party: PartyMinionRow[],
  batch: Awaited<ReturnType<typeof loadPartyEquipmentBatch>>,
  codex: ReturnType<typeof codexBonusesFromMeta>,
) {
  const memberInputs = party.map((p) => {
    const wi = batch.weaponById.get(p.minion.equippedWeaponInstanceId ?? "");
    const equipRow = batch.armorByMinionId.get(p.minionId);
    const armorIds: MinionArmorIds = equipRow ?? EMPTY_ARMOR_IDS;
    return buildMinionPartyCombatRow({
      minionId: p.minionId,
      nickname: equipRow?.nickname ?? null,
      level: p.minion.level,
      fighterRank: batch.fighterByMinionId.get(p.minionId) ?? 0,
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
      armor: buildArmorLoadoutFromIds(armorIds, batch.armorInstById),
      accessories: accessorySlotsFromIds(accessoryIdsFromRow(equipRow ?? EMPTY_ACCESSORY_IDS)),
      bonusAtkFlat: codex.codexAtkFlat,
      bonusMagicFlat: codex.codexMagicFlat,
    });
  });

  for (const row of memberInputs) {
    row.power += codex.codexPower;
    row.bonusHp += codex.codexBonusHp;
    row.bonusDef += codex.codexBonusDef;
  }
  return memberInputs;
}

/** 기사단 집계 — 전체 미니언 CP 합 (기사단 보너스·순환 호출 없음) */
export async function sumAllMinionCombatPower(
  tx: CombatDb,
  userId: string,
  codexMeta?: UserCodexMeta,
) {
  const minions = await tx.minion.findMany({
    where: { userId },
    select: MINION_CP_SELECT,
    take: 200,
  });
  if (!minions.length) {
    return { totalCombatPower: 0, minionCount: 0 };
  }

  const party = minions.map((m) => ({ minionId: m.id, minion: m }));
  const [batch, meta] = await Promise.all([
    loadPartyEquipmentBatch(tx, userId, party),
    codexMeta ? Promise.resolve(codexMeta) : loadUserCodexMeta(tx, userId),
  ]);
  const memberInputs = buildMemberInputsForParty(party, batch, codexBonusesFromMeta(meta));
  const totalCombatPower = memberInputs.reduce(
    (sum, row) => sum + displayCombatPower(Math.max(0, Math.floor(row.power))),
    0,
  );
  return { totalCombatPower, minionCount: minions.length };
}

/** 단일 미니언 CP — 장비 변경 응답용 */
export async function computeMinionCombatPowerForUser(
  tx: CombatDb,
  userId: string,
  minion: PartyMinionRow["minion"] & { id: string },
) {
  const party = [{ minionId: minion.id, minion }];
  const [batch, meta] = await Promise.all([
    loadPartyEquipmentBatch(tx, userId, party),
    loadUserCodexMeta(tx, userId),
  ]);
  const memberInputs = buildMemberInputsForParty(party, batch, codexBonusesFromMeta(meta));
  return displayCombatPower(Math.max(0, Math.floor(memberInputs[0]?.power ?? 0)));
}

type PanelMinionRow = PartyMinionRow["minion"] & {
  id: string;
  nickname?: string | null;
  equippedWeaponInstanceId?: string | null;
  traits?: Array<{ type: string; rank: number }>;
  equippedWeaponInstance?: {
    id: string;
    baseItemId: string;
    enhanceLevel: number;
    optionsJson: string | null;
    quality?: number;
    itemLevel?: number;
  } | null;
};

/** 패널 payload — 이미 로드한 미니언·장비 데이터로 CP 합산 (추가 DB 조회 없음) */
export function sumCombatPowerFromPanelData(
  minions: PanelMinionRow[],
  armorByMinionId: Map<string, MinionArmorIds>,
  accessoryByMinionId: Map<string, MinionAccessoryIds>,
  armorInstById: Map<string, { baseItemId: string; optionsJson: string | null; enhanceLevel?: number; quality?: number; itemLevel?: number }>,
  codex: Pick<UserCodexMeta, "weaponCodex" | "armorCodex" | "setCodex">,
) {
  if (!minions.length) return 0;

  const fighterByMinionId = new Map(
    minions.map((m) => [m.id, (m.traits ?? []).find((t) => t.type === "FIGHTER")?.rank ?? 0]),
  );
  const weaponById = new Map(
    minions
      .filter((m) => m.equippedWeaponInstance && m.equippedWeaponInstanceId)
      .map((m) => [m.equippedWeaponInstanceId!, m.equippedWeaponInstance!]),
  );
  const armorByMinionIdCombat = new Map<string, MinionCombatEquipRow>(
    minions.map((m) => {
      const armorIds = armorByMinionId.get(m.id) ?? EMPTY_ARMOR_IDS;
      const accessoryIds = accessoryByMinionId.get(m.id) ?? EMPTY_ACCESSORY_IDS;
      return [
        m.id,
        {
          id: m.id,
          nickname: m.nickname ?? null,
          ...armorIds,
          ...accessoryIds,
        } as MinionCombatEquipRow,
      ];
    }),
  );
  const party = minions.map((m) => ({ minionId: m.id, minion: m }));
  const batch = {
    fighterByMinionId,
    weaponById,
    armorByMinionId: armorByMinionIdCombat,
    armorInstById,
  } as Awaited<ReturnType<typeof loadPartyEquipmentBatch>>;
  const memberInputs = buildMemberInputsForParty(party, batch, codexBonusesFromMeta(codex));
  return memberInputs.reduce((sum, row) => sum + Math.max(0, Math.floor(row.power)), 0);
}

/** 던전·자동 웨이브 — UI와 동일한 장비/옵션/방어구 반영 */
export async function getCachedKnightOrderBonuses(tx: CombatDb, userId: string): Promise<KnightOrderBonuses> {
  const meta = await loadUserCombatMeta(tx, userId);
  return meta.knightOrder;
}

/** 던전·자동 웨이브 — UI와 동일한 장비/옵션/방어구 반영 */
export async function loadPartyCombatRows(tx: CombatDb, userId: string, party: PartyMinionRow[]) {
  const [batch, userMeta] = await Promise.all([
    loadPartyEquipmentBatch(tx, userId, party),
    loadUserCombatMeta(tx, userId),
  ]);

  const { weaponCodex, armorCodex, setCodex, knightOrder } = userMeta;
  const memberInputs = buildMemberInputsForParty(party, batch, codexBonusesFromMeta(userMeta));

  const basePartyPower = computePartyPower({ members: memberInputs.map((x) => x.row) });
  const partyPower = scalePartyPowerWithKnightOrder(basePartyPower, knightOrder);
  return { memberInputs, partyPower, basePartyPower, knightOrder, weaponCodex, armorCodex };
}
