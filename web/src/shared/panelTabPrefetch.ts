import type { GameTabKey } from "@/shared/gameNav";
import { API_CACHE_TTL } from "@/shared/apiCache";
import { prefetchCombatRoster } from "@/shared/combatRosterClient";
import { prefetchMeEquipmentState } from "@/shared/meEquipmentState";
import { apiGetJsonCached, BOOTSTRAP_FETCH_TIMEOUT_MS } from "@/shared/sessionClient";
import { isCombatGameTab, prefetchCombatPanelChunk } from "@/shared/combatTabPrefetch";
import { prefetchPanelChunk } from "@/shared/panelChunkLoad";

function prefetchPanelChunkForTab(tab: GameTabKey) {
  if (typeof window === "undefined") return;
  if (isCombatGameTab(tab)) {
    prefetchCombatPanelChunk(tab);
    return;
  }
  switch (tab) {
    case "market":
      prefetchPanelChunk("panel:market", () => import("@/app/_components/MarketBoard"));
      break;
    case "shop":
      prefetchPanelChunk("panel:shop", () => import("@/app/_components/ShopPanel"));
      break;
    case "inventory":
      prefetchPanelChunk("panel:inventory", () => import("@/app/_components/InventoryPanel"));
      break;
    case "codex":
      prefetchPanelChunk("panel:codex", () => import("@/app/_components/CodexPanel"));
      break;
    case "enhance":
      prefetchPanelChunk("panel:enhance", () => import("@/app/_components/WeaponEnhancePanel"));
      break;
    case "pvp":
      prefetchPanelChunk("panel:pvp", () => import("@/app/_components/PvpPanel"));
      break;
    case "ranking":
      prefetchPanelChunk("panel:ranking", () => import("@/app/_components/RankingPanel"));
      break;
    case "minions":
      prefetchPanelChunk("panel:minions", () => import("@/app/_components/MinionManagementPanel"));
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
    case "shop":
      void apiGetJsonCached("/api/shop/gacha", { ttlMs: API_CACHE_TTL.meState }).catch(() => {});
      break;
    case "pvp":
      void apiGetJsonCached("/api/pvp/opponents", { ttlMs: API_CACHE_TTL.pvpState }).catch(() => {});
      void apiGetJsonCached("/api/pvp/history", { ttlMs: API_CACHE_TTL.pvpHistory }).catch(() => {});
      break;
    case "minions":
      void apiGetJsonCached("/api/minions/panel", {
        ttlMs: API_CACHE_TTL.minionPanel,
        timeoutMs: BOOTSTRAP_FETCH_TIMEOUT_MS,
      }).catch(() => {});
      break;
    default:
      break;
  }
}

export function prefetchGamePanel(tab: GameTabKey, userId: string | null) {
  prefetchPanelChunkForTab(tab);
  prefetchPanelData(tab, userId);
}
