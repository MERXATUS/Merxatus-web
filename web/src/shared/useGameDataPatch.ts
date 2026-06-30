import { useEffect } from "react";
import {
  GAME_FRAME_PATCH_EVENT,
  type GameDataScope,
  type GameFramePatchDetail,
  patchIncludesScope,
} from "@/shared/gameFramePatch";
import { GAME_FRAME_REFRESH_EVENT } from "@/shared/gameNav";

/** 패널 — 관심 scope만 구독 (전역 refresh 대체) */
export function useGameDataPatch(
  scopes: GameDataScope[],
  onPatch: (detail: GameFramePatchDetail) => void,
) {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<GameFramePatchDetail>).detail;
      if (!detail) return;
      if (patchIncludesScope(detail, scopes)) onPatch(detail);
    };
    const onLegacy = () => onPatch({ scopes: ["all"] });
    window.addEventListener(GAME_FRAME_PATCH_EVENT, handler);
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onLegacy);
    return () => {
      window.removeEventListener(GAME_FRAME_PATCH_EVENT, handler);
      window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onLegacy);
    };
  }, [scopes, onPatch]);
}
