import type { LootDropRow } from "@/shared/craftingItemDrops";
import type { RaidDifficultyMode } from "@/shared/raidRoster";

export const RAID_ENTRY_TICKET_ITEM_ID = "item_raid_ticket";

export function isRaidEntryTicketItemId(itemId: string): boolean {
  return itemId.trim().toLowerCase() === RAID_ENTRY_TICKET_ITEM_ID;
}

/** 레이드 1회 입장에 소모되는 입장권 수 */
export function raidEntryTicketCost(mode: RaidDifficultyMode | string | undefined): number {
  return mode === "hard" ? 2 : 1;
}

export function raidEntryTicketDropRow(ctx: {
  tier: number;
  maxFloors: number;
  boss?: boolean;
}): LootDropRow | null {
  const t = Math.max(1, Math.min(8, Math.floor(ctx.tier)));
  const mf = Math.max(1, Math.floor(ctx.maxFloors));
  const weight = ctx.boss
    ? t <= 2
      ? 350
      : t <= 4
        ? 550
        : t <= 6
          ? 850
          : 1100
    : t <= 2
      ? 100
      : t <= 4
        ? 180
        : t <= 6
          ? 280
          : 380;
  const minFloor = ctx.boss ? undefined : Math.max(1, Math.ceil(mf * (t <= 3 ? 0.35 : 0.2)));
  return {
    itemId: RAID_ENTRY_TICKET_ITEM_ID,
    weight,
    minQty: 1,
    maxQty: t >= 6 && ctx.boss ? 2 : 1,
    ...(minFloor != null ? { minFloor } : {}),
  };
}

export function mergeRaidEntryTicketDrops(
  drops: LootDropRow[],
  ctx: { tier: number; maxFloors: number; boss?: boolean },
): LootDropRow[] {
  if (drops.some((d) => isRaidEntryTicketItemId(d.itemId))) return drops;
  const row = raidEntryTicketDropRow(ctx);
  if (!row) return drops;
  return [...drops, row];
}
