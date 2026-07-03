import { prisma } from "@/server/db";
import { ensureMinionEntitiesForUser } from "@/server/ensureMinionEntitiesForUser";
import { attachIcons, getItemIconMap } from "@/server/itemCatalog";
import { itemGradeViewForItem } from "@/server/itemGrade";
import { loadMinionArmorIdsForUser } from "@/server/minionArmorDb";
import { loadMinionAccessoryIdsForUser } from "@/server/minionAccessoryDb";
import { MAX_DUNGEON_MINIONS } from "@/server/minionCapacity";
import { mapMinionToListRow } from "@/server/minionListBuild";
import { formatEquipmentOptionDisplay, parseEquipmentOptionsPayload } from "@/server/equipmentOptions";
import { equipmentBaseStatsView } from "@/shared/equipmentItemBaseStats";
import { knightOrderToView } from "@/server/knightOrderView";
import { ZERO_KNIGHT_ORDER_BONUSES } from "@/shared/knightOrder";
const minionInclude = {
  traits: true,
  equippedWeaponInstance: { include: { baseItem: true } },
} as const;

export async function loadMinionPanelPayload(userId: string, opts?: { detailMinionId?: string | null }) {
  await ensureMinionEntitiesForUser(userId).catch((e) => {
    console.warn("[minionPanelPayload] ensureMinionEntitiesForUser", e);
  });

  const [armorByMinionId, accessoryByMinionId, minions, weaponInstances, armorInstances, iconMap, userAccount] =
    await Promise.all([
    loadMinionArmorIdsForUser(prisma, userId),
    loadMinionAccessoryIdsForUser(prisma, userId),
    prisma.minion.findMany({
      where: { userId },
      include: minionInclude,
      orderBy: [{ createdAt: "asc" }],
      take: MAX_DUNGEON_MINIONS,
    }),
    prisma.weaponInstance.findMany({
      where: { userId, status: "OWNED" },
      include: { baseItem: true },
      orderBy: [{ createdAt: "asc" }],
      take: 200,
    }),
    prisma.armorInstance.findMany({
      where: { userId, status: "OWNED" },
      include: { baseItem: true },
      orderBy: [{ createdAt: "asc" }],
      take: 200,
    }),
    getItemIconMap(),
    prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
  ]);

  const armorInstById = new Map(
    armorInstances.map((a) => [a.id, { baseItemId: a.baseItemId, optionsJson: a.optionsJson }]),
  );

  const detailMinionId = opts?.detailMinionId ?? null;
  const playerUsername = userAccount?.username ?? null;
  const minionRows = minions.map((m) =>
    mapMinionToListRow(m, armorByMinionId, {
      detailMinionId,
      armorInstancesById: armorInstById,
      accessoryByMinionId,
      playerUsername,
    }),
  );

  return {
    maxDungeonOwned: MAX_DUNGEON_MINIONS,
    maxOwned: MAX_DUNGEON_MINIONS,
    knightOrder: knightOrderToView(ZERO_KNIGHT_ORDER_BONUSES),
    minions: minionRows,
    weaponInstances: attachIcons(
      weaponInstances.map((w) => ({
        id: w.id,
        baseItemId: w.baseItemId,
        name: w.baseItem.name,
        enhanceLevel: w.enhanceLevel,
        quality: w.quality,
        qualityCraftCount: w.qualityCraftCount,
        itemLevel: w.itemLevel,
        ...itemGradeViewForItem(w.baseItemId, w.baseItem.grade),
        identified: parseEquipmentOptionsPayload(w.optionsJson).identified,
        options: formatEquipmentOptionDisplay(w.optionsJson, "weapon", w.baseItemId),
        baseStats: equipmentBaseStatsView(w.baseItemId, "weapon"),
      })),
      iconMap,
      "baseItemId",
    ),
    armorInstances: attachIcons(
      armorInstances.map((a) => ({
        id: a.id,
        baseItemId: a.baseItemId,
        name: a.baseItem.name,
        enhanceLevel: a.enhanceLevel,
        quality: a.quality,
        qualityCraftCount: a.qualityCraftCount,
        itemLevel: a.itemLevel,
        createdAt: a.createdAt,
        ...itemGradeViewForItem(a.baseItemId, a.baseItem.grade),
        identified: parseEquipmentOptionsPayload(a.optionsJson).identified,
        options: formatEquipmentOptionDisplay(a.optionsJson, "armor", a.baseItemId),
        baseStats: equipmentBaseStatsView(a.baseItemId, "armor"),
      })),
      iconMap,
      "baseItemId",
    ),
    inventory: [] as Array<{
      itemId: string;
      name: string;
      category: string;
      quantity: number;
      grade: number;
      gradeLabel: string;
    }>,
  };
}
