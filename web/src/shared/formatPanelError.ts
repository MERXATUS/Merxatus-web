/** 패널 공통 — API 오류를 사용자용 한글 메시지로 변환 */
import { parseMinionLevelTooLowError } from "@/shared/itemEquipLevel";

export function formatPanelError(e: unknown): string {
  if (e == null) return "알 수 없는 오류가 발생했습니다.";
  if (typeof e === "string") {
    const levelReq = parseMinionLevelTooLowError(e);
    if (levelReq != null) return minionLevelTooLowMessage(levelReq);
    const mapped = mapErrorCode(e);
    if (mapped) return mapped;
    if (looksLikeDbMigration(e)) return mapErrorCode("DB_MIGRATION_REQUIRED") ?? e;
    return e;
  }
  if (e instanceof Error) {
    const levelReq = parseMinionLevelTooLowError(e.message);
    if (levelReq != null) return minionLevelTooLowMessage(levelReq);
    const mapped = mapErrorCode(e.message);
    if (mapped) return mapped;
    if (looksLikeDbMigration(e.message)) return mapErrorCode("DB_MIGRATION_REQUIRED") ?? e.message;
    return e.message;
  }

  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    const code = typeof o.error === "string" ? o.error : "";

    if (code) {
      const mapped = mapErrorCode(code);
      if (mapped) return mapped;
      if (
        (code === "INTERNAL_SERVER_ERROR" || code === "INTERNAL") &&
        typeof o.message === "string" &&
        o.message.length > 0
      ) {
        if (looksLikeDbMigration(o.message)) {
          return mapErrorCode("DB_MIGRATION_REQUIRED") ?? "DB 마이그레이션이 필요합니다.";
        }
        return "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
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

function looksLikeDbMigration(text: string): boolean {
  return /does not exist|Friendship|ArmorInstance|ArmorCodexEntry|ToolInstance|TradeSession|PvpMatch|WeaponCodexEntry|P2021/i.test(text);
}

function minionLevelTooLowMessage(requiredLevel: number): string {
  return `착용 전투력이 부족합니다. (필요 ${requiredLevel.toLocaleString()} CP 이상)`;
}

function mapErrorCode(code: string): string | null {
  const levelReq = parseMinionLevelTooLowError(code);
  if (levelReq != null) return minionLevelTooLowMessage(levelReq);

  const exact: Record<string, string> = {
    BAD_REQUEST: "요청 형식이 잘못됐습니다. 새로고침 후 다시 시도해 주세요.",
    REQUEST_TIMEOUT: "서버 응답이 지연되고 있습니다. 잠시 후 새로고침해 주세요.",
    DB_CONNECTION_FAILED: "데이터베이스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    DB_POOL_TIMEOUT: "서버가 바빠서 응답이 지연되었습니다. 잠시 후 새로고침해 주세요.",
    DB_TRANSACTION_BUSY: "데이터 처리가 몰려 있습니다. 잠시 후 다시 시도해 주세요.",
    SESSION_TIMEOUT: "로그인 확인 시간이 초과됐습니다. 새로고침해 주세요.",
    BOOTSTRAP_INCOMPLETE: "대시보드 데이터를 불러오지 못했습니다. 새로고침해 주세요.",
    USER_NOT_FOUND: "유저를 찾을 수 없습니다. 로그인을 확인해 주세요.",
    UNAUTHORIZED: "로그인이 필요합니다.",
    FORBIDDEN: "이 작업을 수행할 권한이 없습니다.",
    NOT_FOUND: "요청한 데이터를 찾을 수 없습니다.",
    TRANSACTION_FAILED: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    INSUFFICIENT_GOLD: "골드가 부족합니다.",
    POOL_LOCKED: "아직 이 뽑기 상자를 이용할 수 없습니다. 던전 진행 조건을 확인해 주세요.",
    MINION_STAT_ALLOC_DISABLED: "스탯 배분은 비활성화되었습니다. 전투력은 장비·강화·도감으로 성장합니다.",
    PROMOTION_DISABLED: "전직 시스템은 비활성화되었습니다.",
    SKILLS_DISABLED: "스킬 시스템은 비활성화되었습니다.",
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
    ITEM_LOCKED: "잠긴 아이템은 사용·판매할 수 없습니다. 인벤에서 잠금을 해제해 주세요.",
    ITEM_USER_LOCKED: "잠긴 장비입니다. 인벤에서 잠금을 해제한 뒤 다시 시도해 주세요.",
    EQUIPMENT_EQUIPPED: "착용 중인 장비는 도감에 등록할 수 없습니다. 해제 후 다시 시도해 주세요.",
    EQUIPMENT_LOCKED: "거래 등록 중이거나 사용할 수 없는 장비입니다.",
    WEAPON_CODEX_NOT_UPGRADE: "이미 등록된 무기보다 낮거나 같은 수치입니다. 더 강한 무기로 갱신할 수 있습니다.",
    ARMOR_CODEX_NOT_UPGRADE: "이미 등록된 방어구보다 낮거나 같은 수치입니다. 더 강한 방어구로 갱신할 수 있습니다.",
    CODEX_MILESTONE_INVALID: "잘못된 도감 단계입니다.",
    CODEX_MILESTONE_NOT_MET: "이 장비는 해당 도감 단계 조건을 충족하지 않습니다.",
    CODEX_MILESTONE_ALREADY: "이미 등록된 도감 단계입니다.",
    INSUFFICIENT_AVAILABLE: "잠글 수 있는 가용 수량이 부족합니다.",
    INSUFFICIENT_LOCKED: "해제할 잠금 수량이 부족합니다.",
    NOTHING_LOCKED: "잠긴 수량이 없습니다.",
    STACK_NOT_FOUND: "인벤에 해당 아이템이 없습니다.",
    ARMOR_SLOT_MISMATCH: "이 슬롯에 맞지 않는 방어구입니다.",
    ARMOR_STATS_NOT_FOUND: "방어구 데이터를 찾을 수 없습니다.",
    NOT_ARMOR: "방어구만 착용할 수 있습니다.",
    INVALID_ARMOR_SLOT: "잘못된 방어구 슬롯입니다.",
    ARMOR_SLOTS_NOT_MIGRATED:
      "방어구 슬롯 DB 마이그레이션이 필요합니다. web 폴더에서 npx prisma db push 후 서버를 재시작해 주세요.",
    MINION_NOT_FOUND: "미니언을 찾을 수 없습니다.",
    WEAPON_ALREADY_EQUIPPED: "다른 미니언이 착용 중인 무기입니다.",
    CHAT_BACKEND_UNAVAILABLE: "채팅 서버를 사용할 수 없습니다.",
    DB_MIGRATION_REQUIRED:
      "DB 마이그레이션이 필요합니다. web 폴더에서 npm run db:migrate 를 실행해 주세요. (친구·직거래 등 최신 테이블 반영)",
    DB_SCHEMA_OUT_OF_DATE:
      "DB가 최신 스키마와 맞지 않습니다. web 폴더에서 npx prisma db push 실행 후 서버를 재시작해 주세요.",
    DB_TRANSACTION_FAILED: "전투 처리 중 일시적인 오류가 발생했습니다. 새로고침 후 다시 시도해 주세요.",
    RUN_STATE_CHANGED: "탐험 상태가 바뀌었습니다. 새로고침 후 다시 시도해 주세요.",
    AUTO_EXPLORE_ACTIVE: "자동 탐험이 진행 중입니다. 층 탐험을 하려면 자동 탐험을 먼저 중지해 주세요.",
    DAILY_WAVE_CAP_REACHED: "오늘 자동 탐험 웨이브 한도에 도달했습니다.",
    NO_ACTIVE_AUTO_RUN: "진행 중인 자동 탐험이 없습니다.",
    INTERNAL_SERVER_ERROR: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    INTERNAL: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    FRIEND_USER_NOT_FOUND: "해당 닉네임의 유저를 찾을 수 없습니다.",
    CANNOT_FRIEND_SELF: "자기 자신은 친구로 추가할 수 없습니다.",
    ALREADY_FRIENDS: "이미 친구입니다.",
    REQUEST_ALREADY_SENT: "이미 친구 요청을 보냈습니다.",
    FRIEND_REQUEST_NOT_FOUND: "친구 요청을 찾을 수 없습니다.",
    FRIEND_REQUEST_NOT_PENDING: "이미 처리된 요청입니다.",
    NOT_FRIENDS: "친구 관계가 아닙니다.",
    TRADE_USER_NOT_FOUND: "상대 유저를 찾을 수 없습니다.",
    TRADE_CANNOT_SELF: "자기 자신과는 거래할 수 없습니다.",
    PROCESS_CRAFT_DISABLED: "가공 제작은 비활성화됐어요. 던전·무탑·레이드 드랍이나 거래소를 이용해 주세요.",
    SPECIALIST_SYSTEM_REMOVED: "전문 직업 시스템이 제거됐어요. 던전·거래소를 이용해 주세요.",
    GATHER_DISABLED: "수집 시스템이 비활성화됐어요. 던전·삼계의 탑·레이드에서 아이템을 얻을 수 있어요.",
    MAX_EQUIPMENT_OWNED: "무기·방어구 보유 한도(100개)에 도달했어요. 분해하거나 거래소에 올린 뒤 다시 시도해 주세요.",
    SALVAGE_BATCH_TOO_LARGE: "한 번에 분해할 수 있는 장비는 최대 50개까지예요.",
    SHOP_SELL_BATCH_TOO_LARGE: "한 번에 매입할 수 있는 장비는 최대 50개까지예요.",
    REPRESENTATIVE_REQUIRED: "미니언이 없어요. 미니언을 먼저 생성해 주세요.",
    DEFENDER_NOT_READY: "상대에게 미니언이 없어요.",
    CANNOT_ATTACK_SELF: "자기 자신에게는 도전할 수 없어요.",
    PVP_DAILY_LIMIT: "오늘 결투 도전 횟수를 모두 사용했어요.",
  };

  if (exact[code]) return exact[code];

  if (code.startsWith("MINION_JOB_NOT_ALLOWED_FOR_WORKSHOP")) {
    const parts = code.split(":");
    if (parts.length >= 3) return `${parts[1]}에는 ${parts[2]}만 배치할 수 있습니다.`;
    return "이 시설에 맞지 않는 직업의 미니언입니다.";
  }

  if (code.startsWith("DUNGEON_PARTY_LEVEL_TOO_LOW:")) {
    const parts = code.split(":");
    const min = Number(parts[1] ?? 0);
    const have = Number(parts[2] ?? 0);
    if (Number.isFinite(min) && Number.isFinite(have) && min > 0) {
      return `파티 평균 레벨이 부족합니다. (현재 Lv${have} / 최소 Lv${min} 필요)`;
    }
    return "파티 레벨이 이 던전 권장 구간보다 낮습니다.";
  }

  if (code.startsWith("DUNGEON_PARTY_POWER_TOO_LOW:")) {
    const parts = code.split(":");
    const min = Number(parts[1] ?? 0);
    const have = Number(parts[2] ?? 0);
    if (Number.isFinite(min) && Number.isFinite(have) && min > 0) {
      return `파티 전투력이 부족합니다. (현재 ${have.toLocaleString()} / 최소 ${min.toLocaleString()} 필요)`;
    }
    return "파티 전투력이 이 던전 권장 구간보다 낮습니다.";
  }

  if (code.startsWith("RAID_PARTY_POWER_TOO_LOW:")) {
    const parts = code.split(":");
    const min = Number(parts[1] ?? 0);
    const have = Number(parts[2] ?? 0);
    if (Number.isFinite(min) && Number.isFinite(have) && min > 0) {
      return `파티 전투력이 부족합니다. (현재 ${have.toLocaleString()} / 최소 ${min.toLocaleString()} 필요)`;
    }
    return "파티 전투력이 부족해 레이드를 시작할 수 없습니다.";
  }

  if (code.startsWith("RAID_ENTRY_TICKET_MISSING:")) {
    const parts = code.split(":");
    const have = Number(parts[1] ?? 0);
    const need = Number(parts[2] ?? 1);
    if (Number.isFinite(need) && need > 0) {
      return `레이드 입장권이 부족합니다. (보유 ${have} / 필요 ${need}) 던전에서 입장권을 획득하세요.`;
    }
    return "레이드 입장권이 부족합니다. 던전에서 입장권을 획득하세요.";
  }

  return null;
}
