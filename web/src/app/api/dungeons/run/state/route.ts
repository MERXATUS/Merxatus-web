import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { loadDungeons } from "@/server/dungeonData";
import { computePartyPower, computeWinRate } from "@/server/dungeonCombat";
import { weaponCombatBonusFromOptions } from "@/server/itemOptions";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ userId: url.searchParams.get("userId") ?? undefined });
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok)
    return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const run = await prisma.dungeonRun.findFirst({
      where: { userId: auth.userId, status: "RUNNING" },
      orderBy: { startedAt: "desc" },
      include: { party: { include: { minion: true } } },
    });
    if (!run) return Response.json({ ok: true, active: false });

    const { dungeons } = await loadDungeons();
    const dungeon = dungeons.find((d) => d.id === run.dungeonId);
    if (!dungeon) return Response.json({ ok: false, error: "DUNGEON_DEF_MISSING" }, { status: 500 });

    const minionIds = run.party.map((p) => p.minionId);
    const traits = await prisma.minionTrait.findMany({
      where: { minionId: { in: minionIds }, type: "FIGHTER" },
      select: { minionId: true, rank: true },
      take: 50,
    });
    const fighterByMinionId = new Map(traits.map((t) => [t.minionId, t.rank]));

    const weaponInstanceIds = run.party
      .map((p) => p.minion.equippedWeaponInstanceId)
      .filter(Boolean) as string[];
    const weapons = weaponInstanceIds.length
      ? await prisma.weaponInstance.findMany({
          where: { id: { in: weaponInstanceIds }, userId: auth.userId },
          include: { baseItem: true },
          take: 50,
        })
      : [];
    const weaponById = new Map(weapons.map((w) => [w.id, w]));

    const partyPower = computePartyPower({
      members: run.party.map((m) => {
        const wi = weaponById.get(m.minion.equippedWeaponInstanceId ?? "");
        return {
          weaponBaseItemId: wi?.baseItemId ?? null,
          weaponEnhanceLevel: wi?.enhanceLevel ?? 0,
          weaponOptionBonus: wi ? weaponCombatBonusFromOptions(wi.optionsJson) : 0,
          level: m.minion.level,
          fighterRank: fighterByMinionId.get(m.minionId) ?? 0,
          minionGrade: m.minion.grade,
        };
      }),
    });
    const winRate = computeWinRate({ partyPower, dungeon });

    const now = Date.now();
    const elapsedSec = Math.max(0, Math.floor((now - new Date(run.lastTickAt).getTime()) / 1000));
    const availableWaves = Math.floor(elapsedSec / dungeon.baseWaveSeconds);

    const extra = (await (prisma as any).$queryRawUnsafe(
      `SELECT "floor" as floor, "pendingLootJson" as pendingLootJson FROM "DungeonRun" WHERE "id" = ? LIMIT 1`,
      run.id,
    )) as any;
    const e0 = Array.isArray(extra) ? extra[0] : extra;

    return Response.json({
      ok: true,
      active: true,
      run: {
        id: run.id,
        dungeonId: run.dungeonId,
        status: run.status,
        startedAt: run.startedAt,
        lastTickAt: run.lastTickAt,
        wins: run.wins,
        losses: run.losses,
        floor: e0?.floor ?? 1,
      },
      party: run.party.map((p) => ({
        minionId: p.minionId,
        weaponItemId: weaponById.get(p.minion.equippedWeaponInstanceId ?? "")?.baseItemId ?? null,
        weaponLevel: weaponById.get(p.minion.equippedWeaponInstanceId ?? "")?.enhanceLevel ?? 0,
      })),
      dungeon,
      combat: { partyPower, winRate },
      availableWaves,
      pendingLoot: e0?.pendingLootJson ?? "[]",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

