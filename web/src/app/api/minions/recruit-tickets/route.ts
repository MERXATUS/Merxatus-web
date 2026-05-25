import { z } from "zod";

import { requireUserId } from "@/server/auth";

import { loadMinionCsvBundle } from "@/server/minionCsvData";



export const runtime = "nodejs";



const QuerySchema = z.object({

  userId: z.string().min(1).optional(),

});



export async function GET(req: Request) {

  const url = new URL(req.url);

  const parsed = QuerySchema.safeParse({ userId: url.searchParams.get("userId") ?? undefined });

  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });



  const auth = requireUserId(req, parsed.data.userId ?? null);

  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });



  try {

    const bundle = await loadMinionCsvBundle();

    const tickets = [...bundle.ticketsByItemId.values()].map((t) => ({

      itemId: t.itemId,

      nameKo: t.nameKo,

      pickCount: t.pickCount,

    }));

    return Response.json({ ok: true, tickets });

  } catch (e) {

    const message = e instanceof Error ? e.message : "UNKNOWN";

    return Response.json({ ok: false, error: message }, { status: 500 });

  }

}

