import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { getAllowedJobsForWorkshopName, getPreferredJobsForWorkshopName } from "@/server/minionJobs";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
  workshopId: z.string().min(1),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    userId: url.searchParams.get("userId") ?? undefined,
    workshopId: url.searchParams.get("workshopId"),
  });
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });
  const userId = auth.userId;

  const ws = await prisma.workshopInstance.findUnique({
    where: { id: parsed.data.workshopId },
    include: { workshopType: true },
  });
  if (!ws) return Response.json({ ok: false, error: "WORKSHOP_NOT_FOUND" }, { status: 404 });
  if (ws.userId !== userId) return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const allowedJobs = getAllowedJobsForWorkshopName(ws.workshopType.name);
  const preferredJobs = getPreferredJobsForWorkshopName(ws.workshopType.name);

  const rows = await prisma.workshopAssignment.findMany({
    where: { workshopId: ws.id },
    include: { minion: true },
    orderBy: [{ createdAt: "asc" }],
    take: 500,
  });

  return Response.json({
    ok: true,
    workshop: { id: ws.id, name: ws.workshopType.name, kind: ws.workshopType.kind },
    allowedJobs,
    preferredJobs,
    assigned: rows.map((r) => ({
      assignmentId: r.id,
      minionId: r.minionId,
      jobType: r.minion.jobType,
      createdAt: r.createdAt,
    })),
  });
}

