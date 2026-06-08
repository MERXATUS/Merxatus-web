import type { GameTabKey } from "@/shared/gameNav";

const COMBAT_TABS = new Set<GameTabKey>(["dungeon", "raid", "tower"]);

export function isCombatGameTab(tab: GameTabKey): boolean {
  return COMBAT_TABS.has(tab);
}

/** GameFrame 네비 hover — 패널 JS 청크 선로드 */
export function prefetchCombatPanelChunk(tab: GameTabKey) {
  if (typeof window === "undefined") return;
  switch (tab) {
    case "dungeon":
      void import("@/app/_components/DungeonsPanel");
      break;
    case "raid":
      void import("@/app/_components/RaidsPanel");
      break;
    case "tower":
      void import("@/app/_components/TowerPanel");
      break;
    default:
      break;
  }
}
