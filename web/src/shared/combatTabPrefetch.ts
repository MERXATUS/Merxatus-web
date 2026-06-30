import type { GameTabKey } from "@/shared/gameNav";
import { prefetchPanelChunk } from "@/shared/panelChunkLoad";

const COMBAT_TABS = new Set<GameTabKey>(["dungeon", "raid", "tower"]);

export function isCombatGameTab(tab: GameTabKey): boolean {
  return COMBAT_TABS.has(tab);
}

/** GameFrame 네비 hover — 패널 JS 청크 선로드 */
export function prefetchCombatPanelChunk(tab: GameTabKey) {
  if (typeof window === "undefined") return;
  switch (tab) {
    case "dungeon":
      prefetchPanelChunk("panel:dungeon", () => import("@/app/_components/DungeonHubPanel"));
      break;
    case "raid":
      prefetchPanelChunk("panel:raid", () => import("@/app/_components/RaidsPanel"));
      break;
    case "tower":
      prefetchPanelChunk("panel:tower", () => import("@/app/_components/TowerPanel"));
      break;
    default:
      break;
  }
}
