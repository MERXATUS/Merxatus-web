import { API_CACHE_TTL, withApiCache } from "@/shared/apiCache";
import { apiGetJson } from "@/shared/sessionClient";

export type CombatRosterMinion = {
  id: string;
  level: number;
  pool?: string;
  combatClassLabel: string;
  displayName?: string;
  nickname?: string | null;
  combatStats?: { combatPower: number };
  combatPower?: number;
  equippedWeapon?: {
    id: string;
    baseItemId: string;
    name: string;
    enhanceLevel: number;
    grade: number;
  } | null;
};

type CacheEntry = {
  userId: string;
  minions: CombatRosterMinion[];
  fetchedAt: number;
};

let cache: CacheEntry | null = null;

const ROSTER_TTL_MS = API_CACHE_TTL.minionPartyPick;

export function invalidateCombatRosterCache() {
  cache = null;
}

export async function fetchCombatRoster(userId: string, opts?: { force?: boolean }): Promise<CombatRosterMinion[]> {
  const now = Date.now();
  if (!opts?.force && cache && cache.userId === userId && now - cache.fetchedAt < ROSTER_TTL_MS) {
    return cache.minions;
  }

  const url = "/api/minions/list?scope=partyPick";
  const minions = await withApiCache(
    url,
    () =>
      apiGetJson<{ ok: boolean; minions: CombatRosterMinion[] }>(url).then((r) =>
        r.ok ? (r.minions ?? []) : [],
      ),
    { ttlMs: ROSTER_TTL_MS, force: opts?.force },
  );

  cache = { userId, minions, fetchedAt: Date.now() };
  return minions;
}

/** 네비 hover 등 — 로그인 후 백그라운드 워밍 */
export function prefetchCombatRoster(userId: string | null | undefined) {
  if (!userId) return;
  void fetchCombatRoster(userId).catch(() => {});
}
