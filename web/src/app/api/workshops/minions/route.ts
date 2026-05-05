import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { collectWorkshopInTx, cappedGatherElapsedMs } from "@/server/workshops";
import { workshopMasterySnapshot } from "@/server/workshopMastery";
import { GAME_RULES } from "@/server/gameRules";

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

      const maxOwned = GAME_RULES.minion.maxOwned;
      const inv = await tx.minionInventory.upsert({
        where: { userId },
        create: { userId, owned: 1 },
        update: {},
      });

      // 현재 배치 수는 assignment 기준으로 계산한다.
      const prev = await tx.workshopAssignment.count({ where: { workshopId: ws.id } });

      let autoCollect: unknown = null;
      const now = new Date();

      // explicit mode: apply concrete changes first, then recompute next
      if (wantsExplicit) {
        const uniqAssign = Array.from(new Set(assignMinionIds));
        const uniqUnassign = Array.from(new Set(unassignMinionIds));

        // validate minions exist and belong to user (직업 무관 배치)
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
          }
        }

        // total assigned limit check (owned, 상한은 미니언 보유 수)
        const ownedCap = Math.min(inv.owned, maxOwned);
        const assignedTotal = await tx.workshopAssignment.count({ where: { workshop: { userId } } });
        if (assignedTotal + uniqAssign.length - uniqUnassign.length > ownedCap) throw new Error("NOT_ENOUGH_MINIONS");

        // Unassign requested minions (only those currently assigned to this workshop)
        if (uniqUnassign.length > 0) {
          await tx.workshopAssignment.deleteMany({
            where: { workshopId: ws.id, minionId: { in: uniqUnassign } },
          });
        }

        // Assign requested minions (must be free)
        for (const minionId of uniqAssign) {
          const existing = await tx.workshopAssignment.findUnique({ where: { minionId }, select: { id: true } });
          if (existing) throw new Error("MINION_ALREADY_ASSIGNED");
          const m = await tx.minion.findUnique({ where: { id: minionId }, select: { id: true, jobType: true, userId: true } });
          if (!m || m.userId !== userId) throw new Error("MINION_NOT_FOUND");
          await tx.workshopAssignment.create({
            data: { workshopId: ws.id, minionId: m.id, jobType: m.jobType },
          });
        }
      }

      const mid = await tx.workshopAssignment.count({ where: { workshopId: ws.id } });
      const next = wantsExplicit ? mid : Math.max(0, prev + delta);

      // 미니언을 옮기기 직전에 몰아 넣고 수령하면 (경과틱 × 새 미니언)으로 롤이 뻥튀기되는 것 방지:
      // "총 미수령 롤" = 경과틱 × 이전 미니언 수 를 유지하도록 lastCollectedAt을 재설정한다.
      if (prev > 0 && next > 0 && prev !== next) {
        const tickMs = workshopMasterySnapshot(ws.masteryXp).tickSeconds * 1000;
        const data: { minionCount: number; lastCollectedAt?: Date } = { minionCount: next };
        if (tickMs > 0) {
          const elapsedMs = Math.max(0, now.getTime() - new Date(ws.lastCollectedAt).getTime());
          const wholeTicks = Math.floor(cappedGatherElapsedMs(elapsedMs) / tickMs);
          if (wholeTicks > 0) {
            const rollBank = wholeTicks * prev;
            const newWholeTicks = Math.floor(rollBank / next);
            if (newWholeTicks > 0) {
              data.lastCollectedAt = new Date(now.getTime() - newWholeTicks * tickMs);
            } else {
              data.lastCollectedAt = now;
            }
          }
        }
        const updated = await tx.workshopInstance.update({ where: { id: ws.id }, data });
        // assignment는 아래에서 수행한다(데이터만 lastCollectedAt 조정)
      }

      // 0으로 내려가는 경우: 수집 시설은 먼저 자동 수령(assignment 기반 effectiveMinions 사용)
      if (next === 0 && prev > 0 && ws.workshopType.kind === "GATHER") {
        autoCollect = await collectWorkshopInTx(tx, { workshopId, userId });
      }

      if (!wantsExplicit && delta > 0) {
        const ownedCap = Math.min(inv.owned, maxOwned);
        const assignedTotal = await tx.workshopAssignment.count({ where: { workshop: { userId } } });
        if (assignedTotal + delta > ownedCap) throw new Error("NOT_ENOUGH_MINIONS");

        for (let i = 0; i < delta; i++) {
          const cand = await tx.minion.findFirst({
            where: {
              userId,
              workshopAssignments: { none: {} },
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
        if (removeN <= 0) {
          // already empty -> noop
          const updated = await tx.workshopInstance.update({
            where: { id: ws.id },
            data: ws.workshopType.kind === "GATHER" ? { minionCount: 0 } : { minionCount: 0, lastCollectedAt: now },
          });
          return { workshop: updated, autoCollect };
        }
        const rows = await tx.workshopAssignment.findMany({
          where: { workshopId: ws.id },
          orderBy: { createdAt: "desc" },
          take: removeN,
          select: { id: true },
        });
        if (rows.length === 0) {
          // race / already empty -> noop
          const updated = await tx.workshopInstance.update({
            where: { id: ws.id },
            data: ws.workshopType.kind === "GATHER" ? { minionCount: 0 } : { minionCount: 0, lastCollectedAt: now },
          });
          return { workshop: updated, autoCollect };
        }
        await tx.workshopAssignment.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      }

      const afterCount = await tx.workshopAssignment.count({ where: { workshopId: ws.id } });
      const updated = await tx.workshopInstance.update({
        where: { id: ws.id },
        data: ws.workshopType.kind === "GATHER" ? { minionCount: afterCount } : { minionCount: afterCount, lastCollectedAt: now },
      });

      return { workshop: updated, autoCollect };
    });

    return Response.json({
      ok: true,
      minionCount: result.workshop.minionCount,
      autoCollect: result.autoCollect,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
