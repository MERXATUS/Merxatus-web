import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { loadDungeons } from "@/server/dungeonData";
import { getActiveRunCombatPreview, resolvePendingLootDisplay } from "@/server/dungeonRun";
import { listHpRecoveryPotionIds, loadPotionEffects } from "@/server/potionEffectsData";
import { formatPotionHealLabel } from "@/shared/potionEffects";

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

    const combatPreview = await getActiveRunCombatPreview(auth.userId, {
      existingRun: run,
      dungeon,
      skipClearChance: true,
    });
    const partyPower = combatPreview?.partyPower ?? 0;
    const clearChance = combatPreview?.clearChance ?? 0;
    const hpByMinion = new Map((combatPreview?.partyHp ?? []).map((e) => [e.minionId, e]));

    const now = Date.now();
    const elapsedSec = Math.max(0, Math.floor((now - new Date(run.lastTickAt).getTime()) / 1000));
    const availableWaves = Math.floor(elapsedSec / dungeon.baseWaveSeconds);
    const pendingLootItems = await resolvePendingLootDisplay(prisma, run.pendingLootJson ?? "[]");

    let recoveryPotions: Array<{
      itemId: string;
      name: string;
      quantity: number;
      grade: number;
      healLabel: string;
      effectValue: string;
    }> = [];
    if (dungeon.mode === "PUSH_LUCK") {
      const potionIds = await listHpRecoveryPotionIds();
      if (potionIds.length > 0) {
        const [effects, stacks, items] = await Promise.all([
          loadPotionEffects(),
          prisma.inventoryStack.findMany({
            where: { userId: auth.userId, itemId: { in: potionIds }, quantity: { gt: 0 } },
            select: { itemId: true, quantity: true },
          }),
          prisma.item.findMany({
            where: { id: { in: potionIds } },
            select: { id: true, name: true, grade: true },
          }),
        ]);
        const itemById = new Map(items.map((it) => [it.id, it]));
        recoveryPotions = stacks
          .map((s) => {
            const effect = effects.get(s.itemId);
            const item = itemById.get(s.itemId);
            if (!effect || effect.effectType !== "HP_Recovery") return null;
            return {
              itemId: s.itemId,
              name: item?.name ?? effect.name,
              quantity: s.quantity,
              grade: item?.grade ?? effect.grade,
              healLabel: formatPotionHealLabel(effect.effectValue),
              effectValue: effect.effectValue,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x != null)
          .sort((a, b) => a.grade - b.grade);
      }
    }

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
      pendingLootItems,
      pendingGold: Math.max(0, Math.floor(run.pendingGold ?? 0)),
      recoveryPotions,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

