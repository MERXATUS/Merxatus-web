import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { ensureMinionEntitiesForUser } from "@/server/ensureMinionEntitiesForUser";
import { upgradeCostForLevel } from "@/server/minionUpgradeRules";
import { GAME_RULES } from "@/server/gameRules";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ userId: url.searchParams.get("userId") ?? undefined });
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok)
    return Response.json({ ok: false, error: auth.error }, { status: 401 });

  await ensureMinionEntitiesForUser(auth.userId);

  /** If Prisma client is stale, findMany may omit grade; backfill from DB. */
  const gradeRows = await prisma.$queryRaw<Array<{ id: string; grade: string }>>`
    SELECT "id", "grade" FROM "Minion" WHERE "userId" = ${auth.userId}
  `;
  const gradeById = new Map(gradeRows.map((r) => [r.id, r.grade]));

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
    maxOwned: GAME_RULES.minion.maxOwned,
    minions: minions.map((m) => {
      const lv = m.level ?? 1;
      const gradeRaw = (m as { grade?: string | null }).grade;
      const grade = gradeById.get(m.id) ?? gradeRaw ?? "D";
      return {
        id: m.id,
        level: lv,
        grade,
        jobType: m.jobType,
        equippedWeaponInstanceId: m.equippedWeaponInstanceId ?? null,
        equippedWeapon: m.equippedWeaponInstance
          ? {
              id: m.equippedWeaponInstance.id,
              baseItemId: m.equippedWeaponInstance.baseItemId,
              name: m.equippedWeaponInstance.baseItem.name,
              enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
              grade: m.equippedWeaponInstance.baseItem.grade,
            }
          : null,
        assignedWorkshop: m.workshopAssignments?.[0]
          ? {
              workshopId: m.workshopAssignments[0].workshopId,
              workshopName: m.workshopAssignments[0].workshop.workshopType.name,
              workshopKind: m.workshopAssignments[0].workshop.workshopType.kind,
            }
          : null,
        traits: (m.traits ?? []).map((t) => ({ type: t.type, rank: t.rank, xp: t.xp })),
        nextUpgradeCost: lv >= GAME_RULES.minion.maxLevel ? null : upgradeCostForLevel(lv),
        maxLevel: GAME_RULES.minion.maxLevel,
        nextWeaponUpgradeCost: null,
      };
    }),
  });
}

