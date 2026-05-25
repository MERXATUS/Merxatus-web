import { z } from "zod";

import { prisma } from "@/server/db";

import { requireUserId } from "@/server/auth";

import { collectWorkshopInTx } from "@/server/workshops";

import {

  countGatherMinions,

  countGatherWorkshopAssignments,

  gatherMinionWhere,

  MAX_GATHER_MINIONS,

} from "@/server/minionCapacity";

import { assertMinionJobAllowedAtGatherWorkshop, getAllowedJobsForWorkshopName, isDungeonMinionJob } from "@/server/minionJobs";



export const runtime = "nodejs";



const BodySchema = z.object({

  userId: z.string().min(1).optional(),

  workshopId: z.string().min(1),

  // legacy: count-based adjustment (auto-select minions)

  delta: z.number().int().optional(),

  // new: explicit minion assignment control

  assignMinionIds: z.array(z.string().min(1)).optional(),

  unassignMinionIds: z.array(z.string().min(1)).optional(),

});



export async function POST(req: Request) {

  const json = await req.json().catch(() => null);

  const parsed = BodySchema.safeParse(json);

  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });



  const auth = requireUserId(req, parsed.data.userId ?? null);

  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const userId = auth.userId;

  const { workshopId } = parsed.data;

  const delta = parsed.data.delta ?? 0;

  const assignMinionIds = parsed.data.assignMinionIds ?? [];

  const unassignMinionIds = parsed.data.unassignMinionIds ?? [];

  const wantsExplicit = assignMinionIds.length > 0 || unassignMinionIds.length > 0;

  if (!wantsExplicit && delta === 0) return Response.json({ ok: true });



  try {

    const result = await prisma.$transaction(async (tx) => {

      const ws = await tx.workshopInstance.findUnique({

        where: { id: workshopId },

        include: { workshopType: true },

      });

      if (!ws) throw new Error("WORKSHOP_NOT_FOUND");

      if (ws.userId !== userId) throw new Error("FORBIDDEN");

      if (ws.workshopType.kind === "PROCESS") throw new Error("MINION_ASSIGNMENT_DISABLED_FOR_PROCESS");



      await tx.minionInventory.upsert({

        where: { userId },

        create: { userId, owned: 1, gatherOwned: 1, dungeonOwned: 0 },

        update: {},

      });



      const prev = await tx.workshopAssignment.count({ where: { workshopId: ws.id } });

      let autoCollect: unknown = null;

      const now = new Date();



      if (wantsExplicit) {

        const uniqAssign = Array.from(new Set(assignMinionIds));

        const uniqUnassign = Array.from(new Set(unassignMinionIds));



        if (uniqAssign.length > 0) {

          const mins = await tx.minion.findMany({

            where: { id: { in: uniqAssign }, userId },

            select: { id: true, jobType: true },

            take: 500,

          });

          const byId = new Map(mins.map((m) => [m.id, m]));

          for (const id of uniqAssign) {

            const m = byId.get(id);

            if (!m) throw new Error("MINION_NOT_FOUND");

            if (isDungeonMinionJob(m.jobType)) throw new Error("DUNGEON_MINION_CANNOT_ASSIGN_WORKSHOP");

            if (ws.workshopType.kind === "GATHER") {

              assertMinionJobAllowedAtGatherWorkshop(ws.workshopType.name, m.jobType);

            }

          }

        }



        const gatherCap = Math.min(await countGatherMinions(tx, userId), MAX_GATHER_MINIONS);

        const assignedTotal = await countGatherWorkshopAssignments(tx, userId);

        if (assignedTotal + uniqAssign.length - uniqUnassign.length > gatherCap) throw new Error("NOT_ENOUGH_MINIONS");



        if (uniqUnassign.length > 0) {

          await tx.workshopAssignment.deleteMany({

            where: { workshopId: ws.id, minionId: { in: uniqUnassign } },

          });

        }



        for (const minionId of uniqAssign) {

          const existing = await tx.workshopAssignment.findUnique({ where: { minionId }, select: { id: true } });

          if (existing) throw new Error("MINION_ALREADY_ASSIGNED");

          const m = await tx.minion.findUnique({

            where: { id: minionId },

            select: { id: true, jobType: true, userId: true },

          });

          if (!m || m.userId !== userId) throw new Error("MINION_NOT_FOUND");

          if (isDungeonMinionJob(m.jobType)) throw new Error("DUNGEON_MINION_CANNOT_ASSIGN_WORKSHOP");

          if (ws.workshopType.kind === "GATHER") {

            assertMinionJobAllowedAtGatherWorkshop(ws.workshopType.name, m.jobType);

          }

          await tx.workshopAssignment.create({

            data: { workshopId: ws.id, minionId: m.id, jobType: m.jobType },

          });

        }

      }



      const mid = await tx.workshopAssignment.count({ where: { workshopId: ws.id } });

      const next = wantsExplicit ? mid : Math.max(0, prev + delta);



      if (next === 0 && prev > 0 && ws.workshopType.kind === "GATHER") {

        try {

          autoCollect = await collectWorkshopInTx(tx, { workshopId, userId });

        } catch (e) {

          if (!(e instanceof Error && e.message === "COLLECT_NOT_READY")) throw e;

        }

      }



      if (!wantsExplicit && delta > 0) {

        const gatherCap = Math.min(await countGatherMinions(tx, userId), MAX_GATHER_MINIONS);

        const assignedTotal = await countGatherWorkshopAssignments(tx, userId);

        if (assignedTotal + delta > gatherCap) throw new Error("NOT_ENOUGH_MINIONS");



        const gatherAllowed =

          ws.workshopType.kind === "GATHER" ? getAllowedJobsForWorkshopName(ws.workshopType.name) : [];



        for (let i = 0; i < delta; i++) {

          const cand = await tx.minion.findFirst({

            where: {

              ...gatherMinionWhere(userId),

              workshopAssignments: { none: {} },

              ...(gatherAllowed.length > 0 ? { jobType: { in: [...gatherAllowed] } } : {}),

            },

            orderBy: { createdAt: "asc" },

          });

          if (!cand) throw new Error("NO_AVAILABLE_MINION_FOR_JOB");



          await tx.workshopAssignment.create({

            data: { workshopId: ws.id, minionId: cand.id, jobType: cand.jobType },

          });

        }

      } else if (!wantsExplicit && delta < 0) {

        const removeN = Math.min(prev, Math.abs(delta));

        if (removeN > 0) {

          const rows = await tx.workshopAssignment.findMany({

            where: { workshopId: ws.id },

            orderBy: { createdAt: "desc" },

            take: removeN,

            select: { id: true },

          });

          if (rows.length > 0) {

            await tx.workshopAssignment.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });

          }

        }

      }



      const afterCount = await tx.workshopAssignment.count({ where: { workshopId: ws.id } });

      const ticksReset = ws.workshopType.kind === "GATHER" && prev !== afterCount;

      const updated = await tx.workshopInstance.update({

        where: { id: ws.id },

        data: {

          minionCount: afterCount,

          ...(ticksReset || ws.workshopType.kind !== "GATHER" ? { lastCollectedAt: now } : {}),

        },

      });



      return { workshop: updated, autoCollect, ticksReset };

    });



    return Response.json({

      ok: true,

      minionCount: result.workshop.minionCount,

      autoCollect: result.autoCollect,

      ticksReset: result.ticksReset,

      lastCollectedAt: result.workshop.lastCollectedAt.toISOString(),

    });

  } catch (e) {

    const message = e instanceof Error ? e.message : "UNKNOWN";

    return Response.json({ ok: false, error: message }, { status: 400 });

  }

}


