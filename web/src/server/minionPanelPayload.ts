import { prisma } from "@/server/db";
import { ensureMinionEntitiesForUser } from "@/server/ensureMinionEntitiesForUser";
import { attachIcons, getItemIconMap } from "@/server/itemCatalog";
import { itemGradeLabel, itemGradeViewForItem } from "@/server/itemGrade";
import { loadMinionArmorIdsForUser } from "@/server/minionArmorDb";
import { MAX_DUNGEON_MINIONS } from "@/server/minionCapacity";
import { mapMinionToListRow } from "@/server/minionListBuild";
import { formatEquipmentOptionDisplay, parseEquipmentOptionsPayload } from "@/server/equipmentOptions";
import { loadKnightOrderBonuses } from "@/server/knightOrder";
import { knightOrderToView } from "@/server/knightOrderView";
import { getMinionCreateEligibility } from "@/server/minionCreate";

const minionInclude = {
  traits: true,
  equippedWeaponInstance: { include: { baseItem: true } },
} as const;

export async function loadMinionPanelPayload(userId: string) {
  await ensureMinionEntitiesForUser(userId).catch((e) => {
    console.warn("[minionPanelPayload] ensureMinionEntitiesForUser", e);
  });

  const [armorByMinionId, minions, weaponInstances, armorInstances, iconMap, knightOrderRaw, userRow, minionCreate] =
    await Promise.all([
    loadMinionArmorIdsForUser(prisma, userId),
    prisma.minion.findMany({
      where: { userId },
      include: minionInclude,
      orderBy: [{ createdAt: "asc" }],
      take: 200,
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
    loadKnightOrderBonuses(prisma, userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { representativeMinionId: true },
    }),
    getMinionCreateEligibility(prisma, userId),
  ]);

  const armorInstById = new Map(
    armorInstances.map((a) => [a.id, { baseItemId: a.baseItemId, optionsJson: a.optionsJson }]),
  );

  return {
    maxDungeonOwned: MAX_DUNGEON_MINIONS,
    maxOwned: MAX_DUNGEON_MINIONS,
    representativeMinionId: userRow?.representativeMinionId ?? null,
    minionCreate,
    knightOrder: knightOrderToView(knightOrderRaw),
    minions: minions.map((m) =>
      mapMinionToListRow(m, armorByMinionId, { armorInstancesById: armorInstById }),
    ),
    weaponInstances: attachIcons(
      weaponInstances.map((w) => ({
        id: w.id,
        baseItemId: w.baseItemId,
        name: w.baseItem.name,
        enhanceLevel: w.enhanceLevel,
        ...itemGradeViewForItem(w.baseItemId, w.baseItem.grade),
        identified: parseEquipmentOptionsPayload(w.optionsJson).identified,
        options: formatEquipmentOptionDisplay(w.optionsJson, "weapon"),
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
        createdAt: a.createdAt,
        ...itemGradeViewForItem(a.baseItemId, a.baseItem.grade),
        identified: parseEquipmentOptionsPayload(a.optionsJson).identified,
        options: formatEquipmentOptionDisplay(a.optionsJson, "armor"),
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
