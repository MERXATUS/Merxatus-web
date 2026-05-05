import { migrateUserWorkshopPlot } from "@/server/workshopPlot";

/**
 * 로그인·목록 조회 시 호출: 레거시 시설(WorkshopInstance) 행을 부지 슬롯 규칙(최대 4칸)에 맞게 정리합니다.
 * 신규 유저는 시설 0개로 시작하며, 부지에서 타입을 골라 설치합니다.
 */
export async function ensureWorkshopsForUser(userId: string) {
  await migrateUserWorkshopPlot(userId);
  return { ok: true as const, created: 0 };
}
