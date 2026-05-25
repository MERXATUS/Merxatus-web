import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { loadDungeons } from "@/server/dungeonData";
import { getActiveRunCombatPreview } from "@/server/dungeonRun";

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

    const combatPreview = await getActiveRunCombatPreview(auth.userId);
    const partyPower = combatPreview?.partyPower ?? 0;
    const clearChance = combatPreview?.clearChance ?? 0;
    const hpByMinion = new Map((combatPreview?.partyHp ?? []).map((e) => [e.minionId, e]));

    const now = Date.now();
    const elapsedSec = Math.max(0, Math.floor((now - new Date(run.lastTickAt).getTime()) / 1000));
    const availableWaves = Math.floor(elapsedSec / dungeon.baseWaveSeconds);

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
        floor: run.floor ?? 1,
      },
      party: run.party.map((p) => {
        const hp = hpByMinion.get(p.minionId);
        return {
          minionId: p.minionId,
          weaponItemId: weaponById.get(p.minion.equippedWeaponInstanceId ?? "")?.baseItemId ?? null,
          weaponLevel: weaponById.get(p.minion.equippedWeaponInstanceId ?? "")?.enhanceLevel ?? 0,
          hp: hp?.hp,
          maxHp: hp?.maxHp,
          label: hp?.label,
        };
      }),
      dungeon,
      combat: { partyPower, clearChance },
      availableWaves,
      pendingLoot: run.pendingLootJson ?? "[]",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

