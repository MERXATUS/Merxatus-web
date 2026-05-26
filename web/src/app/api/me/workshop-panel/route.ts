import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { getUserSpecialistRow } from "@/server/userSpecialistDb";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
});

/** 작업장 패널(전문)용 가벼운 상태 — 무기/매물/아이콘 조회 없음 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ userId: url.searchParams.get("userId") ?? undefined });
    if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const auth = requireUserId(req, parsed.data.userId ?? null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });
    const userId = auth.userId;

    const [userLite, wallet, stacks] = await Promise.all([
      getUserSpecialistRow(prisma, userId),
      prisma.wallet.findUnique({ where: { userId } }),
      prisma.inventoryStack.findMany({
        where: { userId, quantity: { gt: 0 } },
        include: { item: { select: { name: true } } },
        orderBy: [{ itemId: "asc" }],
        take: 500,
      }),
    ]);

    return Response.json({
      ok: true,
      wallet: wallet ?? { goldAvailable: 0, goldLocked: 0 },
      inventory: stacks.map((s) => ({
        itemId: s.itemId,
        name: s.item.name,
        quantity: s.quantity,
      })),
      specialistUnlocked: userLite?.specialistUnlocked ?? false,
      specialistProfession: userLite?.specialistProfession ?? null,
    });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
