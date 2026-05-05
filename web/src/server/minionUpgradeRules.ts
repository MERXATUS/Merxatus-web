import { GAME_RULES } from "@/server/gameRules";

export type UpgradeCost = {
  gold: number;
  materials: Array<{ itemId: string; quantity: number }>;
};

export function upgradeCostForLevel(currentLevel: number): UpgradeCost {
  const cur = Math.max(1, Math.floor(currentLevel));
  const next = cur + 1;
  const g = GAME_RULES.minionUpgrade.gold;
  const gold = Math.ceil(g.base * Math.pow(g.growth, next - 1));

  const mats: Array<{ itemId: string; quantity: number }> = [];
  const stoneQty = Math.max(0, Math.floor(GAME_RULES.minionUpgrade.materials.stonePerNextLevel * next));
  if (stoneQty > 0) mats.push({ itemId: "item_stone", quantity: stoneQty });

  const n = Math.max(1, Math.floor(GAME_RULES.minionUpgrade.materials.oreEveryNLevels));
  if (next % n === 0) {
    mats.push({ itemId: "item_ore", quantity: Math.max(1, Math.floor(GAME_RULES.minionUpgrade.materials.oreQty)) });
  }

  return { gold, materials: mats };
}

