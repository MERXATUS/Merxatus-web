import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { ensureMinionEntitiesForUser } from "@/server/ensureMinionEntitiesForUser";
import { MAX_DUNGEON_MINIONS } from "@/server/minionCapacity";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";
import { loadMinionArmorIdsForUser } from "@/server/minionArmorDb";
import { mapMinionToListRow } from "@/server/minionListBuild";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
  selectedId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      userId: url.searchParams.get("userId") ?? undefined,
      selectedId: url.searchParams.get("selectedId") ?? undefined,
    });
    if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const auth = requireUserId(req, parsed.data.userId ?? null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    void ensureMinionEntitiesForUser(auth.userId).catch((e) => {
      console.warn("[api/minions/list] ensureMinionEntitiesForUser", e);
    });

    const [armorByMinionId, minions] = await Promise.all([
      loadMinionArmorIdsForUser(prisma, auth.userId),
      prisma.minion.findMany({
        where: { userId: auth.userId },
        include: {
          traits: true,
          equippedWeaponInstance: { include: { baseItem: true } },
        },
        orderBy: [{ createdAt: "asc" }],
        take: 200,
      }),
    ]);

    return Response.json({
      ok: true,
      maxDungeonOwned: MAX_DUNGEON_MINIONS,
      maxOwned: MAX_DUNGEON_MINIONS,
      minions: minions.map((m) =>
        mapMinionToListRow(m, armorByMinionId, { detailMinionId: parsed.data.selectedId ?? null }),
      ),
    });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/minions/list]", e);
    return Response.json({ ok: false, error: "INTERNAL_SERVER_ERROR", message }, { status: 500 });
  }
}
