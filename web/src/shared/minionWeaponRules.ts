/** 무기 베이스 아이템 id 패턴으로 구분 (검 / 활 / 지팡이) */
export type WeaponArchetype = "SWORD" | "BOW" | "STAFF";

const ARCHETYPE_LABEL: Record<WeaponArchetype, string> = {
  SWORD: "검",
  BOW: "활",
  STAFF: "지팡이",
};

/** 직업이 착용 가능한 무기 종류 설명 (UI용) */
export function allowedWeaponKindsLabelForJob(jobType: string): string {
  const a = allowedArchetypesForJob(jobType);
  if (a === null) return "알 수 없음";
  if (a.length === 0) return "직업 배정 후 착용 가능";
  return a.map((x) => ARCHETYPE_LABEL[x]).join(" · ");
}

export function weaponArchetypeFromBaseItemId(baseItemId: string): WeaponArchetype | null {
  const id = baseItemId.toLowerCase();
  if (id.includes("bow")) return "BOW";
  if (id.includes("staff")) return "STAFF";
  if (id.includes("sword") || id === "item_sword") return "SWORD";
  return null;
}

/** 빈 배열이면 해당 직업은 무기 착용 불가(미배정 등). null이면 알 수 없는 직업값 → 착용 불가 */
export function allowedArchetypesForJob(jobType: string): WeaponArchetype[] | null {
  switch (jobType) {
    case "UNASSIGNED":
      return [];
    case "WARRIOR":
    case "MINER":
    case "FISHER":
    case "ARCHAEOLOGIST":
    case "LUMBERJACK":
    case "BLACKSMITH":
    case "COOK":
    case "SCRAPPER":
      return ["SWORD"];
    case "ARCHER":
    case "EXPLORER":
      return ["BOW"];
    case "MAGE":
    case "HERBALIST":
    case "JEWELER":
    case "ALCHEMIST":
      return ["STAFF"];
    default:
      return null;
  }
}

export function canMinionEquipWeapon(jobType: string, baseItemId: string): boolean {
  const arch = weaponArchetypeFromBaseItemId(baseItemId);
  if (arch == null) return false;
  const allowed = allowedArchetypesForJob(jobType);
  if (allowed == null) return false;
  return allowed.includes(arch);
}
