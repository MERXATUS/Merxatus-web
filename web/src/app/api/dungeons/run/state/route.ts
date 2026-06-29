import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { loadDungeons, type DungeonDef } from "@/server/dungeonData";
import { findDungeonById } from "@/server/specialDungeonData";
import { getIdleDungeonState } from "@/server/dungeonIdleRun";
import { resolvePendingLootDisplay } from "@/server/dungeonRun";
import { loadUserRecoveryPotions } from "@/server/dungeonRecoveryPotions";
import { parsePartyHpJson } from "@/shared/dungeonPartyHp";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
  lite: z.string().optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    userId: url.searchParams.get("userId") ?? undefined,
    lite: url.searchParams.get("lite") ?? undefined,
  });
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok)
    return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    await prisma.dungeonRun.updateMany({
      where: { userId: auth.userId, status: "RUNNING", autoExplore: true },
      data: { status: "STOPPED" },
    });

    const run = await prisma.dungeonRun.findFirst({
      where: { userId: auth.userId, status: "RUNNING", autoExplore: false },
      orderBy: { startedAt: "desc" },
      include: { party: { include: { minion: true } } },
    });
    if (!run) return Response.json({ ok: true, active: false });

    const { dungeons } = await loadDungeons();
    const dungeon = await findDungeonById(run.dungeonId);
    if (!dungeon) return Response.json({ ok: false, error: "DUNGEON_DEF_MISSING" }, { status: 500 });

    if (dungeon.mode === "IDLE") {
      const idleState = await getIdleDungeonState(auth.userId, dungeon as DungeonDef);
      return Response.json({ ...idleState, idle: true });
    }

    const lite = parsed.data.lite !== "0" && parsed.data.lite !== "false";
    if (lite) {
      const partyHpEntries = parsePartyHpJson(run.partyHpJson);
      const now = Date.now();
      const elapsedSec = Math.max(0, Math.floor((now - new Date(run.lastTickAt).getTime()) / 1000));
      const availableWaves = Math.floor(elapsedSec / dungeon.baseWaveSeconds);
      const recoveryPotions = await loadUserRecoveryPotions(prisma, auth.userId, dungeon.mode);
      return Response.json({
        ok: true,
        active: true,
        combatActive: false,
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
          const hp = partyHpEntries.find((e) => e.minionId === p.minionId);
          return {
            minionId: p.minionId,
            weaponItemId: null,
            weaponLevel: 0,
            hp: hp?.hp,
            maxHp: hp?.maxHp,
            label: hp?.label,
          };
        }),
        dungeon,
        combat: { partyPower: 0 },
        availableWaves,
        pendingLoot: run.pendingLootJson ?? "[]",
        pendingLootItems: [],
        pendingGold: Math.max(0, Math.floor(run.pendingGold ?? 0)),
        recoveryPotions,
      });
    }

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

    // full 모드: partyPower/hp 계산은 loadPartyCombatRows를 거치므로 비용이 크다.
    const partyPower = 0;
    const hpByMinion = new Map(parsePartyHpJson(run.partyHpJson).map((e) => [e.minionId, e]));

    const now = Date.now();
    const elapsedSec = Math.max(0, Math.floor((now - new Date(run.lastTickAt).getTime()) / 1000));
    const availableWaves = Math.floor(elapsedSec / dungeon.baseWaveSeconds);
    const pendingLootItems = await resolvePendingLootDisplay(prisma, run.pendingLootJson ?? "[]");
    const recoveryPotions = await loadUserRecoveryPotions(prisma, auth.userId, dungeon.mode);

    return Response.json({
      ok: true,
      active: true,
      combatActive: false,
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
      combat: { partyPower },
      availableWaves,
      pendingLoot: run.pendingLootJson ?? "[]",
      pendingLootItems,
      pendingGold: Math.max(0, Math.floor(run.pendingGold ?? 0)),
      recoveryPotions,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

