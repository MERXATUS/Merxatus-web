export const SPECIAL_DUNGEON_TICKET_ITEM_ID = "item_special_dungeon_ticket";

export function specialDungeonTicketCost(stageOrder: number): number {
  const t = Math.max(1, Math.min(8, Math.floor(stageOrder)));
  if (t <= 2) return 1;
  if (t <= 5) return 2;
  return 3;
}

export function isSpecialDungeonTicketItemId(itemId: string): boolean {
  return itemId.trim().toLowerCase() === SPECIAL_DUNGEON_TICKET_ITEM_ID;
}
