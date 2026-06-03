import { prisma } from "@/server/db";
import { guardDevApi } from "@/server/devApiGuard";
import { createMinionWithBirth } from "@/server/minionInsert";
import { countDungeonMinions, MAX_DUNGEON_MINIONS } from "@/server/minionCapacity";

export const runtime = "nodejs";

/** @deprecated 수집 풀 제거 — 던전 미니언만 */
export async function POST() {
  const blocked = guardDevApi();
  if (blocked) return blocked;

  try {
    const users = await prisma.user.findMany({ select: { id: true }, take: 50 });
    let updated = 0;
    for (const u of users) {
      const n = await countDungeonMinions(prisma, u.id);
      if (n >= MAX_DUNGEON_MINIONS) continue;
      await createMinionWithBirth(prisma, { userId: u.id, level: 1 });
      updated++;
    }
    return Response.json({ ok: true, updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
