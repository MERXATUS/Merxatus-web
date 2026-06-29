import { requireUserId } from "@/server/auth";
import { jsonApiError } from "@/server/apiRouteError";
import { prisma } from "@/server/db";
import { stackAvailableQty } from "@/server/inventoryStackOps";
import { RAID_ENTRY_TICKET_ITEM_ID } from "@/shared/raidEntry";

export const runtime = "nodejs";

/** 레이드 입장권 보유량만 — 목록 메타는 클라이언트 정적 catalog */
export async function GET(req: Request) {
  try {
    const auth = requireUserId(req, null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    const [ticketStack, ticketItem] = await Promise.all([
      prisma.inventoryStack.findUnique({
        where: { userId_itemId: { userId: auth.userId, itemId: RAID_ENTRY_TICKET_ITEM_ID } },
      }),
      prisma.item.findUnique({
        where: { id: RAID_ENTRY_TICKET_ITEM_ID },
        select: { name: true },
      }),
    ]);

    return Response.json({
      ok: true as const,
      entryTicket: {
        itemId: RAID_ENTRY_TICKET_ITEM_ID,
        name: ticketItem?.name ?? "레이드 입장권",
        availableQty: ticketStack ? stackAvailableQty(ticketStack) : 0,
      },
    });
  } catch (e) {
    return jsonApiError(e);
  }
}
