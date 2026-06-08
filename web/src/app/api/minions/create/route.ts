import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { assertCanCreateMinion } from "@/server/minionCreate";
import { createMinionWithBirth } from "@/server/minionInsert";
import { syncMinionInventoryCaps } from "@/server/minionCapacity";
import { verifyRecruitPickToken } from "@/server/minionRecruitPickToken";
import { minionBaseStatsFromRow } from "@/shared/minionBaseStats";
import { minionRoleLabel } from "@/server/minionJobs";
import { resolveMinionCombatClass } from "@/shared/minionPromotion";
import { MINION_CREATE_PICK_ITEM_ID } from "@/shared/minionCreate";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  candidateIndex: z.number().int().min(0),
  pickToken: z.string().min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const { candidateIndex, pickToken } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await assertCanCreateMinion(tx, auth.userId);

      const payload = verifyRecruitPickToken(pickToken, auth.userId);
      if (payload.itemId !== MINION_CREATE_PICK_ITEM_ID) throw new Error("PICK_TOKEN_MISMATCH");

      const pickedStats = payload.candidates[candidateIndex];
      if (!pickedStats) throw new Error("INVALID_CANDIDATE_PICK");

      const created = await createMinionWithBirth(tx, {
        userId: auth.userId,
        level: 1,
        baseStats: pickedStats,
      });

      await syncMinionInventoryCaps(tx, auth.userId);

      const baseStats = minionBaseStatsFromRow(created);
      const combatClass = resolveMinionCombatClass({ promotionTier: 0, promotionClass: "ADVENTURER" });

      return {
        ok: true as const,
        minion: {
          id: created.id,
          level: created.level,
          pool: "DUNGEON",
          baseStats,
          combatClass,
          combatClassLabel: minionRoleLabel({ combatClass }),
        },
        recruit: {
          itemId: MINION_CREATE_PICK_ITEM_ID,
          minionKind: "DUNGEON",
          ticketNameKo: "캐릭터 생성",
        },
        consumedItemId: MINION_CREATE_PICK_ITEM_ID,
      };
    });

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
