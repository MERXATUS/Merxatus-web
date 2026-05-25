import { z } from "zod";

import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { createMinionWithBirth } from "@/server/minionInsert";
import { itemIconFieldsForItemId } from "@/server/itemCatalog";
import {
  assertCanHatchMinionJob,
  countDungeonMinions,
  countGatherMinions,
  syncMinionInventoryCaps,
} from "@/server/minionCapacity";
import { loadMinionCsvBundle, UNIFIED_MINION_RECRUIT_ITEM_ID } from "@/server/minionCsvData";
import { buildMinionRecruitBirth } from "@/server/minionRecruit";
import { verifyRecruitPickToken } from "@/server/minionRecruitPickToken";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  /** 고용권 items.csv / minion_tickets.csv ItemId */
  itemId: z.string().min(1).optional(),
  /** 통합 고용권(item_minion_ticket) 사용 시 필수 */
  category: z.enum(["GATHER", "DUNGEON"]).optional(),
  /** 후보 선택 확정 시 */
  jobType: z.string().min(1).optional(),
  pickToken: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const consumeItemId = parsed.data.itemId?.trim() || UNIFIED_MINION_RECRUIT_ITEM_ID;
  const category = parsed.data.category;
  const pickToken = parsed.data.pickToken?.trim();
  const jobTypeRaw = parsed.data.jobType?.trim().toUpperCase();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const stack = await tx.inventoryStack.findUnique({
        where: { userId_itemId: { userId: auth.userId, itemId: consumeItemId } },
      });
      const qty = stack?.quantity ?? 0;
      if (qty < 1) throw new Error("NO_RECRUIT_TICKET");

      if (!pickToken || !jobTypeRaw) throw new Error("RECRUIT_PICK_REQUIRED");

      const gatherCount = await countGatherMinions(tx, auth.userId);
      const dungeonCount = await countDungeonMinions(tx, auth.userId);

      const payload = verifyRecruitPickToken(pickToken, auth.userId);
      if (payload.itemId !== consumeItemId) throw new Error("PICK_TOKEN_MISMATCH");
      if (category && payload.category !== category) throw new Error("PICK_TOKEN_MISMATCH");
      if (!payload.candidates.includes(jobTypeRaw as (typeof payload.candidates)[number])) {
        throw new Error("INVALID_JOB_PICK");
      }

      const bundle = await loadMinionCsvBundle();
      const ticket = bundle.ticketsByItemId.get(consumeItemId);
      if (!ticket) throw new Error("INVALID_RECRUIT_ITEM");

      const birth = buildMinionRecruitBirth({
        ticket,
        category: payload.category,
        jobType: jobTypeRaw as (typeof payload.candidates)[number],
      });

      assertCanHatchMinionJob(birth.jobType, gatherCount, dungeonCount);

      await tx.inventoryStack.update({
        where: { userId_itemId: { userId: auth.userId, itemId: consumeItemId } },
        data: { quantity: { decrement: 1 } },
      });

      const created = await createMinionWithBirth(tx, {
        userId: auth.userId,
        level: birth.level,
        jobType: birth.jobType,
      });

      await syncMinionInventoryCaps(tx, auth.userId);

      const iconFields = await itemIconFieldsForItemId(consumeItemId);

      return {
        ok: true as const,
        minion: {
          id: created.id,
          level: created.level,
          jobType: created.jobType,
        },
        recruit: {
          itemId: birth.ticket.itemId,
          ticketNameKo: birth.ticket.nameKo,
          minionKind: birth.minionKind,
        },
        consumedItemId: consumeItemId,
        icon: iconFields.icon,
        iconSrc: iconFields.iconSrc,
      };
    });

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
