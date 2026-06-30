import { DEFAULT_GAME_TAB, isGameTabKey, type GameTabKey } from "@/shared/gameNav";

/** 북마크·뒤로가기용 URL — 기본 탭은 `/`, 나머지는 `/?tab=` */
export function urlForGameTab(tab: GameTabKey): string {
  if (tab === DEFAULT_GAME_TAB) return "/";
  return `/?tab=${encodeURIComponent(tab)}`;
}

export function syncGameTabUrl(tab: GameTabKey, opts?: { replace?: boolean }) {
  if (typeof window === "undefined") return;
  const url = urlForGameTab(tab);
  const state = { gameTab: tab };
  if (opts?.replace) {
    window.history.replaceState(state, "", url);
  } else {
    window.history.pushState(state, "", url);
  }
}

export function readGameTabFromWindow(): GameTabKey {
  if (typeof window === "undefined") return DEFAULT_GAME_TAB;
  const fromState = (window.history.state as { gameTab?: string } | null)?.gameTab;
  if (fromState === "home" || fromState === "hub") return DEFAULT_GAME_TAB;
  if (isGameTabKey(fromState)) return fromState;
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab === "home" || tab === "hub") return DEFAULT_GAME_TAB;
  if (isGameTabKey(tab)) return tab;
  return DEFAULT_GAME_TAB;
}
