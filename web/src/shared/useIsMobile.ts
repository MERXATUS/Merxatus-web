"use client";

import { MOBILE_MEDIA_QUERY } from "@/shared/viewport";
import { useMediaQuery } from "@/shared/useMediaQuery";

/** 좁은 화면(모바일·태블릿 세로) — JS 분기용. 레이아웃은 CSS @media 우선 */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_MEDIA_QUERY, false);
}
