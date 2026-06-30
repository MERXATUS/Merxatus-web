/** 패널별 부분 갱신 — 전체 리마운트·재조회 대신 scope 단위 */

export type GameDataScope =
  | "wallet"
  | "summary"
  | "inventory"
  | "weapons"
  | "armor"
  | "market"
  | "enhance"
  | "all";

export type GameFramePatchDetail = {
  scopes: GameDataScope[];
};

export const GAME_FRAME_PATCH_EVENT = "game_frame_patch";

export function notifyGameFramePatch(scopes: GameDataScope[]) {
  if (typeof window === "undefined") return;
  const unique = [...new Set(scopes)];
  if (unique.length === 0) return;
  window.dispatchEvent(
    new CustomEvent<GameFramePatchDetail>(GAME_FRAME_PATCH_EVENT, { detail: { scopes: unique } }),
  );
}

export function patchIncludesScope(detail: GameFramePatchDetail, scopes: GameDataScope[]): boolean {
  if (detail.scopes.includes("all")) return true;
  return scopes.some((s) => detail.scopes.includes(s));
}
