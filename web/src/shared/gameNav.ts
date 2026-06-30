import { GAME_FEATURES } from "@/shared/gameFeatureFlags";
import { notifyGameFramePatch } from "@/shared/gameFramePatch";
import { urlForGameTab } from "@/shared/gameTabUrl";

export type GameTabKey =
  | "market"
  | "shop"
  | "inventory"
  | "codex"
  | "enhance"
  | "dungeon"
  | "raid"
  | "tower"
  | "pvp"
  | "ranking"
  | "minions";

export type MinionPanelTab = "dungeon";

export type GameTabDef = {
  key: GameTabKey;
  label: string;
  shortLabel: string;
  glyph: string;
  group: "core" | "trade" | "other";
};

export const DEFAULT_GAME_TAB: GameTabKey = "dungeon";

export const GAME_TAB_STORAGE_KEY = "merxatus_game_tab_v1";

export const GAME_TABS: GameTabDef[] = [
  { key: "dungeon", label: "던전", shortLabel: "던전", glyph: "⚔", group: "core" },
  { key: "raid", label: "레이드", shortLabel: "레이드", glyph: "☗", group: "core" },
  { key: "tower", label: "삼계의 탑", shortLabel: "무탑", glyph: "▲", group: "core" },
  { key: "pvp", label: "결투", shortLabel: "결투", glyph: "✦", group: "core" },
  { key: "ranking", label: "랭킹", shortLabel: "랭킹", glyph: "◈", group: "core" },
  { key: "market", label: "거래소", shortLabel: "거래소", glyph: "¤", group: "trade" },
  { key: "shop", label: "상점", shortLabel: "상점", glyph: "◇", group: "trade" },
  { key: "inventory", label: "인벤토리", shortLabel: "인벤", glyph: "◆", group: "other" },
  { key: "codex", label: "도감", shortLabel: "도감", glyph: "☰", group: "other" },
  { key: "minions", label: "미니언", shortLabel: "미니언", glyph: "●", group: "other" },
  { key: "enhance", label: "대장간", shortLabel: "대장간", glyph: "⚒", group: "other" },
];

const TAB_KEYS = new Set<GameTabKey>(GAME_TABS.map((t) => t.key));

const LEGACY_PANEL_MAP: Record<string, GameTabKey> = {
  inventory: "inventory",
  codex: "codex",
  gather: "dungeon",
  specialist: "dungeon",
  minions: "minions",
  royal: "shop",
  blackmarket: "market",
  shop: "shop",
  market: "market",
  dungeons: "dungeon",
  dungeon: "dungeon",
  raid: "raid",
  tower: "tower",
  pvp: "pvp",
  ranking: "ranking",
  enhance: "enhance",
  hub: "dungeon",
  home: "dungeon",
};

export function isGameTabKey(raw: string | null | undefined): raw is GameTabKey {
  return !!raw && TAB_KEYS.has(raw as GameTabKey);
}

export function readStoredGameTab(): GameTabKey | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(GAME_TAB_STORAGE_KEY);
    if (raw === "home" || raw === "hub") return "dungeon";
    if (raw === "gather" || raw === "specialist") return "dungeon";
    if (raw === "royal") return "shop";
    if (raw === "blackmarket") return "market";
    return isGameTabKey(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredGameTab(tab: GameTabKey) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(GAME_TAB_STORAGE_KEY, tab);
  } catch {
    /* ignore */
  }
}

