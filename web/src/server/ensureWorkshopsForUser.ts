import { migrateUserWorkshopPlot } from "@/server/workshopPlot";
import { getUserSpecialistRow } from "@/server/userSpecialistDb";
import { ensureSpecialistWorkshopsForUser } from "@/server/ensureSpecialistWorkshops";
import type { SpecialistProfessionSlug } from "@/shared/specialistProfession";
import { prisma } from "@/server/db";

const migrateCooldownMs = 60_000;
const lastMigrateAt = new Map<string, number>();

export function invalidateWorkshopEnsureCache(userId: string) {
  lastMigrateAt.delete(userId);
}

/**
 * 로그인·목록 조회 시 호출: 레거시 시설 정리 + 전문 직업이 있으면 맞는 가공 시설 자동 설치.
 * migrate는 유저당 1분에 한 번만(목록 새로고침마다 트랜잭션 경합 방지).
 */
export async function ensureWorkshopsForUser(userId: string) {
  const now = Date.now();
  const last = lastMigrateAt.get(userId) ?? 0;
  if (now - last >= migrateCooldownMs) {
    try {
      await migrateUserWorkshopPlot(userId);
      lastMigrateAt.set(userId, now);
    } catch (e) {
      console.warn("[ensureWorkshopsForUser] migrate skipped:", e);
    }
  }

  const row = await getUserSpecialistRow(prisma, userId);
  if (row?.specialistProfession) {
    const out = await ensureSpecialistWorkshopsForUser(
      userId,
      row.specialistProfession as SpecialistProfessionSlug,
    );
    return { ok: true as const, created: out.installed.length };
  }

  return { ok: true as const, created: 0 };
}
