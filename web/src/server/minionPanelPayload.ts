import { prisma } from "@/server/db";
import { ensureMinionEntitiesForUser } from "@/server/ensureMinionEntitiesForUser";
import { attachIcons, getItemIconMap } from "@/server/itemCatalog";
import { itemGradeLabel } from "@/server/itemGrade";
import { loadMinionArmorIdsForUser } from "@/server/minionArmorDb";
import { MAX_DUNGEON_MINIONS } from "@/server/minionCapacity";
import { mapMinionToListRow } from "@/server/minionListBuild";
import { formatOptionRows, parseOptionsJson } from "@/server/itemOptions";

const minionInclude = {
  traits: true,
  equippedWeaponInstance: { include: { baseItem: true } },
} as const;

export async function loadMinionPanelPayload(userId: string) {
  void ensureMinionEntitiesForUser(userId).catch((e) => {
    console.warn("[minionPanelPayload] ensureMinionEntitiesForUser", e);
  });

  const [armorByMinionId, minions, weaponInstances, armorInstances, iconMap] = await Promise.all([
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
  ]);

  const armorInstById = new Map(
    armorInstances.map((a) => [a.id, { baseItemId: a.baseItemId, optionsJson: a.optionsJson }]),
  );

  return {
    maxDungeonOwned: MAX_DUNGEON_MINIONS,
    maxOwned: MAX_DUNGEON_MINIONS,
    minions: minions.map((m) =>
      mapMinionToListRow(m, armorByMinionId, { armorInstancesById: armorInstById }),
    ),
    weaponInstances: attachIcons(
      weaponInstances.map((w) => ({
        id: w.id,
        baseItemId: w.baseItemId,
        name: w.baseItem.name,
        enhanceLevel: w.enhanceLevel,
        grade: w.baseItem.grade,
        gradeLabel: itemGradeLabel(w.baseItem.grade),
        options: formatOptionRows(parseOptionsJson(w.optionsJson), "weapon"),
      })),
      iconMap,
      "baseItemId",
    ),
    armorInstances: attachIcons(
      armorInstances.map((a) => ({
        id: a.id,
        baseItemId: a.baseItemId,
        name: a.baseItem.name,
        createdAt: a.createdAt,
        grade: a.baseItem.grade,
        gradeLabel: itemGradeLabel(a.baseItem.grade),
        options: formatOptionRows(parseOptionsJson(a.optionsJson), "armor"),
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