export function resolveGameTab(pathname: string, searchParams: URLSearchParams): GameTabKey {
  if (pathname === "/market" || pathname.startsWith("/market/")) return "market";
  if (pathname === "/shop" || pathname.startsWith("/shop/")) return "shop";
  if (pathname === "/dungeon" || pathname === "/dungeons" || pathname.startsWith("/dungeon")) return "dungeon";
  if (pathname === "/raid" || pathname.startsWith("/raid")) return "raid";
  if (pathname === "/tower" || pathname.startsWith("/tower")) return "tower";
  if (pathname === "/pvp" || pathname.startsWith("/pvp")) return "pvp";
  if (pathname === "/ranking" || pathname.startsWith("/ranking")) return "ranking";
  if (pathname === "/enhance" || pathname.startsWith("/enhance/")) return "enhance";
  if (pathname === "/inventory" || pathname.startsWith("/inventory/")) return "inventory";
  if (pathname === "/codex" || pathname.startsWith("/codex/")) return "codex";

  const tab = searchParams.get("tab");
  if (tab === "home" || tab === "hub") return "dungeon";
  if (tab === "gather" || tab === "specialist") return "dungeon";
  if (tab === "royal") return "shop";
  if (tab === "blackmarket") return "market";
  if (isGameTabKey(tab)) return tab;

  const panel = searchParams.get("panel");
  if (panel && LEGACY_PANEL_MAP[panel]) return LEGACY_PANEL_MAP[panel];

  return DEFAULT_GAME_TAB;
}

export function routeForGameTab(tab: GameTabKey): string {
  return urlForGameTab(tab);
}

export function gameTabLabel(tab: GameTabKey): string {
  return GAME_TABS.find((t) => t.key === tab)?.label ?? tab;
}

/** 인벤·거래소·대장간처럼 리스트가 길어 전체 패널 스크롤이 필요한 탭 */
export const SCROLLABLE_GAME_TABS = new Set<GameTabKey>(["inventory", "codex", "market", "shop", "enhance"]);

export function isScrollableGameTab(tab: GameTabKey): boolean {
  return SCROLLABLE_GAME_TABS.has(tab);
}

/** 기능 플래그 반영 — 네비에 표시할 탭 */
export function visibleGameTabs(): GameTabDef[] {
  return GAME_TABS.filter((t) => {
    if (t.key === "raid" && !GAME_FEATURES.raidEnabled) return false;
    if (t.key === "tower" && !GAME_FEATURES.towerEnabled) return false;
    if (t.key === "pvp" && !GAME_FEATURES.pvpEnabled) return false;
    if (t.key === "ranking" && !GAME_FEATURES.towerEnabled && !GAME_FEATURES.raidEnabled && !GAME_FEATURES.pvpEnabled) return false;
    return true;
  });
}

export function isVisibleGameTab(tab: GameTabKey): boolean {
  return visibleGameTabs().some((t) => t.key === tab);
}

/** 하단 독에 고정 표시할 주요 탭 (모바일) */
export const MOBILE_DOCK_TAB_KEYS: GameTabKey[] = [
  "dungeon",
  "inventory",
  "enhance",
  "market",
];

const MOBILE_MORE_TAB_KEYS: GameTabKey[] = [
  "raid",
  "tower",
  "pvp",
  "ranking",
  "shop",
  "codex",
  "minions",
];

export function mobileDockGameTabs(): GameTabDef[] {
  const visible = new Set(visibleGameTabs().map((t) => t.key));
  return MOBILE_DOCK_TAB_KEYS.filter((k) => visible.has(k)).map(
    (k) => GAME_TABS.find((t) => t.key === k)!,
  );
}

export function mobileMoreGameTabs(): GameTabDef[] {
  const visible = new Set(visibleGameTabs().map((t) => t.key));
  return MOBILE_MORE_TAB_KEYS.filter((k) => visible.has(k)).map(
    (k) => GAME_TABS.find((t) => t.key === k)!,
  );
}

export function isMobileMoreTab(tab: GameTabKey): boolean {
  return MOBILE_MORE_TAB_KEYS.includes(tab);
}

export const GAME_FRAME_REFRESH_EVENT = "game_frame_refresh";

export function notifyGameFrameRefresh() {
  notifyGameFramePatch(["all"]);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(GAME_FRAME_REFRESH_EVENT));
  }
}
