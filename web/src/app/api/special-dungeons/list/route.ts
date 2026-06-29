import { loadSpecialDungeons } from "@/server/specialDungeonData";
import { specialDungeonTicketCost } from "@/shared/specialDungeon";

export const runtime = "nodejs";

export async function GET() {
  const { dungeons } = await loadSpecialDungeons();
  return Response.json({
    ok: true,
    dungeons: dungeons.map((d) => ({
      id: d.id,
      name: d.name,
      mode: d.mode,
      maxFloors: d.maxFloors ?? 20,
      maxPartySize: d.maxPartySize ?? 1,
      linkedStageOrder: d.linkedStageOrder,
      ticketCost: d.ticketCost ?? specialDungeonTicketCost(d.linkedStageOrder),
    })),
  });
}
