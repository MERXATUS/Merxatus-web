/** 패널 공통 — API 오류를 사용자용 한글 메시지로 변환 */
export function formatPanelError(e: unknown): string {
  if (e == null) return "알 수 없는 오류가 발생했습니다.";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;

  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    const code = typeof o.error === "string" ? o.error : "";

    if (code) {
      const mapped = mapErrorCode(code);
      if (mapped) return mapped;
      if (code === "INTERNAL_SERVER_ERROR" && typeof o.message === "string" && o.message.length > 0) {
        return o.message;
      }
      return code;
    }

    if (typeof o.message === "string" && o.message.length > 0) return o.message;

    if (typeof o.status === "number") {
      const st = o.status;
      if (st === 401) return "로그인이 필요합니다.";
      if (st === 403) return "이 작업을 수행할 권한이 없습니다.";
      if (st === 404) return "요청한 데이터를 찾을 수 없습니다.";
      if (st >= 500) return `서버 오류(${st}). 잠시 후 다시 시도해 주세요.`;
      return `요청 실패(HTTP ${st})`;
    }
  }

  return "요청 처리 중 오류가 발생했습니다. 새로고침 후 다시 시도해 주세요.";
}

function mapErrorCode(code: string): string | null {
  const exact: Record<string, string> = {
    BAD_REQUEST: "요청 형식이 잘못됐습니다. 새로고침 후 다시 시도해 주세요.",
    USER_NOT_FOUND: "유저를 찾을 수 없습니다. 로그인을 확인해 주세요.",
    UNAUTHORIZED: "로그인이 필요합니다.",
    FORBIDDEN: "이 작업을 수행할 권한이 없습니다.",
    NOT_FOUND: "요청한 데이터를 찾을 수 없습니다.",
    TRANSACTION_FAILED: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    INSUFFICIENT_GOLD: "골드가 부족합니다.",
    WORKSHOP_TYPE_NOT_FOUND: "시설 종류를 찾을 수 없습니다.",
    SLOT_OCCUPIED: "이 칸에 이미 시설이 있습니다.",
    PLOT_FULL: "시설 개수가 상한에 도달했습니다. 철거 후 다시 설치해 주세요.",
    TIER_UPGRADE_NOT_ALLOWED: "이 시설 종류는 티어 업그레이드를 할 수 없습니다.",
    ALREADY_MAX_TIER: "이미 최대 티어입니다.",
    WORKSHOP_NOT_FOUND: "시설을 찾을 수 없습니다.",
    UPGRADE_COST_MISSING: "티어 업그레이드 비용 설정이 없습니다.",
    RECIPE_TIER_TOO_LOW: "시설 티어가 부족합니다. 티어 업그레이드 후 다시 시도해 주세요.",
    MINION_ASSIGNMENT_DISABLED_FOR_PROCESS: "가공 시설에는 미니언을 배치할 수 없습니다.",
    COLLECT_NOT_READY: "아직 수령할 생산이 없습니다. 조금 더 기다려 주세요.",
    SPECIALIST_NOT_CHOSEN: "전문 직업을 먼저 선택해야 가공 제작을 시작할 수 있습니다.",
    SPECIALIST_MISMATCH: "이 시설에 맞는 전문 직업이 아닙니다.",
    SPECIALIST_LOCKED: "아직 전문 직업을 선택할 수 없습니다.",
    SPECIALIST_ALREADY_CHOSEN: "이미 전문 직업을 선택했습니다.",
    PROCESS_WORKSHOP_UNKNOWN: "이 가공 시설은 전문 직업 규칙에 등록되어 있지 않습니다.",
    CRAFT_IN_PROGRESS: "이전 제작 정리 중입니다. 잠시 후 다시 시도해 주세요.",
    MAX_LISTINGS_REACHED: "동시 등록 가능한 매물은 최대 20개까지입니다.",
    LISTING_EXPIRED: "판매 기간(48시간)이 만료된 매물입니다.",
    LISTING_NOT_EXPIRED: "아직 판매 기간이 남아 있습니다. 취소로 회수할 수 있습니다.",
    INSUFFICIENT_ITEM: "보유 수량이 부족합니다.",
    ARMOR_SLOT_MISMATCH: "이 슬롯에 맞지 않는 방어구입니다.",
    ARMOR_STATS_NOT_FOUND: "방어구 데이터를 찾을 수 없습니다.",
    NOT_ARMOR: "방어구만 착용할 수 있습니다.",
    INVALID_ARMOR_SLOT: "잘못된 방어구 슬롯입니다.",
    ARMOR_SLOTS_NOT_MIGRATED:
      "방어구 슬롯 DB 마이그레이션이 필요합니다. web 폴더에서 npx prisma db push 후 서버를 재시작해 주세요.",
    MINION_NOT_FOUND: "미니언을 찾을 수 없습니다.",
    WEAPON_ALREADY_EQUIPPED: "다른 미니언이 착용 중인 무기입니다.",
    CHAT_BACKEND_UNAVAILABLE: "채팅 서버를 사용할 수 없습니다.",
  };

  if (exact[code]) return exact[code];

  if (code.startsWith("MINION_JOB_NOT_ALLOWED_FOR_WORKSHOP")) {
    const parts = code.split(":");
    if (parts.length >= 3) return `${parts[1]}에는 ${parts[2]}만 배치할 수 있습니다.`;
    return "이 시설에 맞지 않는 직업의 미니언입니다.";
  }

  return null;
}
