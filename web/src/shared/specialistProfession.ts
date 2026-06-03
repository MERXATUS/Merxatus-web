/** @deprecated 전문 직업 시스템 제거 — 닉네임만 표시 */
export function formatSpecialistBeforeNickname(
  username: string | null | undefined,
  _specialistProfession?: string | null,
) {
  return username?.trim() || "플레이어";
}
