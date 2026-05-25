/** 로컬·스테이징에서만 켜는 개발용 API */
export function assertDevApiAllowed():
  | { ok: true }
  | { ok: false; error: "DEV_ONLY" } {
  if (process.env.NODE_ENV === "production" && process.env.MERXATUS_ALLOW_DEV_TOOLS !== "1") {
    return { ok: false, error: "DEV_ONLY" };
  }
  return { ok: true };
}
