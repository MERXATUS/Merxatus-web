/** 로컬·스테이징에서만 켜는 개발용 API */
export function assertDevApiAllowed():
  | { ok: true }
  | { ok: false; error: "DEV_ONLY" } {
  if (process.env.NODE_ENV === "production" && process.env.MERXATUS_ALLOW_DEV_TOOLS !== "1") {
    return { ok: false, error: "DEV_ONLY" };
  }
  return { ok: true };
}

export function devOnlyResponse() {
  return Response.json({ ok: false, error: "DEV_ONLY" }, { status: 403 });
}

/** dev 라우트 핸들러 시작부에서 사용 */
export function guardDevApi() {
  const dev = assertDevApiAllowed();
  if (!dev.ok) return devOnlyResponse();
  return null;
}
