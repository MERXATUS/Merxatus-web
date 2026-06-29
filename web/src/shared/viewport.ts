/** 모바일·데스크톱 분기 기준 (CSS @media 와 동일) */
export const MOBILE_MAX_WIDTH_PX = 768;

export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_MAX_WIDTH_PX}px)`;

export const DESKTOP_MEDIA_QUERY = `(min-width: ${MOBILE_MAX_WIDTH_PX + 1}px)`;
