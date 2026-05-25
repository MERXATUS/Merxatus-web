import weaponEnhanceLevels from "../../data/weapon_enhance_levels.json";

export type WeaponUpgradeCost = {
  gold: number;
  materials: Array<{ itemId: string; quantity: number }>;
  successRate: number;
};

type EnhanceLevelRow = {
  targetLevel: number;
  gold: number;
  scrollItemId: string | null;
  scrollQty: number;
  successRate: number;
};

const LEVELS = weaponEnhanceLevels as EnhanceLevelRow[];
const byTargetLevel = new Map(LEVELS.map((row) => [row.targetLevel, row]));

export function weaponEnhanceMaxLevel(): number {
  if (LEVELS.length === 0) return 0;
  return Math.max(...LEVELS.map((r) => r.targetLevel));
}

/** currentWeaponLevel(0~) → next level (= current + 1) 비용 */
export function weaponUpgradeCostForNextLevel(currentWeaponLevel: number): WeaponUpgradeCost {
  const cur = Math.max(0, Math.floor(currentWeaponLevel));
  const next = cur + 1;
  const row = byTargetLevel.get(next);
  if (!row) throw new Error("MAX_WEAPON_LEVEL");

  const materials: Array<{ itemId: string; quantity: number }> = [];
  if (row.scrollItemId && row.scrollQty > 0) {
    materials.push({ itemId: row.scrollItemId, quantity: row.scrollQty });
  }

  return {
    gold: Math.max(0, Math.ceil(row.gold)),
    materials,
    successRate: Math.max(0, Math.min(100, row.successRate)),
  };
}

export function listWeaponEnhanceLevels(): EnhanceLevelRow[] {
  return LEVELS.slice();
}
