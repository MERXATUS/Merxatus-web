import { GAME_RULES } from "@/server/gameRules";

export type WeaponUpgradeCost = {
  gold: number;
  materials: Array<{ itemId: string; quantity: number }>;
};

/** currentWeaponLevel -> nextWeaponLevel (= current + 1) 비용 */
export function weaponUpgradeCostForNextLevel(currentWeaponLevel: number): WeaponUpgradeCost {
  const cur = Math.max(0, Math.floor(currentWeaponLevel));
  const next = cur + 1;
  const max = Math.max(0, Math.floor(GAME_RULES.weaponUpgrade.maxLevel));
  if (next > max) {
    throw new Error("MAX_WEAPON_LEVEL");
  }

  const g = GAME_RULES.weaponUpgrade.gold;
  const gold = Math.ceil(g.base * Math.pow(g.growth, next - 1));

  const mats: Array<{ itemId: string; quantity: number }> = [];
  const stoneQty = Math.max(0, Math.floor(GAME_RULES.weaponUpgrade.materials.stonePerNextLevel * next));
  if (stoneQty > 0) mats.push({ itemId: "item_stone", quantity: stoneQty });

  const n = Math.max(1, Math.floor(GAME_RULES.weaponUpgrade.materials.oreEveryNLevels));
  if (next % n === 0) {
    mats.push({ itemId: "item_ore", quantity: Math.max(1, Math.floor(GAME_RULES.weaponUpgrade.materials.oreQty)) });
  }

  return { gold, materials: mats };
}
