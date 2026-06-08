import type { DungeonDef } from "@/server/dungeonData";
import type { RaidDef } from "@/server/raidData";
import type { TowerDef } from "@/server/towerData";
import {
  contentTierForDungeonId,
  contentTierForRaidId,
  mergeCraftingDropPool,
  mergeCraftingIntoTowerDrops,
} from "@/shared/craftingItemDrops";

export function applyCraftingDropsToDungeon(dungeon: DungeonDef): DungeonDef {
  const tier = contentTierForDungeonId(dungeon.id);
  const maxFloors = dungeon.maxFloors ?? 20;
  return {
    ...dungeon,
    drops: mergeCraftingDropPool(dungeon.drops, { tier, maxFloors }),
    bossDrops: mergeCraftingDropPool(dungeon.bossDrops ?? [], { tier, maxFloors, boss: true }),
  };
}

export function applyCraftingDropsToRaid(raid: RaidDef): RaidDef {
  const tier = contentTierForRaidId(raid.id);
  return {
    ...raid,
    drops: mergeCraftingDropPool(raid.drops, { tier, maxFloors: 1, boss: true }),
    phaseDrops: mergeCraftingDropPool(raid.phaseDrops ?? [], { tier, maxFloors: 1, boss: true }),
  };
}

export function applyCraftingDropsToTower(config: TowerDef): TowerDef {
  return {
    ...config,
    drops: mergeCraftingIntoTowerDrops(config.drops),
  };
}
