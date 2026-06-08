export type DungeonLootRow = {
  itemId: string;
  qty: number;
  name: string;
  grade: number;
};

export type MinionXpGrantPayload = {
  minionId: string;
  xpGained: number;
  levelsGained: number;
  statPointsGained: number;
  level: number;
  experience?: number;
  unspentStatPoints?: number;
};

export type DungeonXpGrantRow = MinionXpGrantPayload & {
  label: string;
};

export type DungeonSettlementKind = "clear" | "cashout" | "defeat" | "abort";

export type DungeonSettlement = {
  kind: DungeonSettlementKind;
  title: string;
  subtitle?: string;
  xpGrants: DungeonXpGrantRow[];
  loot: DungeonLootRow[];
  forfeitedLoot?: DungeonLootRow[];
  goldGained?: number;
  forfeitedGold?: number;
  lootMultiplier?: number;
};

export function settlementTitle(kind: DungeonSettlementKind): string {
  switch (kind) {
    case "clear":
      return "던전 클리어!";
    case "cashout":
      return "탐험 정산";
    case "defeat":
      return "전멸…";
    case "abort":
      return "탐험 중단";
    default:
      return "탐험 결과";
  }
}
