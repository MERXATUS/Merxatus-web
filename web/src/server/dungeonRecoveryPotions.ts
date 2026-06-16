import type { PrismaClient } from "@prisma/client";
import { listHpRecoveryPotionIds, loadPotionEffects } from "@/server/potionEffectsData";
import { formatPotionHealLabel } from "@/shared/potionEffects";

export type RecoveryPotionRow = {
  itemId: string;
  name: string;
  quantity: number;
  grade: number;
  healLabel: string;
  effectValue: string;
};

/** PUSH_LUCK 던전 탐험 중 사용 가능한 HP 회복 물약 인벤 목록 */
export async function loadUserRecoveryPotions(
  db: PrismaClient,
  userId: string,
  dungeonMode: string,
): Promise<RecoveryPotionRow[]> {
  if (dungeonMode !== "PUSH_LUCK") return [];

  const potionIds = await listHpRecoveryPotionIds();
  if (potionIds.length === 0) return [];

  const [effects, stacks, items] = await Promise.all([
    loadPotionEffects(),
    db.inventoryStack.findMany({
      where: { userId, itemId: { in: potionIds }, quantity: { gt: 0 } },
      select: { itemId: true, quantity: true },
    }),
    db.item.findMany({
      where: { id: { in: potionIds } },
      select: { id: true, name: true, grade: true },
    }),
  ]);

  const itemById = new Map(items.map((it) => [it.id, it]));
  return stacks
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
    .filter((x): x is RecoveryPotionRow => x != null)
    .sort((a, b) => a.grade - b.grade);
}
