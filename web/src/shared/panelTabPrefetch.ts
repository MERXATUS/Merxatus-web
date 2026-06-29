import type { GameTabKey } from "@/shared/gameNav";
import { API_CACHE_TTL } from "@/shared/apiCache";
import { prefetchCombatRoster } from "@/shared/combatRosterClient";
import { prefetchMeEquipmentState } from "@/shared/meEquipmentState";
import { apiGetJsonCached } from "@/shared/sessionClient";
import { isCombatGameTab, prefetchCombatPanelChunk } from "@/shared/combatTabPrefetch";

function prefetchPanelChunk(tab: GameTabKey) {
  if (typeof window === "undefined") return;
  if (isCombatGameTab(tab)) {
    prefetchCombatPanelChunk(tab);
    return;
  }
  switch (tab) {
    case "home":
      void import("@/app/_components/HomeOverviewPanel");
      break;
    case "market":
      void import("@/app/_components/MarketBoard");
      break;
    case "inventory":
      void import("@/app/_components/InventoryPanel");
      break;
    case "codex":
      void import("@/app/_components/CodexPanel");
      break;
    case "enhance":
      void import("@/app/_components/WeaponEnhancePanel");
      break;
    case "pvp":
      void import("@/app/_components/PvpPanel");
      break;
    case "ranking":
      void import("@/app/_components/RankingPanel");
      break;
    case "minions":
      void import("@/app/_components/MinionManagementPanel");
      break;
    default:
      break;
  }
}

function prefetchPanelData(tab: GameTabKey, userId: string | null) {
  if (!userId) return;
  switch (tab) {
    case "dungeon":
      prefetchCombatRoster(userId);
      void apiGetJsonCached("/api/dungeons/run/state?lite=1", { ttlMs: API_CACHE_TTL.runState }).catch(
        () => {},
      );
      break;
    case "raid":
      prefetchCombatRoster(userId);
      void apiGetJsonCached("/api/raids/run/state?lite=1", { ttlMs: API_CACHE_TTL.runState }).catch(() => {});
      void apiGetJsonCached("/api/raids/entry", { ttlMs: API_CACHE_TTL.raidsEntry }).catch(() => {});
      break;
    case "tower":
      prefetchCombatRoster(userId);
      void apiGetJsonCached("/api/tower/run/state?lite=1", { ttlMs: API_CACHE_TTL.runState }).catch(() => {});
      break;
    case "inventory":
    case "enhance":
      prefetchMeEquipmentState();
      break;
    case "codex":
      void apiGetJsonCached("/api/codex/weapons", { ttlMs: API_CACHE_TTL.meState }).catch(() => {});
      void apiGetJsonCached("/api/codex/armor", { ttlMs: API_CACHE_TTL.meState }).catch(() => {});
      void apiGetJsonCached("/api/codex/sets", { ttlMs: API_CACHE_TTL.meState }).catch(() => {});
      break;
    case "market":
      void apiGetJsonCached("/api/me/state?scope=market", { ttlMs: API_CACHE_TTL.meStateMarket }).catch(
        () => {},
      );
      break;
    case "pvp":
      void apiGetJsonCached("/api/pvp/opponents", { ttlMs: API_CACHE_TTL.pvpState }).catch(() => {});
      void apiGetJsonCached("/api/pvp/history", { ttlMs: API_CACHE_TTL.pvpHistory }).catch(() => {});
      break;
    case "minions":
      void apiGetJsonCached("/api/minions/panel", { ttlMs: API_CACHE_TTL.minionPanel }).catch(() => {});
      break;
    default:
      break;
  }
}

export function prefetchGamePanel(tab: GameTabKey, userId: string | null) {
  prefetchPanelChunk(tab);
  prefetchPanelData(tab, userId);
}
