/** 플레이어 전문 직업(Prisma `SpecialistProfession`과 동일 문자열) */
export type SpecialistProfessionSlug = "BLACKSMITH" | "ALCHEMIST" | "JEWELER";

export const SPECIALIST_LABEL: Record<SpecialistProfessionSlug, string> = {
  BLACKSMITH: "대장장이",
  ALCHEMIST: "연금술사",
  JEWELER: "세공사",
};

export function specialistProfessionLabel(
  profession: SpecialistProfessionSlug | string | null | undefined,
): string | null {
  if (!profession) return null;
  return SPECIALIST_LABEL[profession as SpecialistProfessionSlug] ?? profession;
}

/** 예: [대장장이] */
export function specialistProfessionBadge(
  profession: SpecialistProfessionSlug | string | null | undefined,
): string | null {
  const label = specialistProfessionLabel(profession);
  return label ? `[${label}]` : null;
}

/** 예: yj030 [대장장이] */
export function formatNicknameWithSpecialist(
  username: string | null | undefined,
  profession: SpecialistProfessionSlug | string | null | undefined,
): string {
  if (!username?.trim()) return "미로그인";
  const badge = specialistProfessionBadge(profession);
  return badge ? `${username.trim()} ${badge}` : username.trim();
}

/** 예: [대장장이] yj030 */
export function formatSpecialistBeforeNickname(
  username: string | null | undefined,
  profession: SpecialistProfessionSlug | string | null | undefined,
): string {
  if (!username?.trim()) return "미로그인";
  const badge = specialistProfessionBadge(profession);
  const name = username.trim();
  return badge ? `${badge} ${name}` : name;
}

/** 가공(PROCESS) 시설 이름 → 필요한 플레이어 전문 직업 */
export function requiredSpecialistForProcessWorkshop(workshopName: string): SpecialistProfessionSlug | null {
  const n = workshopName.trim();
  if (["대장간", "제련소"].includes(n)) return "BLACKSMITH";
  if (["공방", "주점"].includes(n)) return "ALCHEMIST";
  if (["세공소", "분해소"].includes(n)) return "JEWELER";
  return null;
}

export function playerMatchesProcessWorkshop(
  workshopName: string,
  playerProfession: SpecialistProfessionSlug | string | null | undefined,
): boolean {
  const req = requiredSpecialistForProcessWorkshop(workshopName);
  if (req == null) return false;
  return playerProfession === req;
}

/** 전문 직업 선택 시 자동으로 열어 줄 가공 시설 이름 */
export function processWorkshopNamesForProfession(
  profession: SpecialistProfessionSlug,
): readonly string[] {
  switch (profession) {
    case "BLACKSMITH":
      return ["대장간", "제련소"];
    case "ALCHEMIST":
      return ["공방", "주점"];
    case "JEWELER":
      return ["세공소", "분해소"];
    default:
      return [];
  }
}
