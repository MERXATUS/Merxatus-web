import type { PrismaClient } from "@prisma/client";
import { GAME_RULES } from "@/server/gameRules";

/** `.env`의 `BOT_COUNT`(없으면 `GAME_RULES.bots.count`). 서버 프로세스 기동 시 한 번 로드됨. */
export function getConfiguredBotCount(): number {
  const raw = process.env.BOT_COUNT;
  if (raw == null || String(raw).trim() === "") return GAME_RULES.bots.count;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return GAME_RULES.bots.count;
  return Math.min(100, Math.max(1, n));
}

export function botUsernamesForCount(count: number): string[] {
  const c = Math.min(100, Math.max(1, Math.floor(count)));
  const p = GAME_RULES.bots.usernamePrefix;
  return Array.from({ length: c }, (_, i) => `${p}${i + 1}`);
}

function botNumericSuffixRegex(): RegExp {
  const esc = GAME_RULES.bots.usernamePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${esc}(\\d+)$`);
}

export function parseBotUsernameIndex(username: string): number | null {
  const m = username.match(botNumericSuffixRegex());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** `market_bot_숫자` 형식만 골라 번호 순으로 정렬 */
export async function findBotUsersOrdered(prisma: Pick<PrismaClient, "user">) {
  const prefix = GAME_RULES.bots.usernamePrefix;
  const all = await prisma.user.findMany({
    where: { username: { startsWith: prefix } },
  });

  return all
    .map((u) => {
      const idx = parseBotUsernameIndex(u.username);
      return idx == null ? null : { user: u, idx };
    })
    .filter((x): x is { user: (typeof all)[number]; idx: number } => x != null)
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.user);
}
