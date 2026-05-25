import { migrateUserWorkshopPlot } from "@/server/workshopPlot";
import { getUserSpecialistRow } from "@/server/userSpecialistDb";
import { ensureSpecialistWorkshopsForUser } from "@/server/ensureSpecialistWorkshops";
import type { SpecialistProfessionSlug } from "@/shared/specialistProfession";
import { prisma } from "@/server/db";

/**
 * 로그인·목록 조회 시 호출: 레거시 시설 정리 + 전문 직업이 있으면 맞는 가공 시설 자동 설치.
 */
export async function ensureWorkshopsForUser(userId: string) {
  await migrateUserWorkshopPlot(userId);

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
