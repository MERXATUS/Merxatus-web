import { GAME_FEATURES } from "@/shared/gameFeatureFlags";

export type GameTabKey =
  | "home"
  | "market"
  | "inventory"
  | "enhance"
  | "royal"
  | "dungeon"
  | "raid"
  | "tower"
  | "pvp"
  | "ranking"
  | "minions"
  | "blackmarket";

export type MinionPanelTab = "dungeon";

export type GameTabDef = {
  key: GameTabKey;
  label: string;
  shortLabel: string;
  glyph: string;
  group: "core" | "trade" | "other";
};

export const DEFAULT_GAME_TAB: GameTabKey = "home";

export const GAME_TAB_STORAGE_KEY = "merxatus_game_tab_v1";

export const GAME_TABS: GameTabDef[] = [
  { key: "home", label: "홈", shortLabel: "홈", glyph: "⌂", group: "core" },
  { key: "dungeon", label: "던전", shortLabel: "던전", glyph: "⚔", group: "core" },
  { key: "raid", label: "레이드", shortLabel: "레이드", glyph: "☗", group: "core" },
  { key: "tower", label: "삼계의 탑", shortLabel: "무탑", glyph: "▲", group: "core" },
  { key: "pvp", label: "결투", shortLabel: "결투", glyph: "✦", group: "core" },
  { key: "ranking", label: "랭킹", shortLabel: "랭킹", glyph: "◈", group: "core" },
  { key: "market", label: "거래소", shortLabel: "거래", glyph: "¤", group: "trade" },
  { key: "inventory", label: "인벤토리", shortLabel: "인벤", glyph: "◆", group: "other" },
  { key: "minions", label: "미니언", shortLabel: "미니언", glyph: "●", group: "other" },
  { key: "enhance", label: "강화소", shortLabel: "강화", glyph: "＋", group: "other" },
  { key: "royal", label: "황실", shortLabel: "황실", glyph: "♛", group: "trade" },
  { key: "blackmarket", label: "암시장", shortLabel: "암시장", glyph: "☾", group: "trade" },
];

const TAB_KEYS = new Set<GameTabKey>(GAME_TABS.map((t) => t.key));

const LEGACY_PANEL_MAP: Record<string, GameTabKey> = {
  inventory: "inventory",
  gather: "dungeon",
  specialist: "dungeon",
  minions: "minions",
  royal: "royal",
  blackmarket: "blackmarket",
  market: "market",
  dungeons: "dungeon",
  dungeon: "dungeon",
  raid: "raid",
  tower: "tower",
  pvp: "pvp",
  ranking: "ranking",
  enhance: "enhance",
  hub: "home",
  home: "home",
};

export function isGameTabKey(raw: string | null | undefined): raw is GameTabKey {
  return !!raw && TAB_KEYS.has(raw as GameTabKey);
}

export function readStoredGameTab(): GameTabKey | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(GAME_TAB_STORAGE_KEY);
    if (raw === "gather" || raw === "specialist") return "dungeon";
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
  if (pathname === "/dungeon" || pathname === "/dungeons" || pathname.startsWith("/dungeon")) return "dungeon";
  if (pathname === "/raid" || pathname.startsWith("/raid")) return "raid";
  if (pathname === "/tower" || pathname.startsWith("/tower")) return "tower";
  if (pathname === "/pvp" || pathname.startsWith("/pvp")) return "pvp";
  if (pathname === "/ranking" || pathname.startsWith("/ranking")) return "ranking";
  if (pathname === "/enhance" || pathname.startsWith("/enhance/")) return "enhance";
  if (pathname === "/inventory" || pathname.startsWith("/inventory/")) return "inventory";

  const tab = searchParams.get("tab");
  if (tab === "gather" || tab === "specialist") return "dungeon";
  if (isGameTabKey(tab)) return tab;

  const panel = searchParams.get("panel");
  if (panel && LEGACY_PANEL_MAP[panel]) return LEGACY_PANEL_MAP[panel];

  return DEFAULT_GAME_TAB;
}

export function routeForGameTab(tab: GameTabKey): string {
  switch (tab) {
    case "market":
      return "/market";
    case "dungeon":
      return "/dungeon";
    case "raid":
      return "/raid";
    case "tower":
      return "/tower";
    case "pvp":
      return "/pvp";
    case "ranking":
      return "/ranking";
    case "enhance":
      return "/enhance";
    case "inventory":
      return "/inventory";
    default:
      return `/?tab=${tab}`;
  }
}

export function gameTabLabel(tab: GameTabKey): string {
  return GAME_TABS.find((t) => t.key === tab)?.label ?? tab;
}

/** 인벤·거래소처럼 리스트가 길어 전체 패널 스크롤이 필요한 탭 */
export const SCROLLABLE_GAME_TABS = new Set<GameTabKey>(["inventory", "market"]);

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

export const GAME_FRAME_REFRESH_EVENT = "game_frame_refresh";

export function notifyGameFrameRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(GAME_FRAME_REFRESH_EVENT));
  }
}

/** 설정·친구 목록에서 거래소 직거래 탭으로 상대 닉네임 전달 */
export const TRADE_START_USERNAME_KEY = "merxatus_trade_start_username_v1";
export const START_TRADE_WITH_EVENT = "merxatus_start_trade_with";

export function notifyStartTradeWith(username: string) {
  if (typeof window === "undefined") return;
  const trimmed = username.trim();
  if (!trimmed) return;
  try {
    sessionStorage.setItem(TRADE_START_USERNAME_KEY, trimmed);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(START_TRADE_WITH_EVENT, { detail: { username: trimmed } }));
}
