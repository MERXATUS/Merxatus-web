import type { PrismaClient } from "@prisma/client";
import { migrateLegacyEnhanceScrolls } from "@/server/migrateLegacyEnhanceScrolls";
import { purgeOrphanInventory } from "@/server/purgeOrphanInventory";

const HYGIENE_TTL_MS = 30 * 60 * 1000;
const lastHygieneAt = new Map<string, number>();

/** 인벤 정리·레거시 마이그레이션 — 유저당 30분에 1회, 응답을 막지 않음 */
export function scheduleInventoryHygiene(db: PrismaClient, userId: string) {
  const now = Date.now();
  const last = lastHygieneAt.get(userId) ?? 0;
  if (now - last < HYGIENE_TTL_MS) return;
  lastHygieneAt.set(userId, now);

  void (async () => {
    await migrateLegacyEnhanceScrolls(db, userId).catch(() => {});
    await purgeOrphanInventory(db, { userId }).catch(() => {});
  })();
}
