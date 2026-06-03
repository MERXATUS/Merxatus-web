import type { MinionCombatClass } from "@/shared/minionDerivedClass";

/** 스킬 슬롯·레벨업 확장용 기본 타입 */
export type MinionSkill = {
  id: string;
  name: string;
  description: string;
  /** 1=기본, 2=전직 후, 3=2차 전직 후 */
  tier: 1 | 2 | 3;
  maxLevel: number;
};

const BASE_SKILLS: MinionSkill[] = [
  {
    id: "adventure_strike",
    name: "모험가 타격",
    description: "기본 공격. (스킬 시스템 확장 예정)",
    tier: 1,
    maxLevel: 5,
  },
];

const SWORDSMAN_SKILLS: MinionSkill[] = [
  {
    id: "sword_slash",
    name: "베기",
    description: "검으로 적을 베어 공격합니다. (스킬 시스템 확장 예정)",
    tier: 2,
    maxLevel: 10,
  },
  {
    id: "sword_guard",
    name: "검막",
    description: "짧은 시간 방어력이 상승합니다. (스킬 시스템 확장 예정)",
    tier: 2,
    maxLevel: 5,
  },
];

const ADVANCED_SKILLS: Partial<Record<MinionCombatClass, MinionSkill[]>> = {
  WARRIOR: [
    {
      id: "warrior_cleave",
      name: "강타",
      description: "힘을 모아 강력한 일격. (스킬 시스템 확장 예정)",
      tier: 3,
      maxLevel: 10,
    },
  ],
  WIND_BLADE: [
    {
      id: "wind_blade_rush",
      name: "질풍 베기",
      description: "민첩함으로 연속 공격. (스킬 시스템 확장 예정)",
      tier: 3,
      maxLevel: 10,
    },
  ],
  MAGIC_BLADE: [
    {
      id: "magic_blade_arc",
      name: "마력 베기",
      description: "마력이 깃든 검기. (스킬 시스템 확장 예정)",
      tier: 3,
      maxLevel: 10,
    },
  ],
  SHIELD_BLADE: [
    {
      id: "shield_blade_counter",
      name: "반격",
      description: "방어 후 즉시 반격. (스킬 시스템 확장 예정)",
      tier: 3,
      maxLevel: 10,
    },
  ],
};

/** 전투 클래스별 보유 스킬 목록 (현재는 스텁 — 추후 레벨·슬롯 DB 연동) */
export function skillsForCombatClass(combatClass: MinionCombatClass): MinionSkill[] {
  switch (combatClass) {
    case "ADVENTURER":
      return BASE_SKILLS;
    case "SWORDSMAN":
      return [...BASE_SKILLS, ...SWORDSMAN_SKILLS];
    case "WARRIOR":
    case "WIND_BLADE":
    case "MAGIC_BLADE":
    case "SHIELD_BLADE":
      return [...BASE_SKILLS, ...SWORDSMAN_SKILLS, ...(ADVANCED_SKILLS[combatClass] ?? [])];
    default:
      return BASE_SKILLS;
  }
}

/** UI용 — 현재는 모든 스킬 Lv1 고정 */
export type MinionSkillView = MinionSkill & { level: number };

export function skillViewsForCombatClass(combatClass: MinionCombatClass): MinionSkillView[] {
  return skillsForCombatClass(combatClass).map((s) => ({ ...s, level: 1 }));
}
