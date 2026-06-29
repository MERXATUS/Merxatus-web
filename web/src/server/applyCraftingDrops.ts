import type { DungeonDef } from "@/server/dungeonData";
import type { RaidDef } from "@/server/raidData";
import type { TowerDef } from "@/server/towerData";
import {
  contentTierForDungeonId,
  mergeCraftingDropPool,
  mergeCraftingIntoTowerDrops,
} from "@/shared/craftingItemDrops";
import { mergeRaidEntryTicketDrops } from "@/shared/raidEntry";
import { contentTierForRaidId } from "@/shared/raidRoster";

export function applyCraftingDropsToDungeon(dungeon: DungeonDef): DungeonDef {
  const tier = contentTierForDungeonId(dungeon.id);
  const maxFloors = dungeon.maxFloors ?? 20;
  const dropCtx = { tier, maxFloors };
  const bossCtx = { tier, maxFloors, boss: true as const };
  return {
    ...dungeon,
    drops: mergeRaidEntryTicketDrops(mergeCraftingDropPool(dungeon.drops, dropCtx), dropCtx),
    bossDrops: mergeRaidEntryTicketDrops(
      mergeCraftingDropPool(dungeon.bossDrops ?? [], bossCtx),
      bossCtx,
    ),
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
