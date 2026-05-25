import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { ensureMinionEntitiesForUser } from "@/server/ensureMinionEntitiesForUser";
import { MAX_DUNGEON_MINIONS, MAX_GATHER_MINIONS } from "@/server/minionCapacity";
import { buildMinionCombatBreakdown } from "@/server/minionCombatBuild";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";
import { armorIdsFromRow, loadMinionArmorIdsForUser } from "@/server/minionArmorDb";
import { getArmorStats } from "@/shared/armorStatsData";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ userId: url.searchParams.get("userId") ?? undefined });
    if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const auth = requireUserId(req, parsed.data.userId ?? null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    await ensureMinionEntitiesForUser(auth.userId);

    const armorByMinionId = await loadMinionArmorIdsForUser(prisma, auth.userId);

    const minions = await prisma.minion.findMany({
      where: { userId: auth.userId },
      include: {
        traits: true,
        equippedWeaponInstance: { include: { baseItem: true } },
        workshopAssignments: { include: { workshop: { include: { workshopType: true } } } },
      },
      orderBy: [{ createdAt: "asc" }],
      take: 200,
    });

    return Response.json({
      ok: true,
      maxGatherOwned: MAX_GATHER_MINIONS,
      maxDungeonOwned: MAX_DUNGEON_MINIONS,
      maxOwned: MAX_GATHER_MINIONS + MAX_DUNGEON_MINIONS,
      minions: minions.map((m) => {
        const lv = m.level ?? 1;
        const fighterRank = (m.traits ?? []).find((t) => t.type === "FIGHTER")?.rank ?? 0;
        const armorIds = armorIdsFromRow(armorByMinionId.get(m.id));
        const equippedArmor = {
          helmet: armorIds.equippedHelmetItemId
            ? {
                itemId: armorIds.equippedHelmetItemId,
                name: getArmorStats(armorIds.equippedHelmetItemId)?.name ?? armorIds.equippedHelmetItemId,
                grade: getArmorStats(armorIds.equippedHelmetItemId)?.grade ?? 1,
              }
            : null,
          armor: armorIds.equippedChestItemId
            ? {
                itemId: armorIds.equippedChestItemId,
                name: getArmorStats(armorIds.equippedChestItemId)?.name ?? armorIds.equippedChestItemId,
                grade: getArmorStats(armorIds.equippedChestItemId)?.grade ?? 1,
              }
            : null,
          pants: armorIds.equippedPantsItemId
            ? {
                itemId: armorIds.equippedPantsItemId,
                name: getArmorStats(armorIds.equippedPantsItemId)?.name ?? armorIds.equippedPantsItemId,
                grade: getArmorStats(armorIds.equippedPantsItemId)?.grade ?? 1,
              }
            : null,
          shoes: armorIds.equippedBootsItemId
            ? {
                itemId: armorIds.equippedBootsItemId,
                name: getArmorStats(armorIds.equippedBootsItemId)?.name ?? armorIds.equippedBootsItemId,
                grade: getArmorStats(armorIds.equippedBootsItemId)?.grade ?? 1,
              }
            : null,
        };
        const combatStats = buildMinionCombatBreakdown({
          level: lv,
          fighterRank,
          weapon: m.equippedWeaponInstance
            ? {
                baseItemId: m.equippedWeaponInstance.baseItemId,
                enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
                optionsJson: m.equippedWeaponInstance.optionsJson,
              }
            : null,
          armor: armorIds,
        });
        return {
          id: m.id,
          level: lv,
          jobType: m.jobType,
          equippedWeaponInstanceId: m.equippedWeaponInstanceId ?? null,
          equippedHelmetItemId: armorIds.equippedHelmetItemId,
          equippedChestItemId: armorIds.equippedChestItemId,
          equippedPantsItemId: armorIds.equippedPantsItemId,
          equippedBootsItemId: armorIds.equippedBootsItemId,
          equippedWeapon: m.equippedWeaponInstance?.baseItem
            ? {
                id: m.equippedWeaponInstance.id,
                baseItemId: m.equippedWeaponInstance.baseItemId,
                name: m.equippedWeaponInstance.baseItem.name,
                enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
                grade: m.equippedWeaponInstance.baseItem.grade,
              }
            : m.equippedWeaponInstance
              ? {
                  id: m.equippedWeaponInstance.id,
                  baseItemId: m.equippedWeaponInstance.baseItemId,
                  name: m.equippedWeaponInstance.baseItemId,
                  enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
                  grade: 1,
                }
              : null,
          equippedArmor,
          combatStats,
          assignedWorkshop: m.workshopAssignments?.[0]
            ? {
                workshopId: m.workshopAssignments[0].workshopId,
                workshopName: m.workshopAssignments[0].workshop.workshopType.name,
                workshopKind: m.workshopAssignments[0].workshop.workshopType.kind,
              }
            : null,
          traits: (m.traits ?? []).map((t) => ({ type: t.type, rank: t.rank, xp: t.xp })),
        };
      }),
    });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/minions/list]", e);
    return Response.json(
      { ok: false, error: "INTERNAL_SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
